// What day 4 adds: fair judging (assignments, conflicts, blind review, calibration, normalised ranking), the application rubric and group messages.
// Run: npx wrangler dev  (in one terminal), then: node tests/e2e/day4.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d4${Date.now().toString(36)}`;
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

const owner = await person("owner"), rev = await person("rev");
const alice = await person("alice"), bob = await person("bob"), carol = await person("carol"), dan = await person("dan");
const j1 = await person("jone"), j2 = await person("jtwo"), j3 = await person("jthree");
const ORG = `${P}-hub`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
// A second organisation admin, to show every admin scores applications on their own.
sql(`INSERT INTO memberships (org_id, user_id, role) SELECT o.id, u.id, 'admin' FROM organizations o, users u WHERE o.slug = '${ORG}' AND u.email = '${rev.email}'`);
async function challenge(title, extra = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await owner(`/orgs/${ORG}/challenges`, "POST", { title });
  const r = await owner(`/orgs/${ORG}/challenges/${slug}`, "PUT", { title, summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY, ...extra });
  if (r.s !== 200) throw new Error(`challenge ${title}: ${JSON.stringify(r)}`);
  return slug;
}
const C = await challenge("Fair Play");
const B = `/orgs/${ORG}/challenges/${C}`;
const teamOf = {};
for (const [who, name] of [[alice, "Alpha"], [bob, "Bravo"], [carol, "Charlie"], [dan, "Delta"]]) {
  await who(`${B}/team`, "POST", { name });
  const t = (await who(`${B}/team`)).d.team;
  teamOf[name] = t.id;
  if (name === "Delta") await j3("/teams/join", "POST", { code: t.invite_code }); // a judge who is also on a team
  const a = await who(`/teams/${t.id}/application`, "PUT", { answers: {} });
  if (a.s !== 200) throw new Error(`apply ${name}: ${JSON.stringify(a)}`);
}
const nameOf = Object.fromEntries(Object.entries(teamOf).map(([n, id]) => [id, n]));

// ---------- 4B: application rubric ----------
ok("application rubric must add up to 100", (await owner(`${B}/application-criteria`, "PUT", { criteria: [{ name: "Idea", weight: 50 }] })).s === 400);
ok("application rubric saves", (await owner(`${B}/application-criteria`, "PUT", { criteria: [{ name: "Idea", weight: 60, max_score: 10 }, { name: "Team", weight: 40, max_score: 10 }] })).s === 200);
ok("only organisation admins see the application rubric", (await alice(`${B}/application-criteria`)).s === 403);
const acrit = (await owner(`${B}/application-criteria`)).d.criteria;
ok("pitch rubric does not include application criteria", (await owner(`${B}/criteria`)).d.criteria.length === 0);
ok("public page does not show the application rubric", (await anon(B)).d.challenge.criteria.length === 0);
const score = (who, team, a, b) => who(`${B}/applications/${teamOf[team]}/scores`, "PUT", { scores: [{ criterion_id: acrit[0].id, score: a }, { criterion_id: acrit[1].id, score: b }] });
ok("score above the max is refused", (await score(owner, "Alpha", 11, 5)).s === 400);
await score(owner, "Alpha", 9, 9); await score(owner, "Bravo", 5, 5); await score(owner, "Charlie", 7, 7); await score(owner, "Delta", 3, 3);
await score(rev, "Alpha", 7, 7);
ok("a participant cannot score applications", (await alice(`${B}/applications/${teamOf.Bravo}/scores`, "PUT", { scores: [{ criterion_id: acrit[0].id, score: 1 }] })).s === 403);
const apps = (await owner(`${B}/applications`)).d;
const appOf = (n) => apps.applications.find((a) => a.name === n);
ok("list shows the average and the number of reviewers", appOf("Alpha").review.average === 80 && appOf("Alpha").review.reviewers === 2, appOf("Alpha").review);
ok("list shows my own scores", appOf("Alpha").review.mine.length === 2 && appOf("Bravo").review.average === 50);
ok("list carries the application rubric", apps.criteria.length === 2);
const csvOwner = await owner(`${B}/applications.csv`);
ok("CSV has the review average", typeof csvOwner.d === "string" && csvOwner.d.includes("Review average") && csvOwner.d.includes(",80,2,"), String(csvOwner.d).slice(0, 300));

