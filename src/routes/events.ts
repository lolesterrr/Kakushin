import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { TOPICS } from "../lib/topics";
import { fileUrl } from "../lib/access";
import { pushLater } from "../lib/push";
import { webUrl } from "../lib/feeds";
import { announceEvents, calendarFile, calendarResponse, eventCard, eventFull, eventSlug, liveSql, tellPlatformAdmins, type EventRow } from "../lib/events";

/** Global events: hackathons and opportunities from outside Kakushin. Mounted at /api/events. Reading is public. */
export const events = new Hono<AppEnv>();

const readCursor = (raw: string | undefined) => { const m = /^o(\d{1,5})$/.exec(raw ?? ""); return m ? Number(m[1]) : 0; };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
const SUGGESTIONS_PER_DAY = 5;

/** Published events that are not over, soonest date first. Filters: topic, q, online=1. Pages like the challenges feed. */
events.get("/", async (c) => {
  const topic = c.req.query("topic");
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const sort = c.req.query("sort") === "newest" ? "newest" : "soonest";
  const limit = Math.min(60, Math.max(1, Number(c.req.query("limit")) || 24));
  const offset = readCursor(c.req.query("cursor"));
  const where = [liveSql("e")];
  const args: unknown[] = [Date.now()];
  if (topic && (TOPICS as readonly string[]).includes(topic)) { where.push("e.topics LIKE ?"); args.push(`%"${topic}"%`); }
  if (c.req.query("online") === "1") where.push("e.is_online = 1");
  for (const w of q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
    where.push("(lower(e.title) LIKE ? ESCAPE '\\' OR lower(e.summary) LIKE ? ESCAPE '\\' OR lower(e.organizer) LIKE ? ESCAPE '\\' OR lower(e.location) LIKE ? ESCAPE '\\')");
    const pat = `%${likeEscape(w)}%`;
    args.push(pat, pat, pat, pat);
  }
  const order = sort === "newest"
    ? "e.published_at DESC, e.id"
    : "(COALESCE(e.deadline_at, e.starts_at) IS NULL), COALESCE(e.deadline_at, e.starts_at) ASC, e.published_at DESC, e.id";
  const { results } = await c.env.DB.prepare(`SELECT e.* FROM external_events e WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset).all<EventRow>();
  return c.json({ events: results.slice(0, limit).map(eventCard), next: results.length > limit ? `o${offset + limit}` : null });
});

const optionalMs = z.number().int().min(0).max(4_102_444_800_000).nullable().default(null);
const link = z.string().trim().max(500).transform((v, ctx) => {
  const u = webUrl(v);
  if (!u) { ctx.addIssue({ code: "custom", message: "The link must start with https:// or http://" }); return z.NEVER; }
  return u;
});
export const eventBody = z.object({
  title: z.string().trim().min(3, "Give the event a name (at least 3 characters)").max(160),
  url: link,
  summary: z.string().trim().max(200).default(""),
  description: z.string().trim().max(4000).default(""),
  organizer: z.string().trim().max(80).default(""),
  location: z.string().trim().max(120).default(""),
  is_online: z.boolean().default(false),
  starts_at: optionalMs, ends_at: optionalMs, deadline_at: optionalMs,
  topics: z.array(z.enum(TOPICS)).max(5).default([]),
}).refine((b) => !b.starts_at || !b.ends_at || b.ends_at >= b.starts_at, { message: "The event must end after it starts" });

/** Someone suggests an event. It waits for a platform admin, except when a platform admin adds it themselves. */
events.post("/suggest", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to suggest an event" }, 401);
  const parsed = eventBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the event details" }, 400);
  const b = parsed.data, now = Date.now();
  if ((b.deadline_at ?? b.ends_at ?? b.starts_at ?? now + 1) <= now) return c.json({ error: "That event is already over" }, 400);
  if (!user.is_platform_admin) {
    const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM external_events WHERE submitted_by = ? AND created_at > ?").bind(user.id, now - 86400000).first<{ n: number }>();
    if ((recent?.n ?? 0) >= SUGGESTIONS_PER_DAY) return c.json({ error: `You can suggest up to ${SUGGESTIONS_PER_DAY} events a day. Try again tomorrow.` }, 429);
  }
  const dupe = await c.env.DB.prepare("SELECT slug, state FROM external_events WHERE url = ?").bind(b.url).first<{ slug: string; state: string }>();
  if (dupe) return c.json({ error: dupe.state === "published" ? "That event is already listed" : "That event has already been suggested", slug: dupe.state === "published" ? dupe.slug : undefined }, 409);
  const id = newId(), slug = eventSlug(b.title), live = !!user.is_platform_admin;
  try {
    await c.env.DB.prepare(
      `INSERT INTO external_events (id, slug, submitted_by, title, summary, description, url, organizer, location, is_online, starts_at, ends_at, deadline_at, topics, state, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, slug, user.id, b.title, b.summary, b.description, b.url, b.organizer, b.location, b.is_online ? 1 : 0, b.starts_at, b.ends_at, b.deadline_at,
      JSON.stringify([...new Set(b.topics)]), live ? "published" : "pending", live ? now : null, now).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "That event has already been suggested" }, 409);
    throw e;
  }
  if (live) await announceEvents(c.env, [id], now);
  else await tellPlatformAdmins(c.env, "event.review", `Global event suggested: ${b.title}`, `${user.name || "Someone"} suggested an event from outside Kakushin.`, "/platform/events", now);
  pushLater(c);
  return c.json({ ok: true, slug, pending: !live }, 201);
});

