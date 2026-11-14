import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { applyWindow } from "./teams";
import { pushLater } from "../lib/push";
import { MAX_PHOTOS_PER_PERSON, MAX_RECAP_PHOTOS, MEDIA_BYTES, fileUrl, headerCaption, youtubeEmbed } from "../lib/media";
import { saveImage } from "../lib/upload";
import { newId } from "../lib/crypto";
import { pitchImages } from "./pitch";

/**
 * Day 5B: public profiles, who's coming, the team finder and the project gallery.
 * Email addresses never leave these routes: people are shown by name, and by handle when their profile is public.
 */

export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export const RESERVED_HANDLES = new Set(["admin", "api", "me", "kakushin", "support", "help", "settings", "profile", "login", "signup", "root", "staff", "team", "teams", "judge", "platform"]);

const displayName = (name: string | null) => (name && name.trim()) || "Participant";
const parseJson = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };

/** Mounted at /api/people. */
export const people = new Hono<AppEnv>();

/** A public profile. A private, missing or suspended one is a plain 404, so nobody can tell which it is. */
people.get("/:handle", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  if (!HANDLE_RE.test(handle)) return c.json({ error: "Not found" }, 404);
  const u = await c.env.DB.prepare(
    "SELECT id, name, bio, institution, location, skills, links, handle, avatar_key FROM users WHERE handle = ? AND public_profile = 1 AND suspended = 0",
  ).bind(handle).first<{ id: string; name: string | null; bio: string | null; institution: string | null; location: string | null; skills: string; links: string; handle: string; avatar_key: string | null }>();
  if (!u) return c.json({ error: "Not found" }, 404);
  const db = c.env.DB;
  const [certs, teams] = await db.batch([
    db.prepare(
      `SELECT ce.code, ce.kind, ce.title, ce.issued_at, ch.title AS challenge, ch.slug AS cslug, o.slug AS oslug, o.name AS org
       FROM certificates ce JOIN challenges ch ON ch.id = ce.challenge_id JOIN organizations o ON o.id = ch.org_id
       WHERE ce.user_id = ? AND ce.revoked = 0 AND o.suspended = 0 ORDER BY ce.issued_at DESC LIMIT 50`,
    ).bind(u.id),
    // Outcomes only show once results are public, so a profile never gives away an organiser's decision early.
    db.prepare(
      `SELECT t.name AS team, t.status, t.placement, ch.title AS challenge, ch.slug AS cslug, ch.results_published, o.slug AS oslug, o.name AS org
       FROM team_members m JOIN teams t ON t.id = m.team_id JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id
       WHERE m.user_id = ? AND ch.status != 'draft' AND o.suspended = 0 AND t.status != 'forming' ORDER BY t.created_at DESC LIMIT 50`,
    ).bind(u.id),
  ]);
  type T = { team: string; status: string; placement: number | null; challenge: string; cslug: string; results_published: number; oslug: string; org: string };
  return c.json({
    profile: {
      handle: u.handle, name: displayName(u.name), avatar_url: u.avatar_key ? fileUrl(u.avatar_key) : null, bio: u.bio ?? "", institution: u.institution ?? "", location: u.location ?? "",
      skills: parseJson<string[]>(u.skills, []), links: parseJson<Record<string, string>>(u.links, {}),
      certificates: certs!.results,
      teams: (teams!.results as T[]).map((t) => ({
        team: t.team, challenge: t.challenge, org: t.org, oslug: t.oslug, cslug: t.cslug,
        outcome: !t.results_published ? "taking part" : t.status === "winner" ? `winner${t.placement ? ` (${t.placement === 1 ? "1st" : t.placement === 2 ? "2nd" : t.placement === 3 ? "3rd" : `${t.placement}th`})` : ""}` : t.status === "finalist" ? "finalist" : "took part",
      })),
    },
  });
});

interface Ch { id: string; slug: string; title: string; status: string; applications_open_at: number | null; applications_close_at: number | null; team_max: number; results_published: number }

