import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { loadOrg } from "../lib/access";
import { sendEmail } from "../lib/email";
import { calibration, leaderboard, type Criterion, type ScoreRow } from "../lib/scoring";
import { autoAssign, judgeSees } from "../lib/assign";
import { pushLater } from "../lib/push";
import { loginFromProfile, matchContributors, parseRepo, repoStats } from "../lib/github";
import { youtubeEmbed } from "../lib/media";
import { pitchImages } from "./pitch";

/** Organiser side: criteria, judges, leaderboard. Mounted under /api/orgs. */
export const orgJudging = new Hono<AppEnv>();
/** Judge side. Mounted at /api/judge. */
export const judge = new Hono<AppEnv>();

interface Ch { id: string; slug: string; title: string; status: string; org_id: string; blind_judging: number; judges_per_team: number }

async function adminLoad(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const ch = await c.env.DB.prepare("SELECT id, slug, title, status, org_id, blind_judging, judges_per_team FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch) return { err: c.json({ error: "Not found" }, 404) };
  return { org: access.org, ch };
}

export type Stage = "application" | "pitch";

/** SQL: a pitch criterion (by table alias) belongs to its challenge's current round. */
export const CURRENT_ROUND = (a: string) => `${a}.round_no = (SELECT cr0.current_round FROM challenges cr0 WHERE cr0.id = ${a}.challenge_id)`;
/** SQL: a team (by table alias) is a finalist still in the current round. */
export const FINALIST_NOW = (a: string) => `${a}.status IN ('finalist','winner') AND ${a}.round_reached >= (SELECT ch0.current_round FROM challenges ch0 WHERE ch0.id = ${a}.challenge_id)`;

export const criteriaOf = async (c: Context<AppEnv>, challengeId: string, stage: Stage = "pitch") =>
  (await c.env.DB.prepare(`SELECT id, name, description, weight, max_score, position FROM criteria WHERE challenge_id = ?1 AND stage = ?2 AND (stage <> 'pitch' OR ${CURRENT_ROUND("criteria")}) ORDER BY position, rowid`).bind(challengeId, stage).all<Criterion & { description: string }>()).results;

export const criteriaBody = z.object({
  criteria: z.array(z.object({
    id: z.string().max(40).optional(),
    name: z.string().trim().min(1, "Every criterion needs a name").max(60),
    description: z.string().trim().max(300).default(""),
    weight: z.number().gt(0, "Weights must be above zero").max(100),   // percent in the request
    max_score: z.number().int().min(1).max(100).default(10),
  })).min(1, "Add at least one criterion").max(10, "Use at most 10 criteria"),
});

/**
 * Replaces one stage's rubric. Judges and reviewers score against it, so changing it mid-judging would silently change
 * or clamp their scores: both rubrics lock once the challenge reaches judging.
 */
export async function saveCriteria(c: Context<AppEnv>, ch: { id: string; status: string }, stage: Stage): Promise<Response> {
  if (ch.status === "judging" || ch.status === "completed") {
    return c.json({ error: "The rubric is locked once judging starts. To change it, move the stage back to reviewing first." }, 409);
  }
  const parsed = criteriaBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the criteria" }, 400);
  const list = parsed.data.criteria;
  const sum = list.reduce((a, r) => a + r.weight, 0);
  if (Math.abs(sum - 100) > 0.01) return c.json({ error: `Weights must add up to 100. They add up to ${Math.round(sum * 100) / 100}.` }, 400);

  const existing = new Set((await criteriaOf(c, ch.id, stage)).map((r) => r.id));
  const keep = new Set(list.map((r) => r.id).filter((id): id is string => !!id && existing.has(id)));
  const stmts = [...existing].filter((id) => !keep.has(id)).map((id) => c.env.DB.prepare("DELETE FROM criteria WHERE id = ? AND challenge_id = ? AND stage = ?").bind(id, ch.id, stage));
  list.forEach((r, i) => {
    if (r.id && keep.has(r.id)) {
      stmts.push(c.env.DB.prepare("UPDATE criteria SET name = ?, description = ?, weight = ?, max_score = ?, position = ? WHERE id = ? AND challenge_id = ? AND stage = ?")
        .bind(r.name, r.description, r.weight / 100, r.max_score, i, r.id, ch.id, stage));
    } else {
      stmts.push(c.env.DB.prepare("INSERT INTO criteria (id, challenge_id, name, description, weight, max_score, position, stage, round_no) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT current_round FROM challenges WHERE id = ?2))")
        .bind(newId(), ch.id, r.name, r.description, r.weight / 100, r.max_score, i, stage));
    }
  });
  await c.env.DB.batch(stmts);
  // A lowered max_score could leave old scores above the new max; clamp them.
  const table = stage === "pitch" ? "scores" : "application_scores";
  await c.env.DB.prepare(`UPDATE ${table} SET score = (SELECT max_score FROM criteria WHERE criteria.id = ${table}.criterion_id) WHERE criterion_id IN (SELECT id FROM criteria WHERE challenge_id = ? AND stage = ?) AND score > (SELECT max_score FROM criteria WHERE criteria.id = ${table}.criterion_id)`).bind(ch.id, stage).run();
  return c.json({ ok: true });
}

// ---- criteria (the pitch rubric) ----
orgJudging.get("/:slug/challenges/:cslug/criteria", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  return c.json({ criteria: await criteriaOf(c, x.ch.id) });
});

