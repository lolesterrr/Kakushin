import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { loadOrg } from "../lib/access";

/** Day 7: multi-round challenges. Organiser side, mounted under /api/orgs. */
export const orgRounds = new Hono<AppEnv>();

interface Ch { id: string; status: string; round_names: string; current_round: number }

async function load(c: Context<AppEnv>) {
  if (!c.get("user")) return { err: c.json({ error: "Not signed in" }, 401) };
  const access = await loadOrg(c, c.req.param("slug")!);
  if (!access) return { err: c.json({ error: "Not found" }, 404) };
  if (!access.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  const ch = await c.env.DB.prepare("SELECT id, status, round_names, current_round FROM challenges WHERE org_id = ? AND slug = ?")
    .bind(access.org.id, c.req.param("cslug")!).first<Ch>();
  if (!ch) return { err: c.json({ error: "Not found" }, 404) };
  let names: string[] = [];
  try { const v = JSON.parse(ch.round_names); if (Array.isArray(v)) names = v.map(String); } catch { /* reads as one round */ }
  return { ch, names };
}

orgRounds.get("/:slug/challenges/:cslug/rounds", async (c) => {
  const x = await load(c); if ("err" in x) return x.err;
  const { results: teams } = await c.env.DB.prepare(
    "SELECT id, name, round_reached FROM teams WHERE challenge_id = ? AND status IN ('finalist','winner') ORDER BY round_reached DESC, name",
  ).bind(x.ch.id).all<{ id: string; name: string; round_reached: number }>();
  return c.json({ rounds: x.names, current: x.ch.current_round, status: x.ch.status, teams });
});

/** Names the rounds. Fewer than two names means a one-round challenge. Rounds already reached cannot be removed. */
orgRounds.put("/:slug/challenges/:cslug/rounds", async (c) => {
  const x = await load(c); if ("err" in x) return x.err;
  const parsed = z.object({ rounds: z.array(z.string().trim().min(1, "Give every round a name").max(60, "Keep round names under 60 characters")).max(6, "Use at most 6 rounds") })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the round names" }, 400);
  const names = parsed.data.rounds;
  if (Math.max(names.length, 1) < x.ch.current_round) return c.json({ error: `Judging is already in round ${x.ch.current_round}, so keep at least ${x.ch.current_round} rounds.` }, 409);
  await c.env.DB.prepare("UPDATE challenges SET round_names = ? WHERE id = ?").bind(JSON.stringify(names), x.ch.id).run();
  return c.json({ ok: true });
});

/**
 * Closes the current round. The picked finalists go through to the next one, the stage goes back to reviewing so the
 * organiser can adjust the next round's rubric (a copy of this one) and re-run judge assignments, then starts judging again.
 * Earlier rounds' scores stay in place and stay out of the new leaderboard.
 */
orgRounds.post("/:slug/challenges/:cslug/rounds/advance", async (c) => {
  const x = await load(c); if ("err" in x) return x.err;
  const parsed = z.object({ team_ids: z.array(z.string()).min(1, "Pick at least one team to go through") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Pick the teams that go through" }, 400);
  const cur = x.ch.current_round;
  if (cur >= x.names.length) return c.json({ error: "This is the last round. Publish results from the Results tab." }, 409);
  if (x.ch.status !== "judging") return c.json({ error: "Move the stage to judging and let judges score this round first." }, 409);
  const db = c.env.DB;
  const { results: ok } = await db.prepare("SELECT id FROM teams WHERE challenge_id = ? AND status IN ('finalist','winner') AND round_reached >= ?").bind(x.ch.id, cur).all<{ id: string }>();
  const valid = new Set(ok.map((r) => r.id));
  const ids = [...new Set(parsed.data.team_ids)].filter((id) => valid.has(id));
  if (!ids.length) return c.json({ error: "Only teams in this round can go through" }, 400);
  const { results: rubric } = await db.prepare("SELECT name, description, weight, max_score, position FROM criteria WHERE challenge_id = ? AND stage = 'pitch' AND round_no = ?")
    .bind(x.ch.id, cur).all<{ name: string; description: string; weight: number; max_score: number; position: number }>();
  await db.batch([
    ...ids.map((id) => db.prepare("UPDATE teams SET round_reached = ? WHERE id = ? AND challenge_id = ?").bind(cur + 1, id, x.ch.id)),
    // Re-runs guard against a double click: the round only moves if nobody moved it in between.
    db.prepare("UPDATE challenges SET current_round = ?, status = 'reviewing' WHERE id = ? AND current_round = ?").bind(cur + 1, x.ch.id, cur),
    db.prepare("DELETE FROM judge_assignments WHERE challenge_id = ?").bind(x.ch.id),
    db.prepare("DELETE FROM criteria WHERE challenge_id = ? AND stage = 'pitch' AND round_no = ?").bind(x.ch.id, cur + 1),
    ...rubric.map((r) => db.prepare("INSERT INTO criteria (id, challenge_id, name, description, weight, max_score, position, stage, round_no) VALUES (?, ?, ?, ?, ?, ?, ?, 'pitch', ?)")
      .bind(newId(), x.ch.id, r.name, r.description, r.weight, r.max_score, r.position, cur + 1)),
  ]);
  return c.json({ ok: true, current: cur + 1, advanced: ids.length });
});

/** Undoes the last advance, as long as no judge has scored the new round yet. */
orgRounds.post("/:slug/challenges/:cslug/rounds/back", async (c) => {
  const x = await load(c); if ("err" in x) return x.err;
  const cur = x.ch.current_round;
  if (cur <= 1) return c.json({ error: "This is already the first round." }, 409);
  const db = c.env.DB;
  const scored = await db.prepare("SELECT COUNT(*) AS n FROM scores s JOIN criteria cr ON cr.id = s.criterion_id WHERE cr.challenge_id = ? AND cr.stage = 'pitch' AND cr.round_no = ?")
    .bind(x.ch.id, cur).first<{ n: number }>();
  if (scored?.n) return c.json({ error: "Judges have already scored this round, so it cannot be undone." }, 409);
  await db.batch([
    db.prepare("DELETE FROM criteria WHERE challenge_id = ? AND stage = 'pitch' AND round_no = ?").bind(x.ch.id, cur),
    db.prepare("UPDATE teams SET round_reached = ? WHERE challenge_id = ? AND round_reached >= ?").bind(cur - 1, x.ch.id, cur),
    db.prepare("DELETE FROM judge_assignments WHERE challenge_id = ?").bind(x.ch.id),
    db.prepare("UPDATE challenges SET current_round = ?, status = 'judging' WHERE id = ? AND current_round = ?").bind(cur - 1, x.ch.id, cur),
  ]);
  return c.json({ ok: true, current: cur - 1 });
});
