// Full dry run of a hackathon, from posting the challenge to certificates, through the public API.
// It removes everything it created when it finishes (use --keep to leave it for inspection). For presentation data see scripts/demo/seed-demo.mjs.
//
//   Local:      node scripts/dryrun.mjs                     (needs `npm run dev` running)
//   Production: node scripts/dryrun.mjs --live              (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
//   Remove:     node scripts/dryrun.mjs --live --cleanup    (only needed after --keep or a crash)
//
// People are signed in by writing one-time codes straight into the database, so no email is sent. All demo accounts use
// @example.com addresses, which cannot receive mail, so nobody can sign in as them by accident.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const live = process.argv.includes("--live");
const cleanup = process.argv.includes("--cleanup");
const U = live ? "https://kakushin.kajjabantu.workers.dev" : "http://localhost:8787";
const D = "dryrun";
const SLUG = "dryrun-hub";
const where = live ? "--remote" : "--local";
const sql = (q) => execSync(`npx wrangler d1 execute kakushin ${where} --json --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const email = (l) => `${D}-${l}@example.com`;

if (cleanup) {
  sql(`DELETE FROM organizations WHERE slug = '${SLUG}'`);
  sql(`DELETE FROM users WHERE email LIKE '${D}-%@example.com'`);
  sql(`DELETE FROM login_tokens WHERE email LIKE '${D}-%@example.com'`);
  console.log("demo data removed");
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };
const t0 = Date.now();

async function person(label, name) {
  const em = email(label);
  sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ('${crypto.createHash("sha256").update(`${em}:123456`).digest("hex")}', 'code', '${em}', ${Date.now() + 600000})`);
  let r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: em, code: "123456" }) });
  // Sign-in is rate limited per IP, so wait and retry when many people sign in at once.
  for (let i = 0; r.status === 429 && i < 12; i++) { await new Promise((ok) => setTimeout(ok, 10000)); r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: em, code: "123456" }) }); }
  const tok = /kk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
  if (!tok) throw new Error(`could not sign in ${em}: ${r.status}`);
  const call = async (path, method = "GET", json, raw) => {
    const res = await fetch(`${U}/api${path}`, { method, headers: { "content-type": "application/json", cookie: `kk_session=${tok}` }, body: json === undefined ? undefined : JSON.stringify(json) });
    if (raw) return res;
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: res.status, d };
  };
  call.email = em;
  if (name) await call("/me", "PUT", { name, bio: "", institution: "Demo University", location: "Kampala", skills: [], links: {}, gender: null });
  return call;
}

console.log(`Dry run against ${U}`);
// ---------- 1. An organiser sets up ----------
const host = await person("host", "Demo Host");
const mk = await host("/orgs", "POST", { name: "Kampala Demo Hub", slug: SLUG, type: "hub", website: "https://example.org" });
ok("organisation created", mk.s === 201 || mk.s === 200 || mk.s === 409, mk);
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${SLUG}'`);
const O = `/orgs/${SLUG}`;

async function challenge(title, extra = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
  await host(`${O}/challenges`, "POST", { title });
  const r = await host(`${O}/challenges/${slug}`, "PUT", {
    title, summary: "Design a cleaner, cheaper way to cook for households that still rely on charcoal.",
    description: "Teams of two to four build a working prototype and pitch it to a panel of judges.\n\nYou will be scored on impact, feasibility and the quality of your pitch.",
    prizes: "UGX 10M seed fund, mentorship and a place in the next cohort", status: "open", team_min: 1, team_max: 3, topics: ["climate", "energy"],
    questions: [{ label: "What problem will you solve?", type: "short_text", required: true, options: [] }, { label: "Which district will you pilot in?", type: "choice", required: false, options: ["Kampala", "Wakiso", "Mukono", "Other"] }],
    applications_open_at: Date.now() - 86400000, applications_close_at: Date.now() + 14 * 86400000, ...extra,
  });
  return { slug, r };
}
const done = await challenge("Clean Cookstoves Challenge");
ok("challenge published (verified org skips review)", done.r.s === 200, done.r);
const C = `${O}/challenges/${done.slug}`;
ok("anyone can see it", (await fetch(`${U}/api${C}`)).status === 200);
ok("it appears in explore", JSON.stringify(await (await fetch(`${U}/api/challenges`)).json()).includes("Clean Cookstoves"));

