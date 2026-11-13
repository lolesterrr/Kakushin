import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { fileUrl, loadOrg } from "../lib/access";
import { notifyTeam } from "../lib/mail";

interface Question { id: string; label: string; type: "short_text" | "long_text" | "choice" | "url"; required: boolean; options: string[] }
interface ChRow {
  id: string; org_id: string; slug: string; title: string; status: string; team_min: number; team_max: number;
  applications_open_at: number | null; applications_close_at: number | null; questions: string;
}
interface TeamRow { id: string; challenge_id: string; name: string; invite_code: string; lead_user_id: string; status: string; placement: number | null; created_at: number; show_project?: number }

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

export function applyWindow(ch: Pick<ChRow, "status" | "applications_open_at" | "applications_close_at">, now = Date.now()): string | null {
  if (ch.status !== "open") return "This challenge is not taking applications";
  if (ch.applications_open_at && now < ch.applications_open_at) return "Applications have not opened yet";
  if (ch.applications_close_at && now > ch.applications_close_at) return "Applications are closed";
  return null;
}

export function validateAnswers(questions: Question[], raw: Record<string, unknown>): { ok: true; clean: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {};
  for (const q of questions) {
    const v = typeof raw[q.id] === "string" ? (raw[q.id] as string).trim() : "";
    if (!v) { if (q.required) return { ok: false, error: `Please answer: ${q.label}` }; continue; }
    if (q.type === "short_text" && v.length > 300) return { ok: false, error: `Answer too long: ${q.label}` };
    if (q.type === "long_text" && v.length > 3000) return { ok: false, error: `Answer too long: ${q.label}` };
    if (q.type === "url" && (v.length > 300 || !/^https?:\/\/\S+$/i.test(v))) return { ok: false, error: `Enter a link starting with http:// or https://: ${q.label}` };
    if (q.type === "choice" && !q.options.includes(v)) return { ok: false, error: `Pick one of the options: ${q.label}` };
    clean[q.id] = v;
  }
  return { ok: true, clean };
}

async function members(c: { env: AppEnv["Bindings"] }, teamId: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.joined_at`,
  ).bind(teamId).all<{ id: string; name: string | null; email: string }>();
  return results;
}

async function teamOut(c: { env: AppEnv["Bindings"] }, t: TeamRow, viewerId: string) {
  const app = await c.env.DB.prepare("SELECT answers, submitted_at FROM applications WHERE team_id = ?").bind(t.id).first<{ answers: string; submitted_at: number }>();
  return {
    id: t.id, name: t.name, status: t.status, placement: t.placement, invite_code: t.invite_code, is_lead: t.lead_user_id === viewerId, show_project: !!t.show_project,
    members: (await members(c, t.id)).map((m) => ({ id: m.id, name: m.name || m.email.split("@")[0], is_lead: m.id === t.lead_user_id })),
    application: app ? { answers: JSON.parse(app.answers) as Record<string, string>, submitted_at: app.submitted_at } : null,
  };
}

async function myTeamFor(c: { env: AppEnv["Bindings"] }, challengeId: string, userId: string) {
  return c.env.DB.prepare(
    `SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id WHERE t.challenge_id = ? AND m.user_id = ?`,
  ).bind(challengeId, userId).first<TeamRow>();
}

const teamName = z.string().trim().min(2, "Team name needs at least 2 characters").max(60);

/** Participant routes tied to one challenge: /api/orgs/:slug/challenges/:cslug/team */
export const orgTeams = new Hono<AppEnv>();

async function loadChallenge(c: Parameters<typeof loadOrg>[0], slug: string, cslug: string) {
  const access = await loadOrg(c, slug);
  if (!access) return null;
  const ch = await c.env.DB.prepare("SELECT * FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, cslug).first<ChRow>();
  if (!ch || (ch.status === "draft" && !access.role)) return null;
  return { ...access, ch };
}

orgTeams.get("/:slug/challenges/:cslug/team", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ team: null });
  const x = await loadChallenge(c, c.req.param("slug"), c.req.param("cslug"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const t = await myTeamFor(c, x.ch.id, user.id);
  return c.json({ team: t ? await teamOut(c, t, user.id) : null });
});

orgTeams.post("/:slug/challenges/:cslug/team", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to create a team" }, 401);
  const x = await loadChallenge(c, c.req.param("slug"), c.req.param("cslug"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = applyWindow(x.ch);
  if (why) return c.json({ error: why }, 409);
  const parsed = z.object({ name: teamName }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the team name" }, 400);
  if (await myTeamFor(c, x.ch.id, user.id)) return c.json({ error: "You are already in a team for this challenge" }, 409);

  const id = newId();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO teams (id, challenge_id, name, invite_code, lead_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, x.ch.id, parsed.data.name, newCode(), user.id, Date.now()),
    c.env.DB.prepare("INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, user.id, Date.now()),
    // In a team now, so no longer looking for one.
    c.env.DB.prepare("DELETE FROM team_seekers WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, user.id),
  ]);
  return c.json({ ok: true }, 201);
});

/** Routes under /api/teams */
export const teams = new Hono<AppEnv>();

teams.get("/mine", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status, t.placement, ch.title, ch.slug AS cslug, o.slug AS oslug, o.name AS oname, o.logo_key,
       ch.status AS cstatus, ch.applications_close_at, ch.pitch_due_at,
       EXISTS (SELECT 1 FROM submissions s WHERE s.team_id = t.id) AS has_pitch
     FROM team_members m JOIN teams t ON t.id = m.team_id JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id
     WHERE m.user_id = ? ORDER BY t.created_at DESC`,
  ).bind(user.id).all<Record<string, unknown> & { logo_key: string | null; has_pitch: number }>();
  // The dates and pitch flag let the app set its own reminders on the phone.
  return c.json({ teams: results.map(({ logo_key, has_pitch, ...r }) => ({ ...r, logo_url: fileUrl(logo_key), has_pitch: !!has_pitch })) });
});

