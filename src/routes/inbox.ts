import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { TOPICS } from "../lib/topics";
import { loadOrg } from "../lib/access";

/** Notification inbox. Mounted at /api/inbox. */
export const inbox = new Hono<AppEnv>();

const PAGE = 50;

/** Newest first, 50 at a time. `next` is the cursor for the page after this one ("<created_at>:<id>"), or null. */
inbox.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ items: [], unread: 0, next: null });
  const m = /^(\d{1,15}):([0-9a-zA-Z-]{1,64})$/.exec(c.req.query("before") ?? "");
  const stmt = m
    ? c.env.DB.prepare(
      `SELECT id, kind, title, body, link, read_at, created_at FROM notifications
       WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(user.id, Number(m[1]), Number(m[1]), m[2], PAGE + 1)
    : c.env.DB.prepare("SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(user.id, PAGE + 1);
  const { results } = await stmt.all<{ id: string; created_at: number }>();
  const items = results.slice(0, PAGE);
  const last = items[items.length - 1];
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id).first<{ n: number }>();
  return c.json({ items, unread: n?.n ?? 0, next: results.length > PAGE && last ? `${last.created_at}:${last.id}` : null });
});

/** Marks everything read. */
inbox.post("/read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(Date.now(), user.id).run();
  return c.json({ ok: true });
});

/** Marks one item read, when it is opened. */
inbox.post("/:id{[0-9a-zA-Z-]{1,64}}/read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const r = await c.env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?").bind(Date.now(), c.req.param("id"), user.id).run();
  if (!r.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Followed organisations and topic interests. Mounted at /api/follows. */
export const follows = new Hono<AppEnv>();

follows.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ orgs: [], topics: [] });
  const orgs = await c.env.DB.prepare("SELECT o.slug, o.name FROM follows f JOIN organizations o ON o.id = f.org_id WHERE f.user_id = ? ORDER BY o.name").bind(user.id).all<{ slug: string; name: string }>();
  const topics = await c.env.DB.prepare("SELECT topic FROM interests WHERE user_id = ? ORDER BY topic").bind(user.id).all<{ topic: string }>();
  return c.json({ orgs: orgs.results, topics: topics.results.map((t) => t.topic) });
});

follows.put("/orgs/:slug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to follow an organisation" }, 401);
  const a = await loadOrg(c, c.req.param("slug"));
  if (!a) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("INSERT OR IGNORE INTO follows (user_id, org_id, created_at) VALUES (?, ?, ?)").bind(user.id, a.org.id, Date.now()).run();
  return c.json({ ok: true });
});

follows.delete("/orgs/:slug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const a = await loadOrg(c, c.req.param("slug"));
  if (!a) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM follows WHERE user_id = ? AND org_id = ?").bind(user.id, a.org.id).run();
  return c.json({ ok: true });
});

follows.put("/topics", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const parsed = z.object({ topics: z.array(z.enum(TOPICS)).max(TOPICS.length) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick topics from the list" }, 400);
  const topics = [...new Set(parsed.data.topics)];
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM interests WHERE user_id = ?").bind(user.id),
    ...topics.map((t) => c.env.DB.prepare("INSERT INTO interests (user_id, topic) VALUES (?, ?)").bind(user.id, t)),
  ]);
  return c.json({ ok: true });
});

/** Per-person notification settings and phone push registration. Mounted at /api/inbox too, under /settings and /push-token. */
inbox.get("/settings", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const s = await c.env.DB.prepare("SELECT push FROM notification_settings WHERE user_id = ?").bind(user.id).first<{ push: number }>();
  const d = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE user_id = ?").bind(user.id).first<{ n: number }>();
  return c.json({ push: (s?.push ?? 1) === 1, devices: d?.n ?? 0 });
});

inbox.put("/settings", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const parsed = z.object({ push: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the settings" }, 400);
  await c.env.DB.prepare("INSERT INTO notification_settings (user_id, push) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET push = excluded.push").bind(user.id, parsed.data.push ? 1 : 0).run();
  return c.json({ ok: true });
});

inbox.post("/push-token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const parsed = z.object({ token: z.string().regex(/^Expo(nent)?PushToken\[[^\]]{10,}\]$/, "That is not an Expo push token"), platform: z.enum(["ios", "android"]).default("ios") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the token" }, 400);
  const now = Date.now();
  // A phone token belongs to whoever signed in on it last.
  await c.env.DB.prepare(
    `INSERT INTO push_tokens (id, user_id, token, platform, created_at, last_seen_at) VALUES (lower(hex(randomblob(12))), ?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, last_seen_at = excluded.last_seen_at`,
  ).bind(user.id, parsed.data.token, parsed.data.platform, now, now).run();
  return c.json({ ok: true });
});

inbox.delete("/push-token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const parsed = z.object({ token: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the request" }, 400);
  await c.env.DB.prepare("DELETE FROM push_tokens WHERE user_id = ? AND token = ?").bind(user.id, parsed.data.token).run();
  return c.json({ ok: true });
});
