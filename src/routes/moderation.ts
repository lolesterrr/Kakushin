import { type Context, type Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { TOPICS } from "../lib/topics";
import { audit } from "../lib/audit";
import { pushLater } from "../lib/push";
import { tellOrgAdmins } from "../lib/notify";
import { readSource, sourceUrl } from "../lib/feeds";
import { announceEvents, eventFull, fetchSource, type EventRow, type SourceRow } from "../lib/events";
import { eventBody } from "./events";

/**
 * Platform admin work for global events and reports: the review queue, the sources they are read from, and what to do
 * about something people reported. Added to the platform router, which already checks for a platform admin.
 */
export function addModeration(platform: Hono<AppEnv>) {
  // ---- global events ----
  platform.get("/events", async (c) => {
    const state = z.enum(["pending", "published", "rejected", "removed"]).catch("pending").parse(c.req.query("state"));
    const { results } = await c.env.DB.prepare(
      `SELECT e.*, u.email AS submitter_email, u.name AS submitter_name FROM external_events e LEFT JOIN users u ON u.id = e.submitted_by
       WHERE e.state = ? ORDER BY ${state === "pending" ? "e.created_at" : "COALESCE(e.published_at, e.created_at) DESC"} LIMIT 100`,
    ).bind(state).all<EventRow & { submitter_email: string | null; submitter_name: string | null }>();
    return c.json({ items: results.map((r) => ({ id: r.id, ...eventFull(r), review_note: r.review_note, created_at: r.created_at, submitter: r.submitter_email ? { email: r.submitter_email, name: r.submitter_name } : null })) });
  });

  const one = (c: Context<AppEnv>) => c.env.DB.prepare("SELECT * FROM external_events WHERE id = ?").bind(c.req.param("id")!).first<EventRow>();
  const tellSubmitter = async (c: Context<AppEnv>, e: EventRow, title: string, body: string, link: string) => {
    if (!e.submitted_by) return;
    await c.env.DB.prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (lower(hex(randomblob(12))), ?, 'event.result', ?, ?, ?, ?)")
      .bind(e.submitted_by, title, body, link, Date.now()).run();
  };

  /** Fix what a feed got wrong (dates, topics, wording) before or after publishing. */
  platform.put("/events/:id", async (c) => {
    const parsed = eventBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the event details" }, 400);
    const e = await one(c);
    if (!e) return c.json({ error: "Not found" }, 404);
    const b = parsed.data;
    try {
      await c.env.DB.prepare(
        `UPDATE external_events SET title = ?, url = ?, summary = ?, description = ?, organizer = ?, location = ?, is_online = ?, starts_at = ?, ends_at = ?, deadline_at = ?, topics = ? WHERE id = ?`,
      ).bind(b.title, b.url, b.summary, b.description, b.organizer, b.location, b.is_online ? 1 : 0, b.starts_at, b.ends_at, b.deadline_at, JSON.stringify([...new Set(b.topics)]), e.id).run();
    } catch (err) {
      if (String(err).includes("UNIQUE")) return c.json({ error: "Another listing already uses that link" }, 409);
      throw err;
    }
    await audit(c, "event.edited", "event", e.id, b.title);
    return c.json({ ok: true });
  });

  platform.post("/events/:id/approve", async (c) => {
    const e = await one(c);
    if (!e) return c.json({ error: "Not found" }, 404);
    if (e.state === "published") return c.json({ error: "This event is already listed" }, 409);
    const now = Date.now();
    await c.env.DB.prepare("UPDATE external_events SET state = 'published', review_note = '', published_at = COALESCE(published_at, ?) WHERE id = ?").bind(now, e.id).run();
    await announceEvents(c.env, [e.id], now);
    await tellSubmitter(c, e, `Listed: ${e.title}`, "The event you suggested is now in Global events. Thank you.", `/events/${e.slug}`);
    await audit(c, "event.approved", "event", e.id, e.title);
    pushLater(c);
    return c.json({ ok: true });
  });

  /** Approve many at once, for a source that brought a batch. */
  platform.post("/events/approve", async (c) => {
    const parsed = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(100) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Pick the events to approve" }, 400);
    const now = Date.now(), ids = [...new Set(parsed.data.ids)];
    const marks = ids.map(() => "?").join(",");
    const done = await c.env.DB.prepare(`UPDATE external_events SET state = 'published', review_note = '', published_at = COALESCE(published_at, ?) WHERE state = 'pending' AND id IN (${marks}) RETURNING id, slug, title, submitted_by`)
      .bind(now, ...ids).all<{ id: string; slug: string; title: string; submitted_by: string | null }>();
    await announceEvents(c.env, done.results.map((r) => r.id), now);
    for (const r of done.results) await tellSubmitter(c, r as EventRow, `Listed: ${r.title}`, "The event you suggested is now in Global events. Thank you.", `/events/${r.slug}`);
    await audit(c, "event.approved", "event", "many", `${done.results.length} events`);
    pushLater(c);
    return c.json({ ok: true, approved: done.results.length });
  });

  /** Turn a pending event down, or take a listed one off. A note is optional for feed items and goes to a suggester. */
  platform.post("/events/:id/reject", async (c) => {
    const parsed = z.object({ note: z.string().trim().max(500).default("") }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Check the note" }, 400);
    const e = await one(c);
    if (!e) return c.json({ error: "Not found" }, 404);
    if (e.state === "rejected" || e.state === "removed") return c.json({ error: "This event is already off the list" }, 409);
    const to = e.state === "published" ? "removed" : "rejected";
    // The row stays, so the same page is not brought back by the next read of its source.
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE external_events SET state = ?, review_note = ? WHERE id = ?").bind(to, parsed.data.note, e.id),
      c.env.DB.prepare("UPDATE reports SET state = 'actioned', resolved_by = ?, resolved_at = ? WHERE kind = 'event' AND item_id = ? AND state = 'open'").bind(c.get("user")!.id, Date.now(), e.id),
      c.env.DB.prepare("DELETE FROM saved_items WHERE kind = 'event' AND item_id = ?").bind(e.id),
    ]);
    if (to === "rejected") await tellSubmitter(c, e, `Not listed: ${e.title}`, parsed.data.note || "The event you suggested was not added to Global events.", "/events/suggest");
    await audit(c, to === "removed" ? "event.removed" : "event.rejected", "event", e.id, `${e.title}${parsed.data.note ? `: ${parsed.data.note}` : ""}`);
    pushLater(c);
    return c.json({ ok: true });
  });

  // ---- sources ----
  const sourceBody = z.object({
    name: z.string().trim().min(2, "Give the source a name").max(80),
    kind: z.enum(["rss", "hackclub"]),
    url: z.string().trim().max(500),
    topics: z.array(z.enum(TOPICS)).max(5).default([]),
    keywords: z.string().trim().max(300).default(""),
    auto_publish: z.boolean().default(false),
    enabled: z.boolean().default(true),
  });
  const sourceOut = (s: SourceRow) => ({ ...s, topics: JSON.parse(s.topics) as string[], auto_publish: !!s.auto_publish, enabled: !!s.enabled });

  platform.get("/sources", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM external_events e WHERE e.source_id = s.id AND e.state = 'published') AS listed,
         (SELECT COUNT(*) FROM external_events e WHERE e.source_id = s.id AND e.state = 'pending') AS waiting
       FROM external_sources s ORDER BY s.created_at`,
    ).all<SourceRow & { listed: number; waiting: number }>();
    return c.json({ sources: results.map(sourceOut) });
  });

  /** Reads a source without saving anything, so an admin can see what it would bring before adding it. */
  platform.post("/sources/preview", async (c) => {
    const parsed = sourceBody.pick({ kind: true, url: true, topics: true, keywords: true }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Check the source" }, 400);
    try {
      const items = await readSource(parsed.data, c.env.EVENT_FEED_TEST_HOST);
      return c.json({ count: items.length, items: items.slice(0, 8).map((i) => ({ title: i.title, url: i.url, summary: i.summary, topics: i.topics, deadline_at: i.deadline_at, starts_at: i.starts_at, location: i.location })) });
    } catch (e) { return c.json({ error: e instanceof Error ? e.message : "The source could not be read" }, 400); }
  });

  platform.post("/sources", async (c) => {
    const parsed = sourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the source" }, 400);
    const b = parsed.data, url = sourceUrl(b.url, c.env.EVENT_FEED_TEST_HOST);
    if (!url) return c.json({ error: "The address must be a public https link" }, 400);
    const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM external_sources").first<{ n: number }>();
    if ((n?.n ?? 0) >= 30) return c.json({ error: "There are already 30 sources. Remove one first." }, 409);
    const id = newId();
    try {
      await c.env.DB.prepare("INSERT INTO external_sources (id, name, kind, url, topics, keywords, auto_publish, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, b.name, b.kind, url, JSON.stringify([...new Set(b.topics)]), b.keywords, b.auto_publish ? 1 : 0, b.enabled ? 1 : 0, Date.now()).run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "That source is already on the list" }, 409);
      throw e;
    }
    await audit(c, "source.added", "source", id, `${b.name}: ${url}`);
    return c.json({ ok: true, id }, 201);
  });

  const oneSource = (c: Context<AppEnv>) => c.env.DB.prepare("SELECT * FROM external_sources WHERE id = ?").bind(c.req.param("id")!).first<SourceRow>();

  platform.put("/sources/:id", async (c) => {
    const parsed = sourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the source" }, 400);
    const s = await oneSource(c);
    if (!s) return c.json({ error: "Not found" }, 404);
    const b = parsed.data, url = sourceUrl(b.url, c.env.EVENT_FEED_TEST_HOST);
    if (!url) return c.json({ error: "The address must be a public https link" }, 400);
    try {
      await c.env.DB.prepare("UPDATE external_sources SET name = ?, kind = ?, url = ?, topics = ?, keywords = ?, auto_publish = ?, enabled = ? WHERE id = ?")
        .bind(b.name, b.kind, url, JSON.stringify([...new Set(b.topics)]), b.keywords, b.auto_publish ? 1 : 0, b.enabled ? 1 : 0, s.id).run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "That source is already on the list" }, 409);
      throw e;
    }
    await audit(c, "source.edited", "source", s.id, b.name);
    return c.json({ ok: true });
  });

  /** Removing a source keeps the events it already brought; they just stop being refreshed from it. */
  platform.delete("/sources/:id", async (c) => {
    const s = await oneSource(c);
    if (!s) return c.json({ error: "Not found" }, 404);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE external_events SET source_id = NULL WHERE source_id = ?").bind(s.id),
      c.env.DB.prepare("DELETE FROM external_sources WHERE id = ?").bind(s.id),
    ]);
    await audit(c, "source.removed", "source", s.id, s.name);
    return c.json({ ok: true });
  });

  platform.post("/sources/:id/fetch", async (c) => {
    const s = await oneSource(c);
    if (!s) return c.json({ error: "Not found" }, 404);
    const r = await fetchSource(c.env, s);
    pushLater(c);
    return c.json({ ok: r.ok, status: r.status, added: r.added });
  });

  // ---- reports ----
  /** Open reports, one row per reported thing, with everything people said about it. */
  platform.get("/reports", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.kind, r.item_id, r.reason, r.details, r.created_at, u.email AS reporter,
         COALESCE(ch.title, e.title) AS title, ch.status AS challenge_status, o.slug AS org_slug, o.name AS org_name, ch.slug AS challenge_slug, e.slug AS event_slug, e.url AS event_url
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_user_id
       LEFT JOIN challenges ch ON r.kind = 'challenge' AND ch.id = r.item_id
       LEFT JOIN organizations o ON o.id = ch.org_id
       LEFT JOIN external_events e ON r.kind = 'event' AND e.id = r.item_id
       WHERE r.state = 'open' ORDER BY r.created_at LIMIT 300`,
    ).all<Record<string, unknown>>();
    const groups = new Map<string, { kind: string; item_id: string; title: string; link: string | null; where: string; first_at: number; reports: { reason: string; details: string; reporter: string | null; created_at: number }[] }>();
    for (const r of results) {
      const key = `${r.kind}:${r.item_id}`;
      const g = groups.get(key) ?? {
        kind: String(r.kind), item_id: String(r.item_id), title: String(r.title ?? "(deleted)"),
        link: r.kind === "event" ? (r.event_slug ? `/events/${r.event_slug}` : null) : (r.org_slug && r.challenge_status !== "draft" ? `/o/${r.org_slug}/c/${r.challenge_slug}` : null),
        where: r.kind === "event" ? "Global event" : `Challenge by ${r.org_name ?? "a deleted organisation"}`,
        first_at: Number(r.created_at), reports: [],
      };
      g.reports.push({ reason: String(r.reason), details: String(r.details ?? ""), reporter: (r.reporter as string | null) ?? null, created_at: Number(r.created_at) });
      groups.set(key, g);
    }
    return c.json({ items: [...groups.values()] });
  });

  /**
   * Settles every open report on one thing. "dismiss" leaves it up. "takedown" takes it off the public site: a global
   * event is removed, and a challenge goes back to draft with a note for its organisers, who must pass review again.
   */
  platform.post("/reports/resolve", async (c) => {
    const parsed = z.object({ kind: z.enum(["challenge", "event"]), item_id: z.string().min(1).max(40), action: z.enum(["dismiss", "takedown"]), note: z.string().trim().max(1000).default("") })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Check the request" }, 400);
    const p = parsed.data, me = c.get("user")!, now = Date.now();
    const settle = (state: "dismissed" | "actioned") => c.env.DB.prepare("UPDATE reports SET state = ?, resolved_by = ?, resolved_at = ? WHERE kind = ? AND item_id = ? AND state = 'open'").bind(state, me.id, now, p.kind, p.item_id);
    if (p.action === "dismiss") {
      const r = await settle("dismissed").run();
      if (!r.meta.changes) return c.json({ error: "There are no open reports on that" }, 404);
      await audit(c, "report.dismissed", p.kind, p.item_id);
      return c.json({ ok: true });
    }
    if (p.kind === "event") {
      const e = await c.env.DB.prepare("SELECT id, title FROM external_events WHERE id = ?").bind(p.item_id).first<{ id: string; title: string }>();
      if (!e) return c.json({ error: "Not found" }, 404);
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE external_events SET state = 'removed', review_note = ? WHERE id = ?").bind(p.note, e.id),
        c.env.DB.prepare("DELETE FROM saved_items WHERE kind = 'event' AND item_id = ?").bind(e.id),
        settle("actioned"),
      ]);
      await audit(c, "event.removed", "event", e.id, `${e.title}: reported${p.note ? `: ${p.note}` : ""}`);
      return c.json({ ok: true });
    }
    if (p.note.length < 3) return c.json({ error: "Tell the organiser what to fix" }, 400);
    const ch = await c.env.DB.prepare(
      `SELECT ch.id, ch.slug, ch.title, ch.org_id, o.slug AS oslug, o.name AS oname,
         EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'owner' AND u.is_super_admin = 1) AS owners
       FROM challenges ch JOIN organizations o ON o.id = ch.org_id WHERE ch.id = ?`,
    ).bind(p.item_id).first<{ id: string; slug: string; title: string; org_id: string; oslug: string; oname: string; owners: number }>();
    if (!ch) return c.json({ error: "Not found" }, 404);
    if (ch.owners && !me.is_super_admin) return c.json({ error: "This challenge belongs to the platform owner. Only the owner can take it down." }, 403);
    // approved_at is cleared so it cannot simply be published again: it goes back through review.
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE challenges SET status = 'draft', review_state = 'rejected', review_note = ?, approved_at = NULL WHERE id = ?").bind(p.note, ch.id),
      settle("actioned"),
    ]);
    await audit(c, "challenge.taken_down", "challenge", ch.id, `${ch.oname}: ${ch.title}: ${p.note}`);
    await tellOrgAdmins(c, ch.org_id, `Taken down: ${ch.title}`, `Your challenge was reported and has been taken off the public site. ${p.note}`, `/admin/o/${ch.oslug}/c/${ch.slug}/edit`, `Your challenge was taken down: ${ch.title}`);
    return c.json({ ok: true });
  });
}
