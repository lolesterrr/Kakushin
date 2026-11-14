import type { Context } from "hono";
import type { AppEnv } from "../types";

/**
 * Link previews. WhatsApp, LinkedIn, Slack and friends do not run JavaScript, so they only see the tags in the HTML.
 * Every page goes through here on its way out of the Worker: image and page URLs become absolute (scrapers need that),
 * and challenge and organisation pages get their own title, summary and cover.
 */
interface Meta { title: string; description: string; image: string; url: string; type: "website" | "article" }

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export async function pageMeta(c: Context<AppEnv>, path: string): Promise<Partial<Meta>> {
  const ch = /^\/o\/([^/]+)\/c\/([^/]+)\/?$/.exec(path);
  if (ch) {
    const row = await c.env.DB.prepare(
      `SELECT c.title, c.summary, c.cover_key, o.name AS org_name, o.logo_key FROM challenges c JOIN organizations o ON o.id = c.org_id
       WHERE o.slug = ? AND c.slug = ? AND c.status != 'draft' AND o.suspended = 0`,
    ).bind(decodeURIComponent(ch[1]!), decodeURIComponent(ch[2]!)).first<{ title: string; summary: string; cover_key: string | null; org_name: string; logo_key: string | null }>();
    if (!row) return {};
    const key = row.cover_key ?? row.logo_key;
    return {
      title: `${row.title} · ${row.org_name}`,
      description: clip(row.summary || `An innovation challenge by ${row.org_name} on Kakushin.`, 200),
      ...(key ? { image: `/api/files/${key}` } : {}),
      type: "article",
    };
  }
  const org = /^\/o\/([^/]+)\/?$/.exec(path);
  if (org) {
    const row = await c.env.DB.prepare("SELECT name, logo_key FROM organizations WHERE slug = ? AND suspended = 0")
      .bind(decodeURIComponent(org[1]!)).first<{ name: string; logo_key: string | null }>();
    if (!row) return {};
    return { title: `${row.name} on Kakushin`, description: `Open and past innovation challenges from ${row.name}.`, ...(row.logo_key ? { image: `/api/files/${row.logo_key}` } : {}) };
  }
  const person = /^\/u\/([a-z0-9-]{3,30})\/?$/.exec(path);
  if (person) {
    const row = await c.env.DB.prepare("SELECT name, bio FROM users WHERE handle = ? AND public_profile = 1 AND suspended = 0").bind(person[1]!).first<{ name: string | null; bio: string | null }>();
    if (!row) return {};
    const name = row.name || "A Kakushin participant";
    return { title: `${name} · Kakushin`, description: clip(row.bio || `${name}'s challenges, teams and certificates on Kakushin.`, 200) };
  }
  const ev = /^\/events\/([a-z0-9-]{3,60})\/?$/.exec(path);
  if (ev && ev[1] !== "suggest") {
    const row = await c.env.DB.prepare("SELECT title, summary, organizer FROM external_events WHERE slug = ? AND state = 'published'").bind(ev[1]!).first<{ title: string; summary: string; organizer: string }>();
    if (!row) return {};
    return { title: `${row.title} · Global events · Kakushin`, description: clip(row.summary || `${row.organizer ? `${row.organizer}. ` : ""}An event from outside Kakushin, listed so you can find it.`, 200), type: "article" };
  }
  if (path === "/events" || path === "/events/") return { title: "Global events · Kakushin", description: "Hackathons and opportunities from around the world, gathered in one place with links to their official pages." };
  if (path === "/challenges/winners") return { title: "Past winners · Kakushin", description: "Winning teams from completed innovation challenges on Kakushin." };
  if (path === "/privacy") return { title: "Privacy policy · Kakushin", description: "What Kakushin keeps about you, who can see it, and how to delete it." };
  if (path === "/terms") return { title: "Terms of use · Kakushin", description: "The rules for using Kakushin as a participant, judge or organiser." };
  if (path === "/challenges" || path === "/challenges/") return { title: "Challenges · Kakushin", description: "Open innovation challenges and hackathons you can apply to now." };
  return {};
}

const setContent = (value: string) => ({ element(el: Element) { el.setAttribute("content", value); } });

/** Rewrites the static tags in web/index.html. Only touches HTML; everything else passes through. */
export async function withMeta(c: Context<AppEnv>, res: Response): Promise<Response> {
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  const base = c.env.APP_URL.replace(/\/$/, "");
  const url = new URL(c.req.url);
  let found: Partial<Meta> = {};
  try { found = await pageMeta(c, url.pathname); } catch (e) { console.error(`page meta failed: ${e instanceof Error ? e.message : e}`); }
  const abs = (u: string) => (/^https?:\/\//i.test(u) ? u : `${base}${u}`);
  const image = abs(found.image ?? "/og.jpg");
  const pageUrl = `${base}${url.pathname}`;
  let rw = new HTMLRewriter()
    .on('meta[property="og:image"]', setContent(image))
    .on('meta[name="twitter:image"]', setContent(image))
    .on('meta[property="og:url"]', setContent(pageUrl));
  if (found.type) rw = rw.on('meta[property="og:type"]', setContent(found.type));
  if (found.title) {
    const title = found.title;
    rw = rw
      .on("title", { element(el) { el.setInnerContent(title); } })
      .on('meta[property="og:title"]', setContent(title))
      .on('meta[name="twitter:title"]', setContent(title));
  }
  if (found.description) {
    rw = rw
      .on('meta[name="description"]', setContent(found.description))
      .on('meta[property="og:description"]', setContent(found.description))
      .on('meta[name="twitter:description"]', setContent(found.description));
  }
  // Pages differ per path now, so do not let a cache hand one page's tags to another.
  const out = rw.transform(res);
  const h = new Headers(out.headers);
  h.set("Cache-Control", "no-cache");
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers: h });
}
