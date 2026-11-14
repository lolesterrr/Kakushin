import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, User } from "../types";
import { randomToken, sha256Hex } from "./crypto";

export const COOKIE = "kk_session";
const SESSION_MS = 30 * 24 * 3600 * 1000;

export async function createSession(c: Context<AppEnv>, userId: string): Promise<string> {
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, Date.now() + SESSION_MS)
    .run();
  return token;
}

export function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.env.APP_URL).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Accepts the session token from the cookie (web) or an Authorization: Bearer header (mobile). */
export function readToken(c: Context<AppEnv>): string | null {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return getCookie(c, COOKIE) ?? null;
}

export async function userFromToken(c: Context<AppEnv>, token: string): Promise<User | null> {
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.is_platform_admin, u.is_super_admin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND s.expires_at > ? AND u.suspended = 0`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<User>();
  return row ?? null;
}
