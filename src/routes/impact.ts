import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { genderRows } from "../lib/impact";

/** Day 7: the impact report for an organisation's challenges. Organiser side, mounted under /api/orgs. */
export const orgImpact = new Hono<AppEnv>();

interface ChallengeImpact {
  slug: string; title: string; status: string; created_at: number;
  teams: number; applied: number; finalists: number; winners: number; participants: number;
  pitches: number; judges: number; checked_in: number; certificates: number;
}

/** People who applied: members of teams past "forming". */
const APPLIED = "t.status <> 'forming'";

async function report(c: Context<AppEnv>, orgId: string) {
  const db = c.env.DB;
  const [per, people, gender] = await db.batch([
    db.prepare(
      `SELECT ch.slug, ch.title, ch.status, ch.created_at,
         (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id) AS teams,
         (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id AND ${APPLIED}) AS applied,
         (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id AND t.status IN ('finalist','winner')) AS finalists,
         (SELECT COUNT(*) FROM teams t WHERE t.challenge_id = ch.id AND (t.status = 'winner' OR t.placement IS NOT NULL)) AS winners,
         (SELECT COUNT(DISTINCT m.user_id) FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.challenge_id = ch.id AND ${APPLIED}) AS participants,
         (SELECT COUNT(*) FROM submissions s JOIN teams t ON t.id = s.team_id WHERE t.challenge_id = ch.id AND (s.deck_key IS NOT NULL OR s.video_url != '' OR s.demo_url != '' OR s.repo_url != '')) AS pitches,
         (SELECT COUNT(*) FROM judges j WHERE j.challenge_id = ch.id) AS judges,
         (SELECT COUNT(*) FROM check_ins k WHERE k.challenge_id = ch.id) AS checked_in,
         (SELECT COUNT(*) FROM certificates ce WHERE ce.challenge_id = ch.id AND ce.revoked = 0) AS certificates
       FROM challenges ch WHERE ch.org_id = ? AND ch.status <> 'draft' ORDER BY ch.created_at DESC`,
    ).bind(orgId),
    // Each person once, with how many of this organisation's challenges they applied to.
    db.prepare(
      `SELECT COUNT(*) AS people, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS returners, COUNT(DISTINCT inst) AS institutions FROM (
         SELECT m.user_id, COUNT(DISTINCT t.challenge_id) AS n, NULLIF(lower(trim(u.institution)), '') AS inst
         FROM team_members m JOIN teams t ON t.id = m.team_id JOIN challenges ch ON ch.id = t.challenge_id JOIN users u ON u.id = m.user_id
         WHERE ch.org_id = ? AND ch.status <> 'draft' AND ${APPLIED} GROUP BY m.user_id)`,
    ).bind(orgId),
    db.prepare(
      `SELECT gender, COUNT(*) AS n FROM users WHERE id IN (
         SELECT m.user_id FROM team_members m JOIN teams t ON t.id = m.team_id JOIN challenges ch ON ch.id = t.challenge_id
         WHERE ch.org_id = ? AND ch.status <> 'draft' AND ${APPLIED}) GROUP BY gender`,
    ).bind(orgId),
  ]);
  const challenges = per!.results as ChallengeImpact[];
  const p = (people!.results[0] ?? {}) as { people?: number; returners?: number | null; institutions?: number };
  const sum = (k: keyof ChallengeImpact) => challenges.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return {
    totals: {
      challenges: challenges.length, people: p.people ?? 0, returning: p.returners ?? 0, institutions: p.institutions ?? 0,
      teams: sum("applied"), pitches: sum("pitches"), finalists: sum("finalists"), checked_in: sum("checked_in"), certificates: sum("certificates"),
    },
    gender: genderRows(gender!.results as { gender: string | null; n: number }[]),
    challenges,
  };
}

async function guard(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can see the impact report" }, 403) };
  return { org: access.org };
}

orgImpact.get("/:slug/impact", async (c) => {
  const x = await guard(c); if ("err" in x) return x.err;
  return c.json({ org: { name: x.org.name, slug: x.org.slug }, ...(await report(c, x.org.id)) });
});

const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

orgImpact.get("/:slug/impact.csv", async (c) => {
  const x = await guard(c); if ("err" in x) return x.err;
  const r = await report(c, x.org.id);
  const head = ["Challenge", "Stage", "Teams formed", "Teams applied", "People who applied", "Pitches", "Finalists", "Winners", "Judges", "Checked in", "Certificates"];
  const lines = [head.map(cell).join(",")];
  for (const ch of r.challenges) lines.push([ch.title, ch.status, ch.teams, ch.applied, ch.participants, ch.pitches, ch.finalists, ch.winners, ch.judges, ch.checked_in, ch.certificates].map(cell).join(","));
  lines.push("");
  lines.push(["Unique people", r.totals.people].map(cell).join(","));
  lines.push(["Came back for another challenge", r.totals.returning].map(cell).join(","));
  lines.push(["Institutions", r.totals.institutions].map(cell).join(","));
  if (r.gender.length) { lines.push(""); lines.push(["Gender (groups under 5 combined)", "People"].map(cell).join(",")); for (const g of r.gender) lines.push([g.label, g.count].map(cell).join(",")); }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.org.slug}-impact.csv"` } });
});
