import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { slugify } from "../lib/slug";
import { CHALLENGE_STATUSES, TOPICS, stageMoveError } from "../lib/topics";
import { audit } from "../lib/audit";
import { fileUrl, loadOrg, type OrgRow } from "../lib/access";
import { saveImage } from "../lib/upload";
import { notifyFollowersOfChallenge } from "../lib/notify";
import { pushLater } from "../lib/push";

interface ChallengeRow {
  id: string; org_id: string; slug: string; title: string; summary: string; description: string;
  cover_key: string | null; prizes: string; status: string; team_min: number; team_max: number;
  applications_open_at: number | null; applications_close_at: number | null; pitch_due_at: number | null;
  topics: string; questions: string; results_published: number; created_at: number;
  review_state: string; review_note: string; cover_credit: string | null;
  rules: string; faq: string; sponsors: string; timeline: string; show_judges: number;
}

export interface Faq { q: string; a: string }
export interface Sponsor { name: string; logo_key: string | null; url: string | null }
export interface TimelineItem { label: string; at: number }
const jsonList = <T,>(raw: string | null | undefined): T[] => { try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };

const credit = z.object({ author: z.string().trim().min(1).max(120), license: z.string().trim().min(1).max(40), source: z.string().url().max(400).refine((u) => u.startsWith("https://")), license_url: z.string().url().max(300).refine((u) => u.startsWith("https://")).optional() });
export const parseCredit = (raw: string | null) => { try { return raw ? (credit.parse(JSON.parse(raw)) as z.infer<typeof credit>) : null; } catch { return null; } };

export function challengeOut(r: ChallengeRow, org: Pick<OrgRow, "slug" | "name" | "logo_key">) {
  return {
    id: r.id, slug: r.slug, title: r.title, summary: r.summary, description: r.description,
    cover_url: fileUrl(r.cover_key), cover_credit: parseCredit(r.cover_credit), prizes: r.prizes, status: r.status,
    team_min: r.team_min, team_max: r.team_max,
    applications_open_at: r.applications_open_at, applications_close_at: r.applications_close_at, pitch_due_at: r.pitch_due_at,
    topics: JSON.parse(r.topics) as string[], questions: JSON.parse(r.questions) as unknown[],
    results_published: r.results_published, created_at: r.created_at,
    review_state: r.review_state, review_note: r.review_note,
    rules: r.rules ?? "", faq: jsonList<Faq>(r.faq), timeline: jsonList<TimelineItem>(r.timeline), show_judges: !!r.show_judges,
    sponsors: jsonList<Sponsor>(r.sponsors).map((x) => ({ name: x.name, url: x.url, logo_key: x.logo_key, logo_url: fileUrl(x.logo_key) })),
    org: { slug: org.slug, name: org.name, logo_url: fileUrl(org.logo_key) },
  };
}

const question = z
  .object({
    id: z.string().trim().min(1).max(40).optional(),
    label: z.string().trim().min(1).max(200),
    type: z.enum(["short_text", "long_text", "choice", "url"]),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  })
  .refine((q) => q.type !== "choice" || q.options.length >= 2, { message: "A choice question needs at least two options" });

const ms = z.number().int().min(0).max(4_102_444_800_000).nullable();
const webLink = z.string().trim().max(300).refine((v) => /^https?:\/\/[^\s<>"']+$/i.test(v), { message: "Sponsor links must start with http:// or https://" });
const faqItem = z.object({ q: z.string().trim().min(1, "Every FAQ needs a question").max(200), a: z.string().trim().min(1, "Every FAQ needs an answer").max(2000) });
const sponsorItem = z.object({
  name: z.string().trim().min(1, "Every sponsor needs a name").max(80),
  logo_key: z.string().max(80).nullable().default(null),
  url: z.union([webLink, z.literal("")]).nullable().default(null).transform((v) => v || null),
});
/** Sponsor logos and page images are stored under the challenge's own folder: sponsors/<challenge id>/<random>.png */
const ownUpload = (key: string, folder: "sponsors" | "pages", challengeId: string) => new RegExp(`^${folder}/${challengeId}/[a-f0-9]{16}\\.(png|jpg|webp)$`).test(key);
const timelineItem = z.object({ label: z.string().trim().min(1, "Every timeline step needs a label").max(80), at: z.number().int().min(0).max(4_102_444_800_000) });

const challengeBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    summary: z.string().trim().max(200).default(""),
    description: z.string().trim().max(20000).default(""),
    prizes: z.string().trim().max(5000).default(""),
    status: z.enum(CHALLENGE_STATUSES),
    team_min: z.number().int().min(1).max(20),
    team_max: z.number().int().min(1).max(20),
    applications_open_at: ms.default(null),
    applications_close_at: ms.default(null),
    pitch_due_at: ms.default(null),
    topics: z.array(z.enum(TOPICS)).max(5).default([]),
    questions: z.array(question).max(20).default([]),
    // Left out, these keep what is stored, so an older client cannot wipe them.
    rules: z.string().trim().max(20000).optional(),
    faq: z.array(faqItem).max(30, "Use at most 30 FAQ entries").optional(),
    sponsors: z.array(sponsorItem).max(20, "Use at most 20 sponsors").optional(),
    timeline: z.array(timelineItem).max(20, "Use at most 20 timeline steps").optional(),
    show_judges: z.boolean().optional(),
    reopen: z.boolean().optional(),
  })
  .refine((b) => b.team_min <= b.team_max, { message: "Minimum team size cannot be bigger than the maximum", path: ["team_min"] })
  .refine(
    (b) => b.applications_open_at === null || b.applications_close_at === null || b.applications_open_at < b.applications_close_at,
    { message: "Applications must close after they open", path: ["applications_close_at"] },
  );

