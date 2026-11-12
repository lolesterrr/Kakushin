import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { slugify } from "../lib/slug";
import { CHALLENGE_STATUSES, TOPICS } from "../lib/topics";
import { fileUrl, loadOrg, type OrgRow } from "../lib/access";
import { saveImage } from "../lib/upload";

interface ChallengeRow {
  id: string; org_id: string; slug: string; title: string; summary: string; description: string;
  cover_key: string | null; prizes: string; status: string; team_min: number; team_max: number;
  applications_open_at: number | null; applications_close_at: number | null; pitch_due_at: number | null;
  topics: string; questions: string; results_published: number; created_at: number;
}

export function challengeOut(r: ChallengeRow, org: Pick<OrgRow, "slug" | "name" | "logo_key">) {
  return {
    id: r.id, slug: r.slug, title: r.title, summary: r.summary, description: r.description,
    cover_url: fileUrl(r.cover_key), prizes: r.prizes, status: r.status,
    team_min: r.team_min, team_max: r.team_max,
    applications_open_at: r.applications_open_at, applications_close_at: r.applications_close_at, pitch_due_at: r.pitch_due_at,
    topics: JSON.parse(r.topics) as string[], questions: JSON.parse(r.questions) as unknown[],
    results_published: r.results_published, created_at: r.created_at,
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
  })
  .refine((b) => b.team_min <= b.team_max, { message: "Minimum team size cannot be bigger than the maximum", path: ["team_min"] })
  .refine(
    (b) => b.applications_open_at === null || b.applications_close_at === null || b.applications_open_at < b.applications_close_at,
    { message: "Applications must close after they open", path: ["applications_close_at"] },
  );

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
  return c.json({ challenge: challengeOut(row, access.org), role: access.role });
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
    b.title, b.summary, b.description, b.prizes, b.status, b.team_min, b.team_max,
    b.applications_open_at, b.applications_close_at, b.pitch_due_at,
    JSON.stringify([...new Set(b.topics)]), JSON.stringify(questions),
    access.org.id, c.req.param("cslug"),
  ).run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Moves a challenge to another stage without touching its other fields. */
orgChallenges.put("/:slug/challenges/:cslug/status", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const parsed = z.object({ status: z.enum(CHALLENGE_STATUSES) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a stage" }, 400);
  const row = await c.env.DB.prepare("SELECT summary, description FROM challenges WHERE org_id = ? AND slug = ?").bind(access.org.id, c.req.param("cslug")).first<{ summary: string; description: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  if (parsed.data.status !== "draft" && (!row.summary || !row.description)) return c.json({ error: "Add a summary and a description before publishing" }, 400);
  await c.env.DB.prepare("UPDATE challenges SET status = ? WHERE org_id = ? AND slug = ?").bind(parsed.data.status, access.org.id, c.req.param("cslug")).run();
  return c.json({ ok: true });
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
  await c.env.DB.prepare("UPDATE challenges SET cover_key = ? WHERE org_id = ? AND slug = ?")
    .bind(saved.key, access.org.id, c.req.param("cslug")).run();
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
      WHERE c.status = 'open' ${useTopic ? "AND c.topics LIKE ?" : ""}
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

explore.get("/topics", (c) => c.json({ topics: TOPICS }));
