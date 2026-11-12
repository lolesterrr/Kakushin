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
}

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
  const { results: rubric } = await c.env.DB.prepare("SELECT name, description, weight, max_score FROM criteria WHERE challenge_id = ? ORDER BY position, rowid")
    .bind(row.id).all<{ name: string; description: string; weight: number; max_score: number }>();
  const criteria = rubric.map((r) => ({ name: r.name, description: r.description, weight: Math.round(r.weight * 10000) / 100, max_score: r.max_score }));
  return c.json({ challenge: { ...challengeOut(row, access.org), criteria }, role: access.role });
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
  const now = await c.env.DB.prepare("SELECT status FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")).first<{ status: string }>();
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

  const res = await c.env.DB.prepare(
    `UPDATE challenges SET title=?, summary=?, description=?, prizes=?, status=?, team_min=?, team_max=?,
       applications_open_at=?, applications_close_at=?, pitch_due_at=?, topics=?, questions=?
     WHERE org_id = ? AND slug = ?`,
  ).bind(
    b.title, b.summary, b.description, b.prizes, gate.status, b.team_min, b.team_max,
    b.applications_open_at, b.applications_close_at, b.pitch_due_at,
    JSON.stringify([...new Set(b.topics)]), JSON.stringify(questions),
    access.org.id, c.req.param("cslug"),
  ).run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
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

orgChallenges.delete("/:slug/challenges/:cslug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const row = await c.env.DB.prepare("SELECT status, cover_key FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")).first<{ status: string; cover_key: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "draft") return c.json({ error: "Only drafts can be deleted" }, 409);
  await c.env.DB.prepare("DELETE FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")).run();
  if (row.cover_key) await c.env.FILES.delete(row.cover_key);
  return c.json({ ok: true });
});

const firstLine = (t: string) => (t.split("\n").map((l) => l.trim()).find(Boolean) ?? "").slice(0, 80);

/** Public Explore feed: open challenges, soonest deadline first. */
export const explore = new Hono<AppEnv>();

explore.get("/", async (c) => {
  const topic = c.req.query("topic");
  const useTopic = topic && (TOPICS as readonly string[]).includes(topic);
  const sql = `SELECT c.slug, c.title, c.summary, c.cover_key, c.topics, c.team_min, c.team_max, c.prizes, c.status,
        c.applications_close_at, o.slug AS org_slug, o.name AS org_name, o.logo_key
      FROM challenges c JOIN organizations o ON o.id = c.org_id
      WHERE c.status = 'open' AND o.suspended = 0 ${useTopic ? "AND c.topics LIKE ?" : ""}
      ORDER BY (c.applications_close_at IS NULL), c.applications_close_at ASC, c.created_at DESC LIMIT 60`;
  const stmt = c.env.DB.prepare(sql);
  const { results } = await (useTopic ? stmt.bind(`%"${topic}"%`) : stmt).all<Record<string, unknown>>();
  return c.json({
    challenges: results.map((r) => ({
      slug: r.slug, title: r.title, summary: r.summary, cover_url: fileUrl(r.cover_key as string | null),
      topics: JSON.parse(String(r.topics)), team_min: r.team_min, team_max: r.team_max, status: r.status,
      prize: firstLine(String(r.prizes ?? "")),
      applications_close_at: r.applications_close_at,
      org: { slug: r.org_slug, name: r.org_name, logo_url: fileUrl(r.logo_key as string | null) },
    })),
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
