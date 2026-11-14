// What day 7 adds: multi-round challenges and the impact report.
// Run: npx wrangler dev  (in one terminal), then: node tests/e2e/day7.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d7${Date.now().toString(36)}`;
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

const owner = await person("owner"), j1 = await person("jone");
const people = [];
for (const n of ["ann", "ben", "cat", "dee", "eve", "fay"]) people.push(await person(n));
const ORG = `${P}-hub`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
const C = "three-rounds";
await owner(`/orgs/${ORG}/challenges`, "POST", { title: "Three Rounds" });
await owner(`/orgs/${ORG}/challenges/${C}`, "PUT", { title: "Three Rounds", summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY });
const B = `/orgs/${ORG}/challenges/${C}`;
const teamOf = {};
for (const [i, who] of people.entries()) {
  const name = `Team${i}`;
  await who(`${B}/team`, "POST", { name });
  const t = (await who(`${B}/team`)).d.team;
  teamOf[name] = t.id;
  await who(`/teams/${t.id}/application`, "PUT", { answers: {} });
}
sql(`UPDATE users SET gender = 'female' WHERE email LIKE '${P}-%' AND email NOT LIKE '%owner%' AND email NOT LIKE '%jone%' AND email NOT LIKE '%fay%'`);
await owner(`${B}/applications/status`, "POST", { team_ids: Object.values(teamOf), status: "finalist" });
await owner(`${B}/criteria`, "PUT", { criteria: [{ name: "Idea", weight: 100, max_score: 10 }] });
await owner(`${B}/judges`, "POST", { email: j1.email });

// ---------- rounds ----------
ok("round names save", (await owner(`${B}/rounds`, "PUT", { rounds: ["Idea round", "Build round", "Demo day"] })).s === 200);
ok("only admins see rounds", (await people[0](`${B}/rounds`)).s === 403);
ok("cannot advance before judging", (await owner(`${B}/rounds/advance`, "POST", { team_ids: [teamOf.Team0] })).s === 409);
await owner(`${B}/status`, "PUT", { status: "judging" });
const J = `/judge/${ORG}/${C}`;
const r1 = (await j1(J)).d;
ok("judge sees the round label", r1.challenge.round === "Round 1 of 3: Idea round", r1.challenge);
ok("round 1 has every finalist", r1.teams.length === 6);
const c1 = r1.criteria[0].id;
for (const [i, id] of Object.values(teamOf).entries()) await j1(`${J}/teams/${id}/scores`, "PUT", { scores: [{ criterion_id: c1, score: i + 1 }] });
ok("round 1 leaderboard is full", (await owner(`${B}/leaderboard`)).d.leaderboard.filter((r) => r.total !== null).length === 6);
const adv = await owner(`${B}/rounds/advance`, "POST", { team_ids: [teamOf.Team4, teamOf.Team5, teamOf.Team3] });
ok("three teams go through", adv.s === 200 && adv.d.current === 2 && adv.d.advanced === 3, adv);
const rs = (await owner(`${B}/rounds`)).d;
ok("round 2 and back to reviewing", rs.current === 2 && rs.status === "reviewing");
const crit2 = (await owner(`${B}/criteria`)).d.criteria;
ok("round 2 starts with a copy of the rubric", crit2.length === 1 && crit2[0].id !== c1 && crit2[0].name === "Idea");
ok("round 2 rubric can change before judging", (await owner(`${B}/criteria`, "PUT", { criteria: [{ name: "Build", weight: 60 }, { name: "Demo", weight: 40 }] })).s === 200);
ok("public page shows the current round's rubric", (await anon(`/orgs/${ORG}/challenges/${C}`)).d.challenge.criteria.map((x) => x.name).join() === "Build,Demo");
const lb2 = (await owner(`${B}/leaderboard`)).d.leaderboard;
ok("round 2 leaderboard has only the teams that went through, with no scores yet", lb2.length === 3 && lb2.every((r) => r.total === null), lb2);
await owner(`${B}/status`, "PUT", { status: "judging" });
const r2 = (await j1(J)).d;
ok("judge sees round 2 and its teams", r2.challenge.round === "Round 2 of 3: Build round" && r2.teams.length === 3 && r2.criteria.length === 2 && r2.teams.every((t) => !t.done));
ok("a team that did not go through cannot be scored", (await j1(`${J}/teams/${teamOf.Team0}/scores`, "PUT", { scores: [{ criterion_id: r2.criteria[0].id, score: 5 }] })).s === 404);
ok("cannot remove rounds already reached", (await owner(`${B}/rounds`, "PUT", { rounds: ["Only"] })).s === 409);
ok("undo before anyone scores", (await owner(`${B}/rounds/back`, "POST")).d.current === 1);
ok("round 1 scores come back", (await owner(`${B}/leaderboard`)).d.leaderboard.filter((r) => r.total !== null).length === 6);
await owner(`${B}/rounds/advance`, "POST", { team_ids: [teamOf.Team5, teamOf.Team4] });
await owner(`${B}/status`, "PUT", { status: "judging" });
const r2b = (await j1(J)).d;
await j1(`${J}/teams/${teamOf.Team5}/scores`, "PUT", { scores: r2b.criteria.map((c) => ({ criterion_id: c.id, score: 3 })) });
ok("no undo once a round is scored", (await owner(`${B}/rounds/back`, "POST")).s === 409);

// ---------- impact report ----------
ok("only admins see the impact report", (await people[0](`/orgs/${ORG}/impact`)).s === 403);
const imp = (await owner(`/orgs/${ORG}/impact`)).d;
ok("impact totals", imp.totals.people === 6 && imp.totals.teams === 6 && imp.totals.finalists === 6 && imp.challenges.length === 1, imp.totals);
ok("one small group is never left visible", JSON.stringify(imp.gender) === JSON.stringify([{ label: "Smaller groups", count: 6 }]), imp.gender);
const csv = await (await fetch(`${U}/api/orgs/${ORG}/impact.csv`)).status;
ok("CSV needs sign in", csv === 401);

console.log(`\n${failed ? "SOME FAILED" : "ALL PASS"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