async function publicChallenge(c: Context<AppEnv>) {
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return null;
  const ch = await c.env.DB.prepare(
    "SELECT id, slug, title, status, applications_open_at, applications_close_at, team_max, results_published FROM challenges WHERE org_id = ? AND slug = ?",
  ).bind(access.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch || (ch.status === "draft" && !access.role)) return null;
  return { ...access, ch };
}

/** Mounted under /api/orgs. */
export const orgPeople = new Hono<AppEnv>();

/**
 * Who's coming. Counts are for everyone. Names are only for signed-in people, and only of those who said they are
 * looking for a team or have a public profile.
 */
orgPeople.get("/:slug/challenges/:cslug/people", async (c) => {
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const user = c.get("user");
  const db = c.env.DB;
  const counts = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM teams WHERE challenge_id = ?1) AS teams,
       (SELECT COUNT(*) FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.challenge_id = ?1) AS in_teams,
       (SELECT COUNT(*) FROM team_seekers s WHERE s.challenge_id = ?1) AS looking`,
  ).bind(x.ch.id).first<{ teams: number; in_teams: number; looking: number }>();
  const out = { teams: counts?.teams ?? 0, participants: (counts?.in_teams ?? 0) + (counts?.looking ?? 0), looking: counts?.looking ?? 0 };
  if (!user) return c.json({ ...out, looking_list: null, people: null, me: null });
  const [seekers, open, mine] = await db.batch([
    db.prepare(
      `SELECT u.id, u.name, u.skills, u.institution, CASE WHEN u.public_profile = 1 THEN u.handle END AS handle, s.note, s.created_at
       FROM team_seekers s JOIN users u ON u.id = s.user_id WHERE s.challenge_id = ? AND u.suspended = 0 ORDER BY s.created_at DESC LIMIT 200`,
    ).bind(x.ch.id),
    db.prepare(
      `SELECT u.id, u.name, u.handle, t.name AS team FROM team_members m JOIN teams t ON t.id = m.team_id JOIN users u ON u.id = m.user_id
       WHERE t.challenge_id = ? AND u.public_profile = 1 AND u.handle IS NOT NULL AND u.suspended = 0 ORDER BY u.name LIMIT 200`,
    ).bind(x.ch.id),
    db.prepare("SELECT note FROM team_seekers WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, user.id),
  ]);
  type S = { id: string; name: string | null; skills: string; institution: string | null; handle: string | null; note: string };
  type P = { id: string; name: string | null; handle: string; team: string };
  return c.json({
    ...out,
    looking_list: (seekers!.results as S[]).map((s) => ({ id: s.id, name: displayName(s.name), handle: s.handle, note: s.note, skills: parseJson<string[]>(s.skills, []).slice(0, 8), institution: s.institution ?? "" })),
    people: (open!.results as P[]).map((p) => ({ id: p.id, name: displayName(p.name), handle: p.handle, team: p.team })),
    me: { looking: (mine!.results as { note: string }[])[0] ?? null },
  });
});

/** "Looking for a team", with a short note. Only while the challenge takes applications, and only without a team. */
orgPeople.put("/:slug/challenges/:cslug/looking", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to look for a team" }, 401);
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = applyWindow(x.ch);
  if (why) return c.json({ error: why }, 409);
  const parsed = z.object({ note: z.string().trim().max(280).default("") }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Keep the note under 280 characters" }, 400);
  const inTeam = await c.env.DB.prepare("SELECT 1 AS x FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.challenge_id = ? AND m.user_id = ?").bind(x.ch.id, user.id).first();
  if (inTeam) return c.json({ error: "You are already in a team for this challenge" }, 409);
  await c.env.DB.prepare(
    "INSERT INTO team_seekers (challenge_id, user_id, note, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(challenge_id, user_id) DO UPDATE SET note = excluded.note",
  ).bind(x.ch.id, user.id, parsed.data.note, Date.now()).run();
  return c.json({ ok: true });
});

orgPeople.delete("/:slug/challenges/:cslug/looking", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM team_seekers WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, user.id).run();
  return c.json({ ok: true });
});

const GALLERY = `SELECT t.id, t.name, t.status, t.placement, ch.title AS challenge, ch.slug AS cslug, o.slug AS oslug,
    s.video_url, s.demo_url, s.notes, s.repo_url,
    (SELECT pi.key FROM pitch_images pi WHERE pi.team_id = t.id ORDER BY pi.position, pi.created_at LIMIT 1) AS cover_key,
    (SELECT group_concat(COALESCE(NULLIF(u.name, ''), 'Participant'), ', ') FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = t.id) AS members
  FROM teams t JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id LEFT JOIN submissions s ON s.team_id = t.id
  WHERE t.show_project = 1 AND t.status IN ('finalist','winner') AND ch.status = 'completed' AND ch.results_published = 1 AND o.suspended = 0`;
type G = { id: string; name: string; status: string; placement: number | null; challenge: string; cslug: string; oslug: string; video_url: string | null; demo_url: string | null; repo_url: string | null; notes: string | null; cover_key: string | null; members: string | null };
// Every media field may be missing: a project with no video, images or links still gets a card and a page.
const galleryOut = (g: G) => ({
  id: g.id, team: g.name, status: g.status, placement: g.placement, challenge: g.challenge, cslug: g.cslug, oslug: g.oslug,
  video_url: g.video_url ?? "", video_embed: youtubeEmbed(g.video_url), demo_url: g.demo_url ?? "", repo_url: g.repo_url ?? "", notes: g.notes ?? "",
  cover_url: g.cover_key ? fileUrl(g.cover_key) : null, members: g.members ?? "",
});

/** Projects from one completed challenge whose teams chose to show them (decision D2: opt in). */
orgPeople.get("/:slug/challenges/:cslug/gallery", async (c) => {
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB.prepare(`${GALLERY} AND ch.id = ? ORDER BY t.placement IS NULL, t.placement, t.name`).bind(x.ch.id).all<G>();
  return c.json({ projects: results.map(galleryOut) });
});

/** One project's own page: the pitch with its video and screenshots, for teams that chose to show it. */
orgPeople.get("/:slug/challenges/:cslug/projects/:teamId", async (c) => {
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const g = await c.env.DB.prepare(`${GALLERY} AND ch.id = ? AND t.id = ?`).bind(x.ch.id, c.req.param("teamId")!).first<G>();
  if (!g) return c.json({ error: "Not found" }, 404);
  // Members link to their profile only when they made it public.
  const { results: members } = await c.env.DB.prepare(
    `SELECT COALESCE(NULLIF(u.name, ''), 'Participant') AS name, CASE WHEN u.public_profile = 1 THEN u.handle END AS handle, CASE WHEN u.public_profile = 1 THEN u.avatar_key END AS avatar_key, (t.lead_user_id = u.id) AS lead
     FROM team_members m JOIN users u ON u.id = m.user_id JOIN teams t ON t.id = m.team_id WHERE m.team_id = ? ORDER BY lead DESC, m.joined_at`,
  ).bind(g.id).all<{ name: string; handle: string | null; avatar_key: string | null; lead: number }>();
  const { results: others } = await c.env.DB.prepare(`${GALLERY} AND ch.id = ? AND t.id != ? ORDER BY t.placement IS NULL, t.placement, t.name LIMIT 6`).bind(x.ch.id, g.id).all<G>();
  return c.json({
    project: { ...galleryOut(g), members: members.map((m) => ({ name: m.name, handle: m.handle, avatar_url: m.avatar_key ? fileUrl(m.avatar_key) : null, lead: !!m.lead })), images: await pitchImages(c, g.id) },
    org: { slug: x.org.slug, name: x.org.name }, more: others.map(galleryOut),
  });
});

// ---- event recap: photos from the day, shown once the challenge is under way ----
const RECAP_STATUSES = ["judging", "completed"];
type Photo = { id: string; key: string; caption: string; approved: number; user_id: string | null; created_at: number; by: string | null };
const photoOut = (p: Photo) => ({ id: p.id, url: fileUrl(p.key), caption: p.caption, approved: !!p.approved, by: p.by ?? "", created_at: p.created_at });

/** Approved photos for everyone. Organisers also get the ones waiting for approval; participants see their own. */
orgPeople.get("/:slug/challenges/:cslug/photos", async (c) => {
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.key, p.caption, p.approved, p.user_id, p.created_at, COALESCE(NULLIF(u.name, ''), 'Participant') AS by
     FROM challenge_photos p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.challenge_id = ? AND (p.approved = 1 OR ? = 1 OR p.user_id = ?) ORDER BY p.approved DESC, p.created_at`,
  ).bind(x.ch.id, x.role ? 1 : 0, user?.id ?? "").all<Photo>();
  const canAdd = !!user && RECAP_STATUSES.includes(x.ch.status) && (!!x.role || !!(await c.env.DB.prepare(
    "SELECT 1 AS x FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.challenge_id = ? AND m.user_id = ?").bind(x.ch.id, user.id).first()));
  return c.json({ photos: results.map(photoOut), can_add: canAdd, can_manage: !!x.role, open: RECAP_STATUSES.includes(x.ch.status), per_person: MAX_PHOTOS_PER_PERSON });
});

