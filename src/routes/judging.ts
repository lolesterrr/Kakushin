import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { loadOrg } from "../lib/access";
import { sendEmail } from "../lib/email";
import { leaderboard, type Criterion, type ScoreRow } from "../lib/scoring";

/** Organiser side: criteria, judges, leaderboard. Mounted under /api/orgs. */
export const orgJudging = new Hono<AppEnv>();
/** Judge side. Mounted at /api/judge. */
export const judge = new Hono<AppEnv>();

interface Ch { id: string; slug: string; title: string; status: string; org_id: string }

async function adminLoad(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const ch = await c.env.DB.prepare("SELECT id, slug, title, status, org_id FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch) return { err: c.json({ error: "Not found" }, 404) };
  return { org: access.org, ch };
}

const criteriaOf = async (c: Context<AppEnv>, challengeId: string) =>
  (await c.env.DB.prepare("SELECT id, name, description, weight, max_score, position FROM criteria WHERE challenge_id = ? ORDER BY position, rowid").bind(challengeId).all<Criterion & { description: string }>()).results;

// ---- criteria (the rubric) ----
orgJudging.get("/:slug/challenges/:cslug/criteria", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  return c.json({ criteria: await criteriaOf(c, x.ch.id) });
});

const criteriaBody = z.object({
  criteria: z.array(z.object({
    id: z.string().max(40).optional(),
    name: z.string().trim().min(1, "Every criterion needs a name").max(60),
    description: z.string().trim().max(300).default(""),
    weight: z.number().gt(0, "Weights must be above zero").max(100),   // percent in the request
    max_score: z.number().int().min(1).max(100).default(10),
  })).min(1, "Add at least one criterion").max(10, "Use at most 10 criteria"),
});

orgJudging.put("/:slug/challenges/:cslug/criteria", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  // Judges score against the rubric, so changing it mid-judging would silently change or clamp their scores.
  if (x.ch.status === "judging" || x.ch.status === "completed") {
    return c.json({ error: "The rubric is locked once judging starts. To change it, move the stage back to reviewing first." }, 409);
  }
  const parsed = criteriaBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the criteria" }, 400);
  const list = parsed.data.criteria;
  const sum = list.reduce((a, r) => a + r.weight, 0);
  if (Math.abs(sum - 100) > 0.01) return c.json({ error: `Weights must add up to 100. They add up to ${Math.round(sum * 100) / 100}.` }, 400);

  const existing = new Set((await criteriaOf(c, x.ch.id)).map((r) => r.id));
  const keep = new Set(list.map((r) => r.id).filter((id): id is string => !!id && existing.has(id)));
  const stmts = [...existing].filter((id) => !keep.has(id)).map((id) => c.env.DB.prepare("DELETE FROM criteria WHERE id = ? AND challenge_id = ?").bind(id, x.ch.id));
  list.forEach((r, i) => {
    if (r.id && keep.has(r.id)) {
      stmts.push(c.env.DB.prepare("UPDATE criteria SET name = ?, description = ?, weight = ?, max_score = ?, position = ? WHERE id = ? AND challenge_id = ?")
        .bind(r.name, r.description, r.weight / 100, r.max_score, i, r.id, x.ch.id));
    } else {
      stmts.push(c.env.DB.prepare("INSERT INTO criteria (id, challenge_id, name, description, weight, max_score, position) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(newId(), x.ch.id, r.name, r.description, r.weight / 100, r.max_score, i));
    }
  });
  await c.env.DB.batch(stmts);
  // A lowered max_score could leave old scores above the new max; clamp them.
  await c.env.DB.prepare("UPDATE scores SET score = (SELECT max_score FROM criteria WHERE criteria.id = scores.criterion_id) WHERE criterion_id IN (SELECT id FROM criteria WHERE challenge_id = ?) AND score > (SELECT max_score FROM criteria WHERE criteria.id = scores.criterion_id)").bind(x.ch.id).run();
  return c.json({ ok: true });
});

// ---- judges ----
orgJudging.get("/:slug/challenges/:cslug/judges", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const { results } = await c.env.DB.prepare(
    `SELECT j.email, j.invited_at, (SELECT COUNT(DISTINCT s.team_id) FROM scores s JOIN users u ON u.id = s.judge_user_id
        WHERE u.email = j.email AND s.team_id IN (SELECT id FROM teams WHERE challenge_id = j.challenge_id)) AS teams_scored
     FROM judges j WHERE j.challenge_id = ? ORDER BY j.invited_at`,
  ).bind(x.ch.id).all();
  return c.json({ judges: results });
});

