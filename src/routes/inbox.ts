import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { TOPICS } from "../lib/topics";
import { loadOrg } from "../lib/access";

/** Notification inbox. Mounted at /api/inbox. */
export const inbox = new Hono<AppEnv>();

inbox.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ items: [], unread: 0 });
  const { results } = await c.env.DB.prepare("SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id).first<{ n: number }>();
  return c.json({ items: results, unread: n?.n ?? 0 });
});

inbox.post("/read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(Date.now(), user.id).run();
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
