import type { Context } from "hono";
import type { AppEnv, Env } from "../types";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
export const PUSH_ROUND = 100; // one Expo call per round (Expo takes up to 100 messages a call)

/**
 * Sends one round of phone pushes: notifications written since `since` that have not been pushed yet, to people who have
 * a registered device and have not switched push off. Returns whether more are waiting, so the caller can run another
 * round (the queue does this until everyone is reached; see src/lib/outbox.ts).
 */
export async function pushPending(env: Env, since = Date.now() - 15 * 60 * 1000): Promise<{ sent: number; more: boolean }> {
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.title, n.body, n.link, t.token
     FROM notifications n
     JOIN push_tokens t ON t.user_id = n.user_id
     LEFT JOIN notification_settings s ON s.user_id = n.user_id
     WHERE n.pushed_at IS NULL AND n.created_at > ? AND COALESCE(s.push, 1) = 1
     ORDER BY n.created_at
     LIMIT ?`,
  ).bind(since, PUSH_ROUND + 1).all<{ id: string; title: string; body: string; link: string; token: string }>();
  if (results.length === 0) return { sent: 0, more: false };
  const more = results.length > PUSH_ROUND;
  let rows = results.slice(0, PUSH_ROUND);
  // A notification can have several devices; keep all of its devices in this round so it is claimed only once.
  if (more) {
    const cut = rows[rows.length - 1]!.id;
    if (results[PUSH_ROUND]!.id === cut) { const head = rows.filter((r) => r.id !== cut); if (head.length) rows = head; }
  }
  // Claim them first so two overlapping runs cannot send the same push twice.
  const ids = [...new Set(rows.map((r) => r.id))];
  const claimedAt = Date.now();
  const claim = await env.DB.prepare(`UPDATE notifications SET pushed_at = ? WHERE pushed_at IS NULL AND id IN (${ids.map(() => "?").join(",")}) RETURNING id`)
    .bind(claimedAt, ...ids).all<{ id: string }>();
  const mine = new Set(claim.results.map((r) => r.id));
  const messages = rows.filter((r) => mine.has(r.id)).map((r) => ({ id: r.id, to: r.token, title: r.title, body: r.body || undefined, sound: "default", data: { link: r.link } }));
  if (messages.length === 0) return { sent: 0, more };

  const dead: string[] = [];
  let failed = false;
  try {
    const res = await fetch(env.EXPO_PUSH_URL ?? EXPO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.map(({ id: _id, ...m }) => m)),
    });
    if (!res.ok) { failed = true; console.error(`expo push failed: ${res.status}`); }
    else {
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((tk, j) => { if (tk.status === "error" && tk.details?.error === "DeviceNotRegistered") dead.push(messages[j]!.to); });
    }
  } catch (e) { failed = true; console.error(`expo push error: ${e instanceof Error ? e.message : e}`); }

  if (failed) {
    // Expo did not take them: release the claim so the hourly job tries again.
    const back = [...mine];
    await env.DB.prepare(`UPDATE notifications SET pushed_at = NULL WHERE pushed_at = ? AND id IN (${back.map(() => "?").join(",")})`).bind(claimedAt, ...back).run();
    return { sent: 0, more: false };
  }
  if (dead.length) await env.DB.prepare(`DELETE FROM push_tokens WHERE token IN (${dead.map(() => "?").join(",")})`).bind(...dead).run();
  return { sent: messages.length, more };
}

/**
 * Call after anything that writes notifications. Runs one round after the response is sent; if more people are
 * waiting, the queue carries on until everyone has been reached. Never lets a push problem reach the caller.
 */
export const pushLater = (c: Context<AppEnv>) => c.executionCtx.waitUntil((async () => {
  const { more } = await pushPending(c.env);
  if (more && c.env.OUTBOX) await c.env.OUTBOX.send({ type: "push" });
})().catch((e) => console.error(`push run failed: ${e instanceof Error ? e.message : e}`)));