orgJudging.post("/:slug/challenges/:cslug/judges", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid email address" }, 400);
  const n = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM judges WHERE challenge_id = ?").bind(x.ch.id).first<{ n: number }>())?.n ?? 0;
  if (n >= 20) return c.json({ error: "You can invite up to 20 judges" }, 409);
  const res = await c.env.DB.prepare("INSERT OR IGNORE INTO judges (challenge_id, email, invited_at) VALUES (?, ?, ?)").bind(x.ch.id, parsed.data.email, Date.now()).run();
  if (res.meta.changes) {
    const url = `${c.env.APP_URL}/judge/${x.org.slug}/${x.ch.slug}`;
    const text = `You have been invited to judge "${x.ch.title}" on Kakushin by ${x.org.name}.\n\nSign in with this email address to see the teams and score them:\n${url}`;
    const html = `<p>You have been invited to judge <b>${x.ch.title.replace(/</g, "&lt;")}</b> on Kakushin by ${x.org.name.replace(/</g, "&lt;")}.</p><p>Sign in with this email address to see the teams and score them.</p><p><a href="${url}">Open the judging page</a></p>`;
    c.executionCtx.waitUntil(sendEmail(c.env, parsed.data.email, `You are invited to judge ${x.ch.title}`, html, text).catch((e) => console.error(`judge invite email failed: ${e instanceof Error ? e.message : e}`)));
  }
  return c.json({ ok: true, invited: !!res.meta.changes, link: `${c.env.APP_URL}/judge/${x.org.slug}/${x.ch.slug}` });
});

orgJudging.delete("/:slug/challenges/:cslug/judges", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ email: z.string().trim().toLowerCase() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a judge" }, 400);
  await c.env.DB.prepare("DELETE FROM judges WHERE challenge_id = ? AND email = ?").bind(x.ch.id, parsed.data.email).run();
  return c.json({ ok: true });
});

// ---- leaderboard ----
async function board(c: Context<AppEnv>, ch: Ch) {
  const criteria = await criteriaOf(c, ch.id);
  const { results: teams } = await c.env.DB.prepare("SELECT id, name FROM teams WHERE challenge_id = ? AND status IN ('finalist','winner')").bind(ch.id).all<{ id: string; name: string }>();
  const { results: js } = await c.env.DB.prepare(
    `SELECT j.email, u.id AS user_id FROM judges j LEFT JOIN users u ON u.email = j.email WHERE j.challenge_id = ? ORDER BY j.invited_at`,
  ).bind(ch.id).all<{ email: string; user_id: string | null }>();
  const { results: raw } = await c.env.DB.prepare(
    `SELECT s.judge_user_id, s.team_id, s.criterion_id, s.score FROM scores s JOIN criteria cr ON cr.id = s.criterion_id WHERE cr.challenge_id = ?`,
  ).bind(ch.id).all<{ judge_user_id: string; team_id: string; criterion_id: string; score: number }>();
  const emailOf = new Map(js.filter((j) => j.user_id).map((j) => [j.user_id as string, j.email]));
  const rows: ScoreRow[] = raw.filter((r) => emailOf.has(r.judge_user_id)).map((r) => ({ judge: emailOf.get(r.judge_user_id)!, team: r.team_id, criterion: r.criterion_id, score: r.score }));
  return { criteria, judges: js.map((j) => j.email), rows, teams, lb: leaderboard(criteria, teams, rows, js.map((j) => j.email)) };
}

orgJudging.get("/:slug/challenges/:cslug/leaderboard", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const b = await board(c, x.ch);
  return c.json({ criteria: b.criteria, judges: b.judges, leaderboard: b.lb });
});

const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

orgJudging.get("/:slug/challenges/:cslug/leaderboard.csv", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const b = await board(c, x.ch);
  const lines = [["Rank", "Team", "Average", "Judges finished", ...b.judges.map((j) => `Judge ${j}`)].map(cell).join(",")];
  for (const r of b.lb) lines.push([r.total === null ? "" : r.rank, r.name, r.total ?? "", r.finished, ...r.judges.map((j) => j.total ?? "")].map(cell).join(","));
  return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.ch.slug}-scores.csv"` } });
});

// ---- judge side ----
async function judgeLoad(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) return { err: c.json({ error: "Not signed in" }, 401) };
  const row = await c.env.DB.prepare(
    `SELECT ch.id, ch.slug, ch.title, ch.status, ch.org_id, o.slug AS oslug, o.name AS oname
     FROM challenges ch JOIN organizations o ON o.id = ch.org_id JOIN judges j ON j.challenge_id = ch.id
     WHERE o.slug = ? AND ch.slug = ? AND j.email = ?`,
  ).bind(c.req.param("slug")!, c.req.param("cslug")!, user.email.toLowerCase()).first<Ch & { oslug: string; oname: string }>();
  if (!row) return { err: c.json({ error: "Not found" }, 404) };
  return { user, ch: row };
}

