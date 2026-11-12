import type { Context } from "hono";
import type { AppEnv } from "../types";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const MAX_PER_RUN = 150; // two Expo calls at most, well inside the free plan's outgoing call limit

/**
 * Sends a phone push for every recent notification that has not been pushed yet, to people who have a registered
 * device and have not switched push off. Call it (in waitUntil) after anything that writes notifications.
 */
export async function pushPending(c: Context<AppEnv>) {
  const since = Date.now() - 15 * 60 * 1000;
  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.body, n.link, t.token
     FROM notifications n
     JOIN push_tokens t ON t.user_id = n.user_id
     LEFT JOIN notification_settings s ON s.user_id = n.user_id
     WHERE n.pushed_at IS NULL AND n.created_at > ? AND COALESCE(s.push, 1) = 1
     LIMIT ?`,
  ).bind(since, MAX_PER_RUN).all<{ id: string; title: string; body: string; link: string; token: string }>();
  if (results.length === 0) return;

  // Claim them first so two overlapping runs cannot send the same push twice.
  const ids = [...new Set(results.map((r) => r.id))];
  await c.env.DB.prepare(`UPDATE notifications SET pushed_at = ? WHERE pushed_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`).bind(Date.now(), ...ids).run();

  const messages = results.map((r) => ({ to: r.token, title: r.title, body: r.body || undefined, sound: "default", data: { link: r.link } }));
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(c.env.EXPO_PUSH_URL ?? EXPO_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(batch) });
      if (!res.ok) { console.error(`expo push failed: ${res.status}`); continue; }
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((tk, j) => { if (tk.status === "error" && tk.details?.error === "DeviceNotRegistered") dead.push(batch[j]!.to); });
    } catch (e) { console.error(`expo push error: ${e instanceof Error ? e.message : e}`); }
  }
  if (dead.length) await c.env.DB.prepare(`DELETE FROM push_tokens WHERE token IN (${dead.map(() => "?").join(",")})`).bind(...dead).run();
}

/** Runs pushPending after the response is sent and never lets a push problem reach the caller. */
export const pushLater = (c: Context<AppEnv>) => c.executionCtx.waitUntil(pushPending(c).catch((e) => console.error(`push run failed: ${e instanceof Error ? e.message : e}`)));
