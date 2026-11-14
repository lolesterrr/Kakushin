import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { judgeSees } from "../lib/assign";
import { newId } from "../lib/crypto";
import { parseRepo, repoUrl } from "../lib/github";
import { MAX_PITCH_IMAGES, MEDIA_BYTES, fileUrl, headerCaption, youtubeEmbed } from "../lib/media";
import { saveImage } from "../lib/upload";

/** Participant pitch routes, mounted under /api/teams. */
export const pitch = new Hono<AppEnv>();
/** Authenticated deck download, mounted at /api/decks. */
export const decks = new Hono<AppEnv>();

const PITCH_STATUSES = ["shortlisted", "finalist", "winner"];
const MAX_DECK = 20 * 1024 * 1024;

interface TeamCtx { team: { id: string; name: string; status: string; challenge_id: string }; due: number | null; chStatus: string }

async function memberTeam(c: Context<AppEnv>, teamId: string): Promise<TeamCtx | null> {
  const user = c.get("user");
  if (!user) return null;
  const row = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.status, t.challenge_id, ch.pitch_due_at AS due, ch.status AS chStatus
     FROM teams t JOIN team_members m ON m.team_id = t.id JOIN challenges ch ON ch.id = t.challenge_id WHERE t.id = ? AND m.user_id = ?`,
  ).bind(teamId, user.id).first<{ id: string; name: string; status: string; challenge_id: string; due: number | null; chStatus: string }>();
  return row ? { team: row, due: row.due, chStatus: row.chStatus } : null;
}

const pitchOut = (r: { deck_name: string | null; deck_key: string | null; video_url: string; demo_url: string; repo_url?: string; notes: string; updated_at: number } | null) =>
  r ? { has_deck: !!r.deck_key, deck_name: r.deck_name, video_url: r.video_url, video_embed: youtubeEmbed(r.video_url), demo_url: r.demo_url, repo_url: r.repo_url ?? "", notes: r.notes, updated_at: r.updated_at } : null;

export interface PitchImage { id: string; url: string; caption: string }

/** A team's screenshots in order. An empty list when there are none. */
export async function pitchImages(c: Context<AppEnv>, teamId: string): Promise<PitchImage[]> {
  const { results } = await c.env.DB.prepare("SELECT id, key, caption FROM pitch_images WHERE team_id = ? ORDER BY position, created_at").bind(teamId).all<{ id: string; key: string; caption: string }>();
  return results.map((r) => ({ id: r.id, url: fileUrl(r.key), caption: r.caption }));
}

pitch.get("/:id/pitch", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM submissions WHERE team_id = ?").bind(x.team.id).first<any>();
  return c.json({ pitch: pitchOut(row), images: await pitchImages(c, x.team.id), max_images: MAX_PITCH_IMAGES, due: x.due, open: PITCH_STATUSES.includes(x.team.status) });
});

function guard(x: TeamCtx): string | null {
  if (!PITCH_STATUSES.includes(x.team.status)) return "Only shortlisted teams can submit a pitch";
  if (x.chStatus === "completed") return "This challenge is finished";
  if (x.due && Date.now() > x.due) return "The pitch deadline has passed";
  return null;
}

const link = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { message: "Links must start with http:// or https://" });
/** A public github.com repo, stored as https://github.com/owner/name. Empty clears it. */
const repo = z.string().trim().max(300).refine((v) => v === "" || parseRepo(v) !== null, { message: "Use a github.com repository link, like https://github.com/your-team/project" })
  .transform((v) => (v === "" ? "" : repoUrl(parseRepo(v)!)));

pitch.put("/:id/pitch", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  // repo_url left out keeps what is stored, so an app from before day 6 cannot wipe it.
  const parsed = z.object({ video_url: link.default(""), demo_url: link.default(""), repo_url: repo.optional(), notes: z.string().trim().max(2000).default("") })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check your pitch details" }, 400);
  const p = parsed.data;
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, team_id, video_url, demo_url, repo_url, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET video_url = excluded.video_url, demo_url = excluded.demo_url,
       repo_url = CASE WHEN ? THEN excluded.repo_url ELSE submissions.repo_url END, notes = excluded.notes, updated_at = excluded.updated_at`,
  ).bind(newId(), x.team.id, p.video_url, p.demo_url, p.repo_url ?? "", p.notes, Date.now(), p.repo_url !== undefined ? 1 : 0).run();
  return c.json({ ok: true });
});

