import type { Context } from "hono";
import type { AppEnv } from "../types";
import { TOPICS } from "./topics";

/** One INSERT ... SELECT, so telling hundreds of people costs a single database query. */
export async function notifyFollowersOfChallenge(c: Context<AppEnv>, ch: { id: string; title: string; slug: string; topics: string[] }, org: { id: string; slug: string; name: string }) {
  const topics = ch.topics.filter((t) => (TOPICS as readonly string[]).includes(t));
  const marks = topics.map(() => "?").join(",");
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), u.id, 'challenge.new', ?, ?, ?, ?
     FROM users u
     WHERE u.id IN (SELECT user_id FROM follows WHERE org_id = ?)
        ${topics.length ? `OR u.id IN (SELECT user_id FROM interests WHERE topic IN (${marks}))` : ""}`,
  ).bind(`New challenge: ${ch.title}`, `${org.name} just opened a challenge.`, `/o/${org.slug}/c/${ch.slug}`, now, org.id, ...topics).run();
}
