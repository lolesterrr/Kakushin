// What day 5 adds: full challenge pages, Explore search and paging, past winners, public profiles, the project gallery,
// the team finder and who's coming.
// Run: npx wrangler dev  (in one terminal), then: node tests/e2e/day5.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d5${Date.now().toString(36)}`;
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
    return { s: res.status, d };
  };
  call.email = email;
  call.cookie = `kk_session=${tok}`;
  call.put = async (path, file, type) => (await fetch(`${U}/api${path}`, { method: "PUT", headers: { "content-type": type, cookie: `kk_session=${tok}` }, body: fs.readFileSync(file) })).status;
  await call("/me", "PUT", { name: label[0].toUpperCase() + label.slice(1), skills: [] });
  return call;
}
const anon = async (path) => { const res = await fetch(`${U}/api${path}`); return { s: res.status, d: await res.json().catch(() => ({})) }; };
const cron = async () => { await fetch(`${U}/__scheduled?cron=${encodeURIComponent("0 * * * *")}`); await new Promise((r) => setTimeout(r, 1500)); };
const chId = (slug) => `(SELECT c.id FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug = '${ORG}' AND c.slug = '${slug}')`;
const inboxTitles = async (who) => (await who("/inbox")).d.items.map((n) => n.title);


const owner = await person("owner"), admin2 = await person("admin"), judge1 = await person("judge");
const lead = await person("lead"), seeker = await person("seeker"), other = await person("other");
const ORG = `${P}-hub`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
sql(`INSERT INTO memberships (org_id, user_id, role) SELECT o.id, u.id, 'admin' FROM organizations o, users u WHERE o.slug = '${ORG}' AND u.email = '${admin2.email}'`);
const WORD = `zq${P}`; // a word no other challenge has, for search
async function challenge(title, extra = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await owner(`/orgs/${ORG}/challenges`, "POST", { title });
  const r = await owner(`/orgs/${ORG}/challenges/${slug}`, "PUT", { title, summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY, ...extra });
  if (r.s !== 200) throw new Error(`challenge ${title}: ${JSON.stringify(r)}`);
  return slug;
}
const png = `${process.env.TMPDIR ?? "/tmp"}/kk-${P}.png`;
fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

// ---- 5A: full challenge pages ----
const C = await challenge(`Pages ${WORD}`, { summary: `Solar ${WORD} for schools`, team_min: 2, team_max: 4 });
const B = `/orgs/${ORG}/challenges/${C}`;
const up = await fetch(`${U}/api${B}/sponsor-logo`, { method: "PUT", headers: { "content-type": "image/png", cookie: "" }, body: fs.readFileSync(png) });
ok("a stranger cannot upload a sponsor logo", up.status === 401);
const logo = await (async () => { const r = await fetch(`${U}/api${B}/sponsor-logo`, { method: "PUT", headers: { "content-type": "image/png", cookie: owner.cookie }, body: fs.readFileSync(png) }); return r.json(); })();
ok("sponsor logo uploads into the challenge's folder", /^sponsors\/[a-f0-9]{20,32}\/[a-f0-9]{16}\.png$/.test(logo.logo_key ?? ""), logo);
ok("sponsor logo is served", (await fetch(`${U}${logo.logo_url}`)).status === 200);
const full = { title: `Pages ${WORD}`, summary: `Solar ${WORD} for schools`, description: "# Hello\n\n**Bold** <script>x</script>", status: "open", team_min: 2, team_max: 4, applications_close_at: now + 2 * DAY,
  rules: "- Be kind\n- Build something", faq: [{ q: "Who can apply?", a: "Anyone" }], sponsors: [{ name: "Acme", url: "https://acme.example", logo_key: logo.logo_key }],
  timeline: [{ label: "Demo day", at: now + 5 * DAY }, { label: "Info session", at: now + DAY }], show_judges: true };