/** What the signed-in person has suggested, with where each one stands. */
events.get("/mine", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ events: [] });
  const { results } = await c.env.DB.prepare("SELECT * FROM external_events WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 30").bind(user.id).all<EventRow>();
  return c.json({ events: results.map((r) => ({ ...eventCard(r), state: r.state, review_note: r.review_note })) });
});

/** One event. Only published ones are public; the person who suggested it and platform admins see it in any state. */
async function loadEvent(c: Context<AppEnv>): Promise<EventRow | null> {
  const row = await c.env.DB.prepare("SELECT * FROM external_events WHERE slug = ?").bind(c.req.param("slug")!).first<EventRow>();
  if (!row) return null;
  const user = c.get("user");
  if (row.state !== "published" && !(user && (user.is_platform_admin || user.id === row.submitted_by))) return null;
  return row;
}

events.get("/:slug", async (c) => {
  const row = await loadEvent(c);
  if (!row) return c.json({ error: "Not found" }, 404);
  const user = c.get("user");
  const saved = user ? !!(await c.env.DB.prepare("SELECT 1 AS x FROM saved_items WHERE user_id = ? AND kind = 'event' AND item_id = ?").bind(user.id, row.id).first()) : false;
  const end = row.deadline_at ?? row.ends_at ?? row.starts_at;
  return c.json({ event: { ...eventFull(row), over: end !== null && end <= Date.now() }, saved });
});

events.get("/:slug/calendar.ics", async (c) => {
  const row = await loadEvent(c);
  if (!row || row.state !== "published") return c.json({ error: "Not found" }, 404);
  const page = `${c.env.APP_URL.replace(/\/$/, "")}/events/${row.slug}`;
  const note = `${row.summary ? `${row.summary}\n\n` : ""}Official page: ${row.url}\nOn Kakushin: ${page}`;
  const entries = [];
  if (row.deadline_at) entries.push({ uid: `${row.id}-deadline`, title: `Deadline: ${row.title}`, start: row.deadline_at - 30 * 60000, end: row.deadline_at, description: note, url: row.url, remindDayBefore: true });
  if (row.starts_at) entries.push({ uid: `${row.id}-event`, title: row.title, start: row.starts_at, end: row.ends_at, description: note, url: row.url, location: row.location, remindDayBefore: true });
  if (!entries.length) return c.json({ error: "This event has no dates to add" }, 404);
  return calendarResponse(calendarFile(row.title, entries), row.slug);
});

// ---- saved ----
/** Bookmarks for challenges and global events. Mounted at /api/saved. */
export const saved = new Hono<AppEnv>();
const MAX_SAVED = 200;

saved.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ challenges: [], events: [] });
  const ch = await c.env.DB.prepare(
    `SELECT c.slug, c.title, c.summary, c.cover_key, c.topics, c.team_min, c.team_max, c.status, c.applications_close_at, c.results_published,
       o.slug AS org_slug, o.name AS org_name, o.logo_key
     FROM saved_items s JOIN challenges c ON c.id = s.item_id JOIN organizations o ON o.id = c.org_id
     WHERE s.user_id = ? AND s.kind = 'challenge' AND c.status != 'draft' AND o.suspended = 0 ORDER BY s.created_at DESC`,
  ).bind(user.id).all<Record<string, unknown>>();
  const ev = await c.env.DB.prepare(
    "SELECT e.* FROM saved_items s JOIN external_events e ON e.id = s.item_id WHERE s.user_id = ? AND s.kind = 'event' AND e.state = 'published' ORDER BY s.created_at DESC",
  ).bind(user.id).all<EventRow>();
  const now = Date.now();
  return c.json({
    challenges: ch.results.map((r) => ({
      slug: r.slug, title: r.title, summary: r.summary, cover_url: fileUrl(r.cover_key as string | null), topics: JSON.parse(String(r.topics)) as string[],
      team_min: r.team_min, team_max: r.team_max, status: r.status, applications_close_at: r.applications_close_at, results_published: r.results_published,
      org: { slug: r.org_slug, name: r.org_name, logo_url: fileUrl(r.logo_key as string | null) },
    })),
    events: ev.results.map((r) => { const end = r.deadline_at ?? r.ends_at ?? r.starts_at; return { ...eventCard(r), over: end !== null && end <= now }; }),
  });
});

