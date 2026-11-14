// What day 8 adds: the platform owner, pitch media (video and screenshots), project pages and the event recap.
// Run: npx wrangler dev  (in one terminal), then: node tests/e2e/day8.mjs
// Like isolation.mjs it signs people in by writing codes into the LOCAL database, so it never touches production.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `d8${Date.now().toString(36)}`;
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
  call.post = async (path, file, type, caption = "") => { const r = await fetch(`${U}/api${path}`, { method: "POST", headers: { "content-type": type, "x-caption": encodeURIComponent(caption), cookie: `kk_session=${tok}` }, body: fs.readFileSync(file) }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
  call.id = () => rows(`SELECT id FROM users WHERE email = '${email}'`)[0].id;
  await call("/me", "PUT", { name: label[0].toUpperCase() + label.slice(1), skills: [] });
  return call;
}
const anon = async (path) => { const res = await fetch(`${U}/api${path}`); return { s: res.status, d: await res.json().catch(() => ({})) }; };
const cron = async () => { await fetch(`${U}/__scheduled?cron=${encodeURIComponent("0 * * * *")}`); await new Promise((r) => setTimeout(r, 1500)); };

const chId = (slug) => `(SELECT c.id FROM challenges c JOIN organizations o ON o.id = c.org_id WHERE o.slug = '${ORG}' AND c.slug = '${slug}')`;
const IMG = "scripts/seed-media/screens/wallet.png", PHOTO = "scripts/seed-media/students-zambia.jpg";

// ---- the platform owner ----
const boss = await person("boss"), helper = await person("helper"), rando = await person("rando");
sql(`UPDATE users SET is_super_admin = 0 WHERE is_super_admin = 1`); // this test owns the role while it runs
sql(`UPDATE users SET is_platform_admin = 1, is_super_admin = 1 WHERE email = '${boss.email}'`);
sql(`UPDATE users SET is_platform_admin = 1 WHERE email = '${helper.email}'`);
ok("another admin cannot suspend the owner", (await helper(`/platform/users/${boss.id()}`, "PUT", { suspended: true })).s === 403);
ok("another admin cannot remove the owner's admin role", (await helper(`/platform/users/${boss.id()}`, "PUT", { is_platform_admin: false })).s === 403);
ok("another admin cannot make new admins", (await helper(`/platform/users/${rando.id()}`, "PUT", { is_platform_admin: true })).s === 403);
ok("another admin can still suspend an ordinary user", (await helper(`/platform/users/${rando.id()}`, "PUT", { suspended: true })).s === 200);
await helper(`/platform/users/${rando.id()}`, "PUT", { suspended: false });
const newbie = await person("newbie");
ok("the owner makes an admin", (await boss(`/platform/users/${newbie.id()}`, "PUT", { is_platform_admin: true })).s === 200);
ok("the owner removes an admin", (await boss(`/platform/users/${helper.id()}`, "PUT", { is_platform_admin: false })).s === 200);
ok("a removed admin loses the console", (await helper("/platform/stats")).s === 404);
const bo = await boss("/orgs", "POST", { name: `Boss ${P}`, slug: `${P}-boss`, type: "hub" });
const bossOrg = rows(`SELECT id FROM organizations WHERE slug = '${P}-boss'`)[0].id;
{ const r = await newbie(`/platform/orgs/${bossOrg}`, "PUT", { suspended: true }); ok("another admin cannot suspend the owner's organisation", r.s === 403, r); }
ok("/me says who the owner is", (await boss("/me")).d.user.is_super_admin === 1);
sql(`UPDATE users SET is_platform_admin = 0 WHERE email = '${newbie.email}'`);

// ---- pitch media ----
const owner = await person("owner"), lead = await person("lead"), mate = await person("mate"), bare = await person("bare"), outsider = await person("outsider");
const ORG = `${P}-hub`, C = "media-hack", B = `/orgs/${ORG}/challenges/${C}`;
await owner("/orgs", "POST", { name: `Hub ${P}`, slug: ORG, type: "hub" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
await owner(`/orgs/${ORG}/challenges`, "POST", { title: "Media Hack" });
await owner(B, "PUT", { title: "Media Hack", summary: "s", description: "d", status: "open", team_min: 1, team_max: 3, applications_close_at: now + 2 * DAY });
await lead(`${B}/team`, "POST", { name: "Shiny" });
const T = (await lead(`${B}/team`)).d.team.id;
sql(`INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) SELECT '${T}', id, ${now} FROM users WHERE email = '${mate.email}'`);
await bare(`${B}/team`, "POST", { name: "Plain" });
const T2 = (await bare(`${B}/team`)).d.team.id;
ok("screenshots wait until the team is shortlisted", (await lead.post(`/teams/${T}/pitch/images`, IMG, "image/png")).s === 409);
sql(`UPDATE teams SET status = 'finalist' WHERE id IN ('${T}', '${T2}')`);
const up1 = await lead.post(`/teams/${T}/pitch/images`, IMG, "image/png", "Ahorro en grupo · ✓");
ok("a member adds a screenshot with a non-Latin caption", up1.s === 200 && up1.d.image.caption === "Ahorro en grupo · ✓", up1);
ok("the screenshot is served", (await fetch(`${U}${up1.d.image.url}`)).status === 200);
const up2 = await mate.post(`/teams/${T}/pitch/images`, "scripts/seed-media/screens/calendar.png", "image/png");
ok("a teammate adds one too", up2.s === 200);
ok("an outsider cannot add one", (await outsider.post(`/teams/${T}/pitch/images`, IMG, "image/png")).s === 404);
const fake = "tests/e2e/day8.mjs";
ok("a file that is not an image is refused", (await lead.post(`/teams/${T}/pitch/images`, fake, "image/png")).s === 400);
for (let i = 0; i < 4; i++) await lead.post(`/teams/${T}/pitch/images`, IMG, "image/png");
ok("the seventh image is refused", (await lead.post(`/teams/${T}/pitch/images`, IMG, "image/png")).s === 409);
let imgs = (await lead(`/teams/${T}/pitch`)).d.images;
ok("six images listed in order", imgs.length === 6 && imgs[0].id === up1.d.image.id, imgs.map((i) => i.id));
const re = [imgs[1], imgs[0], ...imgs.slice(2)].map((m, n) => ({ id: m.id, caption: n === 0 ? "New cover" : m.caption }));
ok("reorder and re-caption", (await lead(`/teams/${T}/pitch/images`, "PUT", { images: re })).s === 200);
imgs = (await lead(`/teams/${T}/pitch`)).d.images;
ok("new order kept", imgs[0].id === up2.d.image.id && imgs[0].caption === "New cover");
ok("a stale order is refused", (await lead(`/teams/${T}/pitch/images`, "PUT", { images: re.slice(1) })).s === 409);
ok("remove one", (await lead(`/teams/${T}/pitch/images/${imgs[5].id}`, "DELETE")).s === 200);
ok("a YouTube link becomes an embed", (await lead(`/teams/${T}/pitch`, "PUT", { video_url: "https://youtu.be/dQw4w9WgXcQ", notes: "We help savings groups." })).s === 200
  && (await lead(`/teams/${T}/pitch`)).d.pitch.video_embed === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
await lead(`/teams/${T}/pitch`, "PUT", { video_url: "https://vimeo.com/1", notes: "x" });
ok("another video link stays a plain link", (await lead(`/teams/${T}/pitch`)).d.pitch.video_embed === null);
await lead(`/teams/${T}/pitch`, "PUT", { video_url: "https://youtu.be/dQw4w9WgXcQ", notes: "We help savings groups." });

// judges see the media; a team with nothing at all still works everywhere
const judge = await person("judge");
await owner(`${B}/criteria`, "PUT", { criteria: [{ name: "Idea", weight: 100, max_score: 10 }] });
await owner(`${B}/judges`, "POST", { email: judge.email });
sql(`UPDATE challenges SET status = 'judging' WHERE id = ${chId(C)}`);
const jv = (await judge(`/judge/${ORG}/${C}/teams/${T}`)).d;
ok("judge gets the embed and the screenshots", jv.pitch?.video_embed && jv.images?.length === 5, jv);
const jb = await judge(`/judge/${ORG}/${C}/teams/${T2}`);
ok("judge view works for a team with no media", jb.s === 200 && jb.d.pitch === null && jb.d.images.length === 0, jb.d);

// ---- event recap ----
ok("recap photos: a stranger cannot add", (await outsider.post(`${B}/photos`, PHOTO, "image/jpeg")).s === 403);
const op = await owner.post(`${B}/photos`, PHOTO, "image/jpeg", "Opening");
ok("the organiser's photo shows at once", op.s === 200 && op.d.approved === true);
const pp = await lead.post(`${B}/photos`, PHOTO, "image/jpeg", "Our table");
ok("a participant's photo waits", pp.s === 200 && pp.d.approved === false);
ok("the public sees only approved photos", (await anon(`${B}/photos`)).d.photos.length === 1);
ok("the participant sees their own waiting photo", (await lead(`${B}/photos`)).d.photos.length === 2);
await lead.post(`${B}/photos`, PHOTO, "image/jpeg"); await lead.post(`${B}/photos`, PHOTO, "image/jpeg");
ok("a participant is held to 3 photos", (await lead.post(`${B}/photos`, PHOTO, "image/jpeg")).s === 409);
ok("the organiser approves", (await owner(`${B}/photos/${pp.d.id}`, "PUT", { approved: true })).s === 200 && (await anon(`${B}/photos`)).d.photos.length === 2);
ok("a participant cannot approve", (await lead(`${B}/photos/${pp.d.id}`, "PUT", { approved: true })).s === 403);

// ---- project page ----
sql(`UPDATE challenges SET status = 'completed' WHERE id = ${chId(C)}`);
sql(`UPDATE teams SET status = 'winner', placement = 1 WHERE id = '${T}'`);
await owner(`${B}/results/publish`, "POST");
ok("no project page until the team opts in", (await anon(`${B}/projects/${T}`)).s === 404);
await lead(`/teams/${T}/showcase`, "PUT", { show: true });
await bare(`/teams/${T2}/showcase`, "PUT", { show: true });
const pg = await anon(`${B}/projects/${T}`);
ok("project page has video, images and members", pg.s === 200 && pg.d.project.video_embed && pg.d.project.images.length === 5 && pg.d.project.members.length >= 1, pg.d);
ok("project page never shows emails", !JSON.stringify(pg.d).includes("@example.com"));
const pb = await anon(`${B}/projects/${T2}`);
ok("a project with no media still has a page", pb.s === 200 && pb.d.project.images.length === 0 && pb.d.project.video_embed === null && pb.d.project.cover_url === null, pb.d);
const gal = (await anon(`${B}/gallery`)).d.projects;
ok("gallery cards carry a cover when there is one", gal.find((g) => g.id === T)?.cover_url && gal.find((g) => g.id === T2)?.cover_url === null, gal);

// ---- profile pictures ----
{
  const up = await lead.post("/me/avatar", PHOTO, "image/jpeg");
  ok("someone adds a profile picture", up.s === 200 && /^\/api\/files\/avatars\//.test(up.d.avatar_url), up);
  ok("/me returns the picture", (await lead("/me")).d.user.avatar_url === up.d.avatar_url);
  ok("the picture is served", (await fetch(`${U}${up.d.avatar_url}`)).status === 200);
  ok("a file that is not an image is refused", (await lead.post("/me/avatar", "package.json", "image/png")).s === 400);
  ok("teammates see the picture", (await lead(`${B}/team`)).d.team.members.some((m) => m.avatar_url === up.d.avatar_url));
  ok("a private profile's picture stays off the public project page", !(await anon(`${B}/projects/${T}`)).d.project.members.some((m) => m.avatar_url));
  const h = `${P}-lead`.slice(0, 30);
  await lead("/me", "PUT", { name: "Lead", skills: [], handle: h, public_profile: true });
  ok("a public profile shows the picture", (await anon(`/people/${h}`)).d.profile.avatar_url === up.d.avatar_url);
  ok("and so does the project page", (await anon(`${B}/projects/${T}`)).d.project.members.some((m) => m.avatar_url === up.d.avatar_url));
  const up2 = await lead.post("/me/avatar", IMG, "image/png");
  await new Promise((r) => setTimeout(r, 500));
  ok("a new picture replaces the old file", up2.s === 200 && (await fetch(`${U}${up.d.avatar_url}`)).status === 404);
  ok("removing the picture", (await lead("/me/avatar", "DELETE")).s === 200 && (await lead("/me")).d.user.avatar_url === null);
  {
    const b = await lead.post("/me/banner", PHOTO, "image/jpeg");
    ok("someone adds a profile banner", b.s === 200 && /^\/api\/files\/banners\//.test(b.d.url) && (await lead("/me")).d.user.banner_url === b.d.url, b);
    ok("the banner is served", (await fetch(`${U}${b.d.url}`)).status === 200);
    ok("a public profile shows the banner", (await anon(`/people/${h}`)).d.profile.banner_url === b.d.url);
    ok("removing the banner", (await lead("/me/banner", "DELETE")).s === 200 && (await anon(`/people/${h}`)).d.profile.banner_url === null);
    await new Promise((r) => setTimeout(r, 500));
    ok("a removed banner's file is deleted", (await fetch(`${U}${b.d.url}`)).status === 404);
  }
  ok("signed out cannot upload", (await fetch(`${U}/api/me/avatar`, { method: "POST", headers: { "content-type": "image/png" }, body: fs.readFileSync(IMG) })).status === 401);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
