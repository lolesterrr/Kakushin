import { TOPICS, type Topic } from "./topics";

/**
 * Reading global events from outside Kakushin. Only sources that publish for readers are supported: RSS and Atom
 * feeds, and the Hack Club hackathons API. Everything read here is someone else's text, so it is stripped to plain
 * text and clipped before it is stored, and links are kept only when they are ordinary web addresses.
 */
export interface FeedItem {
  key: string; title: string; url: string; summary: string; description: string; image_url: string | null;
  organizer: string; location: string; is_online: boolean;
  starts_at: number | null; ends_at: number | null; deadline_at: number | null; published_at: number | null;
  topics: Topic[];
}

export const MAX_ITEMS = 40;
const MAX_FEED_BYTES = 2 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
  if (e[0] === "#") {
    const n = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** Feed text to plain text: no tags, no scripts, entities decoded, blank runs collapsed. Paragraphs become line breaks. */
export function plainText(raw: string, max: number): string {
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s); // feeds usually carry HTML escaped once
  s = s.replace(/<(script|style|iframe|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n").replace(/<[^>]{0,2000}>/g, " ");
  s = decodeEntities(s).replace(/[<>]/g, " ");
  s = s.replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** An ordinary public web address, or null. Feeds are untrusted, so nothing else is ever stored or shown as a link. */
export function webUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.href.length > 600) return null;
    return u.href;
  } catch { return null; }
}

const TOPIC_WORDS: Record<Topic, RegExp> = {
  fintech: /\b(fintech|financial inclusion|payments?|banking|mobile money|insurtech|blockchain|crypto|web3|defi)\b/i,
  health: /\b(health|healthcare|medical|medicine|biotech|medtech|wellbeing|hospital|disease)\b/i,
  agritech: /\b(agri\w*|farm\w*|food security|food systems?|crops?|livestock)\b/i,
  climate: /\b(climate|sustainab\w+|environment\w*|green|carbon|net[- ]zero|conservation|circular economy)\b/i,
  education: /\b(education|edtech|learning|school|students?|teachers?|scholarship)\b/i,
  ai: /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llms?|genai|generative|data science|deep learning)\b/i,
  energy: /\b(energy|solar|renewables?|electrification|battery|batteries|power grid|clean cooking)\b/i,
  transport: /\b(transport\w*|mobility|logistics|electric vehicles?|aviation|shipping)\b/i,
  "social-impact": /\b(social impact|social good|non-?profit|humanitarian|inclusion|gender|refugees?|civic|community development|sdgs?)\b/i,
};

/** Topics an item is about, from its own words plus the source's defaults. At most five, like a challenge. */
export function inferTopics(text: string, defaults: readonly string[] = []): Topic[] {
  const found = TOPICS.filter((t) => defaults.includes(t) || TOPIC_WORDS[t].test(text));
  return found.slice(0, 5);
}

const MONTH = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthIndex = (m: string) => MONTH.findIndex((x) => x.startsWith(m.toLowerCase().replace(/\.$/, "").slice(0, 3)));

/**
 * Finds a written deadline such as "Deadline: 30 November 2026" or "apply by March 5, 2027". Returns the end of that
 * day in UTC, or null. Only dates with a year are accepted, so a vague "apply by Friday" is never guessed at.
 */