orgJudging.put("/:slug/challenges/:cslug/criteria", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  return saveCriteria(c, x.ch, "pitch");
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
  await c.env.DB.batch(["judges", "judge_assignments", "judge_conflicts"].map((t) =>
    c.env.DB.prepare(`DELETE FROM ${t} WHERE challenge_id = ? AND email = ?`).bind(x.ch.id, parsed.data.email)));
  return c.json({ ok: true });
});

// ---- settings, assignments, conflicts ----
orgJudging.put("/:slug/challenges/:cslug/judging/settings", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ blind_judging: z.boolean().optional(), judges_per_team: z.number().int().min(1).max(20).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Judges per team must be between 1 and 20" }, 400);
  const b = parsed.data;
  await c.env.DB.prepare("UPDATE challenges SET blind_judging = ?, judges_per_team = ? WHERE id = ?")
    .bind(b.blind_judging === undefined ? x.ch.blind_judging : b.blind_judging ? 1 : 0, b.judges_per_team ?? x.ch.judges_per_team, x.ch.id).run();
  return c.json({ ok: true });
});


/** Finalists with their assigned judges, conflict flags and progress, for the organiser. */
async function assignmentView(c: Context<AppEnv>, ch: Ch) {
  const db = c.env.DB;
  const [teams, judges, asg, conf, done, own] = await db.batch([
    db.prepare(`SELECT t.id, t.name FROM teams t WHERE t.challenge_id = ? AND ${FINALIST_NOW("t")} ORDER BY t.name`).bind(ch.id),
    db.prepare("SELECT email FROM judges WHERE challenge_id = ? ORDER BY invited_at").bind(ch.id),
    db.prepare("SELECT email, team_id FROM judge_assignments WHERE challenge_id = ?").bind(ch.id),
    db.prepare("SELECT email, team_id, created_at FROM judge_conflicts WHERE challenge_id = ?").bind(ch.id),
    // A judge finished a team when they scored every pitch criterion.
    db.prepare(
      `SELECT u.email, s.team_id FROM scores s JOIN users u ON u.id = s.judge_user_id JOIN criteria cr ON cr.id = s.criterion_id
       WHERE cr.challenge_id = ?1 AND cr.stage = 'pitch' AND ${CURRENT_ROUND("cr")} GROUP BY u.email, s.team_id
       HAVING COUNT(*) >= (SELECT COUNT(*) FROM criteria k WHERE k.challenge_id = ?1 AND k.stage = 'pitch' AND ${CURRENT_ROUND("k")})`,
    ).bind(ch.id),
    // A judge who is on a team cannot judge it.
    db.prepare(
      `SELECT lower(u.email) AS email, m.team_id FROM team_members m JOIN users u ON u.id = m.user_id JOIN teams t ON t.id = m.team_id
       WHERE t.challenge_id = ? AND lower(u.email) IN (SELECT email FROM judges WHERE challenge_id = ?)`,
    ).bind(ch.id, ch.id),
  ]);
  const T = teams!.results as { id: string; name: string }[];
  const J = (judges!.results as { email: string }[]).map((r) => r.email);
  const A = asg!.results as { email: string; team_id: string }[];
  const C = conf!.results as { email: string; team_id: string; created_at: number }[];
  const D = new Set((done!.results as { email: string; team_id: string }[]).map((r) => `${r.email.toLowerCase()}|${r.team_id}`));
  const O = (own!.results as { email: string; team_id: string }[]).map((r) => `${r.email}|${r.team_id}`);
  const has = A.length > 0;
  const rows = T.map((t) => {
    const conflicts = C.filter((r) => r.team_id === t.id).map((r) => r.email);
    const assigned = has ? A.filter((r) => r.team_id === t.id).map((r) => r.email) : J.filter((j) => !conflicts.includes(j) && !O.includes(`${j}|${t.id}`));
    return { id: t.id, name: t.name, judges: assigned, conflicts, finished: assigned.filter((j) => D.has(`${j}|${t.id}`)).length };
  });
  return { has_assignments: has, judges: J, teams: rows, blocked: new Set([...C.map((r) => `${r.email}|${r.team_id}`), ...O]) };
}

