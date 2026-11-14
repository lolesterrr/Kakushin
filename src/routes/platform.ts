import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { audit } from "../lib/audit";
import { sendEmail } from "../lib/email";
import { notifyFollowersOfChallenge } from "../lib/notify";
import { pushLater } from "../lib/push";
import { postNews } from "./announcements";

/** Platform admin console. Mounted at /api/platform. Every route needs a signed-in platform admin. */
export const platform = new Hono<AppEnv>();

platform.use("*", async (c, next) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Not signed in" }, 401);
  if (!u.is_platform_admin) return c.json({ error: "Not found" }, 404); // do not reveal that the console exists
  await next();
});

const count = async (c: Context<AppEnv>, sql: string) => (await c.env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0;

platform.get("/stats", async (c) => {
  const day = Date.now() - 7 * 86400000;
  return c.json({
    users: await count(c, "SELECT COUNT(*) AS n FROM users"),
    new_users_7d: await count(c, `SELECT COUNT(*) AS n FROM users WHERE created_at > ${day}`),
    orgs: await count(c, "SELECT COUNT(*) AS n FROM organizations"),
    verified_orgs: await count(c, "SELECT COUNT(*) AS n FROM organizations WHERE verified = 1"),
    suspended_orgs: await count(c, "SELECT COUNT(*) AS n FROM organizations WHERE suspended = 1"),
    challenges_live: await count(c, "SELECT COUNT(*) AS n FROM challenges WHERE status != 'draft'"),
    awaiting_review: await count(c, "SELECT COUNT(*) AS n FROM challenges WHERE review_state = 'pending'"),
    teams: await count(c, "SELECT COUNT(*) AS n FROM teams"),
    applications: await count(c, "SELECT COUNT(*) AS n FROM applications"),
    certificates: await count(c, "SELECT COUNT(*) AS n FROM certificates"),
  });
});

// ---- review queue ----
platform.get("/review", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ch.id, ch.slug, ch.title, ch.summary, ch.description, ch.prizes, ch.topics, ch.team_min, ch.team_max, ch.submitted_at,
       ch.applications_open_at, ch.applications_close_at, o.slug AS org_slug, o.name AS org_name, o.verified AS org_verified, o.type AS org_type, o.website AS org_website,
       (SELECT COUNT(*) FROM challenges x WHERE x.org_id = o.id AND x.approved_at IS NOT NULL) AS org_approved_before
     FROM challenges ch JOIN organizations o ON o.id = ch.org_id WHERE ch.review_state = 'pending' ORDER BY ch.submitted_at`,
  ).all<Record<string, unknown>>();
  return c.json({ items: results.map((r) => ({ ...r, topics: JSON.parse(String(r.topics)) as string[] })) });
});

async function reviewTarget(c: Context<AppEnv>) {
  return c.env.DB.prepare(
    `SELECT ch.id, ch.slug, ch.title, ch.org_id, ch.review_state, o.slug AS oslug, o.name AS oname
     FROM challenges ch JOIN organizations o ON o.id = ch.org_id WHERE ch.id = ?`,
  ).bind(c.req.param("id")!).first<{ id: string; slug: string; title: string; org_id: string; review_state: string; oslug: string; oname: string }>();
}

/** Tells every admin of the organisation, in the inbox and by email. */
async function tellOrgAdmins(c: Context<AppEnv>, orgId: string, title: string, body: string, link: string, subject: string) {
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), m.user_id, 'review.result', ?, ?, ?, ? FROM memberships m WHERE m.org_id = ?`,
  ).bind(title, body, link, now, orgId).run();
  pushLater(c);
  const { results } = await c.env.DB.prepare("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? LIMIT 20").bind(orgId).all<{ email: string }>();
  const text = `${title}\n\n${body}\n\n${c.env.APP_URL}${link}`;
  const html = `<p><b>${title.replace(/</g, "&lt;")}</b></p><p>${body.replace(/</g, "&lt;")}</p><p><a href="${c.env.APP_URL}${link}">Open it on Kakushin</a></p>`;
  c.executionCtx.waitUntil(Promise.all(results.map((r) => sendEmail(c.env, r.email, subject, html, text).catch((e) => console.error(`review email failed: ${e instanceof Error ? e.message : e}`)))));
}

platform.post("/challenges/:id/approve", async (c) => {
  const t = await reviewTarget(c);
  if (!t) return c.json({ error: "Not found" }, 404);
  if (t.review_state !== "pending") return c.json({ error: "This challenge is not waiting for review" }, 409);
  const now = Date.now();
  await c.env.DB.prepare("UPDATE challenges SET status = 'open', review_state = 'approved', approved_at = ?, review_note = '' WHERE id = ?").bind(now, t.id).run();
  const claim = await c.env.DB.prepare("UPDATE challenges SET announced = 1 WHERE id = ? AND announced = 0").bind(t.id).run();
  if (claim.meta.changes) {
    const ch = await c.env.DB.prepare("SELECT id, slug, title, topics FROM challenges WHERE id = ?").bind(t.id).first<{ id: string; slug: string; title: string; topics: string }>();
    if (ch) { await notifyFollowersOfChallenge(c, { ...ch, topics: JSON.parse(ch.topics) as string[] }, { id: t.org_id, slug: t.oslug, name: t.oname }).catch((e) => console.error(`follower notification failed: ${e instanceof Error ? e.message : e}`)); pushLater(c); }
  }
  await audit(c, "challenge.approved", "challenge", t.id, `${t.oname}: ${t.title}`);
  await tellOrgAdmins(c, t.org_id, `Approved: ${t.title}`, "Your challenge passed review and is now public.", `/o/${t.oslug}/c/${t.slug}`, `Your challenge is live: ${t.title}`);
  return c.json({ ok: true });
});