orgPeople.post("/:slug/challenges/:cslug/photos", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  if (!RECAP_STATUSES.includes(x.ch.status)) return c.json({ error: "Photos can be added once the event is under way" }, 409);
  const organiser = !!x.role;
  if (!organiser) {
    const inTeam = await c.env.DB.prepare("SELECT 1 AS x FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.challenge_id = ? AND m.user_id = ?").bind(x.ch.id, user.id).first();
    if (!inTeam) return c.json({ error: "Only participants and organisers can add photos" }, 403);
  }
  const counts = await c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine FROM challenge_photos WHERE challenge_id = ?")
    .bind(user.id, x.ch.id).first<{ total: number; mine: number | null }>();
  if ((counts?.total ?? 0) >= MAX_RECAP_PHOTOS) return c.json({ error: `This recap already has ${MAX_RECAP_PHOTOS} photos` }, 409);
  if (!organiser && (counts?.mine ?? 0) >= MAX_PHOTOS_PER_PERSON) return c.json({ error: `You can add up to ${MAX_PHOTOS_PER_PERSON} photos` }, 409);
  const saved = await saveImage(c, `photos/${x.ch.id}`, MEDIA_BYTES);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  const id = newId();
  await c.env.DB.prepare("INSERT INTO challenge_photos (id, challenge_id, user_id, key, caption, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, x.ch.id, user.id, saved.key, headerCaption(c.req.header("X-Caption")), organiser ? 1 : 0, Date.now()).run();
  return c.json({ ok: true, id, approved: organiser });
});