orgJudging.get("/:slug/challenges/:cslug/assignments", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const v = await assignmentView(c, x.ch);
  return c.json({ blind_judging: !!x.ch.blind_judging, judges_per_team: x.ch.judges_per_team, has_assignments: v.has_assignments, judges: v.judges, teams: v.teams });
});

/** Replaces every assignment with an even spread of `per_team` judges per finalist. */
orgJudging.post("/:slug/challenges/:cslug/assignments/auto", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ per_team: z.number().int().min(1).max(20).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Judges per team must be between 1 and 20" }, 400);
  const per = parsed.data.per_team ?? x.ch.judges_per_team;
  const v = await assignmentView(c, x.ch);
  if (!v.judges.length) return c.json({ error: "Invite judges first" }, 409);
  if (!v.teams.length) return c.json({ error: "Mark teams as finalist first" }, 409);
  const { pairs, short } = autoAssign(v.teams.map((t) => t.id), v.judges, per, v.blocked);
  const now = Date.now(), db = c.env.DB;
  await db.batch([
    db.prepare("UPDATE challenges SET judges_per_team = ? WHERE id = ?").bind(per, x.ch.id),
    db.prepare("DELETE FROM judge_assignments WHERE challenge_id = ?").bind(x.ch.id),
    ...pairs.map((p) => db.prepare("INSERT INTO judge_assignments (challenge_id, email, team_id, created_at) VALUES (?, ?, ?, ?)").bind(x.ch.id, p.email, p.team, now)),
  ]);
  const names = new Map(v.teams.map((t) => [t.id, t.name]));
  return c.json({ ok: true, assigned: pairs.length, short: short.map((id) => names.get(id)) });
});

/** Back to "every judge sees every finalist". */
orgJudging.delete("/:slug/challenges/:cslug/assignments/all", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  await c.env.DB.prepare("DELETE FROM judge_assignments WHERE challenge_id = ?").bind(x.ch.id).run();
  return c.json({ ok: true });
});

const pairBody = z.object({ email: z.string().trim().toLowerCase().max(254), team_id: z.string().max(40) });

orgJudging.post("/:slug/challenges/:cslug/assignments", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = pairBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a judge and a team" }, 400);
  const v = await assignmentView(c, x.ch);
  const { email, team_id } = parsed.data;
  if (!v.judges.includes(email)) return c.json({ error: "That person is not a judge on this challenge" }, 400);
  if (!v.teams.some((t) => t.id === team_id)) return c.json({ error: "Only finalists can be assigned" }, 400);
  if (v.blocked.has(`${email}|${team_id}`)) return c.json({ error: "This judge knows this team or is on it, so they cannot judge it" }, 409);
  const db = c.env.DB, now = Date.now();
  // The first manual assignment turns assignments on, so keep everyone who could already see every team.
  const seed = v.has_assignments ? [] : v.teams.flatMap((t) => t.judges.map((j) => db.prepare("INSERT OR IGNORE INTO judge_assignments (challenge_id, email, team_id, created_at) VALUES (?, ?, ?, ?)").bind(x.ch.id, j, t.id, now)));
  await db.batch([...seed, db.prepare("INSERT OR IGNORE INTO judge_assignments (challenge_id, email, team_id, created_at) VALUES (?, ?, ?, ?)").bind(x.ch.id, email, team_id, now)]);
  return c.json({ ok: true });
});

orgJudging.delete("/:slug/challenges/:cslug/assignments", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = pairBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a judge and a team" }, 400);
  const v = await assignmentView(c, x.ch);
  const db = c.env.DB, now = Date.now();
  const seed = v.has_assignments ? [] : v.teams.flatMap((t) => t.judges.map((j) => db.prepare("INSERT OR IGNORE INTO judge_assignments (challenge_id, email, team_id, created_at) VALUES (?, ?, ?, ?)").bind(x.ch.id, j, t.id, now)));
  await db.batch([...seed, db.prepare("DELETE FROM judge_assignments WHERE challenge_id = ? AND email = ? AND team_id = ?").bind(x.ch.id, parsed.data.email, parsed.data.team_id)]);
  return c.json({ ok: true });
});

