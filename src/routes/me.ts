import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { clearSessionCookie } from "../lib/session";
import { HANDLE_RE, RESERVED_HANDLES } from "./people";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ user: null });
  const full = await c.env.DB.prepare(
    "SELECT id, email, name, bio, institution, location, skills, links, gender, is_platform_admin, handle, public_profile FROM users WHERE id = ?",
  ).bind(u.id).first<Record<string, unknown>>();
  return c.json({
    user: { ...full, public_profile: !!full?.public_profile, skills: JSON.parse(String(full?.skills ?? "[]")), links: JSON.parse(String(full?.links ?? "{}")) },
  });
});

const profile = z.object({
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).default(""),
  institution: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  skills: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  // Only web addresses: z.string().url() alone would let javascript: and data: links through.
  links: z.record(z.string().trim().max(300).url().regex(/^https?:\/\/[^\s/]/i, "Links must start with http:// or https://")).refine((l) => Object.keys(l).length <= 10).optional(),
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable().optional(),
  // Public profile at /u/:handle. Left out, both stay as they are.
  handle: z.string().trim().toLowerCase().max(30).nullable().optional().transform((v) => (v === "" ? null : v)),
  public_profile: z.boolean().optional(),
});

me.put("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Not signed in" }, 401);
  const parsed = profile.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the profile fields", issues: parsed.error.issues }, 400);
  const p = parsed.data;
  if (p.handle && (!HANDLE_RE.test(p.handle) || RESERVED_HANDLES.has(p.handle))) {
    return c.json({ error: "Your profile address must be 3 to 30 lowercase letters, numbers or dashes, and not a reserved word" }, 400);
  }
  if (p.public_profile || p.handle !== undefined) {
    const cur = await c.env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(u.id).first<{ handle: string | null }>();
    const handle = p.handle !== undefined ? p.handle : cur?.handle ?? null;
    if (p.public_profile && !handle) return c.json({ error: "Pick a profile address before making your profile public" }, 400);
    if (handle && handle !== cur?.handle) {
      const taken = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE handle = ? AND id != ?").bind(handle, u.id).first();
      if (taken) return c.json({ error: "That profile address is taken" }, 409);
    }
  }
  // links and gender are kept as they are unless the request sends them, so a form without those fields cannot wipe them.
  // Clearing the handle also turns the public profile off.
  const res = await c.env.DB.prepare(
    `UPDATE users SET name=?, bio=?, institution=?, location=?, skills=?,
       links = CASE WHEN ? THEN ? ELSE links END,
       gender = CASE WHEN ? THEN ? ELSE gender END,
       handle = CASE WHEN ? THEN ? ELSE handle END,
       public_profile = CASE WHEN ? THEN ? ELSE public_profile END
     WHERE id=?`,
  ).bind(
    p.name, p.bio, p.institution, p.location, JSON.stringify(p.skills),
    p.links !== undefined ? 1 : 0, JSON.stringify(p.links ?? {}),
    p.gender !== undefined ? 1 : 0, p.gender ?? null,
    p.handle !== undefined ? 1 : 0, p.handle ?? null,
    p.public_profile !== undefined || p.handle === null ? 1 : 0, p.handle === null ? 0 : p.public_profile ? 1 : 0,
    u.id,
  ).run().catch((e) => { if (String(e).includes("UNIQUE")) return null; throw e; });
  if (!res) return c.json({ error: "That profile address is taken" }, 409);
  return c.json({ ok: true });
});

/**
 * Deletes the signed-in account and everything that is only theirs: profile, sessions, team places, scores they gave,
 * certificates, inbox, follows, devices and invites to their email. Teams they lead pass to the teammate who joined
 * first; a team with nobody else in it goes. An organisation they own passes to another admin; one with no other admin
 * goes too if it has only drafts, and otherwise blocks the delete so live challenges are not left without anyone.
 */
