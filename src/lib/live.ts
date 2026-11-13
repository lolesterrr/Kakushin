import type { Env } from "../types";
import { pushPending } from "./push";

/** Must match the second entry of "triggers" in wrangler.jsonc. */
export const LIVE_CRON = "*/5 * * * *";
export const MIN = 60 * 1000;
/** The live job runs every 5 minutes (wrangler.jsonc "triggers"). */
export const LIVE_STEP = 5 * MIN;
/** Pushes before the pitch cutoff, in minutes. */
export const CUTOFF_MARKS = [1, 10, 30] as const;

export const AGENDA_KINDS = ["briefing", "ideation", "build", "pitching", "results", "break", "other"] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];
export const KIND_LABEL: Record<AgendaKind, string> = {
  briefing: "Briefing", ideation: "Ideation", build: "Build", pitching: "Pitching", results: "Results", break: "Break", other: "Session",
};

export interface Block { id: string; kind: string; label: string; starts_at: number; ends_at: number }

/** The block running at `now` and the next one to start. Blocks never overlap (the agenda route refuses that). */
export function currentBlock<T extends Block>(blocks: T[], now: number): { current: T | null; next: T | null } {
  const sorted = [...blocks].sort((a, b) => a.starts_at - b.starts_at);
  return {
    current: sorted.find((b) => b.starts_at <= now && now < b.ends_at) ?? null,
    next: sorted.find((b) => b.starts_at > now) ?? null,
  };
}

/** Returns the first pair of blocks that overlap, or null. Touching blocks (one ends as the next starts) are fine. */
export function overlap<T extends { starts_at: number; ends_at: number }>(blocks: T[]): [T, T] | null {
  const s = [...blocks].sort((a, b) => a.starts_at - b.starts_at);
  for (let i = 1; i < s.length; i++) if (s[i]!.starts_at < s[i - 1]!.ends_at) return [s[i - 1]!, s[i]!];
  return null;
}

/**
 * Which cutoff push is due when `left` ms remain, or null. The job runs every 5 minutes, so each mark goes out on the
 * run that falls in the 5 minutes before it, and the push says the real time left. When runs were missed, only the
 * nearest mark is sent: nobody gets "30 minutes" and "10 minutes" at once.
 */
export function cutoffMark(left: number): number | null {
  if (left <= 0) return null;
  for (const m of CUTOFF_MARKS) if (left <= m * MIN + LIVE_STEP) return m;
  return null;
}

export const minutesText = (ms: number) => { const n = Math.max(1, Math.round(ms / MIN)); return `${n} ${n === 1 ? "minute" : "minutes"}`; };

const liveLink = "'/o/' || o.slug || '/c/' || ch.slug || '/live'";

/** Inbox items (and so pushes) for everyone in teams of one challenge whose status is in `statuses`. */
const notifyTeams = (env: Env, statuses: string[], kind: string, title: string, body: string, challengeId: string, now: number) => env.DB.prepare(
  `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
   SELECT lower(hex(randomblob(12))), x.user_id, ?, ?, ?, x.link, ? FROM (
     SELECT DISTINCT m.user_id, ${liveLink} AS link
     FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id
     JOIN challenges ch ON ch.id = t.challenge_id JOIN organizations o ON o.id = ch.org_id
     WHERE t.challenge_id = ? AND u.suspended = 0 AND t.status IN (${statuses.map(() => "?").join(",")})) x`,
).bind(kind, title, body, now, challengeId, ...statuses).run();

/** Claims a live alert. Only the first caller gets true, so overlapping runs never send the same push twice. */
const claim = async (env: Env, challengeId: string, key: string, now: number) =>
  ((await env.DB.prepare("INSERT OR IGNORE INTO live_alerts (challenge_id, key, sent_at) VALUES (?, ?, ?)").bind(challengeId, key, now).run()).meta.changes ?? 0) > 0;

const ACTIVE = "ch.status NOT IN ('draft', 'completed') AND o.suspended = 0";
/** Everyone taking part, as opposed to teams that were turned down. */
const TAKING_PART = ["forming", "applied", "shortlisted", "finalist", "winner"];
const PITCHING = ["shortlisted", "finalist", "winner"];

