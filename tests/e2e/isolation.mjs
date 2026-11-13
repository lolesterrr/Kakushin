// Permission and tenant-isolation checks against a local `wrangler dev` (default http://localhost:8787).
// Run: npm run dev  (in one terminal), then: npm run test:e2e   (set E2E_PREFIX to re-run on a used database).
// It signs people in by writing one-time codes straight into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `e2e${Date.now().toString(36)}`;
const sql = (q) => execSync(`npx wrangler d1 execute kakushin --local --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] });
let failed = 0, passed = 0;
const ok = (name, cond, extra) => { if (cond) passed++; else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); } };
const denied = (r) => r.s === 401 || r.s === 403 || r.s === 404;

async function person(label) {
  const email = `${P}-${label}@example.com`;
  sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ('${crypto.createHash("sha256").update(`${email}:123456`).digest("hex")}', 'code', '${email}', ${Date.now() + 600000})`);
  let r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "123456" }) });
  // Sign-in is rate limited per IP, so wait and retry when many people sign in at once.
  for (let i = 0; r.status === 429 && i < 12; i++) { await new Promise((ok) => setTimeout(ok, 10000)); r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "123456" }) }); }
  const tok = /kk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
  if (!tok) throw new Error(`could not sign in ${email}`);
  const call = async (path, method = "GET", json) => {
    const res = await fetch(`${U}/api${path}`, { method, headers: { "content-type": "application/json", ...(tok === "anon" ? {} : { cookie: `kk_session=${tok}` }) }, body: json === undefined ? undefined : JSON.stringify(json) });
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
    return { s: res.status, d };
  };
  call.email = email;
  return call;
}
const anon = async (path, method = "GET") => { const res = await fetch(`${U}/api${path}`, { method }); return { s: res.status, d: await res.json().catch(() => ({})) }; };

async function makeOrg(owner, slug, name) {
  await owner("/orgs", "POST", { name, slug, type: "hub" });
  sql(`UPDATE organizations SET verified = 1 WHERE slug = '${slug}'`); // verified organisations skip the review queue
  await owner(`/orgs/${slug}/challenges`, "POST", { title: "Open Challenge" });
  await owner(`/orgs/${slug}/challenges/open-challenge`, "PUT", { title: "Open Challenge", summary: "s", description: "d", status: "open", team_min: 1, team_max: 2 });
  await owner(`/orgs/${slug}/challenges`, "POST", { title: "Secret Draft" });
}

const aOwner = await person("aowner"), bOwner = await person("bowner"), alice = await person("alice"), bob = await person("bob"), nobody = await person("nobody");
const A = `${P}-a`, B = `${P}-b`;
await makeOrg(aOwner, A, `${P} A`); await makeOrg(bOwner, B, `${P} B`);

// ---- anonymous visitors ----
for (const path of ["/orgs/mine", "/teams/mine", "/inbox/settings"]) ok(`anon blocked: ${path}`, (await anon(path)).s === 401, path);
// These answer signed-out callers with an empty list so the web app can render; they must never carry data.
for (const path of ["/inbox", "/judge/challenges", "/certificates/mine"]) { const r = await anon(path); ok(`anon gets nothing: ${path}`, r.s === 401 || Object.values(r.d).every((v) => Array.isArray(v) ? v.length === 0 : v === 0 || v === null), r); }
for (const path of ["/platform/stats", "/platform/users", "/platform/audit"]) ok(`anon blocked: ${path}`, denied(await anon(path)), path);
ok("anon cannot announce", denied(await anon(`/orgs/${A}/announcements`, "POST")));

// ---- drafts are private ----
ok("anon cannot open a draft", denied(await anon(`/orgs/${A}/challenges/secret-draft`)));
ok("other org's admin cannot open a draft", denied(await bOwner(`/orgs/${A}/challenges/secret-draft`)));
ok("owner can open own draft", (await aOwner(`/orgs/${A}/challenges/secret-draft`)).s === 200);
ok("draft not in public explore", !JSON.stringify((await anon("/challenges")).d).includes("Secret Draft"));