async function target(c: Context<AppEnv>, kind: "challenge" | "event"): Promise<string | null> {
  if (kind === "event") {
    const e = await c.env.DB.prepare("SELECT id FROM external_events WHERE slug = ? AND state = 'published'").bind(c.req.param("slug")!).first<{ id: string }>();
    return e?.id ?? null;
  }
  const ch = await c.env.DB.prepare(
    "SELECT c.id FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug = ? AND c.slug = ? AND c.status != 'draft' AND o.suspended = 0",
  ).bind(c.req.param("org")!, c.req.param("slug")!).first<{ id: string }>();
  return ch?.id ?? null;
}

for (const [path, kind] of [["/challenges/:org/:slug", "challenge"], ["/events/:slug", "event"]] as const) {
  saved.put(path, async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Sign in to save this" }, 401);
    const id = await target(c, kind);
    if (!id) return c.json({ error: "Not found" }, 404);
    const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM saved_items WHERE user_id = ?").bind(user.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_SAVED) return c.json({ error: `You can save up to ${MAX_SAVED} things. Remove some first.` }, 409);
    await c.env.DB.prepare("INSERT OR IGNORE INTO saved_items (user_id, kind, item_id, created_at) VALUES (?, ?, ?, ?)").bind(user.id, kind, id, Date.now()).run();
    return c.json({ ok: true, saved: true });
  });
  saved.delete(path, async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Not signed in" }, 401);
    const id = await target(c, kind);
    if (!id) return c.json({ error: "Not found" }, 404);
    await c.env.DB.prepare("DELETE FROM saved_items WHERE user_id = ? AND kind = ? AND item_id = ?").bind(user.id, kind, id).run();
    return c.json({ ok: true, saved: false });
  });
}

// ---- reports ----
/** "Something is wrong with this event". Mounted at /api/reports. Platform admins read them in the console. */
export const reports = new Hono<AppEnv>();
export const REPORT_REASONS = ["spam", "scam", "offensive", "wrong", "other"] as const;
const REPORTS_PER_DAY = 10;

reports.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Sign in to report this" }, 401);
  const parsed = z.object({
    kind: z.enum(["challenge", "event"]), org: z.string().max(60).optional(), slug: z.string().min(1).max(80),
    reason: z.enum(REPORT_REASONS), details: z.string().trim().max(500).default(""),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick what is wrong with it" }, 400);
  const p = parsed.data, now = Date.now();
  const item = p.kind === "event"
    ? await c.env.DB.prepare("SELECT id, title FROM external_events WHERE slug = ? AND state = 'published'").bind(p.slug).first<{ id: string; title: string }>()
    : await c.env.DB.prepare("SELECT c.id, c.title FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug = ? AND c.slug = ? AND c.status != 'draft' AND o.suspended = 0").bind(p.org ?? "", p.slug).first<{ id: string; title: string }>();
  if (!item) return c.json({ error: "Not found" }, 404);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter_user_id = ? AND created_at > ?").bind(user.id, now - 86400000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= REPORTS_PER_DAY) return c.json({ error: "You have sent a lot of reports today. Try again tomorrow." }, 429);
  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE kind = ? AND item_id = ? AND state = 'open'").bind(p.kind, item.id).first<{ n: number }>();
  const ins = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO reports (id, kind, item_id, reporter_user_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(newId(), p.kind, item.id, user.id, p.reason, p.details, now).run();
  // The first open report on something tells the admins; later ones only add to the count they see.
  if (ins.meta.changes && (open?.n ?? 0) === 0) {
    await tellPlatformAdmins(c.env, "report.new", `Reported: ${item.title}`, `Someone reported this ${p.kind === "event" ? "global event" : "challenge"} as ${p.reason === "wrong" ? "having wrong details" : p.reason}.`, "/platform/reports", now);
    pushLater(c);
  }
  return c.json({ ok: true, already: !ins.meta.changes });
});