platform.post("/challenges/:id/reject", async (c) => {
  const parsed = z.object({ note: z.string().trim().min(3, "Tell the organiser what to fix").max(1000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Add a note for the organiser" }, 400);
  const t = await reviewTarget(c);
  if (!t) return c.json({ error: "Not found" }, 404);
  if (t.review_state !== "pending") return c.json({ error: "This challenge is not waiting for review" }, 409);
  await c.env.DB.prepare("UPDATE challenges SET review_state = 'rejected', review_note = ? WHERE id = ?").bind(parsed.data.note, t.id).run();
  await audit(c, "challenge.rejected", "challenge", t.id, `${t.oname}: ${t.title}: ${parsed.data.note}`);
  await tellOrgAdmins(c, t.org_id, `Changes needed: ${t.title}`, parsed.data.note, `/admin/o/${t.oslug}/c/${t.slug}/edit`, `Changes needed before your challenge can go live: ${t.title}`);
  return c.json({ ok: true });
});

// ---- organisations ----
platform.get("/orgs", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.slug, o.name, o.type, o.website, o.verified, o.suspended, o.created_at,
       (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS members,
       (SELECT COUNT(*) FROM challenges ch WHERE ch.org_id = o.id AND ch.status != 'draft') AS live_challenges,
       (SELECT COUNT(*) FROM challenges ch WHERE ch.org_id = o.id AND ch.review_state = 'pending') AS pending,
       (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'owner' LIMIT 1) AS owner_email
     FROM organizations o WHERE (? = '' OR lower(o.name) LIKE ? OR o.slug LIKE ?) ORDER BY o.created_at DESC LIMIT 100`,
  ).bind(q, `%${q}%`, `%${q}%`).all();
  return c.json({ orgs: results });
});

platform.put("/orgs/:id", async (c) => {
  const parsed = z.object({ verified: z.boolean().optional(), suspended: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the request" }, 400);
  const o = await c.env.DB.prepare("SELECT id, name FROM organizations WHERE id = ?").bind(c.req.param("id")).first<{ id: string; name: string }>();
  if (!o) return c.json({ error: "Not found" }, 404);
  const { verified, suspended } = parsed.data;
  if (suspended && !c.get("user")!.is_super_admin) {
    const ownerOrg = await c.env.DB.prepare("SELECT 1 AS x FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.role = 'owner' AND u.is_super_admin = 1").bind(o.id).first();
    if (ownerOrg) return c.json({ error: "This organisation belongs to the platform owner. Only the owner can suspend it." }, 403);
  }
  if (verified !== undefined) { await c.env.DB.prepare("UPDATE organizations SET verified = ? WHERE id = ?").bind(verified ? 1 : 0, o.id).run(); await audit(c, verified ? "org.verified" : "org.unverified", "organization", o.id, o.name); }
  if (suspended !== undefined) { await c.env.DB.prepare("UPDATE organizations SET suspended = ? WHERE id = ?").bind(suspended ? 1 : 0, o.id).run(); await audit(c, suspended ? "org.suspended" : "org.restored", "organization", o.id, o.name); }
  return c.json({ ok: true });
});

// ---- users ----
platform.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.is_platform_admin, u.is_super_admin, u.suspended, u.created_at,
       (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS orgs,
       (SELECT COUNT(*) FROM team_members t WHERE t.user_id = u.id) AS teams
     FROM users u WHERE (? = '' OR lower(u.email) LIKE ? OR lower(COALESCE(u.name, '')) LIKE ?) ORDER BY u.created_at DESC LIMIT 100`,
  ).bind(q, `%${q}%`, `%${q}%`).all();
  return c.json({ users: results });
});

platform.put("/users/:id", async (c) => {
  const parsed = z.object({ suspended: z.boolean().optional(), is_platform_admin: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the request" }, 400);
  const me = c.get("user")!;
  const u = await c.env.DB.prepare("SELECT id, email, is_super_admin FROM users WHERE id = ?").bind(c.req.param("id")).first<{ id: string; email: string; is_super_admin: number }>();
  if (!u) return c.json({ error: "Not found" }, 404);
  if (u.id === me.id) return c.json({ error: "You cannot change your own access. Ask another platform admin." }, 409);
  // The platform owner cannot be suspended or demoted by anyone, and only the owner hands out or takes away the admin role.
  if (u.is_super_admin) return c.json({ error: "This is the platform owner's account. Nobody can change its access here." }, 403);
  const { suspended, is_platform_admin } = parsed.data;
  if (is_platform_admin !== undefined && !me.is_super_admin) return c.json({ error: "Only the platform owner can add or remove platform admins" }, 403);
  if (suspended !== undefined) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET suspended = ? WHERE id = ?").bind(suspended ? 1 : 0, u.id),
      ...(suspended ? [c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id)] : []), // sign them out everywhere
    ]);
    await audit(c, suspended ? "user.suspended" : "user.restored", "user", u.id, u.email);
  }
  if (is_platform_admin !== undefined) {
    await c.env.DB.prepare("UPDATE users SET is_platform_admin = ? WHERE id = ?").bind(is_platform_admin ? 1 : 0, u.id).run();
    await audit(c, is_platform_admin ? "user.made_admin" : "user.removed_admin", "user", u.id, u.email);
  }
  return c.json({ ok: true });
});

platform.post("/news", postNews);
platform.get("/news", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, title, body, link, recipients, created_at FROM announcements WHERE org_id IS NULL ORDER BY created_at DESC LIMIT 20").all();
  return c.json({ items: results });
});

platform.get("/audit", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, actor_email, action, target_type, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100").all();
  return c.json({ items: results });
});
