import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId, randomCode, randomToken, sha256Hex } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { turnstileOk, turnstileOn } from "../lib/turnstile";
import { clearSessionCookie, createSession, readToken, setSessionCookie } from "../lib/session";

export const auth = new Hono<AppEnv>();

const TOKEN_MS = 15 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 5;

const requestBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // "link" for web (magic link), "code" for mobile (6-digit code)
  kind: z.enum(["link", "code"]).default("link"),
  turnstile: z.string().max(2048).optional(),
});

const MAX_CODE_MISSES = 5;
const MISS_WINDOW_MS = 15 * 60 * 1000;

/** The web app asks this to know whether to show the Turnstile check. The site key is public by design. */
auth.get("/config", (c) => c.json({ turnstile_site_key: turnstileOn(c) ? c.env.TURNSTILE_SITE_KEY : null }));

/**
 * Per-IP limits, on top of the per-email ones, so one machine cannot send codes to thousands of addresses
 * (email bombing, and it burns the Resend quota) or spread code guesses across many emails.
 */
async function ipLimited(c: Context<AppEnv>, limiter: RateLimit | undefined): Promise<boolean> {
  if (!limiter) return false;
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  try { return !(await limiter.limit({ key: ip })).success; } catch { return false; }
}

/**
 * The Turnstile widget on its own page, for the phone app's web view. It posts the token back to the app.
 * Turnstile only runs on hostnames the widget allows, so the page has to come from this Worker's own address.
 */
