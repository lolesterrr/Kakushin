import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";

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

const pitchOut = (r: { deck_name: string | null; deck_key: string | null; video_url: string; demo_url: string; notes: string; updated_at: number } | null) =>
  r ? { has_deck: !!r.deck_key, deck_name: r.deck_name, video_url: r.video_url, demo_url: r.demo_url, notes: r.notes, updated_at: r.updated_at } : null;

pitch.get("/:id/pitch", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM submissions WHERE team_id = ?").bind(x.team.id).first<any>();
  return c.json({ pitch: pitchOut(row), due: x.due, open: PITCH_STATUSES.includes(x.team.status) });
});

function guard(x: TeamCtx): string | null {
  if (!PITCH_STATUSES.includes(x.team.status)) return "Only shortlisted teams can submit a pitch";
  if (x.chStatus === "completed") return "This challenge is finished";
  if (x.due && Date.now() > x.due) return "The pitch deadline has passed";
  return null;
}

const link = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { message: "Links must start with http:// or https://" });

pitch.put("/:id/pitch", async (c) => {
  if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
  const x = await memberTeam(c, c.req.param("id"));
  if (!x) return c.json({ error: "Not found" }, 404);
  const why = guard(x);
  if (why) return c.json({ error: why }, 409);
  const parsed = z.object({ video_url: link.default(""), demo_url: link.default(""), notes: z.string().trim().max(2000).default("") })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check your pitch details" }, 400);
  const p = parsed.data;
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, team_id, video_url, demo_url, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET video_url = excluded.video_url, demo_url = excluded.demo_url, notes = excluded.notes, updated_at = excluded.updated_at`,
  ).bind(newId(), x.team.id, p.video_url, p.demo_url, p.notes, Date.now()).run();
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
       OR EXISTS (SELECT 1 FROM judges WHERE challenge_id = ?4 AND email = ?5)`,
  ).bind(teamId, user.id, row.org_id, row.challenge_id, user.email.toLowerCase()).first();
  if (!allowed) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.FILES.get(row.deck_key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="pitch-deck.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