/** Organisers approve, re-caption or hide a photo. */
orgPeople.put("/:slug/challenges/:cslug/photos/:photoId", async (c) => {
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  if (!x.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const parsed = z.object({ approved: z.boolean().optional(), caption: z.string().trim().max(120).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the photo details" }, 400);
  const { approved, caption } = parsed.data;
  const r = await c.env.DB.prepare("UPDATE challenge_photos SET approved = COALESCE(?, approved), caption = COALESCE(?, caption) WHERE id = ? AND challenge_id = ?")
    .bind(approved === undefined ? null : approved ? 1 : 0, caption ?? null, c.req.param("photoId")!, x.ch.id).run();
  if (!r.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Organisers remove any photo; participants remove their own. */
orgPeople.delete("/:slug/challenges/:cslug/photos/:photoId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const x = await publicChallenge(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT key, user_id FROM challenge_photos WHERE id = ? AND challenge_id = ?").bind(c.req.param("photoId")!, x.ch.id).first<{ key: string; user_id: string | null }>();
  if (!row || (!x.role && row.user_id !== user.id)) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM challenge_photos WHERE id = ?").bind(c.req.param("photoId")!).run();
  c.executionCtx.waitUntil(c.env.FILES.delete(row.key).catch(() => {}));
  return c.json({ ok: true });
});

/** The same across all of an organisation's completed challenges, newest first. */
orgPeople.get("/:slug/gallery", async (c) => {
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB.prepare(`${GALLERY} AND o.id = ? ORDER BY COALESCE(ch.results_published_at, ch.created_at) DESC, t.placement IS NULL, t.placement, t.name LIMIT 60`)
    .bind(access.org.id).all<G>();
  return c.json({ projects: results.map(galleryOut) });
});

/** Mounted under /api/teams: the lead invites someone from the team finder, and chooses whether to show the project. */
export const teamFinder = new Hono<AppEnv>();

async function ledTeam(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) return { err: c.json({ error: "Not signed in" }, 401) };
  const t = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status, t.invite_code, t.lead_user_id, t.challenge_id, ch.title, ch.slug AS cslug, ch.status AS cstatus, ch.team_max,
       ch.applications_open_at, ch.applications_close_at, o.slug AS oslug, o.name AS oname
     FROM teams t JOIN team_members m ON m.team_id = t.id JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id
     WHERE t.id = ? AND m.user_id = ?`,
  ).bind(c.req.param("id")!, user.id).first<{ id: string; name: string; status: string; invite_code: string; lead_user_id: string; challenge_id: string; title: string; cslug: string; cstatus: string; team_max: number; applications_open_at: number | null; applications_close_at: number | null; oslug: string; oname: string }>();
  if (!t) return { err: c.json({ error: "Not found" }, 404) };
  if (t.lead_user_id !== user.id) return { err: c.json({ error: "Only the team lead can do that" }, 403) };
  return { user, t };
}

teamFinder.post("/:id/invite", async (c) => {
  const x = await ledTeam(c); if ("err" in x) return x.err;
  const { t, user } = x;
  const why = applyWindow({ status: t.cstatus, applications_open_at: t.applications_open_at, applications_close_at: t.applications_close_at });
  if (why) return c.json({ error: why }, 409);
  if (t.status !== "forming") return c.json({ error: "This team has already applied, so it is closed to new members" }, 409);
  const parsed = z.object({ user_id: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick someone to invite" }, 400);
  const target = parsed.data.user_id;
  if (target === user.id) return c.json({ error: "You are already on this team" }, 400);
  const db = c.env.DB;
  const [seeker, size, sent] = await db.batch([
    // Only people who said they are looking, on this challenge, and not in a team yet.
    db.prepare(
      `SELECT 1 AS x FROM team_seekers s JOIN users u ON u.id = s.user_id WHERE s.challenge_id = ? AND s.user_id = ? AND u.suspended = 0
         AND NOT EXISTS (SELECT 1 FROM team_members m JOIN teams t2 ON t2.id = m.team_id WHERE m.user_id = s.user_id AND t2.challenge_id = s.challenge_id)`,
    ).bind(t.challenge_id, target),
    db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(t.id),
    db.prepare("SELECT COUNT(*) AS n FROM team_finder_invites WHERE team_id = ?").bind(t.id),
  ]);
  if (!seeker!.results.length) return c.json({ error: "That person is not looking for a team on this challenge any more" }, 404);
  if (((size!.results[0] as { n: number }).n) >= t.team_max) return c.json({ error: `Your team is full (max ${t.team_max})` }, 409);
  if (((sent!.results[0] as { n: number }).n) >= 30) return c.json({ error: "Your team has sent the most invites it can from the team finder" }, 429);
  const ins = await db.prepare("INSERT OR IGNORE INTO team_finder_invites (team_id, user_id, created_at) VALUES (?, ?, ?)").bind(t.id, target, Date.now()).run();
  if (!ins.meta.changes) return c.json({ ok: true, already: true });
  await db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (lower(hex(randomblob(12))), ?, 'team.invite', ?, ?, ?, ?)")
    .bind(target, `${t.name} invited you to join their team`, `For ${t.title} by ${t.oname}. Open the invite to see the team and join.`, `/join/${t.invite_code}`, Date.now()).run();
  pushLater(c);
  return c.json({ ok: true, already: false });
});

teamFinder.put("/:id/showcase", async (c) => {
  const x = await ledTeam(c); if ("err" in x) return x.err;
  if (x.t.status !== "finalist" && x.t.status !== "winner") return c.json({ error: "Only finalist and winning teams appear in the project gallery" }, 409);
  const parsed = z.object({ show: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Say whether to show the project" }, 400);
  await c.env.DB.prepare("UPDATE teams SET show_project = ? WHERE id = ?").bind(parsed.data.show ? 1 : 0, x.t.id).run();
  return c.json({ ok: true });
});