auth.get("/turnstile", (c) => {
  if (!turnstileOn(c)) return c.json({ error: "Not found" }, 404);
  const key = JSON.stringify(c.env.TURNSTILE_SITE_KEY).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:transparent}body{display:flex;align-items:center;justify-content:center}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=go&render=explicit" async defer></script></head>
<body><div id="t"></div><script>
function send(m){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function go(){turnstile.render("#t",{sitekey:${key},theme:"auto",callback:function(token){send({token:token});},"error-callback":function(){send({error:true});},"expired-callback":function(){send({expired:true});}});}
</script></body></html>`;
  return c.html(html, 200, { "Cache-Control": "no-store" });
});

auth.post("/request", async (c) => {
  const parsed = requestBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid email" }, 400);
  const { email, kind } = parsed.data;
  if (await ipLimited(c, c.env.AUTH_REQUEST_LIMIT)) return c.json({ error: "Too many sign-in requests from your network. Wait a minute and try again." }, 429);
  if (!(await turnstileOk(c, parsed.data.turnstile))) return c.json({ error: "Please complete the check and try again" }, 400);

  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND expires_at > ?",
  )
    .bind(email, Date.now() + TOKEN_MS - 3600 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return c.json({ error: "Too many requests, try again later" }, 429);
  }

  // A fresh code starts a fresh set of guesses. Requests are capped per hour, so this does not weaken the limit.
  if (kind === "code") await c.env.DB.prepare("DELETE FROM code_failures WHERE email = ?").bind(email).run();
  const secret = kind === "code" ? randomCode() : randomToken();
  // Codes are scoped to the email so a 6-digit value cannot be guessed across accounts.
  const hash = await sha256Hex(kind === "code" ? `${email}:${secret}` : secret);
  await c.env.DB.prepare("INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES (?, ?, ?, ?)")
    .bind(hash, kind, email, Date.now() + TOKEN_MS)
    .run();

  try {
    if (kind === "code") {
      await sendEmail(
        c.env, email, "Your Kakushin sign-in code",
        `<p>Your sign-in code is <b style="font-size:20px">${secret}</b></p><p>It expires in 15 minutes.</p>`,
        `Your Kakushin sign-in code is ${secret}. It expires in 15 minutes.`,
      );
    } else {
      const url = `${c.env.APP_URL}/auth/verify?token=${secret}`;
      await sendEmail(
        c.env, email, "Sign in to Kakushin",
        `<p><a href="${url}">Sign in to Kakushin</a></p><p>The link expires in 15 minutes.</p>`,
        `Sign in to Kakushin: ${url}\nThe link expires in 15 minutes.`,
      );
    }
  } catch (e) {
    // Do not let a failed send use up the person's hourly allowance.
    await c.env.DB.prepare("DELETE FROM login_tokens WHERE token_hash = ?").bind(hash).run();
    console.error(`sign-in email failed: ${e instanceof Error ? e.message : e}`);
    return c.json({ error: "We could not send an email to that address right now. Try again later or use a different address." }, 502);
  }
  // Same response whether or not the account exists.
  return c.json({ ok: true });
});

const verifyBody = z.union([
  z.object({ token: z.string().min(10).max(200) }),
  z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/) }),
]);

auth.post("/verify", async (c) => {
  const parsed = verifyBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
  if (await ipLimited(c, c.env.AUTH_VERIFY_LIMIT)) return c.json({ error: "Too many attempts from your network. Wait a minute and try again." }, 429);

  // A 6-digit code has only a million values, so cap wrong guesses per email. Links carry 256 bits and need no cap.
  const guessing = "code" in parsed.data ? parsed.data.email : null;
  if (guessing) {
    const f = await c.env.DB.prepare("SELECT count, window_start FROM code_failures WHERE email = ?").bind(guessing).first<{ count: number; window_start: number }>();
    if (f && f.count >= MAX_CODE_MISSES && Date.now() - f.window_start < MISS_WINDOW_MS) {
      return c.json({ error: "Too many wrong codes. Request a new code and try again in a few minutes." }, 429);
    }
  }

  const hash = await sha256Hex(
    "token" in parsed.data ? parsed.data.token : `${parsed.data.email}:${parsed.data.code}`,
  );
  // Single use: delete and read in one statement.
  const row = await c.env.DB.prepare(
    "DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email",
  )
    .bind(hash, Date.now())
    .first<{ email: string }>();
  if (!row) {
    if (guessing) {
      const now = Date.now();
      const f = await c.env.DB.prepare(
        `INSERT INTO code_failures (email, count, window_start) VALUES (?, 1, ?)
         ON CONFLICT(email) DO UPDATE SET
           count = CASE WHEN ? - window_start >= ${MISS_WINDOW_MS} THEN 1 ELSE count + 1 END,
           window_start = CASE WHEN ? - window_start >= ${MISS_WINDOW_MS} THEN ? ELSE window_start END
         RETURNING count`,
      ).bind(guessing, now, now, now, now).first<{ count: number }>();
      // On the last allowed miss, burn any outstanding codes so the attacker needs a fresh one (which is rate limited).
      if ((f?.count ?? 0) >= MAX_CODE_MISSES) await c.env.DB.prepare("DELETE FROM login_tokens WHERE email = ? AND kind = 'code'").bind(guessing).run();
    }
    return c.json({ error: "This link or code is invalid or expired" }, 401);
  }
  if (guessing) await c.env.DB.prepare("DELETE FROM code_failures WHERE email = ?").bind(guessing).run();

  let user = await c.env.DB.prepare("SELECT id, suspended FROM users WHERE email = ?").bind(row.email).first<{ id: string; suspended?: number }>();
  if (user?.suspended) return c.json({ error: "This account has been suspended. Contact the Kakushin team." }, 403);
  if (!user) {
    const id = newId();
    await c.env.DB.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").bind(id, row.email, Date.now()).run();
    user = { id };
  }

  // Admin invites sent to this address become memberships now.
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO memberships (org_id, user_id, role) SELECT org_id, ?, role FROM org_invites WHERE email = ?").bind(user.id, row.email),
    c.env.DB.prepare("DELETE FROM org_invites WHERE email = ?").bind(row.email),
  ]);

  const token = await createSession(c, user.id);
  setSessionCookie(c, token);
  // The token is also returned so the mobile app can store it in secure storage.
  return c.json({ ok: true, token });
});

auth.post("/logout", async (c) => {
  const token = readToken(c);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
  clearSessionCookie(c);
  return c.json({ ok: true });
});