/**
 * Leaving draft needs the platform team's approval, unless the organisation is verified or this challenge was approved before.
 * Returns the status to store, whether it was sent for review instead, or an error.
 */
async function publishGate(c: Context<AppEnv>, org: OrgRow, cslug: string, want: string): Promise<{ status: string; pending: boolean } | { error: string; code: 403 | 404 }> {
  const cur = await c.env.DB.prepare("SELECT status, review_state, approved_at FROM challenges WHERE org_id = ? AND slug = ?").bind(org.id, cslug).first<{ status: string; review_state: string; approved_at: number | null }>();
  if (!cur) return { error: "Not found", code: 404 };
  if (want === "draft" || cur.status !== "draft") return { status: want, pending: false }; // saving a draft, or already live
  if (org.suspended) return { error: "Your organisation is suspended, so it cannot publish challenges.", code: 403 };
  if (org.verified || cur.approved_at) return { status: want, pending: false };
  return { status: "draft", pending: true };
}

/** Records that a draft is waiting for review and tells the platform admins. */
async function submitForReview(c: Context<AppEnv>, org: OrgRow, cslug: string) {
  const now = Date.now();
  const row = await c.env.DB.prepare("SELECT id, title, review_state FROM challenges WHERE org_id = ? AND slug = ?").bind(org.id, cslug).first<{ id: string; title: string; review_state: string }>();
  if (!row || row.review_state === "pending") return;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE challenges SET review_state = 'pending', review_note = '', submitted_at = ? WHERE id = ?").bind(now, row.id),
    c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
       SELECT lower(hex(randomblob(12))), u.id, 'review.requested', ?, ?, '/platform/review', ? FROM users u WHERE u.is_platform_admin = 1 AND u.suspended = 0`,
    ).bind(`Event waiting for review: ${row.title}`, `${org.name} wants to publish a challenge.`, now),
  ]);
  pushLater(c);
}

/** The first time a challenge leaves draft, tell the organisation's followers and people with a matching topic. */
async function announceOnce(c: Context<AppEnv>, org: { id: string; slug: string; name: string }, cslug: string) {
  const claim = await c.env.DB.prepare("UPDATE challenges SET announced = 1 WHERE org_id = ? AND slug = ? AND announced = 0 AND status != 'draft'").bind(org.id, cslug).run();
  if (!claim.meta.changes) return;
  const ch = await c.env.DB.prepare("SELECT id, slug, title, topics FROM challenges WHERE org_id = ? AND slug = ?").bind(org.id, cslug).first<{ id: string; slug: string; title: string; topics: string }>();
  if (ch) { await notifyFollowersOfChallenge(c, { ...ch, topics: JSON.parse(ch.topics) as string[] }, org).catch((e) => console.error(`follower notification failed: ${e instanceof Error ? e.message : e}`)); pushLater(c); }
}

/** Routes mounted under /api/orgs/:slug/challenges (organiser side, plus public reads of one challenge). */
export const orgChallenges = new Hono<AppEnv>();

orgChallenges.post("/:slug/challenges", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);

  const parsed = z.object({ title: z.string().trim().min(3).max(120) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Give the challenge a title (at least 3 characters)" }, 400);

  const base = slugify(parsed.data.title) || "challenge";
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const clash = await c.env.DB.prepare("SELECT 1 AS x FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, slug).first();
    if (!clash) break;
    slug = `${base.slice(0, 34)}-${crypto.randomUUID().slice(0, 4)}`;
  }
  await c.env.DB.prepare("INSERT INTO challenges (id, org_id, slug, title, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId(), access.org.id, slug, parsed.data.title, Date.now()).run();
  return c.json({ ok: true, slug }, 201);
});

orgChallenges.get("/:slug/challenges/:cslug", async (c) => {
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")).first<ChallengeRow>();
  // Drafts are only visible to the organisation's own admins.
  if (!row || (row.status === "draft" && !access.role)) return c.json({ error: "Not found" }, 404);
  // The rubric is public so people know how they will be scored before they apply. Weights go out as percentages.
  const { results: rubric } = await c.env.DB.prepare("SELECT name, description, weight, max_score FROM criteria WHERE challenge_id = ? AND stage = 'pitch' ORDER BY position, rowid")
    .bind(row.id).all<{ name: string; description: string; weight: number; max_score: number }>();
  const criteria = rubric.map((r) => ({ name: r.name, description: r.description, weight: Math.round(r.weight * 10000) / 100, max_score: r.max_score }));
  // Judges are listed only when the organiser chose to, and only those who gave a name to show. Never their email.
  const judges = row.show_judges
    ? (await c.env.DB.prepare("SELECT display_name, title FROM judges WHERE challenge_id = ? AND display_name IS NOT NULL AND display_name != '' ORDER BY invited_at")
      .bind(row.id).all<{ display_name: string; title: string | null }>()).results.map((j) => ({ name: j.display_name, title: j.title ?? "" }))
    : [];
  return c.json({ challenge: { ...challengeOut(row, access.org), criteria, judges }, role: access.role });
});

orgChallenges.put("/:slug/challenges/:cslug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);

  const parsed = challengeBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the challenge fields" }, 400);
  const b = parsed.data;
  if (b.status !== "draft" && (!b.summary || !b.description)) {
    return c.json({ error: "Add a summary and a description before publishing" }, 400);
  }
  const now = await c.env.DB.prepare("SELECT id, status, rules, faq, sponsors, timeline, show_judges FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")).first<{ id: string; status: string; rules: string; faq: string; sponsors: string; timeline: string; show_judges: number }>();
  if (!now) return c.json({ error: "Not found" }, 404);
  const back = stageMoveError(now.status, b.status, b.reopen);
  if (back) return c.json({ error: back, reopen_needed: true }, 409);
  if (b.reopen && now.status !== b.status) await audit(c, "challenge.reopened", "challenge", c.req.param("cslug"), `${now.status} to ${b.status}`);
  const gate = await publishGate(c, access.org, c.req.param("cslug"), b.status);
  if ("error" in gate) return c.json({ error: gate.error }, gate.code);
  const questions = b.questions.map((q) => ({
    id: q.id ?? newId().slice(-8),
    label: q.label, type: q.type, required: q.required,
    options: q.type === "choice" ? q.options : [],
  }));

  const oldSponsors = jsonList<Sponsor>(now.sponsors);
  const sponsors = b.sponsors ?? oldSponsors;
  // A logo must be one uploaded for this challenge, so removing a sponsor can never delete another challenge's file.
  if (sponsors.some((x) => x.logo_key && !ownUpload(x.logo_key, "sponsors", now.id))) return c.json({ error: "Upload the sponsor logo again" }, 400);
  const timeline = b.timeline ? [...b.timeline].sort((x, y) => x.at - y.at) : jsonList<TimelineItem>(now.timeline);

  const res = await c.env.DB.prepare(
    `UPDATE challenges SET title=?, summary=?, description=?, prizes=?, status=?, team_min=?, team_max=?,
       applications_open_at=?, applications_close_at=?, pitch_due_at=?, topics=?, questions=?,
       rules=?, faq=?, sponsors=?, timeline=?, show_judges=?
     WHERE org_id = ? AND slug = ?`,
  ).bind(
    b.title, b.summary, b.description, b.prizes, gate.status, b.team_min, b.team_max,
    b.applications_open_at, b.applications_close_at, b.pitch_due_at,
    JSON.stringify([...new Set(b.topics)]), JSON.stringify(questions),
    b.rules ?? now.rules, JSON.stringify(b.faq ?? jsonList<Faq>(now.faq)), JSON.stringify(sponsors), JSON.stringify(timeline),
    b.show_judges === undefined ? now.show_judges : b.show_judges ? 1 : 0,
    access.org.id, c.req.param("cslug"),
  ).run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
  // Logos of sponsors that were taken off the page go too.
  const kept = new Set(sponsors.map((x) => x.logo_key));
  const gone = oldSponsors.map((x) => x.logo_key).filter((k): k is string => !!k && !kept.has(k));
  if (gone.length) c.executionCtx.waitUntil(c.env.FILES.delete(gone).catch(() => {}));
  if (gate.pending) await submitForReview(c, access.org, c.req.param("cslug"));
  else await announceOnce(c, access.org, c.req.param("cslug"));
  return c.json({ ok: true, pending: gate.pending });
});

/** Moves a challenge to another stage without touching its other fields. */
orgChallenges.put("/:slug/challenges/:cslug/status", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const parsed = z.object({ status: z.enum(CHALLENGE_STATUSES), reopen: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a stage" }, 400);
  const row = await c.env.DB.prepare("SELECT summary, description, status FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")).first<{ summary: string; description: string; status: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  const back = stageMoveError(row.status, parsed.data.status, parsed.data.reopen);
  if (back) return c.json({ error: back, reopen_needed: true }, 409);
  if (parsed.data.reopen && row.status !== parsed.data.status) await audit(c, "challenge.reopened", "challenge", c.req.param("cslug"), `${row.status} to ${parsed.data.status}`);
  if (parsed.data.status !== "draft" && (!row.summary || !row.description)) return c.json({ error: "Add a summary and a description before publishing" }, 400);
  const gate = await publishGate(c, access.org, c.req.param("cslug"), parsed.data.status);
  if ("error" in gate) return c.json({ error: gate.error }, gate.code);
  await c.env.DB.prepare("UPDATE challenges SET status = ? WHERE org_id = ? AND slug = ?").bind(gate.status, access.org.id, c.req.param("cslug")).run();
  if (gate.pending) await submitForReview(c, access.org, c.req.param("cslug"));
  else await announceOnce(c, access.org, c.req.param("cslug"));
  return c.json({ ok: true, pending: gate.pending });
});

orgChallenges.put("/:slug/challenges/:cslug/cover", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const row = await c.env.DB.prepare("SELECT cover_key FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")).first<{ cover_key: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);

  const saved = await saveImage(c, "covers", 4 * 1024 * 1024);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  // Optional credit for openly licensed photos, sent as JSON in X-Cover-Credit.
  let creditJson: string | null = null;
  const rawCredit = c.req.header("X-Cover-Credit");
  if (rawCredit) {
    const parsedCredit = credit.safeParse((() => { try { return JSON.parse(rawCredit); } catch { return null; } })());
    if (!parsedCredit.success) { await c.env.FILES.delete(saved.key); return c.json({ error: "The photo credit needs an author, a licence and an https source link" }, 400); }
    creditJson = JSON.stringify(parsedCredit.data);
  }
  await c.env.DB.prepare("UPDATE challenges SET cover_key = ?, cover_credit = ? WHERE org_id = ? AND slug = ?")
    .bind(saved.key, creditJson, access.org.id, c.req.param("cslug")).run();
  if (row.cover_key) await c.env.FILES.delete(row.cover_key);
  return c.json({ ok: true, cover_url: fileUrl(saved.key) });
});

/** Uploads for one challenge's page: a sponsor logo, or an image for the Markdown text. Returns the key and its URL. */
async function adminChallenge(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const row = await c.env.DB.prepare("SELECT * FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")!).first<ChallengeRow>();
  if (!row) return { err: c.json({ error: "Not found" }, 404) };
  return { access, row };
}

orgChallenges.put("/:slug/challenges/:cslug/sponsor-logo", async (c) => {
  const x = await adminChallenge(c); if ("err" in x) return x.err;
  const saved = await saveImage(c, `sponsors/${x.row.id}`, 1024 * 1024);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  return c.json({ ok: true, logo_key: saved.key, logo_url: fileUrl(saved.key) });
});

orgChallenges.put("/:slug/challenges/:cslug/images", async (c) => {
  const x = await adminChallenge(c); if ("err" in x) return x.err;
  const saved = await saveImage(c, `pages/${x.row.id}`, 3 * 1024 * 1024);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  return c.json({ ok: true, url: fileUrl(saved.key) });
});

/**
 * Copies a challenge into a new draft: text, questions, both rubrics, sponsors and FAQ. Dates, the banner, the timeline,
 * teams and judges are left behind. Sponsor logos are copied too, so each challenge owns its files.
 */
orgChallenges.post("/:slug/challenges/:cslug/duplicate", async (c) => {
  const x = await adminChallenge(c); if ("err" in x) return x.err;
  const { access, row } = x;
  const id = newId();
  const title = `Copy of ${row.title}`.slice(0, 120);
  const base = slugify(title) || "challenge";
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const clash = await c.env.DB.prepare("SELECT 1 AS x FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, slug).first();
    if (!clash) break;
    slug = `${base.slice(0, 34)}-${crypto.randomUUID().slice(0, 4)}`;
  }
  const sponsors: Sponsor[] = [];
  for (const sp of jsonList<Sponsor>(row.sponsors)) {
    let logo_key: string | null = null;
    if (sp.logo_key) {
      const obj = await c.env.FILES.get(sp.logo_key);
      if (obj) {
        logo_key = sp.logo_key.replace(`sponsors/${row.id}/`, `sponsors/${id}/`);
        await c.env.FILES.put(logo_key, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
      }
    }
    sponsors.push({ name: sp.name, url: sp.url, logo_key });
  }
  // Questions keep their ids, so an organiser who reuses a challenge every year gets the same answer columns.
  const db = c.env.DB;
  await db.batch([
    db.prepare(
      `INSERT INTO challenges (id, org_id, slug, title, summary, description, prizes, status, team_min, team_max, topics, questions,
         rules, faq, sponsors, timeline, show_judges, blind_judging, judges_per_team, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, '[]', ?, (SELECT blind_judging FROM challenges WHERE id = ?), (SELECT judges_per_team FROM challenges WHERE id = ?), ?)`,
    ).bind(id, access.org.id, slug, title, row.summary, row.description, row.prizes, row.team_min, row.team_max, row.topics, row.questions,
      row.rules ?? "", row.faq ?? "[]", JSON.stringify(sponsors), row.show_judges ? 1 : 0, row.id, row.id, Date.now()),
    db.prepare(
      `INSERT INTO criteria (id, challenge_id, name, description, weight, max_score, position, stage)
       SELECT lower(hex(randomblob(11))), ?, name, description, weight, max_score, position, stage FROM criteria WHERE challenge_id = ?`,
    ).bind(id, row.id),
  ]);
  await audit(c, "challenge.duplicated", "challenge", slug, `from ${row.slug}`);
  return c.json({ ok: true, slug }, 201);
});

orgChallenges.delete("/:slug/challenges/:cslug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const row = await c.env.DB.prepare("SELECT id, status, cover_key FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")).first<{ id: string; status: string; cover_key: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "draft") return c.json({ error: "Only drafts can be deleted" }, 409);
  // A duplicated draft brings its rubric with it, so the criteria go first in case foreign keys are not enforced.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM criteria WHERE challenge_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(row.id),
  ]);
  if (row.cover_key) await c.env.FILES.delete(row.cover_key);
  // Sponsor logos and page images live under the challenge's own folders.
  c.executionCtx.waitUntil((async () => {
    for (const folder of ["sponsors", "pages"]) {
      const list = await c.env.FILES.list({ prefix: `${folder}/${row.id}/` });
      if (list.objects.length) await c.env.FILES.delete(list.objects.map((o) => o.key));
    }
  })().catch(() => {}));
  return c.json({ ok: true });
});

const firstLine = (t: string) => (t.split("\n").map((l) => l.trim()).find(Boolean) ?? "").slice(0, 80);

/** Public Explore feed: open challenges, soonest deadline first. */
export const explore = new Hono<AppEnv>();

const cardOut = (r: Record<string, unknown>) => ({
  slug: r.slug, title: r.title, summary: r.summary, cover_url: fileUrl(r.cover_key as string | null),
  topics: JSON.parse(String(r.topics)), team_min: r.team_min, team_max: r.team_max, status: r.status,
  prize: firstLine(String(r.prizes ?? "")),
  applications_close_at: r.applications_close_at,
  org: { slug: r.org_slug, name: r.org_name, logo_url: fileUrl(r.logo_key as string | null) },
});

/** Paging is by position in the list. Cursors are opaque to clients: "o" plus the offset. */
const readCursor = (raw: string | undefined) => { const m = /^o(\d{1,5})$/.exec(raw ?? ""); return m ? Number(m[1]) : 0; };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Public Explore feed: open challenges. Filters: topic, q (title, summary or organisation), size (a team of that many
 * fits), sort (closing, the default, or newest). Pages of `limit` (default 24, at most 60), with `next` for the rest.
 */
explore.get("/", async (c) => {
  const topic = c.req.query("topic");
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const size = Number(c.req.query("size") ?? "");
  const sort = c.req.query("sort") === "newest" ? "newest" : "closing";
  const limit = Math.min(60, Math.max(1, Number(c.req.query("limit")) || 24));
  const offset = readCursor(c.req.query("cursor"));
  const where = ["c.status = 'open'", "o.suspended = 0", "(c.applications_close_at IS NULL OR c.applications_close_at > ?)"];
  // Past the deadline means closed, even in the hour before the cron job moves it to reviewing.
  const args: unknown[] = [Date.now()];
  if (topic && (TOPICS as readonly string[]).includes(topic)) { where.push("c.topics LIKE ?"); args.push(`%"${topic}"%`); }
  if (q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    for (const w of words) {
      where.push("(lower(c.title) LIKE ? ESCAPE '\\' OR lower(c.summary) LIKE ? ESCAPE '\\' OR lower(o.name) LIKE ? ESCAPE '\\')");
      const pat = `%${likeEscape(w)}%`;
      args.push(pat, pat, pat);
    }
  }
  if (Number.isInteger(size) && size >= 1 && size <= 20) { where.push("c.team_min <= ? AND c.team_max >= ?"); args.push(size, size); }
  const order = sort === "newest"
    ? "c.created_at DESC, c.id"
    : "(c.applications_close_at IS NULL), c.applications_close_at ASC, c.created_at DESC, c.id";
  const sql = `SELECT c.slug, c.title, c.summary, c.cover_key, c.topics, c.team_min, c.team_max, c.prizes, c.status,
        c.applications_close_at, o.slug AS org_slug, o.name AS org_name, o.logo_key
      FROM challenges c JOIN organizations o ON o.id = c.org_id
      WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const { results } = await c.env.DB.prepare(sql).bind(...args, limit + 1, offset).all<Record<string, unknown>>();
  const more = results.length > limit;
  return c.json({ challenges: results.slice(0, limit).map(cardOut), next: more ? `o${offset + limit}` : null });
});

