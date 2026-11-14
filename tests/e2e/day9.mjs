// What day 9 adds: global events (sources, suggestions, review), reports and take-downs, saved items and calendar files.
// Run: printf 'EVENT_FEED_TEST_HOST=localhost:9996\n' >> .dev.vars, then npx wrangler dev --test-scheduled, then: node tests/e2e/day9.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d9${Date.now().toString(36)}`;
const sql = (q) => execSync(`npx wrangler d1 execute kakushin --local --json --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const rows = (q) => JSON.parse(sql(q))[0].results;
let failed = 0, passed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log("PASS", name); } else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); } };
const DAY = 86400000, now = Date.now();

async function person(label) {
  const email = `${P}-${label}@example.com`;
  sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ('${crypto.createHash("sha256").update(`${email}:123456`).digest("hex")}', 'code', '${email}', ${Date.now() + 600000})`);
  let r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "123456" }) });
  for (let i = 0; r.status === 429 && i < 12; i++) { await new Promise((ok) => setTimeout(ok, 10000)); r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "123456" }) }); }
  const tok = /kk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
  if (!tok) throw new Error(`could not sign in ${email}`);
  const call = async (path, method = "GET", json) => {
    const res = await fetch(`${U}/api${path}`, { method, headers: { "content-type": "application/json", cookie: `kk_session=${tok}` }, body: json === undefined ? undefined : JSON.stringify(json) });
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: res.status, d, type: res.headers.get("content-type") ?? "" };
  };
  call.email = email;
  call.id = () => rows(`SELECT id FROM users WHERE email = '${email}'`)[0].id;
  await call("/me", "PUT", { name: label[0].toUpperCase() + label.slice(1), skills: [] });
  return call;
}
const anon = async (path) => { const res = await fetch(`${U}/api${path}`); const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: res.status, d, type: res.headers.get("content-type") ?? "" }; };
const cron = async () => { await fetch(`${U}/__scheduled?cron=${encodeURIComponent("0 * * * *")}`); await new Promise((r) => setTimeout(r, 1500)); };
const inbox = async (who) => (await who("/inbox")).d.items;
const titles = async (who) => (await inbox(who)).map((n) => n.title);

// ---- a fake source: an RSS feed and a Hack Club style list ----
const soon = new Date(now + 20 * DAY), MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const deadlineText = `${soon.getUTCDate()} ${MON[soon.getUTCMonth()]} ${soon.getUTCFullYear()}`;
let feedItems = [
  { t: `${P} Fintech Hackathon`, l: `https://feeds.example/${P}/fintech`, d: `<p>Build <b>payments</b> tools.</p><script>alert(1)</script> Application deadline: ${deadlineText}.` },
  { t: `${P} Climate Challenge`, l: `https://feeds.example/${P}/climate`, d: "A sustainability challenge for students." },
  { t: `${P} Nursing scholarship`, l: `https://feeds.example/${P}/nurses`, d: "Not an event at all." },
];
const rss = () => `<?xml version="1.0"?><rss version="2.0"><channel><title>${P} Desk</title>${feedItems.map((i) => `<item><title>${i.t}</title><link>${i.l}</link><guid>${i.l}</guid><pubDate>${new Date(now - DAY).toUTCString()}</pubDate><description><![CDATA[${i.d}]]></description></item>`).join("")}</channel></rss>`;
const hackclub = () => JSON.stringify([
  { id: `${P}hc1`, name: `${P} Lake Hack`, website: `https://lake.example/${P}`, start: new Date(now + 30 * DAY).toISOString(), end: new Date(now + 31 * DAY).toISOString(), city: "Kampala", country: "Uganda", virtual: false },
  { id: `${P}hc2`, name: `${P} Old Hack`, website: `https://old.example/${P}`, start: new Date(now - 5 * DAY).toISOString(), end: new Date(now - 4 * DAY).toISOString(), virtual: true },
]);
const FEED_PORT = 9996, FEED = `http://localhost:${FEED_PORT}`;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/feed.xml")) { res.writeHead(200, { "content-type": "application/rss+xml" }); res.end(rss()); }
  else if (req.url.startsWith("/hackclub.json")) { res.writeHead(200, { "content-type": "application/json" }); res.end(hackclub()); }
  else if (req.url.startsWith("/page.html")) { res.writeHead(200, { "content-type": "text/html" }); res.end("<html><body>not a feed</body></html>"); }
  else { res.writeHead(500); res.end("broken"); }
}).listen(FEED_PORT);

