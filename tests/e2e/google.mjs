// Google sign-in against a local `wrangler dev` whose GOOGLE_CERTS_URL points at this script's fake key server.
// Run: printf 'GOOGLE_CERTS_URL=http://localhost:9998/certs\n' >> .dev.vars, npm run dev, then node tests/e2e/google.mjs
// It signs tokens itself, so Google is never contacted and nothing touches production.
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";

const U = process.env.E2E_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("e2e tests only run against a local server");
const P = process.env.E2E_PREFIX ?? `g${Date.now().toString(36)}`;
const sql = (q) => execSync(`npx wrangler d1 execute kakushin --local --json --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const rows = (q) => JSON.parse(sql(q))[0].results;
let failed = 0, passed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log("PASS", name); } else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };

const config = await (await fetch(`${U}/api/auth/config`)).json();
const CLIENT = config.google_client_id;
if (!CLIENT) throw new Error("GOOGLE_CLIENT_ID is not set in wrangler.jsonc vars");
const mk = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const good = mk(), other = mk();
const jwk = { ...good.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
// The same little server stands in for Google's photo host (GOOGLE_PICTURE_TEST_HOST=localhost:9998 in .dev.vars).
const PHOTO = (await import("node:fs")).readFileSync("mobile/assets/icon.png");
let photoAsked = "";
const srv = http.createServer((q, r) => {
  if (q.url.startsWith("/photo")) { photoAsked = q.url; r.setHeader("content-type", "image/png"); return r.end(PHOTO); }
  if (q.url.startsWith("/fake")) { r.setHeader("content-type", "image/png"); return r.end("<svg onload=alert(1)>"); }
  r.setHeader("content-type", "application/json"); r.setHeader("cache-control", "max-age=1"); r.end(JSON.stringify({ keys: [jwk] }));
}).listen(9998);
const b64u = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
function token(claims = {}, { key = good.privateKey, kid = "test-key", alg = "RS256" } = {}) {
  const head = b64u({ alg, kid, typ: "JWT" });
  const body = b64u({ iss: "https://accounts.google.com", aud: CLIENT, iat: now, exp: now + 3600, email_verified: true, ...claims });
  const sig = alg === "none" ? "" : crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const post = async (credential) => { const r = await fetch(`${U}/api/auth/google`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) }); return { s: r.status, d: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie") ?? "" }; };
const email = (l) => `${P}-${l}@example.com`;

const a = await post(token({ email: email("new"), name: "Grace Hopper" }));
ok("valid token signs a new person in", a.s === 200 && /kk_session=/.test(a.cookie) && !!a.d.token, a);
const me = await (await fetch(`${U}/api/me`, { headers: { cookie: a.cookie.split(";")[0] } })).json();
ok("account has the Google email and name", me.user?.email === email("new") && me.user?.name === "Grace Hopper", me);

// First Google sign-in fills the profile: photo, school from the Workspace domain, and a private profile address.
sql(`INSERT INTO organizations (id, slug, name, type, website, verified, created_at) VALUES ('${P}-uni', '${P}-uni', 'Testville University', 'university', 'https://www.${P}.example.edu', 1, ${Date.now()})`);
{
  const f = await post(token({ email: email("fill"), name: "Ada Lovelace-Byron", picture: "http://localhost:9998/photo/a=s96-c", hd: `students.${P}.example.edu` }));
  const u = (await (await fetch(`${U}/api/me`, { headers: { cookie: f.cookie.split(";")[0] } })).json()).user;
  ok("first Google sign-in brings the photo", !!u?.avatar_url && (await fetch(`${U}${u.avatar_url}`)).status === 200, u);
  ok("the photo is asked for at a sharper size", photoAsked.endsWith("=s256-c"), photoAsked);
  ok("school comes from the Workspace domain", u?.institution === "Testville University", u);
  ok("a private profile address is picked from the name", /^ada-lovelace-byron(-\d+)?$/.test(u?.handle ?? "") && u?.public_profile === false, u);
  const g = await post(token({ email: email("fill2"), name: "Ada Lovelace-Byron", picture: "https://evil.example/x.png" }));
  const u2 = (await (await fetch(`${U}/api/me`, { headers: { cookie: g.cookie.split(";")[0] } })).json()).user;
  ok("a photo from anywhere but Google is ignored, sign-in still works", g.s === 200 && u2.avatar_url === null && u2.handle !== u.handle, u2);
  const h = await post(token({ email: email("fill3"), name: "Z", picture: "http://localhost:9998/fake=s96" }));
  ok("a photo that is not really an image is ignored", h.s === 200 && (await (await fetch(`${U}/api/me`, { headers: { cookie: h.cookie.split(";")[0] } })).json()).user.avatar_url === null);
}

sql(`INSERT INTO users (id, email, name, created_at) VALUES ('${P}-old', '${email("old")}', 'Already Here', ${Date.now()})`);
const b = await post(token({ email: email("old").toUpperCase(), name: "Someone Else" }));
const same = rows(`SELECT id, name FROM users WHERE email = '${email("old")}'`);
ok("an existing account is signed into, not duplicated, and keeps its name", b.s === 200 && same.length === 1 && same[0].id === `${P}-old` && same[0].name === "Already Here", { b, same });

sql(`INSERT INTO users (id, email, suspended, created_at) VALUES ('${P}-sus', '${email("sus")}', 1, ${Date.now()})`);
ok("a suspended account is refused", (await post(token({ email: email("sus") }))).s === 403);

const bad = {
  "wrong audience": token({ email: email("x1"), aud: "someone-else.apps.googleusercontent.com" }),
  "wrong issuer": token({ email: email("x2"), iss: "https://evil.example" }),
  "expired": token({ email: email("x3"), exp: now - 60 }),
  "email not verified": token({ email: email("x4"), email_verified: false }),
  "no email": token({}),
  "signed with another key": token({ email: email("x5") }, { key: other.privateKey }),
  "unknown key id": token({ email: email("x6") }, { kid: "nope" }),
  "alg none": token({ email: email("x7") }, { alg: "none" }),
  "not a token": "aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};
for (const [name, t] of Object.entries(bad)) ok(`refuses: ${name}`, (await post(t)).s === 401, name);
const tampered = token({ email: email("x8") }).split("."); tampered[1] = b64u({ iss: "https://accounts.google.com", aud: CLIENT, exp: now + 3600, email_verified: true, email: email("admin") });
ok("refuses: payload changed after signing", (await post(tampered.join("."))).s === 401);
ok("nothing was created for refused tokens", rows(`SELECT COUNT(*) AS n FROM users WHERE email LIKE '${P}-x%@example.com' OR email = '${email("admin")}'`)[0].n === 0);
ok("missing credential is a 400", (await post(undefined)).s === 400);

srv.close();
console.log(`\n${failed ? "FAILED" : "ALL PASS"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