export function findDeadline(text: string): number | null {
  const lead = "(?:deadline|closing date|apply by|applications? (?:close|due|end)s?|submissions? (?:close|due)|closes on|due date)";
  const dmy = new RegExp(`${lead}[^.\\n]{0,60}?\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MON}\\.?,?\\s+(\\d{4})`, "i").exec(text);
  const mdy = new RegExp(`${lead}[^.\\n]{0,60}?\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i").exec(text);
  const pick = dmy && (!mdy || dmy.index <= mdy.index) ? { d: dmy[1]!, m: dmy[2]!, y: dmy[3]! } : mdy ? { d: mdy[2]!, m: mdy[1]!, y: mdy[3]! } : null;
  if (!pick) return null;
  const day = Number(pick.d), month = monthIndex(pick.m), year = Number(pick.y);
  if (month < 0 || day < 1 || day > 31 || year < 2020 || year > 2100) return null;
  const at = Date.UTC(year, month, day, 23, 59, 59);
  return new Date(at).getUTCDate() === day ? at : null; // rejects 31 February
}

const dateMs = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) && t > 0 && t < 4_102_444_800_000 ? t : null;
};

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}\\s*>`, "i").exec(xml);
  return m ? m[1]! : null;
};
const attr = (xml: string, name: string, a: string): string | null => {
  const m = new RegExp(`<${name}\\b[^>]*?\\s${a}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(xml);
  return m ? (m[1] ?? m[2] ?? null) : null;
};

/** The words an item must mention, from the source's comma-separated list. An empty list lets everything through. */
export function keywordTest(keywords: string): (text: string) => boolean {
  const words = keywords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 30);
  if (!words.length) return () => true;
  return (text) => { const t = text.toLowerCase(); return words.some((w) => t.includes(w)); };
}

/** RSS 2.0 and Atom. A small reader on purpose: the Worker has no XML parser, and feeds only need a few fields. */
export function parseFeed(xml: string, opts: { baseUrl?: string; topics?: readonly string[]; keywords?: string } = {}): FeedItem[] {
  const keep = keywordTest(opts.keywords ?? "");
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1\s*>/gi) ?? [];
  const channel = tag(xml.split(/<(?:item|entry)\b/i)[0] ?? "", "title");
  const feedName = channel ? plainText(channel, 80) : "";
  const out: FeedItem[] = [];
  for (const b of blocks) {
    if (out.length >= MAX_ITEMS) break;
    const atom = /^<entry/i.test(b);
    const title = plainText(tag(b, "title") ?? "", 160);
    // Atom links are attributes, and the page for readers is rel="alternate" (or has no rel at all).
    const atomLink = () => {
      const links = b.match(/<link\b[^>]*>/gi) ?? [];
      const best = links.find((l) => /rel\s*=\s*["']alternate["']/i.test(l)) ?? links.find((l) => !/\srel\s*=/i.test(l)) ?? links[0];
      return best ? attr(best, "link", "href") : null;
    };
    const url = webUrl(atom ? atomLink() : plainText(tag(b, "link") ?? "", 600) || atomLink(), opts.baseUrl);
    if (!title || !url) continue;
    const body = tag(b, "content:encoded") ?? tag(b, "content") ?? tag(b, "description") ?? tag(b, "summary") ?? "";
    const short = tag(b, "description") ?? tag(b, "summary") ?? body;
    const description = plainText(body, 4000);
    const cats = (b.match(/<category\b[^>]*>[\s\S]*?<\/category\s*>|<category\b[^>]*\/>/gi) ?? []).map((c) => plainText(attr(c, "category", "term") ?? tag(c, "category") ?? "", 40)).filter(Boolean);
    const words = `${title}\n${cats.join(" ")}\n${description}`;
    if (!keep(words)) continue;
    const rawBody = decodeEntities(body.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    const image = webUrl(
      attr(b, "media:content", "url") ?? attr(b, "media:thumbnail", "url")
        ?? (/<enclosure\b[^>]*type\s*=\s*["']image\//i.test(b) ? attr(b, "enclosure", "url") : null)
        ?? attr(rawBody, "img", "src"),
      opts.baseUrl,
    );
    const published = dateMs(plainText(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "", 60));
    const key = plainText(tag(b, "guid") ?? tag(b, "id") ?? "", 300) || url;
    out.push({
      key, title, url, summary: plainText(short, 200), description,
      image_url: image && image.startsWith("https://") ? image : null,
      organizer: plainText(tag(b, "dc:creator") ?? tag(tag(b, "author") ?? "", "name") ?? "", 80) || feedName,
      location: "", is_online: false, starts_at: null, ends_at: null,
      deadline_at: findDeadline(words), published_at: published,
      topics: inferTopics(words, opts.topics),
    });
  }
  return out;
}

/** The Hack Club hackathons API (https://hackathons.hackclub.com/api/events/upcoming): a JSON list of events. */
export function parseHackClub(json: unknown, opts: { topics?: readonly string[]; keywords?: string } = {}): FeedItem[] {
  if (!Array.isArray(json)) return [];
  const keep = keywordTest(opts.keywords ?? "");
  const out: FeedItem[] = [];
  const str = (v: unknown, max: number) => (typeof v === "string" ? plainText(v, max) : "");
  for (const raw of json as Record<string, unknown>[]) {
    if (out.length >= MAX_ITEMS) break;
    if (!raw || typeof raw !== "object") continue;
    const title = str(raw.name, 160);
    const url = webUrl(typeof raw.website === "string" ? raw.website : null);
    if (!title || !url || !keep(title)) continue;
    const online = raw.virtual === true;
    const place = [raw.city, raw.state, raw.country].map((x) => str(x, 60)).filter(Boolean).join(", ");
    const image = webUrl(typeof raw.banner === "string" ? raw.banner : null);
    const starts = dateMs(typeof raw.start === "string" ? raw.start : null), ends = dateMs(typeof raw.end === "string" ? raw.end : null);
    out.push({
      key: str(raw.id, 80) || url, title, url,
      summary: `${online ? "Online hackathon" : raw.hybrid === true ? "Hybrid hackathon" : "In-person hackathon"}${place && !online ? ` in ${place}` : ""}, listed by Hack Club.`,
      description: "", image_url: image && image.startsWith("https://") ? image : null,
      organizer: "", location: online ? "Online" : place, is_online: online,
      starts_at: starts, ends_at: ends && starts && ends >= starts ? ends : null, deadline_at: null, published_at: null,
      topics: inferTopics(title, opts.topics),
    });
  }
  return out;
}

/**
 * A source address the Worker is willing to read: https, a real host name, nothing that points back inside a network.
 * `testHost` (only set in tests) lets a local fake feed stand in.
 */
export function sourceUrl(raw: string, testHost?: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (testHost && u.host === testHost && u.protocol === "http:") return u.href;
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  if (h === "localhost" || /\.(local|localhost|internal|lan|home|test|invalid)$/.test(h)) return null;
  return u.href.length <= 500 ? u.href : null;
}

/** Downloads a source and turns it into items. Throws a short, readable reason when the source cannot be used. */
export async function readSource(src: { kind: string; url: string; topics?: readonly string[]; keywords?: string }, testHost?: string): Promise<FeedItem[]> {
  const url = sourceUrl(src.url, testHost);
  if (!url) throw new Error("The address must be a public https link");
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.5", "User-Agent": "KakushinEvents/1.0 (feed reader)" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
  } catch { throw new Error("The source did not answer"); }
  if (!res.ok) throw new Error(`The source answered with error ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) throw new Error("The source is too large to read");
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("The source is too large to read");
  if (src.kind === "hackclub") {
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error("The source did not send a list of events"); }
    if (!Array.isArray(json)) throw new Error("The source did not send a list of events");
    return parseHackClub(json, src);
  }
  if (!/<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 5000))) throw new Error("That address is not an RSS or Atom feed");
  return parseFeed(text, { ...src, baseUrl: url });
}
