import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId, randomToken } from "../lib/crypto";
import { loadOrg } from "../lib/access";
import { AGENDA_KINDS, KIND_LABEL, currentBlock, overlap, passCode, readPass, type AgendaKind, type Block } from "../lib/live";
import { STATUSES, type Audience } from "./messages";

/**
 * Event day: the agenda, the live page and QR check-in. Mounted under /api/orgs, next to the other challenge routes.
 *   GET  /:slug/challenges/:cslug/live              the live page (public; messages only for the people they were sent to)
 *   GET  /:slug/challenges/:cslug/agenda            the agenda (public)
 *   PUT  /:slug/challenges/:cslug/agenda            replace the agenda (admins)
 *   GET  /:slug/challenges/:cslug/checkin/pass      my check-in pass
 *   PUT  /:slug/challenges/:cslug/checkin/settings  turn check-in on or off (admins)
 *   GET  /:slug/challenges/:cslug/checkin           who is here (admins)
 *   POST /:slug/challenges/:cslug/checkin           check someone in from their QR or by name (admins)
 *   DELETE /:slug/challenges/:cslug/checkin         undo a check-in (admins)
 */
export const orgLive = new Hono<AppEnv>();

interface Ch { id: string; slug: string; title: string; status: string; pitch_due_at: number | null; checkin_enabled: number; checkin_secret: string | null }