judge.get("/challenges", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ challenges: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT ch.slug, ch.title, ch.status, o.slug AS oslug, o.name AS oname,
       (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id AND t.status IN ('finalist','winner')) AS teams
     FROM judges j JOIN challenges ch ON ch.id = j.challenge_id JOIN organizations o ON o.id = ch.org_id WHERE j.email = ? ORDER BY ch.created_at DESC`,
  ).bind(user.email.toLowerCase()).all();
  return c.json({ challenges: results });
});

judge.get("/:slug/:cslug", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const criteria = await criteriaOf(c, x.ch.id);
  const { results: teams } = await c.env.DB.prepare(
    `SELECT t.id, t.name, (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id AND (s.deck_key IS NOT NULL OR s.video_url != '' OR s.demo_url != '')) AS has_pitch,
       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.user_id = ?) AS mine,
       (SELECT COUNT(*) FROM scores sc WHERE sc.judge_user_id = ? AND sc.team_id = t.id) AS scored
     FROM teams t WHERE t.challenge_id = ? AND t.status IN ('finalist','winner') ORDER BY t.name`,
  ).bind(x.user.id, x.user.id, x.ch.id).all<{ id: string; name: string; has_pitch: number; mine: number; scored: number }>();
  return c.json({
    challenge: { title: x.ch.title, status: x.ch.status, org: x.ch.oname, scoring_open: x.ch.status === "judging" }, criteria,
    teams: teams.map((t) => ({ id: t.id, name: t.name, has_pitch: !!t.has_pitch, own_team: !!t.mine, done: t.scored >= criteria.length && criteria.length > 0, partial: t.scored > 0 && t.scored < criteria.length })),
  });
});

async function judgeTeam(c: Context<AppEnv>, x: { user: { id: string }; ch: Ch }) {
  return c.env.DB.prepare("SELECT id, name FROM teams WHERE id = ? AND challenge_id = ? AND status IN ('finalist','winner')").bind(c.req.param("teamId")!, x.ch.id).first<{ id: string; name: string }>();
}

judge.get("/:slug/:cslug/teams/:teamId", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const t = await judgeTeam(c, x);
  if (!t) return c.json({ error: "Not found" }, 404);
  const p = await c.env.DB.prepare("SELECT deck_key, deck_name, video_url, demo_url, notes FROM submissions WHERE team_id = ?").bind(t.id).first<any>();
  const { results: members } = await c.env.DB.prepare("SELECT u.name, u.email, u.institution FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.joined_at").bind(t.id).all<{ name: string | null; email: string; institution: string | null }>();
  const { results: mine } = await c.env.DB.prepare("SELECT criterion_id, score, comment FROM scores WHERE judge_user_id = ? AND team_id = ?").bind(x.user.id, t.id).all();
  const own = (await c.env.DB.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, x.user.id).first()) !== null;
  return c.json({
    team: { id: t.id, name: t.name, members: members.map((m) => ({ name: m.name || m.email.split("@")[0], institution: m.institution })) },
    pitch: p ? { has_deck: !!p.deck_key, deck_name: p.deck_name, video_url: p.video_url, demo_url: p.demo_url, notes: p.notes } : null,
    scores: mine, own_team: own, scoring_open: x.ch.status === "judging", criteria: await criteriaOf(c, x.ch.id),
  });
});

judge.put("/:slug/:cslug/teams/:teamId/scores", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  if (x.ch.status !== "judging") return c.json({ error: "Scoring is not open yet. The organiser starts judging." }, 409);
  const t = await judgeTeam(c, x);
  if (!t) return c.json({ error: "Not found" }, 404);
  if (await c.env.DB.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, x.user.id).first()) {
    return c.json({ error: "You cannot score your own team" }, 403);
  }
  const parsed = z.object({ scores: z.array(z.object({ criterion_id: z.string(), score: z.number().int().min(0), comment: z.string().trim().max(1000).default("") })).min(1).max(10) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check your scores" }, 400);
  const criteria = new Map((await criteriaOf(c, x.ch.id)).map((r) => [r.id, r]));
  for (const s of parsed.data.scores) {
    const cr = criteria.get(s.criterion_id);
    if (!cr) return c.json({ error: "Unknown criterion" }, 400);
    if (s.score > cr.max_score) return c.json({ error: `${cr.name} is scored out of ${cr.max_score}` }, 400);
  }
  await c.env.DB.batch(parsed.data.scores.map((s) => c.env.DB.prepare(
    `INSERT INTO scores (judge_user_id, team_id, criterion_id, score, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(judge_user_id, team_id, criterion_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, updated_at = excluded.updated_at`,
  ).bind(x.user.id, t.id, s.criterion_id, s.score, s.comment, Date.now())));
  return c.json({ ok: true });
});