/** Past winners: completed challenges with published results, newest first, with their top placements. */
explore.get("/winners", async (c) => {
  const limit = Math.min(30, Math.max(1, Number(c.req.query("limit")) || 12));
  const offset = readCursor(c.req.query("cursor"));
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.title, c.summary, c.cover_key, c.topics, c.team_min, c.team_max, c.prizes, c.status, c.applications_close_at,
       c.results_published_at, o.slug AS org_slug, o.name AS org_name, o.logo_key,
       (SELECT json_group_array(json_object('placement', w.placement, 'team', w.name)) FROM
          (SELECT t.placement, t.name FROM teams t WHERE t.challenge_id = c.id AND t.status = 'winner' ORDER BY t.placement LIMIT 3) w) AS winners
     FROM challenges c JOIN organizations o ON o.id = c.org_id
     WHERE c.status = 'completed' AND c.results_published = 1 AND o.suspended = 0
     ORDER BY COALESCE(c.results_published_at, c.created_at) DESC, c.id LIMIT ? OFFSET ?`,
  ).bind(limit + 1, offset).all<Record<string, unknown>>();
  const more = results.length > limit;
  return c.json({
    challenges: results.slice(0, limit).map((r) => ({ ...cardOut(r), results_published_at: r.results_published_at, winners: JSON.parse(String(r.winners ?? "[]")) })),
    next: more ? `o${offset + limit}` : null,
  });
});

/** Photo credits for every public cover, linked from the site footer. */
explore.get("/credits", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.slug, c.title, c.cover_credit, o.slug AS org_slug, o.name AS org_name
     FROM challenges c JOIN organizations o ON o.id = c.org_id
     WHERE c.cover_credit IS NOT NULL AND c.cover_key IS NOT NULL AND c.status != 'draft' AND o.suspended = 0 ORDER BY o.name, c.title`,
  ).all<{ slug: string; title: string; cover_credit: string; org_slug: string; org_name: string }>();
  return c.json({ credits: results.flatMap((r) => { const cr = parseCredit(r.cover_credit); return cr ? [{ title: r.title, slug: r.slug, org: r.org_name, org_slug: r.org_slug, ...cr }] : []; }) });
});

explore.get("/topics", (c) => c.json({ topics: TOPICS }));
