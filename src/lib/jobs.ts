import type { Env } from "../types";
import { pushPending } from "./push";
import { fetchDueSources } from "./events";

/**
 * The hourly job (wrangler.jsonc "triggers"). Each step is on its own, so one failing step never stops the others.
 * Every step is safe to run twice: closing only touches open challenges, and reminders check they were not sent before.
 */
export async function runHourly(env: Env, now = Date.now()): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = "failed"; console.error(`cron ${name} failed: ${e instanceof Error ? e.message : e}`); }
  };
  await step("closed", () => closeApplications(env, now));
  await step("closing_reminders", () => closingReminders(env, now));
  await step("pitch_reminders", () => pitchReminders(env, now));
  await step("saved_reminders", () => savedReminders(env, now));
  await step("global_events", () => fetchDueSources(env, now));
  await step("cleaned", () => cleanUp(env, now));
  await step("pushed", () => retryPushes(env, now));
  console.log(`cron: ${JSON.stringify(out)}`);
  return out;
}

const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const link = "'/o/' || o.slug || '/c/' || ch.slug";

/** Challenges past their application deadline move from open to reviewing, and the organisers are told. */
export async function closeApplications(env: Env, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    `UPDATE challenges SET status = 'reviewing'
     WHERE status = 'open' AND applications_close_at IS NOT NULL AND applications_close_at <= ?
     RETURNING id, org_id, slug, title`,
  ).bind(now).all<{ id: string; org_id: string; slug: string; title: string }>();
  if (results.length) {
    await env.DB.batch(results.map((ch) => env.DB.prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
       SELECT lower(hex(randomblob(12))), m.user_id, 'challenge.closed', ?, ?, '/admin/o/' || o.slug || '/c/' || ?, ?
       FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.org_id = ?`,
    ).bind(
      `Applications closed: ${ch.title}`,
      "The deadline passed, so the challenge moved to reviewing. The applications are ready for you.",
      `${ch.slug}/applications`, now, ch.org_id,
    )));
  }
  return results.length;
}

/** "Closing in 3 days" and "closing tomorrow" for every member of a team that has not applied yet. */
export async function closingReminders(env: Env, now: number): Promise<number> {
  const remind = (kind: string, lo: number, hi: number, when: string) => env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), m.user_id, ?1, 'Applications close ' || ?2 || ': ' || ch.title,
            'Your team ' || t.name || ' has not applied yet. Your team lead sends the application.', ${link}, ?3
     FROM teams t
     JOIN team_members m ON m.team_id = t.id
     JOIN users u ON u.id = m.user_id
     JOIN challenges ch ON ch.id = t.challenge_id
     JOIN organizations o ON o.id = ch.org_id
     WHERE t.status = 'forming' AND ch.status = 'open' AND o.suspended = 0 AND u.suspended = 0
       AND ch.applications_close_at > ?4 AND ch.applications_close_at <= ?5
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = m.user_id AND n.kind = ?1 AND n.link = ${link})`,
  ).bind(kind, when, now, lo, hi);
  const r = await env.DB.batch([
    remind("deadline.3d", now + DAY, now + 3 * DAY, "in 3 days"),
    remind("deadline.1d", now, now + DAY, "tomorrow"),
  ]);
  return r.reduce((a, x) => a + (x.meta.changes ?? 0), 0);
}

/** Pitch reminders 3 days and 1 day before the pitch is due, for shortlisted teams that have not sent one yet. */
export async function pitchReminders(env: Env, now: number): Promise<number> {
  const remind = (kind: string, lo: number, hi: number, when: string) => env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), m.user_id, ?1, 'Pitch due ' || ?2 || ': ' || ch.title,
            'Team ' || t.name || ' has not sent its pitch yet. Upload your deck before the deadline.', ${link}, ?3
     FROM teams t
     JOIN team_members m ON m.team_id = t.id
     JOIN users u ON u.id = m.user_id
     JOIN challenges ch ON ch.id = t.challenge_id
     JOIN organizations o ON o.id = ch.org_id
     WHERE t.status IN ('shortlisted', 'finalist') AND ch.status IN ('reviewing', 'judging') AND o.suspended = 0 AND u.suspended = 0
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.team_id = t.id)
       AND ch.pitch_due_at > ?4 AND ch.pitch_due_at <= ?5
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = m.user_id AND n.kind = ?1 AND n.link = ${link})`,
  ).bind(kind, when, now, lo, hi);
  const r = await env.DB.batch([
    remind("pitch.3d", now + DAY, now + 3 * DAY, "in 3 days"),
    remind("pitch.1d", now, now + DAY, "tomorrow"),
  ]);
  return r.reduce((a, x) => a + (x.meta.changes ?? 0), 0);
}

/**
 * "Closes in 3 days" and "closes tomorrow" for things people saved: a global event, or a challenge they have not
 * joined a team for yet (people in a team get the team reminders above instead).
 */
export async function savedReminders(env: Env, now: number): Promise<number> {
  const eventLink = "'/events/' || e.slug";
  const forEvents = (kind: string, lo: number, hi: number, when: string) => env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), s.user_id, ?1,
            CASE WHEN e.deadline_at IS NOT NULL THEN 'Closes ' ELSE 'Starts ' END || ?2 || ': ' || e.title,
            'You saved this global event. Open it for the official link.', ${eventLink}, ?3
     FROM saved_items s
     JOIN external_events e ON e.id = s.item_id AND e.state = 'published'
     JOIN users u ON u.id = s.user_id AND u.suspended = 0
     WHERE s.kind = 'event' AND COALESCE(e.deadline_at, e.starts_at) > ?4 AND COALESCE(e.deadline_at, e.starts_at) <= ?5
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = s.user_id AND n.kind = ?1 AND n.link = ${eventLink})`,
  ).bind(kind, when, now, lo, hi);
  const forChallenges = (kind: string, lo: number, hi: number, when: string) => env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), s.user_id, ?1, 'Applications close ' || ?2 || ': ' || ch.title,
            'You saved this challenge but are not in a team for it yet.', ${link}, ?3
     FROM saved_items s
     JOIN challenges ch ON ch.id = s.item_id AND ch.status = 'open'
     JOIN organizations o ON o.id = ch.org_id AND o.suspended = 0
     JOIN users u ON u.id = s.user_id AND u.suspended = 0
     WHERE s.kind = 'challenge' AND ch.applications_close_at > ?4 AND ch.applications_close_at <= ?5
       AND NOT EXISTS (SELECT 1 FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = s.user_id AND t.challenge_id = ch.id)
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = s.user_id AND n.kind = ?1 AND n.link = ${link})`,
  ).bind(kind, when, now, lo, hi);
  const r = await env.DB.batch([
    forEvents("saved.3d", now + DAY, now + 3 * DAY, "in 3 days"), forEvents("saved.1d", now, now + DAY, "tomorrow"),
    forChallenges("saved.3d", now + DAY, now + 3 * DAY, "in 3 days"), forChallenges("saved.1d", now, now + DAY, "tomorrow"),
  ]);
  return r.reduce((a, x) => a + (x.meta.changes ?? 0), 0);
}

/** Expired sessions and sign-in codes, and wrong-code counters older than their 15-minute window. */
export async function cleanUp(env: Env, now: number): Promise<number> {
  const r = await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM login_tokens WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM code_failures WHERE window_start < ?").bind(now - HOUR),
  ]);
  return r.reduce((a, x) => a + (x.meta.changes ?? 0), 0);
}

/** Pushes that were never sent (Expo was down, or a big event ran past one request), from the last day. */
export async function retryPushes(env: Env, now: number): Promise<number> {
  let sent = 0, more = true;
  for (let i = 0; i < 5 && more; i++) { const r = await pushPending(env, now - DAY); sent += r.sent; more = r.more; }
  if (more && env.OUTBOX) await env.OUTBOX.send({ type: "push" });
  return sent;
}
