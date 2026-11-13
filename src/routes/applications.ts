import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { pushLater } from "../lib/push";
import { notifyTeam } from "../lib/mail";
import { criteriaOf, saveCriteria } from "./judging";
import { judgeTotal } from "../lib/scoring";

/** Organiser side: /api/orgs/:slug/challenges/:cslug/applications... */
export const orgApplications = new Hono<AppEnv>();

interface Row {
  team_id: string; name: string; status: string; submitted_at: number; answers: string; reviewer_note: string;
}
interface Q { id: string; label: string }

async function load(c: Parameters<typeof loadOrg>[0], slug: string, cslug: string) {
  if (!c.get("user")) return { error: { msg: "Not signed in", code: 401 as const } };
  const access = await loadOrg(c, slug);
  if (!access) return { error: { msg: "Not found", code: 404 as const } };
  if (!access.role) return { error: { msg: "Only organisation admins can do that", code: 403 as const } };
  const ch = await c.env.DB.prepare("SELECT id, slug, title, status, questions FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, cslug).first<{ id: string; slug: string; title: string; status: string; questions: string }>();
  if (!ch) return { error: { msg: "Not found", code: 404 as const } };
  return { org: access.org, ch, questions: JSON.parse(ch.questions) as Q[] };
}

async function list(c: Parameters<typeof loadOrg>[0], challengeId: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id AS team_id, t.name, t.status, a.submitted_at, a.answers, a.reviewer_note
     FROM teams t JOIN applications a ON a.team_id = t.id WHERE t.challenge_id = ? ORDER BY a.submitted_at DESC`,
  ).bind(challengeId).all<Row>();
  const { results: ms } = await c.env.DB.prepare(
    `SELECT m.team_id, u.name, u.email, u.institution, (t.lead_user_id = u.id) AS is_lead
     FROM team_members m JOIN users u ON u.id = m.user_id JOIN teams t ON t.id = m.team_id
     WHERE t.challenge_id = ? AND t.id IN (SELECT team_id FROM applications) ORDER BY m.joined_at`,
  ).bind(challengeId).all<{ team_id: string; name: string | null; email: string; institution: string | null; is_lead: number }>();
  const criteria = await criteriaOf(c, challengeId, "application");
  const { results: sc } = await c.env.DB.prepare(
    `SELECT s.reviewer_user_id, s.team_id, s.criterion_id, s.score, s.comment FROM application_scores s
     JOIN criteria cr ON cr.id = s.criterion_id WHERE cr.challenge_id = ? AND cr.stage = 'application'`,
  ).bind(challengeId).all<{ reviewer_user_id: string; team_id: string; criterion_id: string; score: number; comment: string }>();
  const me = c.get("user")!.id;
  return results.map((r) => {
    const mine = sc.filter((s) => s.team_id === r.team_id);
    const totals = [...new Set(mine.map((s) => s.reviewer_user_id))]
      .map((rev) => judgeTotal(criteria, new Map(mine.filter((s) => s.reviewer_user_id === rev).map((s) => [s.criterion_id, s.score]))))
      .filter((t): t is number => t !== null);
    return {
      ...r, answers: JSON.parse(r.answers) as Record<string, string>,
      members: ms.filter((m) => m.team_id === r.team_id).map((m) => ({ name: m.name, email: m.email, institution: m.institution, is_lead: !!m.is_lead })),
      // Average of the reviewers who scored every application criterion, 0 to 100.
      review: {
        average: totals.length ? Math.round((totals.reduce((a, t) => a + t, 0) / totals.length) * 100) / 100 : null,
        reviewers: totals.length,
        mine: mine.filter((s) => s.reviewer_user_id === me).map((s) => ({ criterion_id: s.criterion_id, score: s.score, comment: s.comment })),
      },
    };
  });
}

/** Numbers and the newest applications for the organiser's challenge overview. */
orgApplications.get("/:slug/challenges/:cslug/overview", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const { results } = await c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM teams WHERE challenge_id = ? GROUP BY status").bind(x.ch.id).all<{ status: string; n: number }>();
  const counts = Object.fromEntries(results.map((r) => [r.status, r.n]));
  const newest = (await list(c, x.ch.id)).filter((a) => a.status === "applied").slice(0, 5)
    .map((a) => ({ team_id: a.team_id, name: a.name, submitted_at: a.submitted_at, members: a.members.length }));
  return c.json({ counts, newest });
});

orgApplications.get("/:slug/challenges/:cslug/applications", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  return c.json({ questions: x.questions, criteria: await criteriaOf(c, x.ch.id, "application"), stage: x.ch.status, applications: await list(c, x.ch.id) });
});

// ---- the application rubric ----
orgApplications.get("/:slug/challenges/:cslug/application-criteria", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  return c.json({ criteria: await criteriaOf(c, x.ch.id, "application") });
});

orgApplications.put("/:slug/challenges/:cslug/application-criteria", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  return saveCriteria(c, x.ch, "application");
});

/** Any organisation admin scores an application. Each admin has their own scores; the list shows the average. */
orgApplications.put("/:slug/challenges/:cslug/applications/:teamId/scores", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const team = await c.env.DB.prepare("SELECT t.id FROM teams t JOIN applications a ON a.team_id = t.id WHERE t.id = ? AND t.challenge_id = ?")
    .bind(c.req.param("teamId"), x.ch.id).first<{ id: string }>();
  if (!team) return c.json({ error: "Not found" }, 404);
  const parsed = z.object({ scores: z.array(z.object({ criterion_id: z.string(), score: z.number().int().min(0), comment: z.string().trim().max(1000).default("") })).min(1).max(10) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check your scores" }, 400);
  const criteria = new Map((await criteriaOf(c, x.ch.id, "application")).map((r) => [r.id, r]));
  if (!criteria.size) return c.json({ error: "Set up the application rubric first" }, 409);
  for (const s of parsed.data.scores) {
    const cr = criteria.get(s.criterion_id);
    if (!cr) return c.json({ error: "Unknown criterion" }, 400);
    if (s.score > cr.max_score) return c.json({ error: `${cr.name} is scored out of ${cr.max_score}` }, 400);
  }
  const me = c.get("user")!.id, now = Date.now();
  await c.env.DB.batch(parsed.data.scores.map((s) => c.env.DB.prepare(
    `INSERT INTO application_scores (reviewer_user_id, team_id, criterion_id, score, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(reviewer_user_id, team_id, criterion_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, updated_at = excluded.updated_at`,
  ).bind(me, team.id, s.criterion_id, s.score, s.comment, now)));
  return c.json({ ok: true });
});

const STATUS = z.enum(["applied", "shortlisted", "rejected", "finalist"]);

orgApplications.post("/:slug/challenges/:cslug/applications/status", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const parsed = z.object({ team_ids: z.array(z.string()).min(1).max(90), status: STATUS }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick between 1 and 90 teams and a status" }, 400);
  const { team_ids, status } = parsed.data;

  // Only teams of this challenge that have an application and are not already past review (finalist, winner).
  const marks = team_ids.map(() => "?").join(",");
  const { results: teams } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status FROM teams t JOIN applications a ON a.team_id = t.id
     WHERE t.challenge_id = ? AND t.status IN ('applied','shortlisted','rejected','finalist') AND t.id IN (${marks})`,
  ).bind(x.ch.id, ...team_ids).all<{ id: string; name: string; status: string }>();
  const changing = teams.filter((t) => t.status !== status);
  if (changing.length) {
    await c.env.DB.batch(changing.map((t) => c.env.DB.prepare("UPDATE teams SET status = ? WHERE id = ?").bind(status, t.id)));
  }
  if (changing.length && (status === "shortlisted" || status === "rejected")) {
    // One query for everyone's emails (the free plan allows few queries per request), then one note per team.
    const ids = changing.map((t) => t.id);
    const { results: ms } = await c.env.DB.prepare(
      `SELECT m.team_id, u.email FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id IN (${ids.map(() => "?").join(",")})`,
    ).bind(...ids).all<{ team_id: string; email: string }>();
    for (const t of changing) {
      notifyTeam(c, status, ms.filter((m) => m.team_id === t.id).map((m) => m.email), { team: t.name, challenge: x.ch.title, org: x.org.name, url: `${c.env.APP_URL}/o/${x.org.slug}/c/${x.ch.slug}` });
    }
  }
  if (changing.length && (status === "shortlisted" || status === "finalist" || status === "rejected")) {
    const title = status === "shortlisted" ? `You are shortlisted: ${x.ch.title}` : status === "finalist" ? `You are a finalist: ${x.ch.title}` : `Update on your application: ${x.ch.title}`;
    const body = status === "shortlisted" ? "Open the challenge for your next step." : status === "finalist" ? "Judges can now see your pitch." : "Thank you for applying. Plenty of other challenges are open.";
    const stmts = [];
    for (let i = 0; i < changing.length; i += 90) {
      const ids = changing.slice(i, i + 90).map((t) => t.id);
      stmts.push(c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
         SELECT lower(hex(randomblob(12))), m.user_id, 'application.${status}', ?, ?, ?, ? FROM team_members m WHERE m.team_id IN (${ids.map(() => "?").join(",")})`,
      ).bind(title, body, `/o/${x.org.slug}/c/${x.ch.slug}`, Date.now(), ...ids));
    }
    await c.env.DB.batch(stmts);
    pushLater(c);
  }
  return c.json({ ok: true, updated: changing.length });
});

orgApplications.put("/:slug/challenges/:cslug/applications/:teamId/note", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const parsed = z.object({ note: z.string().trim().max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Note is too long" }, 400);
  const res = await c.env.DB.prepare(
    `UPDATE applications SET reviewer_note = ? WHERE team_id = ? AND team_id IN (SELECT id FROM teams WHERE challenge_id = ?)`,
  ).bind(parsed.data.note, c.req.param("teamId"), x.ch.id).run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Spreadsheets run text starting with = + - @ as formulas, so those cells get a leading quote. */
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

orgApplications.get("/:slug/challenges/:cslug/applications.csv", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const rows = await list(c, x.ch.id);
  const head = ["Team", "Status", "Submitted", "Review average", "Reviewers", "Members", "Emails", "Institutions", ...x.questions.map((q) => q.label), "Reviewer note"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.status, new Date(r.submitted_at).toISOString(), r.review.average ?? "", r.review.reviewers,
      r.members.map((m) => m.name ?? m.email).join("; "), r.members.map((m) => m.email).join("; "),
      [...new Set(r.members.map((m) => m.institution).filter(Boolean))].join("; "),
      ...x.questions.map((q) => r.answers[q.id] ?? ""), r.reviewer_note,
    ].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.ch.slug}-applications.csv"` },
  });
});