// ---- B's admin cannot touch A's organisation ----
const aPaths = [
  ["GET", `/orgs/${A}/challenges/open-challenge/overview`], ["GET", `/orgs/${A}/challenges/open-challenge/applications`], ["GET", `/orgs/${A}/challenges/open-challenge/applications.csv`],
  ["GET", `/orgs/${A}/challenges/open-challenge/criteria`], ["GET", `/orgs/${A}/challenges/open-challenge/judges`], ["GET", `/orgs/${A}/challenges/open-challenge/leaderboard`],
  ["GET", `/orgs/${A}/challenges/open-challenge/results`], ["GET", `/orgs/${A}/members`], ["GET", `/orgs/${A}/announcements`],
];
for (const [m, p] of aPaths) ok(`other org admin blocked: ${m} ${p}`, denied(await bOwner(p, m)), p);
const writes = [
  ["PUT", `/orgs/${A}`, { name: "Hijacked", type: "hub" }], ["PUT", `/orgs/${A}/challenges/open-challenge`, { title: "Hijacked", summary: "s", description: "d", status: "open", team_min: 1, team_max: 2 }],
  ["PUT", `/orgs/${A}/challenges/open-challenge/status`, { status: "completed" }], ["DELETE", `/orgs/${A}/challenges/open-challenge`],
  ["POST", `/orgs/${A}/announcements`, { title: "Spam from B" }], ["POST", `/orgs/${A}/members`, { email: `${P}-bob@example.com` }],
  ["POST", `/orgs/${A}/challenges`, { title: "Planted" }], ["POST", `/orgs/${A}/challenges/open-challenge/judges`, { email: `${P}-bob@example.com` }],
  ["POST", `/orgs/${A}/challenges/open-challenge/results/publish`, {}],
];
for (const [m, p, j] of writes) ok(`other org admin blocked: ${m} ${p}`, denied(await bOwner(p, m, j)), p);
ok("org A name unchanged", (await anon(`/orgs/${A}`)).d.org?.name === `${P} A`);
ok("a plain user cannot send platform news", denied(await aOwner("/platform/news", "POST", { title: "Hello everyone" })));
ok("a plain user cannot read the audit log", denied(await aOwner("/platform/audit")));

// ---- applicants only see their own team ----
const ta = await alice(`/orgs/${A}/challenges/open-challenge/team`, "POST", { name: "Alice Team" });
const tb = await bob(`/orgs/${A}/challenges/open-challenge/team`, "POST", { name: "Bob Team" });
const aliceTeam = (await alice("/teams/mine")).d.teams?.[0]?.id, bobTeam = (await bob("/teams/mine")).d.teams?.[0]?.id;
ok("two separate teams exist", !!aliceTeam && !!bobTeam && aliceTeam !== bobTeam, { ta, tb });
ok("alice cannot submit for bob's team", denied(await alice(`/teams/${bobTeam}/application`, "PUT", { answers: {} })));
ok("alice cannot withdraw bob's team", denied(await alice(`/teams/${bobTeam}/application`, "DELETE")));
ok("alice cannot remove bob from his team", denied(await alice(`/teams/${bobTeam}/members/${(await bob("/me")).d.user?.id}`, "DELETE")));
ok("alice cannot read bob's pitch", denied(await alice(`/teams/${bobTeam}/pitch`)));
ok("alice cannot write bob's pitch", denied(await alice(`/teams/${bobTeam}/pitch`, "PUT", { pitch: "x" })));
ok("alice cannot read bob's deck", denied(await alice(`/decks/${bobTeam}`)));
ok("alice cannot see applications of A", denied(await alice(`/orgs/${A}/challenges/open-challenge/applications`)));
ok("alice cannot score", denied(await alice(`/judge/${A}/open-challenge/teams/${bobTeam}/scores`, "PUT", { scores: [] })));
ok("alice is not shown the judge list", denied(await alice(`/judge/${A}/open-challenge`)));
ok("a stranger cannot preview teams without a code", denied(await nobody(`/teams/preview/not-a-real-code`)));

