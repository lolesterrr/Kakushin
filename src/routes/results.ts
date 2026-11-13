import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { sendEmail } from "../lib/email";
import { pushLater } from "../lib/push";
import { queueEmails } from "../lib/outbox";

/** Organiser side: winners, publishing, certificates. Mounted under /api/orgs. */
export const orgResults = new Hono<AppEnv>();

interface Ch { id: string; slug: string; title: string; status: string; org_id: string; results_published: number }

async function adminLoad(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const ch = await c.env.DB.prepare("SELECT id, slug, title, status, org_id, results_published FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch) return { err: c.json({ error: "Not found" }, 404) };
  return { org: access.org, ch };
}

orgResults.get("/:slug/challenges/:cslug/results", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const { results: teams } = await c.env.DB.prepare(
    "SELECT id, name, status, placement FROM teams WHERE challenge_id = ? AND status IN ('finalist','winner') ORDER BY placement IS NULL, placement, name",
  ).bind(x.ch.id).all<{ id: string; name: string; status: string; placement: number | null }>();
  const certs = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM certificates WHERE challenge_id = ?").bind(x.ch.id).first<{ n: number }>();
  return c.json({ published: !!x.ch.results_published, stage: x.ch.status, teams, certificates: certs?.n ?? 0 });
});

