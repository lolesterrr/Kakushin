import type { Context } from "hono";
import type { AppEnv } from "../types";

/**
 * Cloudflare Turnstile on sign-in. Off until TURNSTILE_SECRET and TURNSTILE_SITE_KEY are set, so nothing breaks before keys exist.
 * Once on, every sign-in request needs a token: the web form shows the widget, and the phone app shows the same widget
 * in a small web view (GET /api/auth/turnstile). There is no client header that skips it, because anyone can send a header.
 */
export const turnstileOn = (c: Context<AppEnv>) => !!c.env.TURNSTILE_SECRET && !!c.env.TURNSTILE_SITE_KEY;

/** Where the widget may run: TURNSTILE_HOSTNAMES (comma-separated), else the host of APP_URL. */
function allowedHosts(c: Context<AppEnv>): string[] {
  const list = (c.env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list;
  try { return [new URL(c.env.APP_URL).hostname.toLowerCase()]; } catch { return []; }
}

/**
 * Checks a token with Cloudflare. A pass needs success, the "signin" action (so a token from another page cannot be
 * reused here) and a hostname we serve. Tokens are single use; Cloudflare rejects a replay.
 */
export async function turnstileOk(c: Context<AppEnv>, token: string | undefined): Promise<boolean> {
  if (!turnstileOn(c)) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const hosts = allowedHosts(c);
  if (!hosts.length) return false;
  const form = new URLSearchParams({ secret: c.env.TURNSTILE_SECRET!, response: token });
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  try {
    const r = await fetch(c.env.TURNSTILE_VERIFY_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return false;
    const d = (await r.json()) as { success?: boolean; action?: string; hostname?: string };
    return d.success === true && d.action === "signin" && hosts.includes(String(d.hostname ?? "").toLowerCase());
  } catch {
    return false;
  }
}