// ---------- 2. Participants form teams and apply ----------
const qs = (await host(C)).d.challenge?.questions ?? (await host(C)).d.questions ?? [];
const answers = Object.fromEntries(qs.map((q) => [q.id, q.type === "choice" ? "Kampala" : "Charcoal costs households a third of their income, and the smoke makes children ill."]));
const leads = [];
const teamNames = ["Moto Moto", "Kuni Clean", "Sunbeam Stoves", "Green Hearth", "Ash & Ember"];
for (let i = 0; i < teamNames.length; i++) {
  const p = await person(`lead${i}`, ["Amina Okello", "Brian Mukasa", "Carol Nakato", "David Ssemwogerere", "Esther Atim"][i]);
  const r = await p(`${C}/team`, "POST", { name: teamNames[i] });
  if (r.s !== 201) console.log("team create", r);
  const mine = (await p(`${C}/team`)).d;
  const team = mine.team ?? mine;
  leads.push({ p, id: team.id ?? (await p("/teams/mine")).d.teams[0].id, code: team.invite_code });
}
ok("five teams exist", leads.every((l) => l.id));
// A second member joins the first team with its invite code.
const buddy = await person("member0", "Grace Namuli");
const joined = await buddy("/teams/join", "POST", { code: leads[0].code });
ok("teammate joins with invite code", joined.s === 200, joined);
ok("one team too small/large is refused", (await buddy(`${C}/team`, "POST", { name: "Second Team" })).s === 409);
for (const l of leads) { const r = await l.p(`/teams/${l.id}/application`, "PUT", { answers }); ok(`application sent (${l.id.slice(0, 4)})`, r.s === 200, r); }
ok("late joiner refused once applied", (await (await person("late", "Late Joiner"))("/teams/join", "POST", { code: leads[1].code })).s === 409);

// ---------- 3. The organiser reviews ----------
const apps = (await host(`${C}/applications`)).d;
ok("organiser sees five applications", apps.applications?.length === 5, apps);
const ids = leads.map((l) => l.id);
ok("shortlist four", (await host(`${C}/applications/status`, "POST", { team_ids: ids.slice(0, 4), status: "shortlisted" })).d.updated === 4);
ok("reject one", (await host(`${C}/applications/status`, "POST", { team_ids: [ids[4]], status: "rejected" })).d.updated === 1);
ok("shortlisted applicant is told", (await leads[0].p("/inbox")).d.items.some((i) => i.kind === "application.shortlisted"));
ok("rejected applicant is told", (await leads[4].p("/inbox")).d.items.some((i) => i.kind === "application.rejected"));
ok("three finalists", (await host(`${C}/applications/status`, "POST", { team_ids: ids.slice(0, 3), status: "finalist" })).d.updated === 3);

// ---------- 4. Pitches and judging ----------
for (let i = 0; i < 3; i++) ok(`pitch saved (${teamNames[i]})`, (await leads[i].p(`/teams/${ids[i]}/pitch`, "PUT", { video_url: "https://example.com/video", demo_url: "https://example.com/demo", notes: `${teamNames[i]} built a stove that halves charcoal use.` })).s === 200);
ok("criteria set", (await host(`${C}/criteria`, "PUT", { criteria: [
  { name: "Impact", description: "Does it help real households?", weight: 40, max_score: 10 },
  { name: "Feasibility", description: "Could it be built and sold?", weight: 35, max_score: 10 },
  { name: "Pitch", description: "Clear, honest and well presented", weight: 25, max_score: 10 }] })).s === 200);