orgResults.put("/:slug/challenges/:cslug/results", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  if (x.ch.results_published) return c.json({ error: "Results are already published, so placements are locked" }, 409);
  const parsed = z.object({ placements: z.array(z.object({ team_id: z.string(), placement: z.number().int().min(1).max(50) })).max(50) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the placements" }, 400);
  const list = parsed.data.placements;
  if (new Set(list.map((p) => p.team_id)).size !== list.length) return c.json({ error: "A team can only have one placement" }, 400);
  if (new Set(list.map((p) => p.placement)).size !== list.length) return c.json({ error: "Two teams cannot share a placement. Give each a different number." }, 400);

  const { results: ok } = await c.env.DB.prepare("SELECT id FROM teams WHERE challenge_id = ? AND status IN ('finalist','winner')").bind(x.ch.id).all<{ id: string }>();
  const eligible = new Set(ok.map((t) => t.id));
  if (list.some((p) => !eligible.has(p.team_id))) return c.json({ error: "Only finalists can be placed" }, 400);

  const db = c.env.DB;
  await db.batch([
    db.prepare("UPDATE teams SET placement = NULL, status = 'finalist' WHERE challenge_id = ? AND status = 'winner'").bind(x.ch.id),
    ...list.map((p) => db.prepare("UPDATE teams SET placement = ?, status = 'winner' WHERE id = ? AND challenge_id = ?").bind(p.placement, p.team_id, x.ch.id)),
  ]);
  return c.json({ ok: true });
});

/** Publishes results, issues one certificate per participant and tells them. Safe to call again: nothing is issued twice. */
orgResults.post("/:slug/challenges/:cslug/results/publish", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  if (x.ch.status === "draft" || x.ch.status === "open") return c.json({ error: "Move the challenge to reviewing or judging before publishing results" }, 409);
  const won = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM teams WHERE challenge_id = ? AND status = 'winner'").bind(x.ch.id).first<{ n: number }>();
  if (!won?.n) return c.json({ error: "Place at least one team before publishing" }, 409);

  const now = Date.now(), db = c.env.DB;
  // Each of these is a single statement, so a big event stays well inside the free query limit.
  await db.batch([
    db.prepare("UPDATE challenges SET results_published = 1, status = 'completed' WHERE id = ?").bind(x.ch.id),
    db.prepare(
      `INSERT OR IGNORE INTO certificates (id, code, user_id, challenge_id, team_id, kind, title, issued_at)
       SELECT lower(hex(randomblob(12))),
              substr(upper(hex(randomblob(6))), 1, 4) || '-' || substr(upper(hex(randomblob(6))), 5, 4) || '-' || substr(upper(hex(randomblob(6))), 9, 4),
              m.user_id, t.challenge_id, t.id,
              CASE t.status WHEN 'winner' THEN 'winner' WHEN 'finalist' THEN 'finalist' ELSE 'participant' END,
              CASE t.status WHEN 'winner' THEN CASE t.placement WHEN 1 THEN '1st Place' WHEN 2 THEN '2nd Place' WHEN 3 THEN '3rd Place' ELSE t.placement || 'th Place' END
                            WHEN 'finalist' THEN 'Finalist' ELSE 'Participant' END,
              ?
       FROM teams t JOIN team_members m ON m.team_id = t.id
       WHERE t.challenge_id = ? AND t.status IN ('shortlisted','finalist','winner')`,
    ).bind(now, x.ch.id),
    db.prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
       SELECT lower(hex(randomblob(12))), ce.user_id, 'results.published', ?, ?, '/profile#certificates', ?
       FROM certificates ce WHERE ce.challenge_id = ? AND NOT EXISTS (
         SELECT 1 FROM notifications n WHERE n.user_id = ce.user_id AND n.kind = 'results.published' AND n.link = '/profile#certificates' AND n.title = ?)`,
    ).bind(`Results are out: ${x.ch.title}`, "Your certificate is ready to download.", now, x.ch.id, `Results are out: ${x.ch.title}`),
  ]);

  pushLater(c);
  const url = `${c.env.APP_URL}/o/${x.org.slug}/c/${x.ch.slug}`;
  const subject = `Results are out: ${x.ch.title}`;
  const text = `The results for "${x.ch.title}" by ${x.org.name} are out.\n\nSee them and download your certificate:\n${url}`;
  const html = `<p>The results for <b>${x.ch.title.replace(/</g, "&lt;")}</b> by ${x.org.name.replace(/</g, "&lt;")} are out.</p><p><a href="${url}">See the results and download your certificate</a></p>`;
  // Everyone gets the email through the queue, which sends a few at a time. Publishing twice does not email twice.
  const { results: people } = await db.prepare(
    "SELECT DISTINCT u.email FROM certificates ce JOIN users u ON u.id = ce.user_id WHERE ce.challenge_id = ? AND ce.issued_at = ? AND u.suspended = 0",
  ).bind(x.ch.id, now).all<{ email: string }>();
  const queued = await queueEmails(c.env, people.map((p) => ({ to: p.email, subject, html, text }))).catch((e) => { console.error(`results email queue failed: ${e instanceof Error ? e.message : e}`); return false; });
  if (!queued) {
    // No queue binding (a local setup): email the first 40 inline, inside the free plan's 50 outgoing calls per request.
    c.executionCtx.waitUntil(Promise.all(people.slice(0, 40).map((p) =>
      sendEmail(c.env, p.email, subject, html, text).catch((e) => console.error(`results email failed: ${e instanceof Error ? e.message : e}`)))));
  }

  const n = await db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE challenge_id = ?").bind(x.ch.id).first<{ n: number }>();
  return c.json({ ok: true, certificates: n?.n ?? 0 });
});

/** Public: the published results of a challenge. */
orgResults.get("/:slug/challenges/:cslug/public-results", async (c) => {
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return c.json({ error: "Not found" }, 404);
  const ch = await c.env.DB.prepare("SELECT id, results_published FROM challenges WHERE org_id = ? AND slug = ? AND status != 'draft'").bind(access.org.id, c.req.param("cslug")!).first<{ id: string; results_published: number }>();
  if (!ch) return c.json({ error: "Not found" }, 404);
  if (!ch.results_published) return c.json({ published: false, winners: [], finalists: [] });
  const { results: teams } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status, t.placement,
       (SELECT group_concat(COALESCE(NULLIF(u.name, ''), 'Participant'), ', ') FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = t.id) AS members
     FROM teams t WHERE t.challenge_id = ? AND t.status IN ('finalist','winner') ORDER BY t.placement IS NULL, t.placement, t.name`,
  ).bind(ch.id).all<{ id: string; name: string; status: string; placement: number | null; members: string | null }>();
  return c.json({
    published: true,
    winners: teams.filter((t) => t.status === "winner").map((t) => ({ placement: t.placement, team: t.name, members: t.members ?? "" })),
    finalists: teams.filter((t) => t.status === "finalist").map((t) => t.name),
  });
});