const admin = await person("admin"), ama = await person("ama"), ben = await person("ben"), cat = await person("cat");
sql(`UPDATE users SET is_platform_admin = 1 WHERE email = '${admin.email}'`);
await ama("/follows/topics", "PUT", { topics: ["fintech", "climate"] });
await ben("/follows/topics", "PUT", { topics: ["fintech"] });
await ben("/inbox/settings", "PUT", { global_events: false });
{
  const s = (await ben("/inbox/settings")).d;
  ok("global event notes can be switched off without touching push", s.global_events === false && s.push === true, s);
  await ben("/inbox/settings", "PUT", { push: false });
  const s2 = (await ben("/inbox/settings")).d;
  ok("the two switches are independent", s2.global_events === false && s2.push === false, s2);
}

// ---- suggestions ----
const sug = { title: `${P} Health Datathon`, url: `https://datathon.example/${P}`, summary: "Two days of health data.", topics: ["health", "ai"], deadline_at: now + 10 * DAY, starts_at: now + 14 * DAY, ends_at: now + 16 * DAY, location: "Nairobi", organizer: "Data Lab" };
ok("signed out cannot suggest", (await fetch(`${U}/api/events/suggest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sug) })).status === 401);
ok("a suggestion needs a real link", (await ama("/events/suggest", "POST", { ...sug, url: "javascript:alert(1)" })).s === 400);
ok("an event that is over is refused", (await ama("/events/suggest", "POST", { ...sug, deadline_at: now - DAY, starts_at: null, ends_at: null })).s === 400);
const s1 = await ama("/events/suggest", "POST", sug);
ok("someone suggests an event and it waits for review", s1.s === 201 && s1.d.pending === true, s1);
const slug1 = s1.d.slug;
ok("it is not public yet", (await anon(`/events/${slug1}`)).s === 404 && !(await anon("/events?limit=60")).d.events.some((e) => e.slug === slug1));
ok("the person who suggested it can see it and its state", (await ama(`/events/${slug1}`)).s === 200 && (await ama("/events/mine")).d.events.some((e) => e.slug === slug1 && e.state === "pending"));
ok("someone else cannot see it", (await cat(`/events/${slug1}`)).s === 404);
ok("the same link cannot be suggested twice", (await cat("/events/suggest", "POST", sug)).s === 409);
ok("platform admins are told", (await titles(admin)).includes(`Global event suggested: ${sug.title}`));
ok("the review queue is closed to everyone else", (await ama("/platform/events")).s === 404);
const q1 = (await admin("/platform/events")).d.items.find((e) => e.slug === slug1);
ok("it shows in the queue with who sent it", q1 && q1.submitter.email === ama.email, q1);

// an admin fixes the wording, then approves
ok("an admin can edit a listing", (await admin(`/platform/events/${q1.id}`, "PUT", { ...sug, title: `${P} Health Datathon 2027` })).s === 200);
ok("approving", (await admin(`/platform/events/${q1.id}/approve`, "POST")).s === 200);
const pub1 = await anon(`/events/${slug1}`);
ok("it is public with its official link", pub1.s === 200 && pub1.d.event.url === sug.url && pub1.d.event.title === `${P} Health Datathon 2027` && pub1.d.event.over === false, pub1);
ok("it is in the list", (await anon("/events?limit=60")).d.events.some((e) => e.slug === slug1 && e.source === "Suggested by the community" && e.host === "datathon.example"));
ok("topic and search filters", (await anon(`/events?topic=health&q=${P}`)).d.events.some((e) => e.slug === slug1) && !(await anon(`/events?topic=energy&q=${P}`)).d.events.length && !(await anon(`/events?q=${P}zzz`)).d.events.length);
ok("the suggester is told it was listed", (await titles(ama)).includes(`Listed: ${P} Health Datathon 2027`));
ok("approving twice is refused", (await admin(`/platform/events/${q1.id}/approve`, "POST")).s === 409);

// a suggestion in a followed topic reaches followers, not the people who switched it off
const s2 = await cat("/events/suggest", "POST", { title: `${P} Payments Sprint`, url: `https://sprint.example/${P}`, topics: ["fintech"], deadline_at: now + 2.5 * DAY });
const q2 = (await admin("/platform/events")).d.items.find((e) => e.slug === s2.d.slug);
await admin(`/platform/events/${q2.id}/approve`, "POST");
ok("people who follow the topic get a note", (await inbox(ama)).some((n) => n.title === `New global event: ${P} Payments Sprint` && n.link === `/events/${s2.d.slug}`));
ok("people who switched global events off do not", !(await titles(ben)).some((t) => t.includes("Payments Sprint")));
ok("the person who suggested it is not told about their own event twice", (await titles(cat)).filter((t) => t.includes("Payments Sprint")).length === 1);

// rejecting a suggestion
const s3 = await cat("/events/suggest", "POST", { title: `${P} Totally real prize`, url: `https://scam.example/${P}`, topics: [] });
const q3 = (await admin("/platform/events")).d.items.find((e) => e.slug === s3.d.slug);
ok("rejecting with a note", (await admin(`/platform/events/${q3.id}/reject`, "POST", { note: "This is not an event." })).s === 200);
ok("a rejected event never goes public", (await anon(`/events/${s3.d.slug}`)).s === 404);
ok("the suggester sees why", (await inbox(cat)).some((n) => n.title === `Not listed: ${P} Totally real prize` && n.body === "This is not an event."));
ok("a rejected link cannot be suggested again", (await ama("/events/suggest", "POST", { title: `${P} Totally real prize`, url: `https://scam.example/${P}` })).s === 409);

// a platform admin's own suggestion goes straight up
const s4 = await admin("/events/suggest", "POST", { title: `${P} Admin Pick`, url: `https://pick.example/${P}`, topics: ["climate"], starts_at: now + 40 * DAY });
ok("an admin's own event is listed at once", s4.s === 201 && s4.d.pending === false && (await anon(`/events/${s4.d.slug}`)).s === 200, s4);

// the daily limit
{
  const dan = await person("dan");
  let last;
  for (let i = 0; i < 6; i++) last = await dan("/events/suggest", "POST", { title: `${P} Flood ${i}`, url: `https://flood.example/${P}/${i}` });
  ok("suggestions are limited to five a day", last.s === 429, last);
  sql(`DELETE FROM external_events WHERE url LIKE 'https://flood.example/${P}/%'`);
}

// ---- sources ----
const canFeed = (await admin("/platform/sources/preview", "POST", { kind: "rss", url: `${FEED}/feed.xml` })).s === 200;
if (!canFeed) console.log("SKIP sources: add EVENT_FEED_TEST_HOST=localhost:9996 to .dev.vars and restart wrangler dev");
else {
  ok("sources are closed to everyone else", (await ama("/platform/sources")).s === 404);
  const pv = await admin("/platform/sources/preview", "POST", { kind: "rss", url: `${FEED}/feed.xml`, keywords: "hackathon, challenge", topics: [] });
  ok("previewing a feed shows what it would bring, filtered by keyword", pv.s === 200 && pv.d.count === 2 && pv.d.items[0].title === `${P} Fintech Hackathon` && pv.d.items[0].topics.includes("fintech") && pv.d.items[0].deadline_at > now, pv);
  ok("a page that is not a feed is refused", (await admin("/platform/sources/preview", "POST", { kind: "rss", url: `${FEED}/page.html` })).s === 400);
  ok("a broken source is refused", (await admin("/platform/sources/preview", "POST", { kind: "rss", url: `${FEED}/nope` })).s === 400);
  for (const bad of ["http://example.org/feed", "https://localhost/feed", "https://127.0.0.1/x", "file:///etc/passwd"]) {
    const r = await admin("/platform/sources", "POST", { name: "Bad", kind: "rss", url: bad });
    ok(`a source at ${bad} is refused`, r.s === 400, r);
  }
  const add = await admin("/platform/sources", "POST", { name: `${P} Desk`, kind: "rss", url: `${FEED}/feed.xml?${P}`, keywords: "hackathon, challenge", topics: [], auto_publish: false });
  ok("adding a source", add.s === 201, add);
  ok("the same source cannot be added twice", (await admin("/platform/sources", "POST", { name: "Again", kind: "rss", url: `${FEED}/feed.xml?${P}` })).s === 409);
  const f1 = await admin(`/platform/sources/${add.d.id}/fetch`, "POST");
  ok("reading it brings the matching items into the queue", f1.s === 200 && f1.d.ok && f1.d.added === 2, f1);
  const queue = (await admin("/platform/events")).d.items.filter((e) => e.title.startsWith(P));
  const fin = queue.find((e) => e.title === `${P} Fintech Hackathon`);
  ok("feed items wait for review and carry no markup", queue.length === 2 && fin && !/[<>]|alert/.test(fin.description) && fin.source === `${P} Desk`, queue);
  ok("nothing from an unreviewed source is public", !(await anon(`/events?q=${P}`)).d.events.some((e) => e.title === `${P} Fintech Hackathon`));
  ok("admins are told how many are waiting", (await titles(admin)).includes("2 global events are waiting for review"));
  ok("reading it again adds nothing", (await admin(`/platform/sources/${add.d.id}/fetch`, "POST")).d.added === 0);
  const clim = queue.find((e) => e.title === `${P} Climate Challenge`);
  await admin(`/platform/events/${clim.id}/reject`, "POST", {});
  ok("a rejected feed item stays rejected after the next read", (await admin(`/platform/sources/${add.d.id}/fetch`, "POST")).d.added === 0 && !(await admin("/platform/events")).d.items.some((e) => e.id === clim.id));
  const many = await admin("/platform/events/approve", "POST", { ids: [fin.id, clim.id] });
  ok("approving a batch only takes the ones still waiting", many.s === 200 && many.d.approved === 1, many);
  ok("the approved feed item is public", (await anon(`/events?q=${P}`)).d.events.some((e) => e.title === `${P} Fintech Hackathon` && e.source === `${P} Desk`));

  // a trusted source publishes on its own, through the hourly job, and skips events that are already over
  const hc = await admin("/platform/sources", "POST", { name: `${P} Hack Club`, kind: "hackclub", url: `${FEED}/hackclub.json?${P}`, topics: ["education"], auto_publish: true });
  ok("adding a trusted source", hc.s === 201, hc);
  const cam = await person("cam");
  await cam("/follows/topics", "PUT", { topics: ["education"] });
  await cron();
  const lake = (await anon(`/events?q=${P}`)).d.events.find((e) => e.title === `${P} Lake Hack`);
  ok("the hourly job reads sources and lists a trusted one's events", lake && lake.location === "Kampala, Uganda" && lake.topics.includes("education"), lake);
  ok("an event that is already over is not brought in", !rows(`SELECT 1 AS x FROM external_events WHERE title = '${P} Old Hack'`).length);
  ok("followers of the topic hear about it once", (await titles(cam)).filter((t) => t.includes("Lake Hack") || t.includes("new global events")).length === 1);
  const st = (await admin("/platform/sources")).d.sources.find((s) => s.id === hc.d.id);
  ok("the source shows when it was last read and what it brought", st && st.last_fetched_at > now - 60000 && /1 new/.test(st.last_status) && st.listed === 1, st);
  await cron();
  ok("a source is not read again within six hours", (await admin("/platform/sources")).d.sources.find((s) => s.id === hc.d.id).last_fetched_at === st.last_fetched_at);
  ok("pausing a source", (await admin(`/platform/sources/${hc.d.id}`, "PUT", { name: `${P} Hack Club`, kind: "hackclub", url: `${FEED}/hackclub.json?${P}`, topics: ["education"], auto_publish: true, enabled: false })).s === 200);
  ok("removing a source keeps its events", (await admin(`/platform/sources/${hc.d.id}`, "DELETE")).s === 200 && (await anon(`/events/${lake.slug}`)).d.event.source === `${P} Hack Club`);
  await admin(`/platform/sources/${add.d.id}`, "DELETE");
}

// ---- saved ----
ok("signed out cannot save", (await fetch(`${U}/api/saved/events/${slug1}`, { method: "PUT" })).status === 401);
ok("saving a global event", (await ama(`/saved/events/${slug1}`, "PUT")).s === 200 && (await ama(`/events/${slug1}`)).d.saved === true);
ok("saving twice is fine", (await ama(`/saved/events/${slug1}`, "PUT")).s === 200);
ok("an unknown event cannot be saved", (await ama("/saved/events/nope-nope", "PUT")).s === 404);
const ORG = `${P}-org`;
await admin("/orgs", "POST", { name: `Org ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
const mk = await admin(`/orgs/${ORG}/challenges`, "POST", { title: `${P} Build Week` });
const CH = mk.d.slug;
const chBody = { title: `${P} Build Week`, summary: "A week of building.", description: "Build things.", status: "open", team_min: 1, team_max: 4, applications_close_at: now + 2.5 * DAY, pitch_due_at: now + 9 * DAY, topics: ["ai"], questions: [] };
ok("a verified organisation publishes a challenge", (await admin(`/orgs/${ORG}/challenges/${CH}`, "PUT", chBody)).s === 200);
ok("a draft cannot be saved", (await ama(`/saved/challenges/${ORG}/nope`, "PUT")).s === 404);
ok("saving a challenge", (await ama(`/saved/challenges/${ORG}/${CH}`, "PUT")).s === 200 && (await ama(`/orgs/${ORG}/challenges/${CH}`)).d.saved === true);
ok("someone else has not saved it", (await cat(`/orgs/${ORG}/challenges/${CH}`)).d.saved === false && (await anon(`/orgs/${ORG}/challenges/${CH}`)).d.saved === false);
{
  const list = (await ama("/saved")).d;
  ok("the saved list has both kinds", list.challenges.some((c) => c.slug === CH && c.org.slug === ORG) && list.events.some((e) => e.slug === slug1), list);
  ok("someone else's list is their own", (await cat("/saved")).d.challenges.length === 0);
}
// reminders for saved things
await cat(`/saved/challenges/${ORG}/${CH}`, "PUT");
await cat(`/orgs/${ORG}/challenges/${CH}/team`, "POST", { name: `${P} Cats` });
await ama(`/saved/events/${s2.d.slug}`, "PUT");
await cron();
{
  const t = await titles(ama);
  ok("a saved challenge reminds people who have no team yet", t.includes(`Applications close in 3 days: ${P} Build Week`), t);
  ok("a saved global event reminds too", t.includes(`Closes in 3 days: ${P} Payments Sprint`), t);
  ok("someone already in a team is not reminded as a saver", !(await inbox(cat)).some((n) => n.kind === "saved.3d" && n.title.includes("Build Week")));
  await cron();
  ok("reminders are sent once", (await titles(ama)).filter((x) => x === `Closes in 3 days: ${P} Payments Sprint`).length === 1);
}
ok("removing a saved challenge", (await ama(`/saved/challenges/${ORG}/${CH}`, "DELETE")).s === 200 && (await ama(`/orgs/${ORG}/challenges/${CH}`)).d.saved === false);

// ---- calendar files ----
{
  const cal = await anon(`/events/${slug1}/calendar.ics`);
  ok("a global event gives a calendar file with its deadline and its dates", cal.s === 200 && cal.type.startsWith("text/calendar") && cal.d.includes(`SUMMARY:Deadline: ${P} Health Datathon 2027`) && cal.d.includes("LOCATION:Nairobi") && (cal.d.match(/BEGIN:VEVENT/g) ?? []).length === 2, cal);
  const cc = await anon(`/orgs/${ORG}/challenges/${CH}/calendar.ics`);
  ok("a challenge gives a calendar file with its deadlines", cc.s === 200 && cc.d.includes(`SUMMARY:Applications close: ${P} Build Week`) && cc.d.includes(`SUMMARY:Pitch due: ${P} Build Week`), cc);
  ok("a pending event has no calendar file", (await ama(`/events/${s3.d.slug}/calendar.ics`)).s === 404);
}

// ---- reports ----
ok("signed out cannot report", (await fetch(`${U}/api/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "event", slug: slug1, reason: "spam" }) })).status === 401);
ok("a report needs a reason from the list", (await ama("/reports", "POST", { kind: "event", slug: slug1, reason: "boring" })).s === 400);
ok("reporting something that does not exist", (await ama("/reports", "POST", { kind: "event", slug: "nope-nope", reason: "spam" })).s === 404);
const before = (await titles(admin)).filter((t) => t.startsWith("Reported:")).length;
ok("reporting a global event", (await ama("/reports", "POST", { kind: "event", slug: s4.d.slug, reason: "scam", details: "Asks for a fee." })).s === 200);
ok("reporting the same thing twice counts once", (await ama("/reports", "POST", { kind: "event", slug: s4.d.slug, reason: "scam" })).d.already === true);
await cat("/reports", "POST", { kind: "event", slug: s4.d.slug, reason: "wrong" });
ok("admins are told once per reported thing", (await titles(admin)).filter((t) => t.startsWith("Reported:")).length === before + 1);
ok("reports are closed to everyone else", (await ama("/platform/reports")).s === 404);
{
  const g = (await admin("/platform/reports")).d.items.find((i) => i.kind === "event" && i.title === `${P} Admin Pick`);
  ok("the console groups reports by what was reported", g && g.reports.length === 2 && g.reports.some((r) => r.details === "Asks for a fee." && r.reporter === ama.email) && g.link === `/events/${s4.d.slug}`, g);
  await ama(`/saved/events/${s4.d.slug}`, "PUT");
  ok("taking a reported event down", (await admin("/platform/reports/resolve", "POST", { kind: "event", item_id: g.item_id, action: "takedown" })).s === 200);
  ok("it is gone from the public list and from saved lists", (await anon(`/events/${s4.d.slug}`)).s === 404 && !(await ama("/saved")).d.events.some((e) => e.slug === s4.d.slug));
  ok("its reports are settled", !(await admin("/platform/reports")).d.items.some((i) => i.item_id === g.item_id));
}
await ama("/reports", "POST", { kind: "challenge", org: ORG, slug: CH, reason: "offensive", details: "Rude text." });
{
  const g = (await admin("/platform/reports")).d.items.find((i) => i.kind === "challenge" && i.title === `${P} Build Week`);
  ok("a reported challenge shows with its organiser", g && g.where === `Challenge by Org ${P}` && g.link === `/o/${ORG}/c/${CH}`, g);
  ok("dismissing leaves the challenge up", (await admin("/platform/reports/resolve", "POST", { kind: "challenge", item_id: g.item_id, action: "dismiss" })).s === 200 && (await anon(`/orgs/${ORG}/challenges/${CH}`)).s === 200);
  await cat("/reports", "POST", { kind: "challenge", org: ORG, slug: CH, reason: "spam" });
  ok("taking a challenge down needs a note for the organiser", (await admin("/platform/reports/resolve", "POST", { kind: "challenge", item_id: g.item_id, action: "takedown" })).s === 400);
  ok("taking a reported challenge down", (await admin("/platform/reports/resolve", "POST", { kind: "challenge", item_id: g.item_id, action: "takedown", note: "Remove the rude text." })).s === 200);
  ok("it is off the public site", (await anon(`/orgs/${ORG}/challenges/${CH}`)).s === 404 && !(await anon(`/challenges?q=${P}`)).d.challenges.length);
  const mine = (await admin(`/orgs/${ORG}/challenges/${CH}`)).d.challenge;
  ok("the organiser sees it as a draft with the note", mine.status === "draft" && mine.review_state === "rejected" && mine.review_note === "Remove the rude text.", mine);
  sql(`UPDATE organizations SET verified = 0 WHERE slug = '${ORG}'`);
  const again = await admin(`/orgs/${ORG}/challenges/${CH}`, "PUT", chBody);
  ok("publishing it again goes back through review", again.s === 200 && again.d.pending === true && (await anon(`/orgs/${ORG}/challenges/${CH}`)).s === 404, again);
  ok("the take-down is in the activity log", (await admin("/platform/audit")).d.items.some((a) => a.action === "challenge.taken_down"));
}
{
  const st = (await admin("/platform/stats")).d;
  ok("the overview counts global events and reports", typeof st.pending_events === "number" && typeof st.global_events === "number" && typeof st.open_reports === "number", st);
}