/** The organiser clears a conflict flag pressed by mistake. The judge's removed scores do not come back. */
orgJudging.delete("/:slug/challenges/:cslug/conflicts", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = pairBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a judge and a team" }, 400);
  await c.env.DB.prepare("DELETE FROM judge_conflicts WHERE challenge_id = ? AND email = ? AND team_id = ?").bind(x.ch.id, parsed.data.email, parsed.data.team_id).run();
  return c.json({ ok: true });
});

// ---- leaderboard and calibration ----
async function board(c: Context<AppEnv>, ch: Ch) {
  const criteria = await criteriaOf(c, ch.id);
  const { results: teams } = await c.env.DB.prepare(`SELECT t.id, t.name FROM teams t WHERE t.challenge_id = ? AND ${FINALIST_NOW("t")}`).bind(ch.id).all<{ id: string; name: string }>();
  const { results: js } = await c.env.DB.prepare(
    `SELECT j.email, u.id AS user_id FROM judges j LEFT JOIN users u ON u.email = j.email WHERE j.challenge_id = ? ORDER BY j.invited_at`,
  ).bind(ch.id).all<{ email: string; user_id: string | null }>();
  const { results: raw } = await c.env.DB.prepare(
    `SELECT s.judge_user_id, s.team_id, s.criterion_id, s.score FROM scores s JOIN criteria cr ON cr.id = s.criterion_id WHERE cr.challenge_id = ? AND cr.stage = 'pitch' AND ${CURRENT_ROUND("cr")}`,
  ).bind(ch.id).all<{ judge_user_id: string; team_id: string; criterion_id: string; score: number }>();
  const emailOf = new Map(js.filter((j) => j.user_id).map((j) => [j.user_id as string, j.email]));
  const rows: ScoreRow[] = raw.filter((r) => emailOf.has(r.judge_user_id)).map((r) => ({ judge: emailOf.get(r.judge_user_id)!, team: r.team_id, criterion: r.criterion_id, score: r.score }));
  const judges = js.map((j) => j.email);
  return { criteria, judges, rows, teams, lb: leaderboard(criteria, teams, rows, judges) };
}

orgJudging.get("/:slug/challenges/:cslug/leaderboard", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const [b, v] = [await board(c, x.ch), await assignmentView(c, x.ch)];
  const expected = new Map(v.teams.map((t) => [t.id, t.judges.length]));
  return c.json({
    criteria: b.criteria, judges: b.judges,
    leaderboard: b.lb.map((r) => ({ ...r, expected: Math.max(expected.get(r.team_id) ?? 0, r.finished) })),
  });
});

orgJudging.get("/:slug/challenges/:cslug/calibration", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const b = await board(c, x.ch);
  return c.json({ judges: calibration(b.lb, b.judges) });
});

const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

orgJudging.get("/:slug/challenges/:cslug/leaderboard.csv", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const b = await board(c, x.ch);
  const lines = [["Rank", "Team", "Average", "Normalised rank", "Normalised average", "Judges finished", ...b.judges.map((j) => `Judge ${j}`)].map(cell).join(",")];
  for (const r of b.lb) lines.push([r.total === null ? "" : r.rank, r.name, r.total ?? "", r.norm_rank ?? "", r.normalised ?? "", r.finished, ...r.judges.map((j) => j.total ?? "")].map(cell).join(","));
  return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.ch.slug}-scores.csv"` } });
});

/** "Round 2 of 3: Build round", or null for a one-round challenge. */
export function roundLabel(namesJson: string, current: number): string | null {
  let names: string[] = [];
  try { const v = JSON.parse(namesJson); if (Array.isArray(v)) names = v.map(String); } catch { /* bad JSON reads as one round */ }
  if (names.length < 2) return null;
  return `Round ${current} of ${names.length}: ${names[current - 1] ?? ""}`.replace(/: $/, "");
}

