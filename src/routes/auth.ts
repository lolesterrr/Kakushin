import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId, randomCode, randomToken, sha256Hex } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { clearSessionCookie, createSession, readToken, setSessionCookie } from "../lib/session";

export const auth = new Hono<AppEnv>();

const TOKEN_MS = 15 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 5;

const requestBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // "link" for web (magic link), "code" for mobile (6-digit code)
  kind: z.enum(["link", "code"]).default("link"),
});

auth.post("/request", async (c) => {
  const parsed = requestBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid email" }, 400);
  const { email, kind } = parsed.data;

  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND expires_at > ?",
  )
    .bind(email, Date.now() + TOKEN_MS - 3600 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return c.json({ error: "Too many requests, try again later" }, 429);
  }

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

  const hash = await sha256Hex(
    "token" in parsed.data ? parsed.data.token : `${parsed.data.email}:${parsed.data.code}`,
  );
  // Single use: delete and read in one statement.
  const row = await c.env.DB.prepare(
    "DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email",
  )
    .bind(hash, Date.now())
    .first<{ email: string }>();
  if (!row) return c.json({ error: "This link or code is invalid or expired" }, 401);

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