// ---------- 4B: group messages ----------
await owner(`${B}/applications/status`, "POST", { team_ids: [teamOf.Alpha, teamOf.Charlie], status: "shortlisted" });
await owner(`${B}/applications/status`, "POST", { team_ids: [teamOf.Bravo], status: "rejected" });
const reach = (await owner(`${B}/messages`)).d.reach;
ok("reach counts each audience", reach.applied === 5 && reach.shortlisted === 2 && reach.not_selected === 1 && reach.finalists === 0, reach);
const send = (audience, title, extra = {}) => owner(`${B}/messages`, "POST", { audience, title, body: "Hello there", ...extra });
const m1 = await send("shortlisted", "Next steps");
ok("message to the shortlist reaches 2", m1.s === 200 && m1.d.recipients === 2, m1);
const got = async (who, t) => (await who("/inbox")).d.items.find((n) => n.title === `Fair Play: ${t}`);
const am = await got(alice, "Next steps");
ok("shortlisted team gets it in the inbox, linking to the challenge", am && am.link === `/o/${ORG}/c/${C}` && am.kind === "challenge.message", am);
ok("rejected team does not get the shortlist message", !(await got(bob, "Next steps")));
ok("not selected reaches the rejected team", (await send("not_selected", "Thanks")).d.recipients === 1 && !!(await got(bob, "Thanks")) && !(await got(alice, "Thanks")));
ok("one team reaches its members only", (await send("team", "Just you", { team_id: teamOf.Delta })).d.recipients === 2 && !!(await got(j3, "Just you")) && !(await got(carol, "Just you")));
ok("one team needs a team", (await send("team", "Nobody")).s === 400);
ok("a team from another challenge is refused", (await send("team", "Elsewhere", { team_id: "nope" })).s === 404);
ok("everyone who applied reaches all 5", (await send("applied", "All of you")).d.recipients === 5);
ok("an empty audience is refused", (await send("finalists", "Nobody yet")).s === 409);
ok("participants cannot send messages", (await alice(`${B}/messages`, "POST", { audience: "applied", title: "Spam", body: "x" })).s === 403);
ok("group messages are not follower announcements", (await owner(`/orgs/${ORG}/announcements`)).d.items.length === 0);
for (let i = 0; i < 6; i++) await send("applied", `Bulk ${i}`);
const over = await send("applied", "One too many");
ok("10 messages a day per challenge", over.s === 429 && (await owner(`${B}/messages`)).d.left_today === 0, over);

// ---------- 4A: judging set-up ----------
await owner(`${B}/applications/status`, "POST", { team_ids: Object.values(teamOf), status: "finalist" });
await owner(`${B}/criteria`, "PUT", { criteria: [{ name: "Overall", weight: 100, max_score: 10 }] });
const pcrit = (await owner(`${B}/criteria`)).d.criteria[0];
ok("pitch rubric is the public rubric", (await anon(B)).d.challenge.criteria.length === 1);
for (const j of [j1, j2, j3]) await owner(`${B}/judges`, "POST", { email: j.email });
await owner(`${B}/status`, "PUT", { status: "judging" });
const J = `/judge/${ORG}/${C}`;
const list = async (who) => (await who(J)).d.teams.map((t) => nameOf[t.id]).sort();
ok("without assignments a judge sees every finalist", JSON.stringify(await list(j1)) === JSON.stringify(["Alpha", "Bravo", "Charlie", "Delta"]));
ok("blind review is off by default", (await owner(`${B}/assignments`)).d.blind_judging === false);
const tv = await j1(`${J}/teams/${teamOf.Alpha}`);
ok("judges see member names when blind review is off", tv.d.blind === false && tv.d.team.members.length === 1 && tv.d.team.members[0].name === "Alice", tv.d.team);
await owner(`${B}/judging/settings`, "PUT", { blind_judging: true });
const tb = await j1(`${J}/teams/${teamOf.Delta}`);
ok("blind review hides members from judges", tb.d.blind === true && tb.d.team.members.length === 0 && tb.d.team.name === "Delta" && !JSON.stringify(tb.d).includes("Dan"), tb.d);
await owner(`${B}/judging/settings`, "PUT", { blind_judging: false });

// ---------- 4A: conflict of interest ----------
const sc = (who, team, s) => who(`${J}/teams/${teamOf[team]}/scores`, "PUT", { scores: [{ criterion_id: pcrit.id, score: s }] });
await sc(j1, "Delta", 9);
ok("conflict is accepted", (await j1(`${J}/teams/${teamOf.Delta}/conflict`, "POST")).s === 200);
ok("the team leaves the judge's list", !(await list(j1)).includes("Delta"));
ok("the judge cannot open or score it any more", (await j1(`${J}/teams/${teamOf.Delta}`)).s === 404 && (await sc(j1, "Delta", 9)).s === 404);
ok("judge challenge list counts 3 teams", (await j1("/judge/challenges")).d.challenges.find((c) => c.slug === C)?.teams === 3);
const lb0 = (await owner(`${B}/leaderboard`)).d.leaderboard.find((r) => r.name === "Delta");
ok("the judge's scores for it are removed", lb0.judges.find((j) => j.judge === j1.email).total === null, lb0);
const av0 = (await owner(`${B}/assignments`)).d;
ok("organiser sees the conflict flag", av0.teams.find((t) => t.name === "Delta").conflicts.includes(j1.email), av0.teams);
ok("organisers are told in their inbox", (await inboxTitles(owner)).includes("A judge knows a team: Fair Play"));
ok("a conflicted judge cannot be assigned to that team", (await owner(`${B}/assignments`, "POST", { email: j1.email, team_id: teamOf.Delta })).s === 409);

