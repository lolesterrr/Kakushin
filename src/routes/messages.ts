import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { loadOrg } from "../lib/access";
import { pushLater } from "../lib/push";
import { queueEmails } from "../lib/outbox";
import { sendEmail } from "../lib/email";

/**
 * Group messages from organisers to the people in one challenge: everyone who applied, the shortlist, the finalists,
 * the teams not selected, or a single team. Each member gets an inbox item, a push and an email (decision D1).
 * Mounted under /api/orgs.
 */
export const orgMessages = new Hono<AppEnv>();

export const AUDIENCES = ["applied", "shortlisted", "finalists", "not_selected", "team"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Team statuses in each audience. "applied" is everyone who sent an application, whatever happened to it since. */
const STATUSES: Record<Exclude<Audience, "team">, string[]> = {
  applied: ["applied", "shortlisted", "rejected", "finalist", "winner"],
  shortlisted: ["shortlisted"],
  finalists: ["finalist", "winner"],
  not_selected: ["rejected"],
};

export const DAILY_LIMIT = 10;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

async function adminLoad(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const a = await loadOrg(c, c.req.param("slug")!);
  if (!a) return { err: c.json({ error: "Not found" }, 404) };
  if (!a.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const ch = await c.env.DB.prepare("SELECT id, slug, title FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(a.org.id, c.req.param("cslug")!).first<{ id: string; slug: string; title: string }>();
  if (!ch) return { err: c.json({ error: "Not found" }, 404) };
  return { org: a.org, ch };
}

/** SQL for the members an audience reaches, and its parameters after the challenge id. */
function who(audience: Audience, teamId: string | undefined) {
  if (audience === "team") return { where: "t.id = ?", params: [teamId ?? ""] };
  const st = STATUSES[audience];
  return { where: `t.status IN (${st.map(() => "?").join(",")})`, params: st };
}

const memberSql = (where: string) =>
  `FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id
   WHERE t.challenge_id = ? AND ${where} AND u.suspended = 0`;

orgMessages.get("/:slug/challenges/:cslug/messages", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const { results: items } = await c.env.DB.prepare(
    "SELECT id, title, body, audience, recipients, created_at FROM announcements WHERE challenge_id = ? ORDER BY created_at DESC LIMIT 30",
  ).bind(x.ch.id).all();
  // How many people each audience reaches right now, so the organiser knows before sending.
  const { results: counts } = await c.env.DB.prepare(
    `SELECT t.status, COUNT(DISTINCT m.user_id) AS n ${memberSql("1 = 1")} GROUP BY t.status`,
  ).bind(x.ch.id).all<{ status: string; n: number }>();
  const by = Object.fromEntries(counts.map((r) => [r.status, r.n]));
  const reach = Object.fromEntries(Object.entries(STATUSES).map(([k, st]) => [k, st.reduce((a, s) => a + (by[s] ?? 0), 0)]));
  const { results: teams } = await c.env.DB.prepare(
    "SELECT t.id, t.name, t.status FROM teams t JOIN applications a ON a.team_id = t.id WHERE t.challenge_id = ? ORDER BY t.name",
  ).bind(x.ch.id).all();
  const sent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM announcements WHERE challenge_id = ? AND created_at > ?").bind(x.ch.id, Date.now() - 86400000).first<{ n: number }>();
  return c.json({ items, reach, teams, left_today: Math.max(0, DAILY_LIMIT - (sent?.n ?? 0)) });
});

const body = z.object({
  audience: z.enum(AUDIENCES),
  team_id: z.string().max(40).optional(),
  title: z.string().trim().min(3, "Give the message a subject").max(100),
  body: z.string().trim().min(1, "Write the message").max(2000),
}).refine((b) => b.audience !== "team" || !!b.team_id, { message: "Pick a team", path: ["team_id"] });

orgMessages.post("/:slug/challenges/:cslug/messages", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  if (x.org.suspended) return c.json({ error: "Your organisation is suspended" }, 403);
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the message" }, 400);
  const p = parsed.data, db = c.env.DB, now = Date.now();
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM announcements WHERE challenge_id = ? AND created_at > ?").bind(x.ch.id, now - 86400000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= DAILY_LIMIT) return c.json({ error: `You can send up to ${DAILY_LIMIT} messages a day for one challenge. Try again tomorrow.` }, 429);
  const w = who(p.audience, p.team_id);
  if (p.audience === "team" && !(await db.prepare("SELECT 1 AS x FROM teams WHERE id = ? AND challenge_id = ?").bind(p.team_id, x.ch.id).first())) {
    return c.json({ error: "Not found" }, 404);
  }

  const link = `/o/${x.org.slug}/c/${x.ch.slug}`;
  const title = `${x.ch.title}: ${p.title}`;
  const ins = await db.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), u.id, 'challenge.message', ?, ?, ?, ? FROM (SELECT DISTINCT u.id ${memberSql(w.where)}) u`,
  ).bind(title, p.body, link, now, x.ch.id, ...w.params).run();
  const sent = ins.meta.changes ?? 0;
  if (!sent) return c.json({ error: "Nobody is in that group yet" }, 409);
  await db.prepare("INSERT INTO announcements (id, org_id, challenge_id, audience, author_user_id, title, body, link, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), x.org.id, x.ch.id, p.audience === "team" ? `team:${p.team_id}` : p.audience, c.get("user")!.id, p.title, p.body, link, sent, now).run();
  pushLater(c);

  // Email copies through the outbox queue, a few at a time (decision D1).
  const { results: people } = await db.prepare(`SELECT DISTINCT u.email ${memberSql(w.where)}`).bind(x.ch.id, ...w.params).all<{ email: string }>();
  const url = `${c.env.APP_URL}${link}`;
  const subject = title;
  const text = `${p.body}\n\nFrom ${x.org.name}, about ${x.ch.title}:\n${url}`;
  const html = `${p.body.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#666">From ${esc(x.org.name)}, about <a href="${esc(url)}">${esc(x.ch.title)}</a>.</p>`;
  const queued = await queueEmails(c.env, people.map((m) => ({ to: m.email, subject, html, text }))).catch((e) => { console.error(`message email queue failed: ${e instanceof Error ? e.message : e}`); return false; });
  if (!queued) {
    // No queue binding (a local setup): email the first 40 inline, inside the free plan's 50 outgoing calls per request.
    c.executionCtx.waitUntil(Promise.all(people.slice(0, 40).map((m) =>
      sendEmail(c.env, m.email, subject, html, text).catch((e) => console.error(`message email failed: ${e instanceof Error ? e.message : e}`)))));
  }
  return c.json({ ok: true, recipients: sent });
});
