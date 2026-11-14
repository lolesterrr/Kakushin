import type { Context } from "hono";
import type { AppEnv } from "../types";
import { TOPICS } from "./topics";
import { sendEmail } from "./email";
import { pushLater } from "./push";

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

/** Tells every admin of the organisation, in the inbox and by email. */
export async function tellOrgAdmins(c: Context<AppEnv>, orgId: string, title: string, body: string, link: string, subject: string) {
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
     SELECT lower(hex(randomblob(12))), m.user_id, 'review.result', ?, ?, ?, ? FROM memberships m WHERE m.org_id = ?`,
  ).bind(title, body, link, now, orgId).run();
  pushLater(c);
  const { results } = await c.env.DB.prepare("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? LIMIT 20").bind(orgId).all<{ email: string }>();
  const text = `${title}\n\n${body}\n\n${c.env.APP_URL}${link}`;
  const html = `<p><b>${title.replace(/</g, "&lt;")}</b></p><p>${body.replace(/</g, "&lt;")}</p><p><a href="${c.env.APP_URL}${link}">Open it on Kakushin</a></p>`;
  c.executionCtx.waitUntil(Promise.all(results.map((r) => sendEmail(c.env, r.email, subject, html, text).catch((e) => console.error(`review email failed: ${e instanceof Error ? e.message : e}`)))));
}