/**
 * The 5-minute job. It only does work when an agenda block starts, or a pitch cutoff mark falls, within the next 5
 * minutes: "Build starts now" to everyone taking part, and "Submissions close in 10 minutes" to the teams that pitch.
 */
export async function runLive(env: Env, now = Date.now()): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = { blocks: 0, cutoffs: 0, pushed: 0 };
  let wrote = 0;
  try {
    const { results: blocks } = await env.DB.prepare(
      `SELECT a.challenge_id, a.label, a.starts_at, a.ends_at, ch.title FROM challenge_agenda a
       JOIN challenges ch ON ch.id = a.challenge_id JOIN organizations o ON o.id = ch.org_id
       WHERE a.starts_at > ? AND a.starts_at <= ? AND ${ACTIVE}`,
    ).bind(now - LIVE_STEP, now + LIVE_STEP).all<{ challenge_id: string; label: string; starts_at: number; ends_at: number; title: string }>();
    for (const b of blocks) {
      if (!(await claim(env, b.challenge_id, `block:${b.starts_at}`, now))) continue;
      const left = b.starts_at - now;
      const title = left <= MIN ? `${b.label} starts now` : `${b.label} starts in ${minutesText(left)}`;
      const r = await notifyTeams(env, TAKING_PART, "live.block", title, `${b.title}. It runs for ${minutesText(b.ends_at - b.starts_at)}. Open the live page for the countdown.`, b.challenge_id, now);
      wrote += r.meta.changes ?? 0; (out.blocks as number)++;
    }
  } catch (e) { out.blocks = "failed"; console.error(`live blocks failed: ${e instanceof Error ? e.message : e}`); }

  try {
    const { results: due } = await env.DB.prepare(
      `SELECT ch.id, ch.title, ch.pitch_due_at FROM challenges ch JOIN organizations o ON o.id = ch.org_id
       WHERE ch.pitch_due_at > ? AND ch.pitch_due_at <= ? AND ${ACTIVE}`,
    ).bind(now, now + CUTOFF_MARKS[CUTOFF_MARKS.length - 1]! * MIN + LIVE_STEP).all<{ id: string; title: string; pitch_due_at: number }>();
    for (const ch of due) {
      const left = ch.pitch_due_at - now;
      const mark = cutoffMark(left);
      if (mark === null || !(await claim(env, ch.id, `cutoff:${mark}:${ch.pitch_due_at}`, now))) continue;
      const r = await notifyTeams(env, PITCHING, `live.cutoff.${mark}`, `Submissions close in ${minutesText(left)}: ${ch.title}`,
        "Upload your final deck and links now. Nothing can be changed after the cutoff.", ch.id, now);
      wrote += r.meta.changes ?? 0; (out.cutoffs as number)++;
    }
  } catch (e) { out.cutoffs = "failed"; console.error(`live cutoffs failed: ${e instanceof Error ? e.message : e}`); }

  if (wrote) {
    try {
      let sent = 0, more = true;
      for (let i = 0; i < 5 && more; i++) { const r = await pushPending(env, now - LIVE_STEP); sent += r.sent; more = r.more; }
      if (more && env.OUTBOX) await env.OUTBOX.send({ type: "push" });
      out.pushed = sent;
    } catch (e) { out.pushed = "failed"; console.error(`live push failed: ${e instanceof Error ? e.message : e}`); }
  }
  if (out.blocks || out.cutoffs) console.log(`live cron: ${JSON.stringify(out)}`);
  return out;
}

// ---- check-in passes ----

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(secret: string, challengeId: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`checkin:${challengeId}:${userId}`));
  return b64url(mac).slice(0, 22); // 128 bits is plenty for a code that is only good for one event
}

/** A person's check-in pass for one challenge: "KK1." + their user id + a signature only the server can make. */
export const passCode = async (secret: string, challengeId: string, userId: string) => `KK1.${userId}.${await sign(secret, challengeId, userId)}`;

/** The user id inside a pass, if the pass was signed for this challenge with its current secret. */
export async function readPass(secret: string, challengeId: string, code: string): Promise<string | null> {
  const m = /^KK1\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{22})$/.exec(code.trim());
  if (!m) return null;
  const want = await sign(secret, challengeId, m[1]!);
  // Compare in constant time.
  let diff = want.length ^ m[2]!.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (m[2]!.charCodeAt(i) || 0);
  return diff === 0 ? m[1]! : null;
}
