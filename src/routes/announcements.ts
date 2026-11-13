import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { loadOrg } from "../lib/access";
import { audit } from "../lib/audit";
import { pushLater } from "../lib/push";

// A link is a path on Kakushin ("/x", never "//host" or "/\\host", which browsers treat as another site) or an http(s) address.
export const body = z.object({
  title: z.string().trim().min(3, "Give the announcement a title").max(100),
  body: z.string().trim().max(500).default(""),
  link: z.string().trim().max(300).refine((v) => v === "" || /^\/(?![/\\])/.test(v) || /^https?:\/\/\S+$/i.test(v), { message: "A link must be a page on Kakushin or start with https://" }).default(""),
});

/** Organiser announcements to their followers. Mounted under /api/orgs. */
export const orgAnnouncements = new Hono<AppEnv>();

async function adminOrg(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const a = await loadOrg(c, c.req.param("slug")!);
  if (!a) return { err: c.json({ error: "Not found" }, 404) };
  if (!a.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  return { org: a.org };
}

orgAnnouncements.get("/:slug/announcements", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  const { results } = await c.env.DB.prepare("SELECT id, title, body, link, recipients, created_at FROM announcements WHERE org_id = ? AND challenge_id IS NULL ORDER BY created_at DESC LIMIT 20").bind(x.org.id).all();
  const f = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM follows WHERE org_id = ?").bind(x.org.id).first<{ n: number }>();
  return c.json({ items: results, followers: f?.n ?? 0 });
});

orgAnnouncements.post("/:slug/announcements", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  if (x.org.suspended) return c.json({ error: "Your organisation is suspended" }, 403);
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the announcement" }, 400);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM announcements WHERE org_id = ? AND challenge_id IS NULL AND created_at > ?").bind(x.org.id, Date.now() - 86400000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return c.json({ error: "You can send up to 5 announcements a day. Try again tomorrow." }, 429);
  const now = Date.now(), p = parsed.data;
  const link = p.link || `/o/${x.org.slug}`;
  const ins = await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), f.user_id, 'announcement', ?, ?, ?, ? FROM follows f JOIN users u ON u.id = f.user_id WHERE f.org_id = ? AND u.suspended = 0`,
  ).bind(`${x.org.name}: ${p.title}`, p.body, link, now, x.org.id).run();
  const sent = ins.meta.changes ?? 0;
  await c.env.DB.prepare("INSERT INTO announcements (id, org_id, author_user_id, title, body, link, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), x.org.id, c.get("user")!.id, p.title, p.body, p.link, sent, now).run();
  pushLater(c);
  return c.json({ ok: true, recipients: sent });
});

/** Platform news to everyone. Mounted by the platform router, which already checks for a platform admin. */
export async function postNews(c: Context<AppEnv>) {
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the news item" }, 400);
  const p = parsed.data, now = Date.now();
  const ins = await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), u.id, 'news', ?, ?, ?, ? FROM users u WHERE u.suspended = 0`,
  ).bind(p.title, p.body, p.link, now).run();
  const sent = ins.meta.changes ?? 0;
  await c.env.DB.prepare("INSERT INTO announcements (id, org_id, author_user_id, title, body, link, recipients, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), c.get("user")!.id, p.title, p.body, p.link, sent, now).run();
  await audit(c, "news.posted", "platform", "all", p.title);
  pushLater(c);
  return c.json({ ok: true, recipients: sent });
}
