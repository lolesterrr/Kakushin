// Scheduled jobs, account deletion, inbox paging and the public rubric, against a local `wrangler dev --test-scheduled`.
// Run: npx wrangler dev --test-scheduled  (in one terminal), then: node tests/e2e/day2.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d2${Date.now().toString(36)}`;
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

// ---------- Logo copy for certificates ----------
ok("print logo takes a JPEG", (await owner.put(`/orgs/${ORG}/logo/print`, "scripts/demo/media/logos-print/agri.jpg", "image/jpeg")) === 200);
ok("print logo refuses a PNG", (await owner.put(`/orgs/${ORG}/logo/print`, "scripts/demo/media/logos/agri.png", "image/png")) === 400);
ok("only admins can set it", (await alice.put(`/orgs/${ORG}/logo/print`, "scripts/demo/media/logos-print/agri.jpg", "image/jpeg")) === 403);
ok("a new main logo clears the old print copy", (await owner.put(`/orgs/${ORG}/logo`, "scripts/demo/media/logos/agri.png", "image/png")) === 200
  && rows(`SELECT logo_print_key FROM organizations WHERE slug = '${ORG}'`)[0].logo_print_key === null);

// ---------- Public rubric ----------
const soon = await challenge("Closing Soon");
await owner(`/orgs/${ORG}/challenges/${soon}/criteria`, "PUT", { criteria: [{ name: "Impact", description: "Who it helps and how much", weight: 60, max_score: 10 }, { name: "Pitch", weight: 40, max_score: 5 }] });
const pub = await anon(`/orgs/${ORG}/challenges/${soon}`);
ok("public challenge shows the rubric", JSON.stringify(pub.d.challenge?.criteria) === JSON.stringify([{ name: "Impact", description: "Who it helps and how much", weight: 60, max_score: 10 }, { name: "Pitch", description: "", weight: 40, max_score: 5 }]), pub.d.challenge?.criteria);

// ---------- Cron: reminders, closing, pitch, clean-up, pushes ----------
await alice(`/orgs/${ORG}/challenges/${soon}/team`, "POST", { name: "Alice Forming" });
await alice("/inbox/push-token", "POST", { token: `ExponentPushToken[${P}-alice-device]` });

const past = await challenge("Already Past");
await bob(`/orgs/${ORG}/challenges/${past}/team`, "POST", { name: "Bob Late" });
sql(`UPDATE challenges SET applications_close_at = ${now - 60000} WHERE id = ${chId(past)}`);
ok("explore hides a challenge past its deadline before the job runs", !JSON.stringify((await anon("/challenges")).d).includes("Already Past"));

const pitchy = await challenge("Pitch Time");
await bob(`/orgs/${ORG}/challenges/${pitchy}/team`, "POST", { name: "Bob Pitch" });
sql(`UPDATE challenges SET status = 'reviewing', pitch_due_at = ${now + 12 * 3600000} WHERE id = ${chId(pitchy)}`);
sql(`UPDATE teams SET status = 'shortlisted' WHERE challenge_id = ${chId(pitchy)}`);

