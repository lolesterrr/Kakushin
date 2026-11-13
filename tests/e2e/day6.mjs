// What day 6 adds: the event-day agenda and live page, timed pushes from the 5-minute job, QR check-in,
// and GitHub repos on pitches with contributor counts for judges.
// Run: npx wrangler dev --test-scheduled  (in one terminal), then: node tests/e2e/day6.mjs
// The GitHub cases need a fake GitHub, which this script starts on port 9997. Point the Worker at it first:
//   printf 'GITHUB_API_URL=http://localhost:9997\n' >> .dev.vars   (then restart wrangler dev)
// Without it those cases are skipped, so the script never calls the real GitHub.
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d6${Date.now().toString(36)}`;
const sql = (q) => execSync(`npx wrangler d1 execute kakushin --local --json --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const rows = (q) => JSON.parse(sql(q))[0].results;
let failed = 0, passed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log("PASS", name); } else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); } };
const MIN = 60000, DAY = 86400000, now = Date.now();

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
  await call("/me", "PUT", { name: label[0].toUpperCase() + label.slice(1), skills: [] });
  call.id = rows(`SELECT id FROM users WHERE email = '${email}'`)[0].id;
  return call;
}
const anon = async (path) => { const res = await fetch(`${U}/api${path}`); return { s: res.status, d: await res.json().catch(() => ({})) }; };
const liveCron = async () => { await fetch(`${U}/__scheduled?cron=${encodeURIComponent("*/5 * * * *")}`); await new Promise((r) => setTimeout(r, 1500)); };
const inboxTitles = async (who) => (await who("/inbox")).d.items.map((n) => n.title);

// A fake GitHub: one public repo, one that does not exist.
let ghHits = 0;
const gh = http.createServer((req, res) => {
  ghHits++;
  if (req.url?.startsWith("/repos/alpha-team/solar/contributors")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ login: "AliceGH", contributions: 42, type: "User" }, { login: "zed", contributions: 1, type: "User" }, { login: "dependabot[bot]", contributions: 5, type: "Bot" }]));
  } else { res.writeHead(404, { "content-type": "application/json" }); res.end('{"message":"Not Found"}'); }
});
await new Promise((r) => gh.listen(9997, r));

const owner = await person("owner"), alice = await person("alice"), bob = await person("bob"), carol = await person("carol"), dan = await person("dan");
const judge = await person("judge"), stranger = await person("stranger");
const ORG = `${P}-hub`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
const TITLE = `Live ${P}`;
const C = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, "-");
await owner(`/orgs/${ORG}/challenges`, "POST", { title: TITLE });
const put = await owner(`/orgs/${ORG}/challenges/${C}`, "PUT", { title: TITLE, summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY, pitch_due_at: now + 3 * DAY });
if (put.s !== 200) throw new Error(JSON.stringify(put));
const B = `/orgs/${ORG}/challenges/${C}`;
const teamOf = {};
for (const [who, name] of [[alice, "Alpha"], [carol, "Gamma"], [dan, "Delta"]]) {
  await who(`${B}/team`, "POST", { name });
  const t = (await who(`${B}/team`)).d.team;
  teamOf[name] = t;
  if (name === "Alpha") await bob("/teams/join", "POST", { code: t.invite_code });
  if (name !== "Delta") await who(`/teams/${t.id}/application`, "PUT", { answers: {} });
}
sql(`UPDATE teams SET status = 'finalist' WHERE id = '${teamOf.Alpha.id}'`);
sql(`UPDATE teams SET status = 'rejected' WHERE id = '${teamOf.Gamma.id}'`);

