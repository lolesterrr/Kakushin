// Builds the presentation dataset through the real API: five organisations with logos, nine challenges with covers
// at every stage (open, reviewing, judging, completed), teams, pitch decks, scores, winners and certificates.
//
//   Local:       node scripts/demo/seed-demo.mjs                 (needs `npm run dev`)
//   Production:  node scripts/demo/seed-demo.mjs --live
//   Remove:      node scripts/demo/seed-demo.mjs [--live] --cleanup
//
// Running it again wipes the previous demo first. Demo people use @example.com addresses (they cannot receive mail).
// Images and decks come from scripts/demo/media (make them again with scripts/demo/make-media.mjs).
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHALLENGES, JUDGES, ORGS, PEOPLE, QUESTIONS, slugOf } from "./data.mjs";

const live = process.argv.includes("--live");
const U = live ? "https://kakushin.dpdns.org" : "http://localhost:8787";
const where = live ? "--remote" : "--local";
const MEDIA = path.join(path.dirname(fileURLToPath(import.meta.url)), "media");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OWNER_EMAIL = "kajjabantu@gmail.com"; // gets admin access to every demo organisation so the demo can be driven from a real account
const DAY = 86400000;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const emailOf = (name) => `demo-${slugify(name)}@example.com`;
const sql = (q) => execSync(`npx wrangler d1 execute kakushin ${where} --json --command "${q.replace(/"/g, '\\"')}"`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).toString();
const rows = (q) => JSON.parse(sql(q))[0].results;