sql(`INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ('${P}-old-session', (SELECT id FROM users WHERE email = '${alice.email}'), ${now - 1000})`);
sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ('${P}-old-token', 'code', '${alice.email}', ${now - 1000})`);

await cron();
ok("past deadline moves to reviewing", rows(`SELECT status FROM challenges WHERE id = ${chId(past)}`)[0]?.status === "reviewing");
ok("still-open challenge stays open", rows(`SELECT status FROM challenges WHERE id = ${chId(soon)}`)[0]?.status === "open");
ok("organiser told applications closed", (await inboxTitles(owner)).includes("Applications closed: Already Past"));
ok("forming team gets the 3-day reminder", (await inboxTitles(alice)).includes("Applications close in 3 days: Closing Soon"));
ok("shortlisted team without a pitch gets the 1-day pitch reminder", (await inboxTitles(bob)).includes("Pitch due tomorrow: Pitch Time"));
ok("expired session cleaned up", rows(`SELECT COUNT(*) AS n FROM sessions WHERE id_hash = '${P}-old-session'`)[0]?.n === 0);
ok("expired sign-in code cleaned up", rows(`SELECT COUNT(*) AS n FROM login_tokens WHERE token_hash = '${P}-old-token'`)[0]?.n === 0);
ok("reminder was pushed to the phone", rows(`SELECT pushed_at FROM notifications WHERE kind = 'deadline.3d' AND user_id = (SELECT id FROM users WHERE email = '${alice.email}')`)[0]?.pushed_at > 0);
await cron();
const twice = (await inboxTitles(alice)).filter((t) => t.startsWith("Applications close")).length;
ok("running the job again sends nothing twice", twice === 1, twice);
sql(`UPDATE challenges SET applications_close_at = ${now + 6 * 3600000} WHERE id = ${chId(soon)}`);
await cron();
ok("the 1-day reminder follows the 3-day one", (await inboxTitles(alice)).includes("Applications close tomorrow: Closing Soon"));

// ---------- Inbox: per-item read and paging ----------
sql(`INSERT INTO notifications (id, user_id, kind, title, body, link, created_at, pushed_at)
     WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < 60)
     SELECT '${P}-n' || i, (SELECT id FROM users WHERE email = '${alice.email}'), 'test', 'Note ' || i, '', '', ${now - 10 * DAY} + i, 1 FROM k`);
const page1 = (await alice("/inbox")).d;
ok("first page holds 50", page1.items.length === 50 && !!page1.next, { n: page1.items.length, next: page1.next });
const page2 = (await alice(`/inbox?before=${encodeURIComponent(page1.next)}`)).d;
const all = [...page1.items, ...page2.items].map((n) => n.id);
ok("second page carries on without repeats", page2.items.length > 0 && new Set(all).size === all.length && all.filter((id) => id.startsWith(`${P}-n`)).length === 60, { n2: page2.items.length });
const unread0 = page1.unread;
ok("one item marks read on its own", (await alice(`/inbox/${P}-n60/read`, "POST")).s === 200 && (await alice("/inbox")).d.unread === unread0 - 1);
ok("someone else's item cannot be marked", (await bob(`/inbox/${P}-n59/read`, "POST")).s === 404);
ok("mark all read still works", (await alice("/inbox/read", "POST")).s === 200 && (await alice("/inbox")).d.unread === 0);

// ---------- Delete account ----------
const aliceId = rows(`SELECT id FROM users WHERE email = '${alice.email}'`)[0].id;
ok("delete needs the email typed back", (await alice("/me", "DELETE", { confirm: "nope@example.com" })).s === 400);
ok("owner of an org with live challenges and no other admin is stopped", (await owner("/me", "DELETE", { confirm: owner.email })).s === 409);
const gone = await alice("/me", "DELETE", { confirm: alice.email.toUpperCase() });
ok("account deletes", gone.s === 200, gone);
ok("session no longer works", (await alice("/me")).d.user === null);
ok("user row is gone", rows(`SELECT COUNT(*) AS n FROM users WHERE id = '${aliceId}'`)[0].n === 0);
ok("their notifications, team places and push tokens are gone",
  rows(`SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = '${aliceId}') + (SELECT COUNT(*) FROM team_members WHERE user_id = '${aliceId}') + (SELECT COUNT(*) FROM push_tokens WHERE user_id = '${aliceId}') AS n`)[0].n === 0);
ok("a team they led alone is removed", rows(`SELECT COUNT(*) AS n FROM teams WHERE name = 'Alice Forming' AND challenge_id = ${chId(soon)}`)[0].n === 0);

// A lead with a teammate hands the team over instead.
const carol = await person("carol"), dan = await person("dan");
await carol(`/orgs/${ORG}/challenges/${soon}/team`, "POST", { name: "Carol Team" });
const code = rows(`SELECT invite_code FROM teams WHERE name = 'Carol Team' AND challenge_id = ${chId(soon)}`)[0].invite_code;
await dan("/teams/join", "POST", { code });
ok("lead with a teammate deletes", (await carol("/me", "DELETE", { confirm: carol.email })).s === 200);
ok("teammate becomes the lead", rows(`SELECT u.email FROM teams t JOIN users u ON u.id = t.lead_user_id WHERE t.name = 'Carol Team' AND t.challenge_id = ${chId(soon)}`)[0]?.email === dan.email);

console.log(`\n${failed ? "FAILED" : "ALL PASS"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