// Public preview so an invite link can show what you are joining before you sign in.
teams.get("/preview/:code", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT t.name, t.status, ch.title, ch.slug AS cslug, ch.team_max, o.slug AS oslug, o.name AS oname, o.logo_key,
       (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS size
     FROM teams t JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id WHERE t.invite_code = ?`,
  ).bind(c.req.param("code").toUpperCase()).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "That invite code does not match a team" }, 404);
  return c.json({ team: { ...row, logo_url: fileUrl(row.logo_key as string | null) } });
});

teams.post("/join", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to join a team" }, 401);
  const parsed = z.object({ code: z.string().trim().toUpperCase().min(6).max(12) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter the team's invite code" }, 400);
  const t = await c.env.DB.prepare("SELECT * FROM teams WHERE invite_code = ?").bind(parsed.data.code).first<TeamRow>();
  if (!t) return c.json({ error: "That invite code does not match a team" }, 404);
  const ch = await c.env.DB.prepare("SELECT * FROM challenges WHERE id = ?").bind(t.challenge_id).first<ChRow>();
  if (!ch) return c.json({ error: "Not found" }, 404);
  const why = applyWindow(ch);
  if (why) return c.json({ error: why }, 409);
  if (t.status !== "forming") return c.json({ error: "This team has already applied, so it is closed to new members" }, 409);
  if (await myTeamFor(c, ch.id, user.id)) return c.json({ error: "You are already in a team for this challenge" }, 409);
  // One statement checks and inserts, so two people joining at the same moment cannot push the team past its maximum,
  // and one person cannot land in two teams of the same challenge. The checks above only give friendlier errors.
  const ins = await c.env.DB.prepare(
    `INSERT INTO team_members (team_id, user_id, joined_at)
     SELECT ?, ?, ? WHERE
       (SELECT COUNT(*) FROM team_members WHERE team_id = ?) < ?
       AND (SELECT status FROM teams WHERE id = ?) = 'forming'
       AND NOT EXISTS (SELECT 1 FROM team_members m JOIN teams t2 ON t2.id = m.team_id WHERE m.user_id = ? AND t2.challenge_id = ?)`,
  ).bind(t.id, user.id, Date.now(), t.id, ch.team_max, t.id, user.id, ch.id).run();
  if (!ins.meta.changes) {
    if (await myTeamFor(c, ch.id, user.id)) return c.json({ error: "You are already in a team for this challenge" }, 409);
    return c.json({ error: `This team is full (max ${ch.team_max})` }, 409);
  }
  await c.env.DB.prepare("DELETE FROM team_seekers WHERE challenge_id = ? AND user_id = ?").bind(ch.id, user.id).run();
  const org = await c.env.DB.prepare("SELECT slug FROM organizations WHERE id = ?").bind(ch.org_id).first<{ slug: string }>();
  return c.json({ ok: true, org: org?.slug, challenge: ch.slug });
});

async function myTeam(c: Parameters<typeof myTeamFor>[0] & { get: (k: "user") => AppEnv["Variables"]["user"]; req: { param: (k: string) => string } }) {
  const user = c.get("user");
  if (!user) return null;
  const t = await c.env.DB.prepare(
    "SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id WHERE t.id = ? AND m.user_id = ?",
  ).bind(c.req.param("id"), user.id).first<TeamRow>();
  return t ? { user, t } : null;
}

teams.post("/:id/leave", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await myTeam(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const { user, t } = x;
  if (t.status !== "forming") return c.json({ error: "Withdraw the application before leaving the team" }, 409);
  const rest = (await members(c, t.id)).filter((m) => m.id !== user.id);
  if (rest.length === 0) {
    await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(t.id).run(); // cascades to members
    return c.json({ ok: true, deleted: true });
  }
  const stmts = [c.env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, user.id)];
  if (t.lead_user_id === user.id) stmts.push(c.env.DB.prepare("UPDATE teams SET lead_user_id = ? WHERE id = ?").bind(rest[0]!.id, t.id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

teams.delete("/:id/members/:userId", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await myTeam(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const { user, t } = x;
  if (t.lead_user_id !== user.id) return c.json({ error: "Only the team lead can remove members" }, 403);
  if (t.status !== "forming") return c.json({ error: "Withdraw the application first" }, 409);
  const target = c.req.param("userId");
  if (target === user.id) return c.json({ error: "Use Leave team instead" }, 400);
  await c.env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, target).run();
  return c.json({ ok: true });
});

teams.put("/:id/application", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await myTeam(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const { user, t } = x;
  if (t.lead_user_id !== user.id) return c.json({ error: "Only the team lead can apply" }, 403);
  if (t.status !== "forming" && t.status !== "applied") return c.json({ error: "This application can no longer be changed" }, 409);
  const ch = await c.env.DB.prepare("SELECT * FROM challenges WHERE id = ?").bind(t.challenge_id).first<ChRow>();
  if (!ch) return c.json({ error: "Not found" }, 404);
  const why = applyWindow(ch);
  if (why) return c.json({ error: why }, 409);
  const ms = await members(c, t.id);
  if (ms.length < ch.team_min || ms.length > ch.team_max) {
    return c.json({ error: `This challenge needs teams of ${ch.team_min === ch.team_max ? ch.team_min : `${ch.team_min} to ${ch.team_max}`}. You have ${ms.length}.` }, 409);
  }
  const body = z.object({ answers: z.record(z.unknown()).default({}) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Check your answers" }, 400);
  const v = validateAnswers(JSON.parse(ch.questions) as Question[], body.data.answers);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const first = t.status === "forming";
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO applications (id, team_id, answers, submitted_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(team_id) DO UPDATE SET answers = excluded.answers, submitted_at = excluded.submitted_at`,
    ).bind(newId(), t.id, JSON.stringify(v.clean), Date.now()),
    c.env.DB.prepare("UPDATE teams SET status = 'applied' WHERE id = ?").bind(t.id),
  ]);
  if (first) {
    const org = await c.env.DB.prepare("SELECT slug, name FROM organizations WHERE id = ?").bind(ch.org_id).first<{ slug: string; name: string }>();
    notifyTeam(c, "received", ms.map((m) => m.email), { team: t.name, challenge: ch.title, org: org?.name ?? "", url: `${c.env.APP_URL}/o/${org?.slug}/c/${ch.slug}` });
  }
  return c.json({ ok: true });
});

teams.delete("/:id/application", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await myTeam(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const { user, t } = x;
  if (t.lead_user_id !== user.id) return c.json({ error: "Only the team lead can withdraw" }, 403);
  if (t.status !== "applied") return c.json({ error: "Only a pending application can be withdrawn" }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM applications WHERE team_id = ?").bind(t.id),
    c.env.DB.prepare("UPDATE teams SET status = 'forming' WHERE id = ?").bind(t.id),
  ]);
  return c.json({ ok: true });
});