pitch.put("/:id/pitch/deck", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  if ((c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/pdf") return c.json({ error: "The deck must be a PDF" }, 400);
  if (Number(c.req.header("Content-Length") ?? 0) > MAX_DECK) return c.json({ error: "The deck is too large (max 20 MB)" }, 400);
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_DECK) return c.json({ error: "The deck is too large (max 20 MB)" }, 400);
  if (new TextDecoder().decode(new Uint8Array(body, 0, 5)) !== "%PDF-") return c.json({ error: "That file is not a valid PDF" }, 400);
  const name = (c.req.header("X-File-Name") ?? "deck.pdf").replace(/[^\w.\- ]/g, "").slice(0, 80) || "deck.pdf";
  const key = `decks/${x.team.id}/${crypto.randomUUID()}.pdf`;
  await c.env.FILES.put(key, body, { httpMetadata: { contentType: "application/pdf" } });
  const old = await c.env.DB.prepare("SELECT deck_key FROM submissions WHERE team_id = ?").bind(x.team.id).first<{ deck_key: string | null }>();
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, team_id, deck_key, deck_name, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET deck_key = excluded.deck_key, deck_name = excluded.deck_name, updated_at = excluded.updated_at`,
  ).bind(newId(), x.team.id, key, name, Date.now()).run();
  if (old?.deck_key) await c.env.FILES.delete(old.deck_key);
  return c.json({ ok: true, deck_name: name });
});

// ---- screenshots: up to MAX_PITCH_IMAGES per team, each with an optional caption ----
pitch.post("/:id/pitch/images", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  const n = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM pitch_images WHERE team_id = ?").bind(x.team.id).first<{ n: number }>())?.n ?? 0;
  if (n >= MAX_PITCH_IMAGES) return c.json({ error: `A pitch can have up to ${MAX_PITCH_IMAGES} images. Remove one first.` }, 409);
  const saved = await saveImage(c, `shots/${x.team.id}`, MEDIA_BYTES);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  const caption = headerCaption(c.req.header("X-Caption"));
  const id = newId();
  await c.env.DB.prepare("INSERT INTO pitch_images (id, team_id, key, caption, position, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, x.team.id, saved.key, caption, n, Date.now()).run();
  return c.json({ ok: true, image: { id, url: fileUrl(saved.key), caption } });
});

/** Captions and order in one call: the list is the new order, and every image the team has must be in it. */
pitch.put("/:id/pitch/images", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  const parsed = z.object({ images: z.array(z.object({ id: z.string().min(1).max(64), caption: z.string().trim().max(120) })).max(MAX_PITCH_IMAGES) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Captions can be up to 120 characters" }, 400);
  const have = new Set((await pitchImages(c, x.team.id)).map((i) => i.id));
  const list = parsed.data.images;
  if (list.length !== have.size || !list.every((i) => have.has(i.id)) || new Set(list.map((i) => i.id)).size !== list.length) {
    return c.json({ error: "The images changed. Reload and try again." }, 409);
  }
  await c.env.DB.batch(list.map((i, pos) => c.env.DB.prepare("UPDATE pitch_images SET caption = ?, position = ? WHERE id = ? AND team_id = ?").bind(i.caption, pos, i.id, x.team.id)));
  return c.json({ ok: true });
});

pitch.delete("/:id/pitch/images/:imageId", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  const row = await c.env.DB.prepare("SELECT key FROM pitch_images WHERE id = ? AND team_id = ?").bind(c.req.param("imageId"), x.team.id).first<{ key: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM pitch_images WHERE id = ?").bind(c.req.param("imageId")).run();
  c.executionCtx.waitUntil(c.env.FILES.delete(row.key).catch(() => {}));
  return c.json({ ok: true });
});

/** A deck can be opened by the team, the organisation's admins, and the challenge's judges. */
decks.get("/:teamId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const teamId = c.req.param("teamId");
  const row = await c.env.DB.prepare(
    `SELECT s.deck_key, t.challenge_id, ch.org_id FROM submissions s JOIN teams t ON t.id = s.team_id JOIN challenges ch ON ch.id = t.challenge_id
     WHERE s.team_id = ? AND s.deck_key IS NOT NULL`,
  ).bind(teamId).first<{ deck_key: string; challenge_id: string; org_id: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  const allowed = await c.env.DB.prepare(
    `SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM team_members WHERE team_id = ?1 AND user_id = ?2)
       OR EXISTS (SELECT 1 FROM memberships WHERE org_id = ?3 AND user_id = ?2)
       OR (EXISTS (SELECT 1 FROM judges WHERE challenge_id = ?4 AND email = ?5) AND ${judgeSees("?4", "?5", "?1")})`,
  ).bind(teamId, user.id, row.org_id, row.challenge_id, user.email.toLowerCase()).first();
  if (!allowed) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.FILES.get(row.deck_key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="pitch-deck.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
