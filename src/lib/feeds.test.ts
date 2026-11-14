import { describe, expect, it } from "vitest";
import { findDeadline, inferTopics, keywordTest, parseFeed, parseHackClub, plainText, sourceUrl, webUrl } from "./feeds";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Opportunities Desk</title><link>https://example.org</link>
<item>
  <title><![CDATA[Africa Fintech Hackathon 2027 &amp; Demo Day]]></title>
  <link>https://example.org/fintech-hackathon-2027/</link>
  <guid isPermaLink="false">https://example.org/?p=101</guid>
  <pubDate>Mon, 09 Nov 2026 08:00:00 +0000</pubDate>
  <dc:creator><![CDATA[Amina]]></dc:creator>
  <category><![CDATA[Hackathons]]></category>
  <description><![CDATA[<p>Build payments tools. <script>alert(1)</script>Application deadline: 30 November 2026.</p>]]></description>
  <content:encoded><![CDATA[<p>Build <b>mobile money</b> tools.</p><img src="https://example.org/img/a.jpg" onerror="x()"><p>Application deadline: 30 November 2026.</p>]]></content:encoded>
</item>
<item>
  <title>Scholarship for nurses</title>
  <link>https://example.org/nurses/</link>
  <description>Fully funded.</description>
</item>
<item><title>No link here</title><description>skip me</description></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Hub news</title>
<entry><title type="html">Climate &lt;em&gt;Challenge&lt;/em&gt;</title>
<link rel="self" href="https://hub.example/api/1"/><link rel="alternate" href="/posts/climate"/>
<id>tag:hub.example,2026:1</id><updated>2026-11-01T10:00:00Z</updated>
<summary>Apply by March 5, 2027 to join.</summary><author><name>The Hub</name></author></entry></feed>`;

describe("reading feeds", () => {
  it("reads RSS items and drops the ones without a usable link", () => {
    const items = parseFeed(RSS);
    expect(items.map((i) => i.title)).toEqual(["Africa Fintech Hackathon 2027 & Demo Day", "Scholarship for nurses"]);
    const a = items[0]!;
    expect(a.url).toBe("https://example.org/fintech-hackathon-2027/");
    expect(a.key).toBe("https://example.org/?p=101");
    expect(a.organizer).toBe("Amina");
    expect(a.image_url).toBe("https://example.org/img/a.jpg");
    expect(a.published_at).toBe(Date.UTC(2026, 10, 9, 8));
    expect(a.deadline_at).toBe(Date.UTC(2026, 10, 30, 23, 59, 59));
    expect(a.topics).toContain("fintech");
  });
  it("never keeps markup or scripts from a feed", () => {
    const a = parseFeed(RSS)[0]!;
    for (const text of [a.title, a.summary, a.description]) { expect(text).not.toMatch(/[<>]/); expect(text).not.toContain("alert"); expect(text).not.toContain("onerror"); }
    expect(a.description).toContain("mobile money");
  });
  it("keeps only items that mention a keyword", () => {
    expect(parseFeed(RSS, { keywords: "hackathon, challenge" }).map((i) => i.title)).toEqual(["Africa Fintech Hackathon 2027 & Demo Day"]);
    expect(keywordTest("")("anything")).toBe(true);
  });
  it("reads Atom, picks the reader's link and resolves it against the feed", () => {
    const [e] = parseFeed(ATOM, { baseUrl: "https://hub.example/feed.xml", topics: ["education"] });
    expect(e!.title).toBe("Climate Challenge");
    expect(e!.url).toBe("https://hub.example/posts/climate");
    expect(e!.organizer).toBe("The Hub");
    expect(e!.deadline_at).toBe(Date.UTC(2027, 2, 5, 23, 59, 59));
    expect(e!.topics).toEqual(["climate", "education"]);
  });
  it("stops at 40 items", () => {
    const many = `<rss><channel>${Array.from({ length: 60 }, (_, n) => `<item><title>Item ${n}</title><link>https://x.example/${n}</link></item>`).join("")}</channel></rss>`;
    expect(parseFeed(many)).toHaveLength(40);
  });
});

describe("the Hack Club list", () => {
  it("maps events and ignores junk", () => {
    const items = parseHackClub([
      { id: "abc", name: "Hack the Lake", website: "https://lake.example", start: "2027-02-01T09:00:00.000Z", end: "2027-02-02T17:00:00.000Z", banner: "https://img.example/b.png", city: "Kampala", state: null, country: "Uganda", virtual: false, hybrid: false },
      { id: "def", name: "Online AI Jam", website: "https://jam.example", start: "2027-03-01T09:00:00.000Z", end: "2027-03-01T08:00:00.000Z", virtual: true },
      { name: "No site" }, null, "text",
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ key: "abc", location: "Kampala, Uganda", is_online: false, starts_at: Date.UTC(2027, 1, 1, 9), ends_at: Date.UTC(2027, 1, 2, 17), image_url: "https://img.example/b.png" });
    expect(items[1]).toMatchObject({ location: "Online", is_online: true, ends_at: null });
    expect(items[1]!.topics).toEqual(["ai"]);
    expect(parseHackClub({ not: "a list" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("finds written deadlines, and only ones with a year", () => {
    expect(findDeadline("Deadline: 5th of January 2027")).toBe(Date.UTC(2027, 0, 5, 23, 59, 59));
    expect(findDeadline("Applications close on Sept. 12, 2027 at noon")).toBe(Date.UTC(2027, 8, 12, 23, 59, 59));
    expect(findDeadline("Apply by Friday")).toBeNull();
    expect(findDeadline("The event is on 3 March 2027")).toBeNull();
    expect(findDeadline("Deadline: 31 February 2027")).toBeNull();
  });
  it("guesses topics from words, whole words only", () => {
    expect(inferTopics("A solar energy hackathon for farmers")).toEqual(["agritech", "energy"]);
    expect(inferTopics("Maintain the trail")).toEqual([]);
    expect(inferTopics("anything", ["health", "nonsense"])).toEqual(["health"]);
  });
  it("turns markup into plain text and clips it", () => {
    expect(plainText("<p>One</p><p>Two &amp; three</p>", 100)).toBe("One\nTwo & three");
    expect(plainText("&lt;script&gt;alert(1)&lt;/script&gt;hello", 100)).toBe("hello");
    expect(plainText("x".repeat(50), 10)).toHaveLength(10);
  });
  it("accepts only ordinary web links", () => {
    expect(webUrl("https://a.example/x?y=1&amp;z=2")).toBe("https://a.example/x?y=1&z=2");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://a.example", "https://user:pw@a.example", "", null]) expect(webUrl(bad)).toBeNull();
  });
  it("only reads sources on the public web", () => {
    expect(sourceUrl("https://example.org/feed/")).toBe("https://example.org/feed/");
    for (const bad of ["http://example.org/feed", "https://localhost/feed", "https://127.0.0.1/feed", "https://10.0.0.8/x", "https://intranet/feed", "https://db.internal/feed", "https://example.org:8443/feed", "https://[::1]/feed", "file:///etc/passwd", "nope"]) expect(sourceUrl(bad)).toBeNull();
    expect(sourceUrl("http://localhost:8799/feed.xml", "localhost:8799")).toBe("http://localhost:8799/feed.xml");
  });
});