me.delete("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Not signed in" }, 401);
  const parsed = z.object({ confirm: z.string().trim().toLowerCase() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirm !== u.email.toLowerCase()) return c.json({ error: "Type your email address to confirm" }, 400);
  if (u.is_platform_admin) return c.json({ error: "Platform admins cannot delete their account here. Ask the Kakushin team to remove your admin role first." }, 409);
  const db = c.env.DB;

  // Organisations they own.
  const { results: owned } = await db.prepare(
    `SELECT o.id, o.name, o.logo_key, o.logo_print_key,
       (SELECT m2.user_id FROM memberships m2 JOIN users u2 ON u2.id = m2.user_id WHERE m2.org_id = o.id AND m2.user_id != ?1 AND u2.suspended = 0 ORDER BY u2.email LIMIT 1) AS heir,
       (SELECT COUNT(*) FROM challenges ch WHERE ch.org_id = o.id AND ch.status != 'draft') AS live
     FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ?1 AND m.role = 'owner'`,
  ).bind(u.id).all<{ id: string; name: string; logo_key: string | null; logo_print_key: string | null; heir: string | null; live: number }>();
  const stuck = owned.filter((o) => !o.heir && o.live > 0);
  if (stuck.length) {
    return c.json({ error: `You are the only admin of ${stuck.map((o) => o.name).join(", ")}, which has public challenges. Add another admin in the organiser area first, so someone can still run them, then delete your account.` }, 409);
  }
  const orgsToDelete = owned.filter((o) => !o.heir);
  const { results: covers } = orgsToDelete.length
    ? await db.prepare(`SELECT cover_key FROM challenges WHERE cover_key IS NOT NULL AND org_id IN (${orgsToDelete.map(() => "?").join(",")})`).bind(...orgsToDelete.map((o) => o.id)).all<{ cover_key: string }>()
    : { results: [] as { cover_key: string }[] };

  // Teams they lead.
  const { results: led } = await db.prepare(
    `SELECT t.id, (SELECT m.user_id FROM team_members m WHERE m.team_id = t.id AND m.user_id != ?1 ORDER BY m.joined_at LIMIT 1) AS heir,
       (SELECT s.deck_key FROM submissions s WHERE s.team_id = t.id) AS deck_key
     FROM teams t WHERE t.lead_user_id = ?1`,
  ).bind(u.id).all<{ id: string; heir: string | null; deck_key: string | null }>();
  const solo = led.filter((t) => !t.heir);

  const files = [
    (await db.prepare("SELECT avatar_key FROM users WHERE id = ?").bind(u.id).first<{ avatar_key: string | null }>())?.avatar_key,
    ...(await db.prepare("SELECT pdf_key FROM certificates WHERE user_id = ? AND pdf_key IS NOT NULL").bind(u.id).all<{ pdf_key: string }>()).results.map((r) => r.pdf_key),
    ...solo.map((t) => t.deck_key), ...orgsToDelete.flatMap((o) => [o.logo_key, o.logo_print_key]), ...covers.map((r) => r.cover_key),
  ].filter((k): k is string => !!k);

  const email = u.email.toLowerCase();
  const byTeam = (table: string, t: string) => db.prepare(`DELETE FROM ${table} WHERE team_id = ?`).bind(t);
  await db.batch([
    ...owned.filter((o) => o.heir).map((o) => db.prepare("UPDATE memberships SET role = 'owner' WHERE org_id = ? AND user_id = ?").bind(o.id, o.heir)),
    ...orgsToDelete.flatMap((o) => [
      db.prepare("DELETE FROM application_scores WHERE criterion_id IN (SELECT id FROM criteria WHERE challenge_id IN (SELECT id FROM challenges WHERE org_id = ?))").bind(o.id),
      db.prepare("DELETE FROM announcements WHERE challenge_id IN (SELECT id FROM challenges WHERE org_id = ?)").bind(o.id),
      ...["judge_assignments", "judge_conflicts", "team_seekers", "criteria", "judges", "challenge_agenda", "live_alerts", "check_ins"].map((table) => db.prepare(`DELETE FROM ${table} WHERE challenge_id IN (SELECT id FROM challenges WHERE org_id = ?)`).bind(o.id)),
      ...["challenges", "memberships", "follows", "announcements", "org_invites"].map((table) => db.prepare(`DELETE FROM ${table} WHERE org_id = ?`).bind(o.id)),
      db.prepare("DELETE FROM organizations WHERE id = ?").bind(o.id),
    ]),
    ...led.filter((t) => t.heir).map((t) => db.prepare("UPDATE teams SET lead_user_id = ? WHERE id = ?").bind(t.heir, t.id)),
    ...solo.flatMap((t) => [byTeam("scores", t.id), byTeam("application_scores", t.id), byTeam("judge_assignments", t.id), byTeam("judge_conflicts", t.id), byTeam("team_finder_invites", t.id), byTeam("certificates", t.id), byTeam("submissions", t.id), byTeam("applications", t.id), byTeam("team_members", t.id),
      db.prepare("DELETE FROM teams WHERE id = ?").bind(t.id)]),
    // Children first, so this works whether or not the database enforces ON DELETE CASCADE.
    ...["sessions", "memberships", "team_members", "team_seekers", "team_finder_invites", "check_ins", "certificates", "notifications", "follows", "interests", "push_tokens", "notification_settings"]
      .map((table) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(u.id)),
    db.prepare("DELETE FROM scores WHERE judge_user_id = ?").bind(u.id),
    db.prepare("UPDATE check_ins SET by_user_id = NULL WHERE by_user_id = ?").bind(u.id),
    db.prepare("DELETE FROM application_scores WHERE reviewer_user_id = ?").bind(u.id),
    db.prepare("DELETE FROM judge_assignments WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM judge_conflicts WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM judges WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM org_invites WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM login_tokens WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM code_failures WHERE lower(email) = ?").bind(email),
    db.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
  ]);
  if (files.length) c.executionCtx.waitUntil(c.env.FILES.delete(files).catch((e) => console.error(`account file clean-up failed: ${e instanceof Error ? e.message : e}`)));
  clearSessionCookie(c);
  return c.json({ ok: true });
});