// ---- an event that is over drops out of the list but keeps its page ----
sql(`UPDATE external_events SET deadline_at = ${now - DAY}, starts_at = NULL, ends_at = NULL WHERE slug = '${slug1}'`);
ok("a finished event leaves the list", !(await anon(`/events?q=${P}`)).d.events.some((e) => e.slug === slug1));
ok("its page stays and says it is over", (await anon(`/events/${slug1}`)).d.event.over === true);

// ---- deleting an account keeps the listings but forgets the person ----
{
  const gone = await person("gone");
  const g = await gone("/events/suggest", "POST", { title: `${P} Leaving Hack`, url: `https://leaving.example/${P}` });
  await gone(`/saved/events/${s2.d.slug}`, "PUT");
  await gone("/reports", "POST", { kind: "event", slug: s2.d.slug, reason: "other" });
  const id = gone.id();
  ok("deleting an account with suggestions, saves and reports", (await gone("/me", "DELETE", { confirm: gone.email })).s === 200);
  ok("nothing points at the deleted account", !rows(`SELECT 1 AS x FROM saved_items WHERE user_id = '${id}' UNION ALL SELECT 1 FROM reports WHERE reporter_user_id = '${id}' UNION ALL SELECT 1 FROM external_events WHERE submitted_by = '${id}'`).length && rows(`SELECT 1 AS x FROM external_events WHERE slug = '${g.d.slug}'`).length === 1);
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
