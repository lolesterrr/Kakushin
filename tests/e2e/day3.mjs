// What the day 3 mobile app reads: signed-out browsing, the organisation page, invite previews, results and team dates.
// Run: npx wrangler dev  (in one terminal), then: node tests/e2e/day3.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d3${Date.now().toString(36)}`;
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
  call.put = async (path, file, type) => (await fetch(`${U}/api${path}`, { method: "PUT", headers: { "content-type": type, cookie: `kk_session=${tok}` }, body: fs.readFileSync(file) })).status;
  await call("/me", "PUT", { name: label[0].toUpperCase() + label.slice(1), skills: [] });
  return call;
}
const anon = async (path) => { const res = await fetch(`${U}/api${path}`); return { s: res.status, d: await res.json().catch(() => ({})) }; };
const cron = async () => { await fetch(`${U}/__scheduled?cron=${encodeURIComponent("0 * * * *")}`); await new Promise((r) => setTimeout(r, 1500)); };
const chId = (slug) => `(SELECT c.id FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug = '${ORG}' AND c.slug = '${slug}')`;
const inboxTitles = async (who) => (await who("/inbox")).d.items.map((n) => n.title);

const owner = await person("owner"), alice = await person("alice"), bob = await person("bob");
const ORG = `${P}-hub`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
async function challenge(title, extra = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await owner(`/orgs/${ORG}/challenges`, "POST", { title });
  const r = await owner(`/orgs/${ORG}/challenges/${slug}`, "PUT", { title, summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY, ...extra });
  if (r.s !== 200) throw new Error(`challenge ${title}: ${JSON.stringify(r)}`);
  return slug;
}

// ---------- Signed out: browse, organisation page, no team ----------
const open = await challenge("Open Door", { topics: ["health"], pitch_due_at: now + 9 * DAY });
const orgPage = await anon(`/orgs/${ORG}`);
ok("anyone can read the organisation page", orgPage.s === 200 && orgPage.d.org?.slug === ORG && orgPage.d.role === null, orgPage);
ok("organisation page lists the open challenge", orgPage.d.challenges?.some((c) => c.slug === open && c.status === "open"), orgPage.d.challenges);
ok("anyone can read the challenge", (await anon(`/orgs/${ORG}/challenges/${open}`)).d.challenge?.slug === open);
ok("signed out has no team, without an error", JSON.stringify((await anon(`/orgs/${ORG}/challenges/${open}/team`)).d) === JSON.stringify({ team: null }));
ok("signed out reads an empty follow list", JSON.stringify((await anon("/follows")).d) === JSON.stringify({ orgs: [], topics: [] }));
ok("following needs an account", (await fetch(`${U}/api/follows/orgs/${ORG}`, { method: "PUT" })).status === 401);

// ---------- Invite link ----------
const made = await alice(`/orgs/${ORG}/challenges/${open}/team`, "POST", { name: "Alice Door" });
const team = (await alice(`/orgs/${ORG}/challenges/${open}/team`)).d.team;
ok("team carries a placement field", team && "placement" in team && team.placement === null, team);
const prev = await anon(`/teams/preview/${team.invite_code.toLowerCase()}`);
ok("invite preview works signed out, any case", prev.s === 200 && prev.d.team?.name === "Alice Door" && prev.d.team?.size === 1 && prev.d.team?.cslug === open, prev);
ok("join by the link's code", (await bob("/teams/join", "POST", { code: team.invite_code })).d.challenge === open, made);

// ---------- My teams: dates for phone reminders ----------
const mine = (await bob("/teams/mine")).d.teams?.find((t) => t.cslug === open);
ok("my teams has the deadlines", mine?.applications_close_at > now && mine?.pitch_due_at > now && mine?.cstatus === "open", mine);
ok("my teams says whether a pitch is in", mine?.has_pitch === false, mine);

// ---------- Results ----------
sql(`UPDATE teams SET status = 'winner', placement = 2 WHERE name = 'Alice Door' AND challenge_id = ${chId(open)}`);
ok("results stay hidden until published", JSON.stringify((await anon(`/orgs/${ORG}/challenges/${open}/public-results`)).d.winners) === "[]");
sql(`UPDATE challenges SET status = 'completed', results_published = 1 WHERE id = ${chId(open)}`);
const res = await anon(`/orgs/${ORG}/challenges/${open}/public-results`);
ok("published results list the winner and place", res.d.published === true && res.d.winners?.[0]?.team === "Alice Door" && res.d.winners[0].placement === 2, res.d);
ok("your team shows its place", (await bob(`/orgs/${ORG}/challenges/${open}/team`)).d.team?.placement === 2);
ok("my teams shows the place too", (await bob("/teams/mine")).d.teams?.find((t) => t.cslug === open)?.placement === 2);

console.log(`\n${failed ? "FAILED" : "ALL PASS"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