ok("challenge page fields save", (await owner(B, "PUT", full)).s === 200);
const pub = (await anon(B)).d.challenge;
ok("rules, FAQ and sponsors come back", pub.rules === full.rules && pub.faq[0].q === "Who can apply?" && pub.sponsors[0].name === "Acme" && pub.sponsors[0].logo_url === logo.logo_url, pub);
ok("timeline is stored in date order", pub.timeline.map((x) => x.label).join() === "Info session,Demo day", pub.timeline);
ok("description is stored as written (the page renders it safely)", pub.description.includes("<script>"));
ok("a sponsor logo from elsewhere is refused", (await owner(B, "PUT", { ...full, sponsors: [{ name: "X", logo_key: "logos/0123456789abcdef.png" }] })).s === 400);
ok("javascript: sponsor links are refused", (await owner(B, "PUT", { ...full, sponsors: [{ name: "X", url: "javascript:alert(1)" }] })).s === 400);
ok("an older client without the new fields keeps them", (await owner(B, "PUT", { title: full.title, summary: full.summary, description: "d2", status: "open", team_min: 2, team_max: 4, applications_close_at: now + 2 * DAY })).s === 200
  && (await anon(B)).d.challenge.faq.length === 1);

// Judges appear only with a display name, and never with their email.
await owner(`${B}/judges`, "POST", { email: judge1.email });
ok("no judges listed before one adds a name", (await anon(B)).d.challenge.judges.length === 0);
ok("judge saves a display name", (await judge1(`/judge/${ORG}/${C}/profile`, "PUT", { display_name: "Dr Ada", title: "CTO, Example" })).s === 200);
const withJudge = await anon(B);
ok("judge shows on the page", withJudge.d.challenge.judges[0]?.name === "Dr Ada" && withJudge.d.challenge.judges[0]?.title === "CTO, Example", withJudge.d.challenge.judges);
ok("judge email is not on the page", !JSON.stringify(withJudge.d).includes(judge1.email));
await owner(B, "PUT", { ...full, show_judges: false });
ok("judges hide when the organiser turns the section off", (await anon(B)).d.challenge.judges.length === 0);
await owner(B, "PUT", full);

// Duplicate.
await owner(`${B}/criteria`, "PUT", { criteria: [{ name: "Impact", weight: 100, max_score: 10 }] });
await owner(`${B}/application-criteria`, "PUT", { criteria: [{ name: "Fit", weight: 100, max_score: 5 }] });
ok("a participant cannot duplicate", (await lead(`${B}/duplicate`, "POST")).s === 403);
const dup = await owner(`${B}/duplicate`, "POST");
ok("duplicate makes a new draft", dup.s === 201 && dup.d.slug !== C, dup);
const D = (await owner(`/orgs/${ORG}/challenges/${dup.d.slug}`)).d.challenge;
ok("the copy is a draft with dates cleared", D.status === "draft" && D.applications_close_at === null && D.pitch_due_at === null && D.timeline.length === 0, D);
ok("the copy has the text, FAQ and sponsors", D.rules === full.rules && D.faq.length === 1 && D.sponsors[0].name === "Acme" && D.sponsors[0].logo_key !== logo.logo_key, D.sponsors);
ok("the copy has both rubrics", rows(`SELECT stage FROM criteria WHERE challenge_id = ${chId(dup.d.slug)} ORDER BY stage`).map((r) => r.stage).join() === "application,pitch");
ok("the copy is hidden from the public", (await anon(`/orgs/${ORG}/challenges/${dup.d.slug}`)).s === 404);
ok("the copy can be deleted as a draft", (await owner(`/orgs/${ORG}/challenges/${dup.d.slug}`, "DELETE")).s === 200);

// Ownership transfer.
const mem = (await owner(`/orgs/${ORG}/members`)).d;
const adminId = mem.members.find((m) => m.email === admin2.email).id;
ok("an admin cannot take ownership", (await admin2(`/orgs/${ORG}/owner`, "POST", { user_id: adminId })).s === 403);
ok("only an admin can become owner", (await owner(`/orgs/${ORG}/owner`, "POST", { user_id: (await lead("/me")).d.user.id })).s === 404);
ok("owner hands over", (await owner(`/orgs/${ORG}/owner`, "POST", { user_id: adminId })).s === 200);
const roles = rows(`SELECT u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id JOIN organizations o ON o.id = m.org_id WHERE o.slug = '${ORG}'`);
ok("exactly one owner afterwards", roles.filter((r) => r.role === "owner").length === 1 && roles.find((r) => r.role === "owner").email === admin2.email, roles);
ok("new owner is told", (await inboxTitles(admin2)).some((t) => t.startsWith("You are now the owner")));
const ownerId = (await owner("/me")).d.user.id;
ok("and can hand it back", (await admin2(`/orgs/${ORG}/owner`, "POST", { user_id: ownerId })).s === 200);