// ---- judge side ----
async function judgeLoad(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) return { err: c.json({ error: "Not signed in" }, 401) };
  const row = await c.env.DB.prepare(
    `SELECT ch.id, ch.slug, ch.title, ch.status, ch.org_id, ch.blind_judging, ch.judges_per_team, ch.round_names, ch.current_round, o.slug AS oslug, o.name AS oname
     FROM challenges ch JOIN organizations o ON o.id = ch.org_id JOIN judges j ON j.challenge_id = ch.id
     WHERE o.slug = ? AND ch.slug = ? AND j.email = ?`,
  ).bind(c.req.param("slug")!, c.req.param("cslug")!, user.email.toLowerCase()).first<Ch & { oslug: string; oname: string; round_names: string; current_round: number }>();
  if (!row) return { err: c.json({ error: "Not found" }, 404) };
  return { user, email: user.email.toLowerCase(), ch: row };
}

judge.get("/challenges", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ challenges: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT ch.slug, ch.title, ch.status, o.slug AS oslug, o.name AS oname,
       (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id AND ${FINALIST_NOW("t")} AND ${judgeSees("ch.id", "j.email", "t.id")}) AS teams
     FROM judges j JOIN challenges ch ON ch.id = j.challenge_id JOIN organizations o ON o.id = ch.org_id WHERE j.email = ? ORDER BY ch.created_at DESC`,
  ).bind(user.email.toLowerCase()).all();
  return c.json({ challenges: results });
});

judge.get("/:slug/:cslug", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const criteria = await criteriaOf(c, x.ch.id);
  const { results: teams } = await c.env.DB.prepare(
    `SELECT t.id, t.name, (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id AND (s.deck_key IS NOT NULL OR s.video_url != '' OR s.demo_url != '')) + (SELECT COUNT(*) FROM pitch_images pi WHERE pi.team_id = t.id) AS has_pitch,
       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.user_id = ?1) AS mine,
       (SELECT COUNT(*) FROM scores sc JOIN criteria cr ON cr.id = sc.criterion_id WHERE sc.judge_user_id = ?1 AND sc.team_id = t.id AND cr.stage = 'pitch' AND ${CURRENT_ROUND("cr")}) AS scored
     FROM teams t WHERE t.challenge_id = ?2 AND ${FINALIST_NOW("t")} AND ${judgeSees("?2", "?3", "t.id")} ORDER BY t.name`,
  ).bind(x.user.id, x.ch.id, x.email).all<{ id: string; name: string; has_pitch: number; mine: number; scored: number }>();
  return c.json({
    challenge: { title: x.ch.title, status: x.ch.status, org: x.ch.oname, scoring_open: x.ch.status === "judging", blind: !!x.ch.blind_judging, round: roundLabel(x.ch.round_names, x.ch.current_round) }, criteria,
    teams: teams.map((t) => ({ id: t.id, name: t.name, has_pitch: !!t.has_pitch, own_team: !!t.mine, done: t.scored >= criteria.length && criteria.length > 0, partial: t.scored > 0 && t.scored < criteria.length })),
  });
});

/** What this judge wants on the public challenge page. It only shows when the organiser turns the judges section on. */
judge.get("/:slug/:cslug/profile", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const r = await c.env.DB.prepare("SELECT j.display_name, j.title, ch.show_judges FROM judges j JOIN challenges ch ON ch.id = j.challenge_id WHERE j.challenge_id = ? AND j.email = ?")
    .bind(x.ch.id, x.email).first<{ display_name: string | null; title: string | null; show_judges: number }>();
  return c.json({ display_name: r?.display_name ?? "", title: r?.title ?? "", shown: !!r?.show_judges });
});

judge.put("/:slug/:cslug/profile", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ display_name: z.string().trim().max(80).default(""), title: z.string().trim().max(120).default("") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Keep the name under 80 characters and the title under 120" }, 400);
  await c.env.DB.prepare("UPDATE judges SET display_name = ?, title = ? WHERE challenge_id = ? AND email = ?")
    .bind(parsed.data.display_name || null, parsed.data.title || null, x.ch.id, x.email).run();
  return c.json({ ok: true });
});

/** A finalist this judge may see: assigned to them (once the challenge uses assignments) and not flagged as a conflict. */
async function judgeTeam(c: Context<AppEnv>, x: { email: string; ch: Ch }) {
  return c.env.DB.prepare(`SELECT id, name FROM teams t WHERE t.id = ?1 AND t.challenge_id = ?2 AND ${FINALIST_NOW("t")} AND ${judgeSees("?2", "?3", "t.id")}`)
    .bind(c.req.param("teamId")!, x.ch.id, x.email).first<{ id: string; name: string }>();
}

judge.get("/:slug/:cslug/teams/:teamId", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const t = await judgeTeam(c, x);
  if (!t) return c.json({ error: "Not found" }, 404);
  const p = await c.env.DB.prepare("SELECT deck_key, deck_name, video_url, demo_url, repo_url, notes FROM submissions WHERE team_id = ?").bind(t.id).first<any>();
  const blind = !!x.ch.blind_judging;
  // Blind review: the query is not even run, so names and institutions never leave the server.
  const members = blind ? [] : (await c.env.DB.prepare("SELECT u.name, u.email, u.institution FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.joined_at").bind(t.id).all<{ name: string | null; email: string; institution: string | null }>()).results;
  const { results: mine } = await c.env.DB.prepare("SELECT criterion_id, score, comment FROM scores WHERE judge_user_id = ? AND team_id = ?").bind(x.user.id, t.id).all();
  const own = (await c.env.DB.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, x.user.id).first()) !== null;
  return c.json({
    team: { id: t.id, name: t.name, members: members.map((m) => ({ name: m.name || m.email.split("@")[0], institution: m.institution })) },
    blind,
    pitch: p ? { has_deck: !!p.deck_key, deck_name: p.deck_name, video_url: p.video_url, video_embed: youtubeEmbed(p.video_url), demo_url: p.demo_url, repo_url: p.repo_url ?? "", notes: p.notes } : null,
    images: await pitchImages(c, t.id),
    scores: mine, own_team: own, scoring_open: x.ch.status === "judging", criteria: await criteriaOf(c, x.ch.id),
  });
});

/**
 * Who pushed code to the team's GitHub repo: contributors and commit counts, matched to members by the GitHub link on
 * their profile. Fetched on its own so a slow GitHub never holds up the pitch. In blind review no names or logins go out.
 */
judge.get("/:slug/:cslug/teams/:teamId/repo", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const t = await judgeTeam(c, x);
  if (!t) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT repo_url FROM submissions WHERE team_id = ?").bind(t.id).first<{ repo_url: string }>();
  const repo = row?.repo_url ? parseRepo(row.repo_url) : null;
  if (!repo) return c.json({ repo_url: null, status: "none" });
  const stats = await repoStats(c.env, repo);
  if (!stats.ok) return c.json({ repo_url: row!.repo_url, status: stats.reason, fetched_at: stats.fetched_at });
  const { results: members } = await c.env.DB.prepare("SELECT u.name, u.email, u.links FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.joined_at")
    .bind(t.id).all<{ name: string | null; email: string; links: string | null }>();
  const links = (raw: string | null) => { try { return JSON.parse(raw ?? "{}") as Record<string, string>; } catch { return {}; } };
  const m = matchContributors(stats.contributors, members.map((u) => ({ name: u.name || u.email.split("@")[0]!, login: loginFromProfile(links(u.links).github) })));
  const blind = !!x.ch.blind_judging;
  return c.json({
    repo_url: row!.repo_url, status: "ok", fetched_at: stats.fetched_at, blind,
    contributors: m.contributors.map((r) => (blind ? { login: null, member: null, on_team: !!r.member, commits: r.commits } : { ...r, on_team: !!r.member })),
    not_on_team: m.not_on_team,
    no_commits: blind ? m.no_commits.length : m.no_commits,
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

/**
 * "I know this team". The team leaves the judge's list, their scores for it are removed so they do not count,
 * and the organisers get an inbox item so they can give the team another judge.
 */
judge.post("/:slug/:cslug/teams/:teamId/conflict", async (c) => {
  const x = await judgeLoad(c); if ("err" in x) return x.err;
  const t = await judgeTeam(c, x);
  if (!t) return c.json({ error: "Not found" }, 404);
  const db = c.env.DB, now = Date.now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO judge_conflicts (challenge_id, email, team_id, created_at) VALUES (?, ?, ?, ?)").bind(x.ch.id, x.email, t.id, now),
    db.prepare("DELETE FROM scores WHERE judge_user_id = ? AND team_id = ?").bind(x.user.id, t.id),
    db.prepare("DELETE FROM judge_assignments WHERE challenge_id = ? AND email = ? AND team_id = ?").bind(x.ch.id, x.email, t.id),
    db.prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
       SELECT lower(hex(randomblob(12))), m.user_id, 'judging.conflict', ?, ?, ?, ? FROM memberships m WHERE m.org_id = ?`,
    ).bind(`A judge knows a team: ${x.ch.title}`, `${x.email} stepped back from judging ${t.name}. You may want to give the team another judge.`,
      `/admin/o/${x.ch.oslug}/c/${x.ch.slug}/judging`, now, x.ch.org_id),
  ]);
  pushLater(c);
  return c.json({ ok: true });
});
