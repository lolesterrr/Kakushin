import type { Context } from "hono";
import type { AppEnv } from "../types";

/**
 * Cloudflare Turnstile on sign-in. Off until TURNSTILE_SECRET and TURNSTILE_SITE_KEY are set, so nothing breaks before keys exist.
 * Once on, every sign-in request needs a token: the web form shows the widget, and the phone app shows the same widget
 * in a small web view (GET /api/auth/turnstile). There is no client header that skips it, because anyone can send a header.
 */
export const turnstileOn = (c: Context<AppEnv>) => !!c.env.TURNSTILE_SECRET && !!c.env.TURNSTILE_SITE_KEY;

export async function turnstileOk(c: Context<AppEnv>, token: string | undefined): Promise<boolean> {
  if (!turnstileOn(c)) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret: c.env.TURNSTILE_SECRET!, response: token });
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  try {
    const r = await fetch(c.env.TURNSTILE_VERIFY_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
