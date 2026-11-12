import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { notifyTeam } from "../lib/mail";

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
  const ch = await c.env.DB.prepare("SELECT id, slug, title, questions FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, cslug).first<{ id: string; slug: string; title: string; questions: string }>();
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
  return results.map((r) => ({
    ...r, answers: JSON.parse(r.answers) as Record<string, string>,
    members: ms.filter((m) => m.team_id === r.team_id).map((m) => ({ name: m.name, email: m.email, institution: m.institution, is_lead: !!m.is_lead })),
  }));
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
  return c.json({ questions: x.questions, applications: await list(c, x.ch.id) });
});

const STATUS = z.enum(["applied", "shortlisted", "rejected"]);

orgApplications.post("/:slug/challenges/:cslug/applications/status", async (c) => {
  const x = await load(c, c.req.param("slug"), c.req.param("cslug"));
  if ("error" in x) return c.json({ error: x.error!.msg }, x.error!.code);
  const parsed = z.object({ team_ids: z.array(z.string()).min(1).max(200), status: STATUS }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick at least one team and a status" }, 400);
  const { team_ids, status } = parsed.data;

  // Only teams of this challenge that have an application and are not already past review (finalist, winner).
  const marks = team_ids.map(() => "?").join(",");
  const { results: teams } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status FROM teams t JOIN applications a ON a.team_id = t.id
     WHERE t.challenge_id = ? AND t.status IN ('applied','shortlisted','rejected') AND t.id IN (${marks})`,
  ).bind(x.ch.id, ...team_ids).all<{ id: string; name: string; status: string }>();
  const changing = teams.filter((t) => t.status !== status);
  if (changing.length) {
    await c.env.DB.batch(changing.map((t) => c.env.DB.prepare("UPDATE teams SET status = ? WHERE id = ?").bind(status, t.id)));
  }
  if (status !== "applied") {
    for (const t of changing) {
      const { results: ms } = await c.env.DB.prepare("SELECT u.email FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ?").bind(t.id).all<{ email: string }>();
      notifyTeam(c, status, ms.map((m) => m.email), { team: t.name, challenge: x.ch.title, org: x.org.name, url: `${c.env.APP_URL}/o/${x.org.slug}/c/${x.ch.slug}` });
    }
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
  const head = ["Team", "Status", "Submitted", "Members", "Emails", "Institutions", ...x.questions.map((q) => q.label), "Reviewer note"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.status, new Date(r.submitted_at).toISOString(),
      r.members.map((m) => m.name ?? m.email).join("; "), r.members.map((m) => m.email).join("; "),
      [...new Set(r.members.map((m) => m.institution).filter(Boolean))].join("; "),
      ...x.questions.map((q) => r.answers[q.id] ?? ""), r.reviewer_note,
    ].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.ch.slug}-applications.csv"` },
  });
});