// ---------- 6A: agenda ----------
const blocks = [
  { kind: "briefing", label: "", starts_at: now - 60 * MIN, ends_at: now - 30 * MIN },
  { kind: "build", label: "Build sprint", starts_at: now - 30 * MIN, ends_at: now + 3 * MIN },
  { kind: "pitching", label: "", starts_at: now + 3 * MIN, ends_at: now + 60 * MIN },
];
ok("a stranger cannot set the agenda", (await stranger(`${B}/agenda`, "PUT", { blocks })).s === 403);
ok("a participant cannot set the agenda", (await alice(`${B}/agenda`, "PUT", { blocks })).s === 403);
ok("overlapping blocks are refused", (await owner(`${B}/agenda`, "PUT", { blocks: [blocks[0], { ...blocks[1], starts_at: now - 45 * MIN }] })).s === 400);
ok("a block that ends before it starts is refused", (await owner(`${B}/agenda`, "PUT", { blocks: [{ kind: "build", starts_at: now, ends_at: now - MIN }] })).s === 400);
const ag = await owner(`${B}/agenda`, "PUT", { blocks: [blocks[2], blocks[0], blocks[1]] });
ok("agenda saves in time order with default labels", ag.s === 200 && ag.d.agenda.map((b) => b.label).join() === "Briefing,Build sprint,Pitching", ag.d);
ok("the challenge page carries the agenda", (await anon(B)).d.challenge.agenda?.length === 3);

const live = (await anon(`${B}/live`)).d;
const idOf = (label) => live.agenda.find((b) => b.label === label)?.id;
ok("live page shows the current and next block", live.current === idOf("Build sprint") && live.next === idOf("Pitching"), live);
ok("live page gives the server time and the cutoff", Math.abs(live.now - Date.now()) < 60000 && live.challenge.pitch_due_at === now + 3 * DAY && live.submissions_closed === false);
ok("signed out, the live page has no messages", live.messages.length === 0 && live.me === null);

// Group messages only reach the live page of the people they were sent to.
await owner(`${B}/messages`, "POST", { audience: "finalists", title: "Pizza is here", body: "Second floor" });
await owner(`${B}/messages`, "POST", { audience: "not_selected", title: "Thanks for coming", body: "See you next time" });
const msgs = async (who) => (await who(`${B}/live`)).d.messages.map((m) => m.title);
ok("a finalist sees the finalists' message only", (await msgs(alice)).join() === "Pizza is here", await msgs(alice));
ok("a rejected team sees its own message only", (await msgs(carol)).join() === "Thanks for coming");
ok("the organiser sees every message", (await msgs(owner)).length === 2);
ok("someone not in the challenge sees none", (await msgs(stranger)).length === 0);