async function load(c: Context<AppEnv>) {
  const a = await loadOrg(c, c.req.param("slug")!);
  if (!a) return null;
  const ch = await c.env.DB.prepare("SELECT id, slug, title, status, pitch_due_at, checkin_enabled, checkin_secret FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(a.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch || (ch.status === "draft" && !a.role)) return null;
  return { ...a, ch };
}

async function adminLoad(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const x = await load(c);
  if (!x) return { err: c.json({ error: "Not found" }, 404) };
  if (!x.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  return x;
}

export const agendaOf = async (c: Context<AppEnv>, challengeId: string) =>
  (await c.env.DB.prepare("SELECT id, kind, label, starts_at, ends_at FROM challenge_agenda WHERE challenge_id = ? ORDER BY starts_at").bind(challengeId).all<Block>()).results;

/** Teams turned down are not at the event. Everyone else in a team can get a pass. */
const ATTENDING = "t.status != 'rejected'";

// ---- agenda ----
orgLive.get("/:slug/challenges/:cslug/agenda", async (c) => {
  const x = await load(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  return c.json({ agenda: await agendaOf(c, x.ch.id) });
});

const ms = z.number().int().min(0).max(4_102_444_800_000);
const agendaBody = z.object({
  blocks: z.array(z.object({
    kind: z.enum(AGENDA_KINDS),
    label: z.string().trim().max(60).default(""),
    starts_at: ms,
    ends_at: ms,
  }).refine((b) => b.ends_at > b.starts_at, { message: "Every block must end after it starts" })
    .refine((b) => b.ends_at - b.starts_at <= 7 * 86400000, { message: "A block can be at most 7 days long" }))
    .max(30, "Use at most 30 blocks"),
});

orgLive.put("/:slug/challenges/:cslug/agenda", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = agendaBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the agenda" }, 400);
  const blocks = parsed.data.blocks.map((b) => ({ ...b, label: b.label || KIND_LABEL[b.kind as AgendaKind] })).sort((a, b) => a.starts_at - b.starts_at);
  const clash = overlap(blocks);
  if (clash) return c.json({ error: `"${clash[0].label}" and "${clash[1].label}" overlap. Blocks run one after another.` }, 400);
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM challenge_agenda WHERE challenge_id = ?").bind(x.ch.id),
    ...blocks.map((b) => db.prepare("INSERT INTO challenge_agenda (id, challenge_id, kind, label, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId(), x.ch.id, b.kind, b.label, b.starts_at, b.ends_at)),
  ]);
  return c.json({ ok: true, agenda: await agendaOf(c, x.ch.id) });
});

// ---- live page ----
/** Does a group message with this audience reach a team with this id and status? */
const reaches = (audience: string | null, team: { id: string; status: string }) =>
  audience === `team:${team.id}` || (!!audience && audience in STATUSES && STATUSES[audience as Exclude<Audience, "team">].includes(team.status));

orgLive.get("/:slug/challenges/:cslug/live", async (c) => {
  const x = await load(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  const user = c.get("user"), now = Date.now();
  const agenda = await agendaOf(c, x.ch.id);
  const { current, next } = currentBlock(agenda, now);
  const team = user ? await c.env.DB.prepare(
    "SELECT t.id, t.name, t.status FROM teams t JOIN team_members m ON m.team_id = t.id WHERE t.challenge_id = ? AND m.user_id = ?",
  ).bind(x.ch.id, user.id).first<{ id: string; name: string; status: string }>() : null;

  // Group messages go to the people they were sent to: organisers see them all, a participant sees those for their team.
  let messages: { id: string; title: string; body: string; created_at: number }[] = [];
  if (x.role || team) {
    const { results } = await c.env.DB.prepare("SELECT id, title, body, audience, created_at FROM announcements WHERE challenge_id = ? ORDER BY created_at DESC LIMIT 30")
      .bind(x.ch.id).all<{ id: string; title: string; body: string; audience: string | null; created_at: number }>();
    messages = results.filter((m) => x.role || (team && reaches(m.audience, team))).slice(0, 5).map(({ audience: _a, ...m }) => m);
  }
  const checkedIn = user && x.ch.checkin_enabled
    ? (await c.env.DB.prepare("SELECT checked_in_at FROM check_ins WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, user.id).first<{ checked_in_at: number }>())?.checked_in_at ?? null
    : null;
  c.header("Cache-Control", "no-store");
  return c.json({
    now,
    challenge: { title: x.ch.title, slug: x.ch.slug, status: x.ch.status, pitch_due_at: x.ch.pitch_due_at, checkin_enabled: !!x.ch.checkin_enabled, org: { slug: x.org.slug, name: x.org.name } },
    agenda, current: current?.id ?? null, next: next?.id ?? null,
    submissions_closed: !!x.ch.pitch_due_at && now >= x.ch.pitch_due_at,
    messages,
    me: user ? { role: x.role, team, checked_in_at: checkedIn } : null,
  });
});

// ---- check-in ----
orgLive.get("/:slug/challenges/:cslug/checkin/pass", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const x = await load(c);
  if (!x) return c.json({ error: "Not found" }, 404);
  if (!x.ch.checkin_enabled || !x.ch.checkin_secret) return c.json({ enabled: false, code: null, checked_in_at: null });
  const team = await c.env.DB.prepare(
    `SELECT t.name FROM teams t JOIN team_members m ON m.team_id = t.id WHERE t.challenge_id = ? AND m.user_id = ? AND ${ATTENDING}`,
  ).bind(x.ch.id, user.id).first<{ name: string }>();
  if (!team) return c.json({ error: "Check-in passes are for people in a team taking part in this challenge" }, 403);
  const row = await c.env.DB.prepare("SELECT checked_in_at FROM check_ins WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, user.id).first<{ checked_in_at: number }>();
  c.header("Cache-Control", "private, no-store");
  return c.json({ enabled: true, code: await passCode(x.ch.checkin_secret, x.ch.id, user.id), team: team.name, name: user.name || user.email.split("@")[0], checked_in_at: row?.checked_in_at ?? null });
});

orgLive.put("/:slug/challenges/:cslug/checkin/settings", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Say whether check-in is on" }, 400);
  // A new secret each time it is turned on, so passes from an earlier event stop working.
  const turningOn = parsed.data.enabled && !x.ch.checkin_enabled;
  await c.env.DB.prepare("UPDATE challenges SET checkin_enabled = ?, checkin_secret = CASE WHEN ? THEN ? ELSE checkin_secret END WHERE id = ?")
    .bind(parsed.data.enabled ? 1 : 0, turningOn ? 1 : 0, randomToken(24), x.ch.id).run();
  return c.json({ ok: true, enabled: parsed.data.enabled });
});

/** Everyone who can check in, with their team and whether they are here. */
async function roster(c: Context<AppEnv>, challengeId: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id AS user_id, COALESCE(NULLIF(u.name, ''), substr(u.email, 1, instr(u.email, '@') - 1)) AS name, t.name AS team, t.status,
       ci.checked_in_at, ci.method
     FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id
     LEFT JOIN check_ins ci ON ci.challenge_id = t.challenge_id AND ci.user_id = u.id
     WHERE t.challenge_id = ? AND ${ATTENDING}
     ORDER BY ci.checked_in_at IS NULL, ci.checked_in_at DESC, name`,
  ).bind(challengeId).all<{ user_id: string; name: string; team: string; status: string; checked_in_at: number | null; method: string | null }>();
  return results;
}

orgLive.get("/:slug/challenges/:cslug/checkin", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const people = await roster(c, x.ch.id);
  return c.json({ enabled: !!x.ch.checkin_enabled, total: people.length, checked_in: people.filter((p) => p.checked_in_at).length, people });
});

const scanBody = z.union([
  z.object({ code: z.string().trim().min(1).max(200) }),
  z.object({ user_id: z.string().trim().min(1).max(64) }),
]);

orgLive.post("/:slug/challenges/:cslug/checkin", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  if (!x.ch.checkin_enabled || !x.ch.checkin_secret) return c.json({ error: "Check-in is off for this challenge. Turn it on first." }, 409);
  const parsed = scanBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Scan a pass or pick a person" }, 400);
  let userId: string | null, method: "qr" | "name";
  if ("code" in parsed.data) {
    userId = await readPass(x.ch.checkin_secret, x.ch.id, parsed.data.code);
    method = "qr";
    if (!userId) return c.json({ error: "This is not a valid pass for this event. Ask the person to open their pass for this challenge." }, 400);
  } else { userId = parsed.data.user_id; method = "name"; }
  const who = await c.env.DB.prepare(
    `SELECT COALESCE(NULLIF(u.name, ''), substr(u.email, 1, instr(u.email, '@') - 1)) AS name, t.name AS team
     FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id WHERE t.challenge_id = ? AND u.id = ? AND ${ATTENDING}`,
  ).bind(x.ch.id, userId).first<{ name: string; team: string }>();
  if (!who) return c.json({ error: "This person is not in a team taking part in this challenge" }, 404);
  const now = Date.now();
  const ins = await c.env.DB.prepare("INSERT OR IGNORE INTO check_ins (challenge_id, user_id, checked_in_at, by_user_id, method) VALUES (?, ?, ?, ?, ?)")
    .bind(x.ch.id, userId, now, c.get("user")!.id, method).run();
  const at = ins.meta.changes ? now : (await c.env.DB.prepare("SELECT checked_in_at FROM check_ins WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, userId).first<{ checked_in_at: number }>())?.checked_in_at ?? now;
  const count = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE challenge_id = ?").bind(x.ch.id).first<{ n: number }>())?.n ?? 0;
  return c.json({ ok: true, already: !ins.meta.changes, name: who.name, team: who.team, checked_in_at: at, checked_in: count });
});

orgLive.delete("/:slug/challenges/:cslug/checkin", async (c) => {
  const x = await adminLoad(c); if ("err" in x) return x.err;
  const parsed = z.object({ user_id: z.string().trim().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a person" }, 400);
  await c.env.DB.prepare("DELETE FROM check_ins WHERE challenge_id = ? AND user_id = ?").bind(x.ch.id, parsed.data.user_id).run();
  return c.json({ ok: true });
});