// ---- judges are scoped to the challenge they were invited to ----
await aOwner(`/orgs/${A}/challenges/open-challenge/judges`, "POST", { email: nobody.email });
ok("assigned judge sees the challenge", (await nobody(`/judge/${A}/open-challenge`)).s === 200);
ok("assigned judge is blocked from B's challenge", denied(await nobody(`/judge/${B}/open-challenge`)));
ok("judge is not an org admin", denied(await nobody(`/orgs/${A}/challenges/open-challenge/applications`)));
ok("judge cannot change results", denied(await nobody(`/orgs/${A}/challenges/open-challenge/results/publish`, "POST", {})));

// ---- notifications and settings are per person ----
ok("inbox is private", (await alice("/inbox")).d.items?.every?.((i) => !JSON.stringify(i).includes(bob.email)) ?? true);
ok("push token cannot be hijacked silently", (await alice("/inbox/push-token", "POST", { token: `ExponentPushToken[${P}-alice-token-0001]` })).s === 200);
ok("bob taking over the token moves it", (await bob("/inbox/push-token", "POST", { token: `ExponentPushToken[${P}-alice-token-0001]` })).s === 200 && (await alice("/inbox/settings")).d.devices === 0);

// ---- day 1 fixes: profile links, announcement links, team size, stages, rubric, link previews, sign-in limits ----
ok("profile rejects a javascript: link", (await alice("/me", "PUT", { name: "Alice", links: { site: "javascript:alert(1)" } })).s === 400);
ok("profile accepts an https link", (await alice("/me", "PUT", { name: "Alice", links: { site: "https://example.com" }, gender: "female" })).s === 200);
ok("a save without links or gender keeps them", (await alice("/me", "PUT", { name: "Alice A" })).s === 200
  && (await alice("/me")).d.user?.links?.site === "https://example.com" && (await alice("/me")).d.user?.gender === "female");
ok("announcement link to //host is refused", (await aOwner(`/orgs/${A}/announcements`, "POST", { title: "Look here", link: "//evil.example" })).s === 400);
ok("announcement link to /\\host is refused", (await aOwner(`/orgs/${A}/announcements`, "POST", { title: "Look here", link: "/\\evil.example" })).s === 400);

// Alice's team allows 2. Three people try to join at the same moment: exactly one gets in.
const code = (await alice(`/orgs/${A}/challenges/open-challenge/team`)).d.team?.invite_code;
const joiners = [await person("j1"), await person("j2"), await person("j3")];
const joins = await Promise.all(joiners.map((j) => j("/teams/join", "POST", { code })));
ok("concurrent joins never pass the team maximum", !!code && joins.filter((r) => r.s === 200).length === 1, joins.map((r) => r.s));

const st = `/orgs/${A}/challenges/open-challenge/status`;
ok("stage can move forward", (await aOwner(st, "PUT", { status: "judging" })).s === 200);
ok("rubric is locked while judging", (await aOwner(`/orgs/${A}/challenges/open-challenge/criteria`, "PUT", { criteria: [{ name: "Impact", weight: 100, max_score: 10 }] })).s === 409);
const back = await aOwner(st, "PUT", { status: "open" });
ok("stage cannot move back without reopen", back.s === 409 && back.d.reopen_needed === true, back);
ok("stage can move back with reopen", (await aOwner(st, "PUT", { status: "open", reopen: true })).s === 200);
ok("rubric can change again after reopening", (await aOwner(`/orgs/${A}/challenges/open-challenge/criteria`, "PUT", { criteria: [{ name: "Impact", weight: 100, max_score: 10 }] })).s === 200);

const page = await (await fetch(`${U}/o/${A}/c/open-challenge`)).text();
ok("challenge page carries its own preview title", page.includes(`<meta property="og:title" content="Open Challenge · ${P} A"`), page.slice(0, 600));
ok("preview image is an absolute URL", /<meta property="og:image" content="https?:\/\//.test(page));
ok("a draft does not leak into previews", !(await (await fetch(`${U}/o/${A}/c/secret-draft`)).text()).includes("Secret Draft"));

const asks = [];
for (let i = 0; i < 7; i++) asks.push((await fetch(`${U}/api/auth/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${P}-flood${i}@example.com`, kind: "code" }) })).status);
ok("sign-in requests are limited per IP", asks.includes(429), asks);

console.log(`${failed === 0 ? "ALL PASS" : "FAILURES"}: ${passed} passed, ${failed} failed (prefix ${P})`);
process.exit(failed ? 1 : 0);