// ---- 5B: Explore ----
const E2 = await challenge(`Second ${WORD}`, { team_min: 5, team_max: 6 });
const search = (await anon(`/challenges?q=${WORD}`)).d.challenges.map((c) => c.slug);
ok("search finds by title", search.includes(C) && search.includes(E2), search);
ok("search finds by summary", (await anon(`/challenges?q=solar%20${WORD}`)).d.challenges.map((c) => c.slug).join() === C);
ok("search finds by organisation", (await anon(`/challenges?q=${encodeURIComponent(`Hub ${P}`)}`)).d.challenges.length === 2);
ok("search treats % as a letter", (await anon(`/challenges?q=%25%25${WORD}`)).d.challenges.length === 0);
ok("team size filter", (await anon(`/challenges?q=${WORD}&size=5`)).d.challenges.map((c) => c.slug).join() === E2);
ok("newest first", (await anon(`/challenges?q=${WORD}&sort=newest`)).d.challenges[0].slug === E2);
const p1 = (await anon(`/challenges?q=${WORD}&limit=1`)).d;
const p2 = (await anon(`/challenges?q=${WORD}&limit=1&cursor=${p1.next}`)).d;
ok("paging: a cursor for the next page", p1.challenges.length === 1 && !!p1.next && p2.challenges.length === 1 && p2.challenges[0].slug !== p1.challenges[0].slug && p2.next === null, [p1, p2]);

// ---- 5B: team finder and who's coming ----
await lead(`${B}/team`, "POST", { name: "Leaders" });
const leadTeam = (await lead(`${B}/team`)).d.team;
ok("signed out: counts but no names", await (async () => { const r = (await anon(`${B}/people`)).d; return r.teams === 1 && r.participants === 1 && r.looking_list === null && r.people === null; })());
ok("seeker ticks looking for a team", (await seeker(`${B}/looking`, "PUT", { note: "I design things" })).s === 200);
ok("someone in a team cannot", (await lead(`${B}/looking`, "PUT", {})).s === 409);
const seen = (await other(`${B}/people`)).d;
const seekerId = (await seeker("/me")).d.user.id;
ok("signed in: sees who is looking, with the note", seen.looking_list.some((p) => p.id === seekerId && p.note === "I design things") && seen.participants === 2, seen);
ok("no emails in who's coming", !JSON.stringify(seen).includes("@example.com"));
ok("a non-lead cannot invite", (await other(`/teams/${leadTeam.id}/invite`, "POST", { user_id: seekerId })).s === 404);
ok("cannot invite someone who is not looking", (await lead(`/teams/${leadTeam.id}/invite`, "POST", { user_id: (await other("/me")).d.user.id })).s === 404);
const inv = await lead(`/teams/${leadTeam.id}/invite`, "POST", { user_id: seekerId });
ok("lead invites from the team finder", inv.s === 200 && inv.d.already === false, inv);
ok("a second invite is not sent twice", (await lead(`/teams/${leadTeam.id}/invite`, "POST", { user_id: seekerId })).d.already === true);
const note = (await seeker("/inbox")).d.items.find((n) => n.kind === "team.invite");
ok("invite lands in the inbox with the join link", note && note.link === `/join/${leadTeam.invite_code}`, note);
ok("joining takes them off the list", (await seeker("/teams/join", "POST", { code: leadTeam.invite_code })).s === 200 && (await other(`${B}/people`)).d.looking_list.every((p) => p.id !== seekerId));

ok("the lead applies with the new teammate", (await lead(`/teams/${leadTeam.id}/application`, "PUT", { answers: {} })).s === 200);