// ---------- 6A: the 5-minute job ----------
await liveCron();
const starts = (t) => t.some((x) => x.startsWith("Pitching starts in"));
ok("a block starting within 5 minutes is pushed to people taking part", starts(await inboxTitles(alice)) && starts(await inboxTitles(dan)), await inboxTitles(alice));
ok("turned-down teams do not get block pushes", !starts(await inboxTitles(carol)));
await liveCron();
ok("each block is pushed once", (await inboxTitles(alice)).filter((t) => t.startsWith("Pitching starts")).length === 1);
const link = rows(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND kind = 'live.block'`)[0]?.link;
ok("block pushes open the live page", link === `/o/${ORG}/c/${C}/live`, link);

// ---------- 6B: GitHub repo on the pitch (before the cutoff) ----------
ok("a non-GitHub repo is refused", (await alice(`/teams/${teamOf.Alpha.id}/pitch`, "PUT", { video_url: "", demo_url: "", repo_url: "https://gitlab.com/a/b", notes: "" })).s === 400);
ok("a GitHub link to a file is refused", (await alice(`/teams/${teamOf.Alpha.id}/pitch`, "PUT", { repo_url: "https://github.com/alpha-team/solar/blob/main/x.js" })).s === 400);
ok("a GitHub repo saves", (await alice(`/teams/${teamOf.Alpha.id}/pitch`, "PUT", { video_url: "", demo_url: "", repo_url: "https://github.com/alpha-team/solar.git", notes: "n" })).s === 200);
ok("the repo is stored as a plain link", (await alice(`/teams/${teamOf.Alpha.id}/pitch`)).d.pitch.repo_url === "https://github.com/alpha-team/solar");
await bob(`/teams/${teamOf.Alpha.id}/pitch`, "PUT", { video_url: "", demo_url: "https://demo.example", notes: "n" });
ok("an older app that leaves the repo out keeps it", (await alice(`/teams/${teamOf.Alpha.id}/pitch`)).d.pitch.repo_url === "https://github.com/alpha-team/solar");
await alice("/me", "PUT", { name: "Alice", skills: [], links: { github: "https://github.com/alicegh" } });
await owner(`${B}/judges`, "POST", { email: judge.email });
const J = `/judge/${ORG}/${C}/teams/${teamOf.Alpha.id}`;
ok("judges see the repo on the pitch", (await judge(J)).d.pitch?.repo_url === "https://github.com/alpha-team/solar");
ok("a stranger cannot read repo stats", (await stranger(`${J}/repo`)).s === 404);
const rs = await judge(`${J}/repo`);
if (rs.d.status === "ok" || ghHits > 0) {
  const c = rs.d.contributors ?? [];
  ok("contributors are matched to members by their GitHub profile link", c[0]?.login === "AliceGH" && c[0]?.member === "Alice" && c[0]?.commits === 42, rs.d);
  ok("people not on the team are counted, bots are left out", rs.d.not_on_team === 1 && c.length === 2 && !c.some((x) => x.login.includes("bot")), rs.d);
  ok("members with no commits are listed", rs.d.no_commits?.map((m) => m.name).join() === "Bob", rs.d);
  const hits = ghHits;
  await judge(`${J}/repo`);
  ok("GitHub answers are cached", ghHits === hits);
  await owner(`${B}/judging/settings`, "PUT", { blind_judging: true });
  const blind = (await judge(`${J}/repo`)).d;
  ok("blind review hides logins and names in repo stats", blind.blind === true && blind.contributors.every((x) => x.login === null && x.member === null) && typeof blind.no_commits === "number" && !JSON.stringify(blind).includes("Alice"), blind);
  ok("blind review still shows commit counts", blind.contributors[0].commits === 42 && blind.contributors[0].on_team === true);
  await owner(`${B}/judging/settings`, "PUT", { blind_judging: false });
  sql(`UPDATE submissions SET repo_url = 'https://github.com/alpha-team/private' WHERE team_id = '${teamOf.Alpha.id}'`);
  ok("a repo GitHub cannot see says so", (await judge(`${J}/repo`)).d.status === "not_found");
  sql(`UPDATE submissions SET repo_url = 'https://github.com/alpha-team/solar' WHERE team_id = '${teamOf.Alpha.id}'`);
} else console.log("SKIP GitHub stats: add GITHUB_API_URL=http://localhost:9997 to .dev.vars and restart wrangler dev");

// ---------- 6A: pitch cutoff pushes ----------
const cut = (t) => t.filter((x) => x.startsWith("Submissions close in"));
sql(`UPDATE challenges SET pitch_due_at = ${Date.now() + 28 * MIN} WHERE slug = '${C}'`);
await liveCron();
ok("the 30-minute cutoff push reaches the pitching team", cut(await inboxTitles(alice)).length === 1 && cut(await inboxTitles(bob)).length === 1, await inboxTitles(alice));
ok("teams that do not pitch do not get it", cut(await inboxTitles(dan)).length === 0 && cut(await inboxTitles(carol)).length === 0);
await liveCron();
ok("each cutoff push goes once", cut(await inboxTitles(alice)).length === 1);
sql(`UPDATE challenges SET pitch_due_at = ${Date.now() + 4 * MIN} WHERE slug = '${C}'`);
await liveCron();
ok("the last call goes out in the final minutes", cut(await inboxTitles(alice)).length === 2 && cut(await inboxTitles(alice)).some((t) => /close in [345] minutes/.test(t)), cut(await inboxTitles(alice)));
sql(`UPDATE challenges SET pitch_due_at = ${Date.now() - 1000} WHERE slug = '${C}'`);
ok("live page says submissions are closed", (await anon(`${B}/live`)).d.submissions_closed === true);
ok("the server refuses pitches after the cutoff", (await alice(`/teams/${teamOf.Alpha.id}/pitch`, "PUT", { video_url: "", demo_url: "", notes: "late" })).s === 409);

// ---------- 6A: QR check-in ----------
ok("no pass while check-in is off", (await alice(`${B}/checkin/pass`)).d.enabled === false);
ok("only organisers turn check-in on", (await alice(`${B}/checkin/settings`, "PUT", { enabled: true })).s === 403);
ok("organiser turns check-in on", (await owner(`${B}/checkin/settings`, "PUT", { enabled: true })).s === 200);
ok("the challenge page says check-in is on", (await anon(B)).d.challenge.checkin_enabled === true);
const pass = (await alice(`${B}/checkin/pass`)).d;
ok("a participant gets a signed pass", pass.enabled && /^KK1\./.test(pass.code) && pass.team === "Alpha" && pass.checked_in_at === null, pass);
ok("the pass is not the invite code", !pass.code.includes(teamOf.Alpha.invite_code));
ok("a turned-down team gets no pass", (await carol(`${B}/checkin/pass`)).s === 403);
ok("someone not in the challenge gets no pass", (await stranger(`${B}/checkin/pass`)).s === 403);
ok("a participant cannot check people in", (await alice(`${B}/checkin`, "POST", { code: pass.code })).s === 403);
const scan = await owner(`${B}/checkin`, "POST", { code: pass.code });
ok("scanning a pass checks the person in", scan.s === 200 && scan.d.name === "Alice" && scan.d.team === "Alpha" && scan.d.already === false, scan.d);
ok("scanning again says they are already in", (await owner(`${B}/checkin`, "POST", { code: pass.code })).d.already === true);
const forged = pass.code.replace(alice.id, bob.id);
ok("a pass edited to another person is refused", (await owner(`${B}/checkin`, "POST", { code: forged })).s === 400);
ok("the team invite code is not a pass", (await owner(`${B}/checkin`, "POST", { code: teamOf.Alpha.invite_code })).s === 400);
ok("organiser checks someone in by name", (await owner(`${B}/checkin`, "POST", { user_id: bob.id })).d.name === "Bob");
ok("a turned-down person cannot be checked in", (await owner(`${B}/checkin`, "POST", { user_id: carol.id })).s === 404);
const list = (await owner(`${B}/checkin`)).d;
ok("organiser sees the count and the list", list.total === 3 && list.checked_in === 2 && list.people.find((p) => p.name === "Bob")?.method === "name", list);
ok("only organisers see the list", (await alice(`${B}/checkin`)).s === 403);
ok("the person sees they are checked in", (await alice(`${B}/checkin/pass`)).d.checked_in_at > 0 && (await alice(`${B}/live`)).d.me.checked_in_at > 0);
ok("undo a check-in", (await owner(`${B}/checkin`, "DELETE", { user_id: bob.id })).s === 200 && (await owner(`${B}/checkin`)).d.checked_in === 1);
await owner(`${B}/checkin/settings`, "PUT", { enabled: false });
ok("scanning is refused while check-in is off", (await owner(`${B}/checkin`, "POST", { code: pass.code })).s === 409);
await owner(`${B}/checkin/settings`, "PUT", { enabled: true });
ok("turning check-in on again makes old passes invalid", (await owner(`${B}/checkin`, "POST", { code: pass.code })).s === 400);
const fresh = (await alice(`${B}/checkin/pass`)).d.code;
ok("the new pass works", fresh !== pass.code && (await owner(`${B}/checkin`, "POST", { code: fresh })).s === 200);

// Account delete clears the person's check-ins.
const del = await dan("/me", "DELETE", { confirm: dan.email });
ok("account delete still works", del.s === 200, del);

gh.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