// ---------- 4A: assignments ----------
const auto = await owner(`${B}/assignments/auto`, "POST", { per_team: 2 });
const av = (await owner(`${B}/assignments`)).d;
const on = (t) => av.teams.find((x) => x.name === t).judges;
ok("auto-assign reports teams it could not fill", auto.s === 200 && JSON.stringify(auto.d.short) === JSON.stringify(["Delta"]), auto.d);
ok("auto-assign never gives a judge their own team or a conflict", on("Delta").length === 1 && on("Delta")[0] === j2.email, on("Delta"));
ok("auto-assign gives the other teams 2 judges", ["Alpha", "Bravo", "Charlie"].every((t) => on(t).length === 2), av.teams);
const loads = [j1, j2, j3].map((j) => av.teams.filter((t) => t.judges.includes(j.email)).length).sort();
ok("auto-assign spreads the load", JSON.stringify(loads) === "[2,2,3]", loads);
ok("auto-assign stores the number per team", av.judges_per_team === 2 && av.has_assignments === true);
// Some judge is left off one of Alpha, Bravo or Charlie (3 teams x 2 judges over 3 free judges).
const gap = [j1, j2, j3].flatMap((j) => ["Alpha", "Bravo", "Charlie"].filter((t) => !on(t).includes(j.email)).map((t) => ({ j, t })))[0];
const mine = await list(gap.j);
ok("a judge sees only assigned teams", mine.length === av.teams.filter((t) => t.judges.includes(gap.j.email)).length && !mine.includes(gap.t), mine);
ok("an unassigned team is hidden from the judge", (await gap.j(`${J}/teams/${teamOf[gap.t]}`)).s === 404 && (await sc(gap.j, gap.t, 5)).s === 404);
ok("organiser adds one judge to one team", (await owner(`${B}/assignments`, "POST", { email: gap.j.email, team_id: teamOf[gap.t] })).s === 200 && (await list(gap.j)).includes(gap.t));
ok("organiser removes one judge from one team", (await owner(`${B}/assignments`, "DELETE", { email: gap.j.email, team_id: teamOf[gap.t] })).s === 200 && !(await list(gap.j)).includes(gap.t));
ok("only finalists can be assigned", (await owner(`${B}/assignments`, "POST", { email: j1.email, team_id: "nope" })).s === 400);
ok("judges cannot change assignments", (await j1(`${B}/assignments/auto`, "POST", {})).s === 403);
ok("clearing assignments shows every team again", (await owner(`${B}/assignments/all`, "DELETE")).s === 200 && (await list(j2)).length === 4);

// ---------- 4A: calibration and normalised ranking ----------
// j1 is generous, j2 and j3 strict. Delta only has j2 (j1 knows it, j3 is on it), who rates it well for them.
for (const [t, s] of [["Alpha", 10], ["Bravo", 9], ["Charlie", 8]]) await sc(j1, t, s);
for (const [t, s] of [["Alpha", 6], ["Bravo", 5], ["Charlie", 4], ["Delta", 7]]) await sc(j2, t, s);
for (const [t, s] of [["Alpha", 6], ["Bravo", 5], ["Charlie", 4]]) await sc(j3, t, s);
ok("a judge still cannot score their own team", (await sc(j3, "Delta", 10)).s === 403);
const lb = (await owner(`${B}/leaderboard`)).d.leaderboard;
const row = (n) => lb.find((r) => r.name === n);
ok("raw ranking puts Alpha first", row("Alpha").rank === 1 && row("Delta").rank === 2, lb.map((r) => [r.name, r.rank, r.total]));
ok("normalised ranking puts Delta first", row("Delta").norm_rank === 1 && row("Alpha").norm_rank === 2, lb.map((r) => [r.name, r.norm_rank, r.normalised]));
ok("progress per team", row("Delta").finished === 1 && row("Delta").expected === 1 && row("Alpha").finished === 3 && row("Alpha").expected === 3, lb.map((r) => [r.name, r.finished, r.expected]));
const cal = (await owner(`${B}/calibration`)).d.judges;
const c1 = cal.find((x) => x.judge === j1.email);
ok("calibration flags the generous judge", c1.flagged && c1.gap > 15 && c1.teams === 3 && c1.average === 90, c1);
const lcsv = await owner(`${B}/leaderboard.csv`);
ok("scores CSV has the normalised rank", typeof lcsv.d === "string" && lcsv.d.includes("Normalised rank"), String(lcsv.d).slice(0, 200));
const av2 = (await owner(`${B}/assignments`)).d;
ok("assignment view shows progress", av2.teams.find((t) => t.name === "Alpha").finished === 3);
ok("organiser clears a conflict flag", (await owner(`${B}/conflicts`, "DELETE", { email: j1.email, team_id: teamOf.Delta })).s === 200 && (await list(j1)).includes("Delta"));

console.log(`\n${failed ? "FAILED" : "ALL PASS"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