const judges = [await person("judge1", "Dr. Judith Auma"), await person("judge2", "Peter Kato")];
for (const j of judges) ok("judge invited", (await host(`${C}/judges`, "POST", { email: j.email })).s === 200);
ok("scoring is closed until judging starts", (await judges[0](`/judge/${SLUG}/${done.slug}/teams/${ids[0]}/scores`, "PUT", { scores: [{ criterion_id: "x", score: 1 }] })).s === 409);
ok("judging started", (await host(`${C}/status`, "PUT", { status: "judging" })).s === 200);
const view = (await judges[0](`/judge/${SLUG}/${done.slug}`)).d;
const crit = view.criteria;
ok("judge sees three finalists and criteria", view.teams?.length === 3 && crit?.length === 3, view);
const marks = [[9, 8, 9], [7, 8, 6], [5, 6, 7]]; // team 0 is best, 2 is weakest
for (const [ji, j] of judges.entries()) for (let t = 0; t < 3; t++) {
  const r = await j(`/judge/${SLUG}/${done.slug}/teams/${ids[t]}/scores`, "PUT", { scores: crit.map((c, k) => ({ criterion_id: c.id, score: Math.min(10, marks[t][k] - (ji && t === 1 ? 1 : 0)), comment: ji ? "" : "Strong demo." })) });
  if (r.s !== 200) ok("scored", false, r);
}
const lb = (await host(`${C}/leaderboard`)).d.leaderboard;
ok("leaderboard ranks Moto Moto first", lb?.[0]?.name === teamNames[0] || lb?.[0]?.team === teamNames[0], lb);
ok("a participant cannot score", (await leads[1].p(`/judge/${SLUG}/${done.slug}/teams/${ids[0]}/scores`, "PUT", { scores: crit.map((c) => ({ criterion_id: c.id, score: 10 })) })).s >= 400);

// ---------- 5. Results and certificates ----------
ok("publish needs placements", (await host(`${C}/results/publish`, "POST")).s === 409);
ok("placements saved", (await host(`${C}/results`, "PUT", { placements: ids.slice(0, 3).map((id, i) => ({ team_id: id, placement: i + 1 })) })).s === 200);
const pub = await host(`${C}/results/publish`, "POST");
ok("results published, certificates issued", pub.s === 200 && pub.d.certificates === 5, pub) // 3 winning teams (4 people) + 1 shortlisted participant;
ok("publishing twice issues nothing new", (await host(`${C}/results/publish`, "POST")).d.certificates === pub.d.certificates);
const res = (await fetch(`${U}/api${C}/public-results`).then((r) => r.json()));
ok("public results page has winners", res.published && res.winners?.length === 3, res);
const mine = (await leads[0].p("/certificates/mine")).d.certificates;
ok("winner has a certificate", mine.length === 1 && /1st/i.test(mine[0].title), mine);
const code = mine[0].code;
ok("certificate verifies publicly", (await fetch(`${U}/api/certificates/${code}`).then((r) => r.json())).valid === true);
const pdf = await leads[0].p(`/certificates/${code}/pdf`, "GET", undefined, true);
const bytes = Buffer.from(await pdf.arrayBuffer());
ok("certificate PDF downloads", pdf.status === 200 && bytes.slice(0, 5).toString() === "%PDF-", pdf.status);
fs.writeFileSync(new URL("./dryrun-certificate.pdf", import.meta.url), bytes);
ok("teammate also gets one", (await buddy("/certificates/mine")).d.certificates.length === 1);
ok("rejected team gets none", (await leads[4].p("/certificates/mine")).d.certificates.length === 0);
ok("judges do not get participant certificates", (await judges[0]("/certificates/mine")).d.certificates.length === 0);
ok("results notification arrived", (await leads[2].p("/inbox")).d.items.some((i) => i.kind === "results.published"));

// ---------- 6. Announcements and a second, open challenge ----------
await leads[0].p(`/follows/orgs/${SLUG}`, "PUT");
ok("organiser announces to followers", (await host(`${O}/announcements`, "POST", { title: "Applications open for the next challenge", body: "Closing in two weeks." })).d.recipients >= 1);
const next = await challenge("Solar Water Pumps Challenge", { topics: ["energy", "agritech"] });
ok("second challenge published", next.r.s === 200, next.r);
const bell = (await leads[0].p("/inbox")).d.items.map((i) => i.kind);
ok("followers are told about the new challenge", bell.includes("challenge.new") && bell.includes("announcement"), bell);

if (!process.argv.includes("--keep")) {
  sql(`DELETE FROM organizations WHERE slug = '${SLUG}'`);
  sql(`DELETE FROM users WHERE email LIKE '${D}-%@example.com'`);
  sql(`DELETE FROM login_tokens WHERE email LIKE '${D}-%@example.com'`);
}
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed in ${Math.round((Date.now() - t0) / 1000)}s (${U})`);
process.exit(fail ? 1 : 0);