// ---- 5B: public profiles ----
ok("no handle yet means 404", (await anon(`/people/${P}-lead`)).s === 404);
ok("cannot go public without an address", (await lead("/me", "PUT", { name: "Lead", public_profile: true })).s === 400);
ok("reserved addresses are refused", (await lead("/me", "PUT", { name: "Lead", handle: "admin" })).s === 400);
ok("handle saves, still private", (await lead("/me", "PUT", { name: "Lead", handle: `${P}-lead`, bio: "Builder", skills: ["react"], links: { github: "https://github.com/x" } })).s === 200);
ok("a private profile is a 404", (await anon(`/people/${P}-lead`)).s === 404);
ok("someone else cannot take the same handle", (await other("/me", "PUT", { name: "Other", handle: `${P}-lead` })).s === 409);
await lead("/me", "PUT", { name: "Lead", bio: "Builder", skills: ["react"], handle: `${P}-lead`, public_profile: true });
const prof = await anon(`/people/${P}-lead`);
ok("a public profile shows", prof.s === 200 && prof.d.profile.name === "Lead" && prof.d.profile.bio === "Builder" && prof.d.profile.links.github === "https://github.com/x", prof.d);
ok("the profile never shows the email", !JSON.stringify(prof.d).includes("@"));
ok("past teams are listed, outcome hidden before results", prof.d.profile.teams[0]?.team === "Leaders" && prof.d.profile.teams[0]?.outcome === "taking part", prof.d.profile.teams);
ok("public profiles show in who's coming", (await other(`${B}/people`)).d.people.some((p) => p.handle === `${P}-lead`));
await lead("/me", "PUT", { name: "Lead", handle: null });
ok("clearing the address turns the profile off", (await anon(`/people/${P}-lead`)).s === 404 && rows(`SELECT public_profile FROM users WHERE email = '${lead.email}'`)[0].public_profile === 0);
await lead("/me", "PUT", { name: "Lead", handle: `${P}-lead`, public_profile: true });

// ---- 5B: past winners and the project gallery ----
ok("a team cannot show its project before it is a finalist", (await lead(`/teams/${leadTeam.id}/showcase`, "PUT", { show: true })).s === 409);
sql(`UPDATE teams SET status = 'winner', placement = 1 WHERE id = '${leadTeam.id}'`);
sql(`INSERT INTO submissions (id, team_id, video_url, demo_url, notes, updated_at) VALUES ('${P}sub', '${leadTeam.id}', 'https://video.example/x', 'https://demo.example', 'Our notes', ${now})`);
sql(`UPDATE challenges SET status = 'judging' WHERE id = ${chId(C)}`);
const pubRes = await owner(`${B}/results/publish`, "POST");
ok("results publish", pubRes.s === 200, pubRes);
const winners = (await anon("/challenges/winners?limit=30")).d.challenges;
const mine = winners.find((w) => w.slug === C);
ok("past winners lists the challenge with its winner", mine && mine.winners[0]?.team === "Leaders" && mine.winners[0]?.placement === 1, winners.slice(0, 2));
ok("newest results first", winners[0]?.slug === C);
ok("gallery is empty until the team opts in", (await anon(`${B}/gallery`)).d.projects.length === 0);
ok("only the lead chooses", (await seeker(`/teams/${leadTeam.id}/showcase`, "PUT", { show: true })).s === 403);
ok("lead shows the project", (await lead(`/teams/${leadTeam.id}/showcase`, "PUT", { show: true })).s === 200);
const gal = (await anon(`${B}/gallery`)).d.projects;
ok("gallery shows the project on the challenge", gal.length === 1 && gal[0].team === "Leaders" && gal[0].video_url === "https://video.example/x", gal);
ok("gallery shows on the organisation page", (await anon(`/orgs/${ORG}/gallery`)).d.projects.length === 1);
ok("profile shows the win and the certificate after results", await (async () => { const p = (await anon(`/people/${P}-lead`)).d.profile; return p.teams[0]?.outcome.startsWith("winner") && p.certificates.length === 1; })());

// ---- deleting an account clears its team finder rows ----
await other(`/orgs/${ORG}/challenges/${E2}/looking`, "PUT", { note: "bye" });
const del = await other("/me", "DELETE", { confirm: other.email });
ok("account delete still works and clears the team finder", del.s === 200 && rows(`SELECT COUNT(*) AS n FROM team_seekers WHERE challenge_id = ${chId(E2)}`)[0].n === 0, del);

fs.rmSync(png, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