// ---------- cleanup ----------
async function cleanup() {
  const slugs = [...ORGS.map((o) => o.slug), "kampala-demo-hub", "dryrun-hub"].map((s) => `'${s}'`).join(",");
  const keys = rows(`SELECT logo_key AS k FROM organizations WHERE slug IN (${slugs}) AND logo_key IS NOT NULL
    UNION SELECT logo_print_key FROM organizations WHERE slug IN (${slugs}) AND logo_print_key IS NOT NULL
    UNION SELECT cover_key FROM challenges WHERE cover_key IS NOT NULL AND org_id IN (SELECT id FROM organizations WHERE slug IN (${slugs}))
    UNION SELECT deck_key FROM submissions WHERE deck_key IS NOT NULL AND team_id IN (SELECT t.id FROM teams t JOIN challenges c ON c.id = t.challenge_id JOIN organizations o ON o.id = c.org_id WHERE o.slug IN (${slugs}))
    UNION SELECT pdf_key FROM certificates WHERE pdf_key IS NOT NULL AND challenge_id IN (SELECT c.id FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug IN (${slugs}))`.replace(/\s+/g, " ")).map((r) => r.k);
  sql(`DELETE FROM organizations WHERE slug IN (${slugs})`);
  sql(`DELETE FROM users WHERE email LIKE 'demo-%@example.com' OR email LIKE 'dryrun-%@example.com'`);
  sql(`DELETE FROM login_tokens WHERE email LIKE 'demo-%@example.com'`);
  for (const k of keys) { try { execSync(`npx wrangler r2 object delete kakushin-files/${k} ${where}`, { cwd: ROOT, stdio: "ignore" }); } catch { /* already gone */ } }
  console.log(`removed demo data (${keys.length} stored files)`);
}
if (process.argv.includes("--cleanup")) { await cleanup(); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };
const log = (m) => console.log(m);
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// ---------- people ----------
const owners = Object.fromEntries(ORGS.map((o) => [o.key, o.owner]));
const everyone = [...new Set([...Object.values(owners), ...PEOPLE, ...JUDGES])];
const now = Date.now();
log(`Seeding ${U}`);
await cleanup();
{
  const values = everyone.map((n) => `('${crypto.createHash("sha256").update(`${emailOf(n)}:123456`).digest("hex")}', 'code', '${emailOf(n)}', ${now + 3600000})`);
  for (let i = 0; i < values.length; i += 20) sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ${values.slice(i, i + 20).join(",")}`);
}
const sessions = {};
async function signIn(name) {
  let r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailOf(name), code: "123456" }) });
  // Sign-in is rate limited per IP, so wait and retry when many people sign in at once.
  for (let i = 0; r.status === 429 && i < 12; i++) { await new Promise((ok) => setTimeout(ok, 10000)); r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailOf(name), code: "123456" }) }); }
  const tok = /kk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
  if (!tok) throw new Error(`could not sign in ${name}: ${r.status}`);
  const call = async (p, method = "GET", json) => {
    const res = await fetch(`${U}/api${p}`, { method, headers: { "content-type": "application/json", cookie: `kk_session=${tok}` }, body: json === undefined ? undefined : JSON.stringify(json) });
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: res.status, d };
  };
  call.putWithCookie = async (p, file, type, extra = {}) => (await fetch(`${U}/api${p}`, { method: "PUT", headers: { "content-type": type, "X-File-Name": path.basename(file), cookie: `kk_session=${tok}`, ...extra }, body: fs.readFileSync(file) })).status;
  call.email = emailOf(name);
  sessions[name] = call;
  await call("/me", "PUT", { name, bio: "", institution: "", location: "Kampala", skills: [], links: {}, gender: null });
  return call;
}
for (let i = 0; i < everyone.length; i += 6) await Promise.all(everyone.slice(i, i + 6).map(signIn));
log(`${everyone.length} people signed in`);

// ---------- organisations ----------
for (const o of ORGS) {
  const host = sessions[o.owner];
  const r = await host("/orgs", "POST", { name: o.name, slug: o.slug, type: o.type, website: o.website });
  ok(`org ${o.slug}`, r.s === 201 || r.s === 200, r);
  sql(`UPDATE organizations SET verified = 1 WHERE slug = '${o.slug}'`);
  ok(`logo ${o.slug}`, (await host.putWithCookie(`/orgs/${o.slug}/logo`, path.join(MEDIA, "logos", `${o.key}.png`), "image/png")) === 200);
  // The JPEG copy certificates print, which the web app makes in the browser when an organiser uploads a logo.
  ok(`print logo ${o.slug}`, (await host.putWithCookie(`/orgs/${o.slug}/logo/print`, path.join(MEDIA, "logos-print", `${o.key}.jpg`), "image/jpeg")) === 200);
}
log("organisations ready");

// ---------- challenges ----------
const CREDITS = fs.existsSync(path.join(MEDIA, "credits.json")) ? JSON.parse(fs.readFileSync(path.join(MEDIA, "credits.json"), "utf8")) : {};
const orgOf = Object.fromEntries(ORGS.map((o) => [o.key, o]));
const MARKS = [[9, 8, 9], [8, 7, 8], [7, 8, 6], [6, 5, 7], [5, 6, 5]];
let k = 0;
for (const ch of CHALLENGES) {
  const org = orgOf[ch.org], host = sessions[org.owner], slug = slugOf(ch.title), O = `/orgs/${org.slug}`, C = `${O}/challenges/${slug}`;
  await host(`${O}/challenges`, "POST", { title: ch.title });
  const put = await host(C, "PUT", {
    title: ch.title, summary: ch.summary, description: ch.description, prizes: ch.prizes, status: "open", team_min: 1, team_max: 3, topics: ch.topics, questions: QUESTIONS,
    applications_open_at: now - 20 * DAY, applications_close_at: now + (9 + ((k * 7) % 24)) * DAY,
  });
  ok(`challenge ${slug}`, put.s === 200, put);
  // Openly licensed photos (with credits) when present, otherwise the drawn illustrations.
  const photo = path.join(MEDIA, "covers-photo", `${slug}.jpg`), cr = CREDITS[slug];
  const useIllustration = !fs.existsSync(photo) || !cr;
  ok(`cover ${slug}`, (await host.putWithCookie(`${C}/cover`, useIllustration ? path.join(MEDIA, "covers", `${slug}.jpg`) : photo, "image/jpeg", useIllustration ? {} : { "X-Cover-Credit": JSON.stringify(cr) })) === 200);
  const qs = (await host(C)).d.challenge?.questions ?? (await host(C)).d.questions ?? [];

  // teams
  const teams = [];
  for (let i = 0; i < ch.teams.length; i++) {
    const [name, idea] = ch.teams[i];
    const lead = sessions[PEOPLE[(k * 5 + i * 2) % PEOPLE.length]];
    const mate = i % 2 === 0 ? sessions[PEOPLE[(k * 5 + i * 2 + 1) % PEOPLE.length]] : null;
    const r = await lead(`${C}/team`, "POST", { name });
    if (r.s !== 201) { ok(`team ${name}`, false, r); continue; }
    const mine = (await lead(`${C}/team`)).d; const t = mine.team ?? mine;
    if (mate) ok(`join ${name}`, (await mate("/teams/join", "POST", { code: t.invite_code })).s === 200);
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.type === "choice" ? ["Kampala", "Wakiso", "Mukono", "Gulu", "Mbarara"][i % 5] : idea]));
    ok(`apply ${name}`, (await lead(`/teams/${t.id}/application`, "PUT", { answers })).s === 200);
    teams.push({ id: t.id, name, idea, lead, i });
  }
  ch.runtime = { teams, host, C, O, slug, org };

  const status = (ids, s) => host(`${C}/applications/status`, "POST", { team_ids: ids, status: s });
  const idsOf = (a) => teams.filter((t) => a.includes(t.i)).map((t) => t.id);
  const finish = async (n, deckCount) => {
    const fin = teams.slice(0, n);
    await status(teams.map((t) => t.id), "shortlisted");
    await status(fin.map((t) => t.id), "finalist");
    for (const t of fin) {
      const deck = path.join(MEDIA, "decks", `${slug}-${t.i}.pdf`);
      ok(`pitch ${t.name}`, (await t.lead(`/teams/${t.id}/pitch`, "PUT", { video_url: "https://example.com/video", demo_url: "https://example.com/demo", notes: `${t.idea} We tested it with real users and learned what to fix first.` })).s === 200);
      if (t.i < deckCount && fs.existsSync(deck)) ok(`deck ${t.name}`, (await t.lead.putWithCookie(`/teams/${t.id}/pitch/deck`, deck, "application/pdf")) === 200);
    }
    ok(`criteria ${slug}`, (await host(`${C}/criteria`, "PUT", { criteria: [
      { name: "Impact", description: "Does it help real people?", weight: 40, max_score: 10 },
      { name: "Feasibility", description: "Could it be built and sold?", weight: 35, max_score: 10 },
      { name: "Pitch", description: "Clear, honest and well presented", weight: 25, max_score: 10 }] })).s === 200);
    return fin;
  };
  const score = async (fin, judgeNames, onlyTeams) => {
    const view = (await sessions[judgeNames[0]](`/judge/${org.slug}/${slug}`)).d; const crit = view.criteria;
    for (const [ji, jn] of judgeNames.entries()) for (const t of fin.slice(0, onlyTeams ?? fin.length)) {
      const base = MARKS[t.i % MARKS.length];
      const r = await sessions[jn](`/judge/${org.slug}/${slug}/teams/${t.id}/scores`, "PUT", { scores: crit.map((c, n) => ({ criterion_id: c.id, score: Math.max(2, Math.min(10, base[n] - (ji === 1 && t.i % 2 ? 1 : 0) + (ji === 2 && t.i === 1 ? 1 : 0))), comment: n === 0 && ji === 0 ? ["Clear need and a believable path to impact.", "Strong demo, rough on pricing.", "Good idea, needs more user evidence."][t.i % 3] : "" })) });
      if (r.s !== 200) ok(`score ${t.name}`, false, r);
    }
  };
  const judgeSet = [JUDGES[k % 5], JUDGES[(k + 1) % 5], JUDGES[(k + 2) % 5]];

  if (ch.stage === "open") {
    await status(idsOf([0, 1]), "shortlisted");
  } else if (ch.stage === "reviewing") {
    await status(idsOf([0, 1, 2]), "shortlisted"); await status(idsOf([4]), "rejected");
    ok(`reviewing ${slug}`, (await host(`${C}/status`, "PUT", { status: "reviewing" })).s === 200);
  } else if (ch.stage === "judging") {
    const fin = await finish(4, 4);
    for (const j of [...judgeSet.slice(0, 2)]) await host(`${C}/judges`, "POST", { email: emailOf(j) });
    await host(`${C}/judges`, "POST", { email: OWNER_EMAIL });
    ok(`judging ${slug}`, (await host(`${C}/status`, "PUT", { status: "judging" })).s === 200);
    await score(fin, judgeSet.slice(0, 2), 3); // two judges are part-way through; the owner has not started
  } else if (ch.stage === "completed") {
    const fin = await finish(3, 3);
    for (const j of judgeSet) await host(`${C}/judges`, "POST", { email: emailOf(j) });
    ok(`judging ${slug}`, (await host(`${C}/status`, "PUT", { status: "judging" })).s === 200);
    await score(fin, judgeSet);
    const lb = (await host(`${C}/leaderboard`)).d.leaderboard ?? [];
    const placements = lb.filter((r) => r.total !== null).slice(0, 3).map((r, n) => ({ team_id: fin.find((t) => t.name === r.name)?.id, placement: n + 1 }));
    ok(`placements ${slug}`, placements.length === 3 && placements.every((p) => p.team_id) && (await host(`${C}/results`, "PUT", { placements })).s === 200, placements);
    const pub = await host(`${C}/results/publish`, "POST");
    ok(`publish ${slug}`, pub.s === 200 && pub.d.certificates > 0, pub);
    ok(`completed ${slug}`, (await host(`${C}/status`, "PUT", { status: "completed" })).s === 200);
  }
  // Past stages happened in the past.
  if (ch.stage !== "open") sql(`UPDATE challenges SET applications_open_at = ${now - 70 * DAY}, applications_close_at = ${now - (ch.stage === "completed" ? 35 : ch.stage === "judging" ? 12 : 4) * DAY} WHERE slug = '${slug}' AND org_id = (SELECT id FROM organizations WHERE slug = '${org.slug}')`);
  log(`${ch.stage.padEnd(9)} ${ch.title} (${teams.length} teams)`);
  k++;
}

// ---------- followers and announcements ----------
for (const [n, name] of PEOPLE.entries()) {
  const p = sessions[name];
  await p(`/follows/orgs/${ORGS[n % ORGS.length].slug}`, "PUT");
  if (n % 2 === 0) await p(`/follows/orgs/${ORGS[(n + 2) % ORGS.length].slug}`, "PUT");
}
const notes = [
  ["climate", "Demo day is on 28 November", "Finalists present live at the Kampala Climate Lab. Bring a friend."],
  ["uni", "Mentor office hours this week", "Book a 20-minute slot with a mentor before your deadline."],
  ["agri", "New buyers joined the market challenge", "Three cooperatives now accept pitches from teams."],
  ["health", "Clinic partners confirmed for pilots", "Winning teams will pilot in three health centres."],
  ["fintech", "Sandbox access opens next week", "Teams get test accounts with two mobile-money providers."],
];
for (const [key, title, body] of notes) ok(`announce ${key}`, (await sessions[orgOf[key].owner](`/orgs/${orgOf[key].slug}/announcements`, "POST", { title, body })).s === 200);

// ---------- your own access ----------
sql(`INSERT OR IGNORE INTO memberships (org_id, user_id, role) SELECT o.id, u.id, 'admin' FROM organizations o, users u WHERE u.email = '${OWNER_EMAIL}' AND o.slug IN (${ORGS.map((o) => `'${o.slug}'`).join(",")})`);

const c = rows("SELECT (SELECT COUNT(*) FROM organizations) AS orgs, (SELECT COUNT(*) FROM challenges) AS challenges, (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM certificates) AS certificates, (SELECT COUNT(*) FROM users) AS users")[0];
console.log(`\n${fail === 0 ? "DONE" : "DONE WITH PROBLEMS"}: ${pass} checks ok, ${fail} failed. Database now holds ${JSON.stringify(c)}`);
process.exit(fail ? 1 : 0);
