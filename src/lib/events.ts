import type { Env } from "../types";
import { newId } from "./crypto";
import { slugify } from "./slug";
import { readSource, type FeedItem } from "./feeds";

/** Global events: listings Kakushin shows but does not run. See migrations/0020 and src/lib/feeds.ts. */
const DAY = 86400000;
/** A post with no dates at all (most feed items) stays listed for this long. */
export const UNDATED_DAYS = 60;
const REFETCH_MS = 6 * 3600 * 1000;
const SOURCES_PER_RUN = 4;

/** SQL for "still worth showing": the deadline, or else the end, or else the start, has not passed. */
export const liveSql = (alias = "e") =>
  `${alias}.state = 'published' AND COALESCE(${alias}.deadline_at, ${alias}.ends_at, ${alias}.starts_at, ${alias}.published_at + ${UNDATED_DAYS * DAY}) > ?`;

export interface EventRow {
  id: string; slug: string; source_id: string | null; source_name: string; submitted_by: string | null;
  title: string; summary: string; description: string; url: string; image_url: string | null; organizer: string; location: string;
  is_online: number; starts_at: number | null; ends_at: number | null; deadline_at: number | null; topics: string;
  state: string; review_note: string; announced: number; published_at: number | null; created_at: number;
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const topicsOf = (raw: string): string[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

export const eventCard = (r: EventRow) => ({
  slug: r.slug, title: r.title, summary: r.summary, image_url: r.image_url, topics: topicsOf(r.topics),
  organizer: r.organizer, location: r.location, is_online: !!r.is_online,
  starts_at: r.starts_at, ends_at: r.ends_at, deadline_at: r.deadline_at,
  source: r.source_name || (r.submitted_by ? "Suggested by the community" : ""), host: hostOf(r.url),
});
export const eventFull = (r: EventRow) => ({ ...eventCard(r), description: r.description, url: r.url, state: r.state, published_at: r.published_at });

export const eventSlug = (title: string) => `${(slugify(title) || "event").slice(0, 34).replace(/-+$/, "")}-${newId().slice(-5)}`;

/** Already over when it arrives: not worth a place in the queue. */
function stale(i: FeedItem, now: number): boolean {
  const end = i.deadline_at ?? i.ends_at ?? i.starts_at;
  if (end !== null) return end <= now;
  return i.published_at !== null && i.published_at < now - UNDATED_DAYS * DAY;
}

/**
 * Stores what a source sent. Anything already listed (same page, or same item from the same source) is left alone, so
 * an admin's edits and decisions are never overwritten by the next read. Returns the ids that were added.
 */
export async function importItems(env: Env, source: { id: string; name: string; auto_publish: number }, items: FeedItem[], now = Date.now()): Promise<{ added: string[]; published: string[] }> {
  const fresh = items.filter((i) => !stale(i, now));
  if (!fresh.length) return { added: [], published: [] };
  const state = source.auto_publish ? "published" : "pending";
  const rows = fresh.map((i) => ({ id: newId(), i }));
  const res = await env.DB.batch(rows.map(({ id, i }) => env.DB.prepare(
    `INSERT OR IGNORE INTO external_events (id, slug, source_id, source_name, external_key, title, summary, description, url, image_url, organizer, location,
       is_online, starts_at, ends_at, deadline_at, topics, state, published_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, eventSlug(i.title), source.id, source.name, i.key.slice(0, 300), i.title, i.summary, i.description, i.url, i.image_url, i.organizer, i.location,
    i.is_online ? 1 : 0, i.starts_at, i.ends_at, i.deadline_at, JSON.stringify(i.topics), state, source.auto_publish ? now : null, now)));
  const added = rows.filter((_, n) => (res[n]?.meta.changes ?? 0) > 0).map((r) => r.id);
  return { added, published: source.auto_publish ? added : [] };
}

/**
 * Tells people about newly published global events in their topics. One note per person however many events there
 * are, so a source that brings twenty at once does not fill anyone's inbox. Each event is announced only once.
 */
export async function announceEvents(env: Env, ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0;
  const marks = ids.map(() => "?").join(",");
  const claim = await env.DB.prepare(`UPDATE external_events SET announced = 1 WHERE announced = 0 AND state = 'published' AND id IN (${marks}) RETURNING id`).bind(...ids).all<{ id: string }>();
  const mine = claim.results.map((r) => r.id);
  if (!mine.length) return 0;
  const m2 = mine.map(() => "?").join(",");
  const ins = await env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), x.user_id, 'event.new',
       CASE WHEN x.n = 1 THEN 'New global event: ' || x.title ELSE x.n || ' new global events in your topics' END,
       CASE WHEN x.n = 1 THEN 'Listed from outside Kakushin. Open it for the details and the official link.' ELSE 'Hackathons and opportunities from outside Kakushin that match what you follow.' END,
       CASE WHEN x.n = 1 THEN '/events/' || x.slug ELSE '/events' END, ?
     FROM (
       SELECT i.user_id, COUNT(DISTINCT e.id) AS n, MAX(e.title) AS title, MAX(e.slug) AS slug
       FROM external_events e
       JOIN json_each(e.topics) j
       JOIN interests i ON i.topic = j.value
       JOIN users u ON u.id = i.user_id AND u.suspended = 0
       LEFT JOIN notification_settings s ON s.user_id = i.user_id
       WHERE e.id IN (${m2}) AND COALESCE(s.global_events, 1) = 1 AND (e.submitted_by IS NULL OR e.submitted_by != i.user_id)
       GROUP BY i.user_id
     ) x`,
  ).bind(now, ...mine).run();
  return ins.meta.changes ?? 0;
}

/** A note for every platform admin, such as "3 global events are waiting for review". */
export async function tellPlatformAdmins(env: Env, kind: string, title: string, body: string, link: string, now = Date.now()) {
  await env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), u.id, ?, ?, ?, ?, ? FROM users u WHERE u.is_platform_admin = 1 AND u.suspended = 0`,
  ).bind(kind, title, body, link, now).run();
}

export interface SourceRow { id: string; name: string; kind: string; url: string; topics: string; keywords: string; auto_publish: number; enabled: number; last_fetched_at: number | null; last_status: string; last_added: number; created_at: number }

/** Reads one source now and stores what is new. Never throws: the outcome is written on the source for the admin to see. */
export async function fetchSource(env: Env, s: SourceRow, now = Date.now()): Promise<{ ok: boolean; status: string; added: number; published: string[] }> {
  let status = "", added: string[] = [], published: string[] = [], ok = true;
  try {
    const items = await readSource({ kind: s.kind, url: s.url, topics: topicsOf(s.topics), keywords: s.keywords }, env.EVENT_FEED_TEST_HOST);
    const r = await importItems(env, s, items, now);
    added = r.added; published = r.published;
    status = `Read ${items.length} ${items.length === 1 ? "item" : "items"}, ${added.length} new`;
  } catch (e) { ok = false; status = (e instanceof Error ? e.message : String(e)).slice(0, 200); }
  await env.DB.prepare("UPDATE external_sources SET last_fetched_at = ?, last_status = ?, last_added = ? WHERE id = ?").bind(now, status, added.length, s.id).run();
  if (published.length) await announceEvents(env, published, now);
  const waiting = added.length - published.length;
  if (waiting > 0) await tellPlatformAdmins(env, "event.review", `${waiting} global ${waiting === 1 ? "event is" : "events are"} waiting for review`, `New from ${s.name}. Approve the ones worth listing.`, "/platform/events", now);
  return { ok, status, added: added.length, published };
}

/** The hourly job's part: read the few sources that have waited longest (each at most every six hours). */
export async function fetchDueSources(env: Env, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM external_sources WHERE enabled = 1 AND (last_fetched_at IS NULL OR last_fetched_at < ?) ORDER BY COALESCE(last_fetched_at, 0) LIMIT ?",
  ).bind(now - REFETCH_MS, SOURCES_PER_RUN).all<SourceRow>();
  let added = 0;
  for (const s of results) added += (await fetchSource(env, s, now)).added;
  return added;
}

// ---- calendar files ----
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines longer than 75 bytes are folded, as calendar apps expect. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
};

export interface CalEntry { uid: string; title: string; start: number; end?: number | null; description?: string; url?: string; location?: string; remindDayBefore?: boolean }

/** A calendar file (.ics) that the phone's or laptop's calendar app can add. */
export function calendarFile(name: string, entries: CalEntry[], now = Date.now()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kakushin//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`];
  for (const e of entries) {
    const end = e.end && e.end > e.start ? e.end : e.start + 30 * 60000;
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@kakushin`, `DTSTAMP:${icsTime(now)}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(end)}`, `SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.remindDayBefore) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, "TRIGGER:-P1D", "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export const calendarResponse = (file: string, filename: string) => new Response(file, {
  headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="${filename.replace(/[^a-z0-9-]/gi, "-").slice(0, 60)}.ics"`, "Cache-Control": "no-store" },
});
