import type { Context } from "hono";
import type { AppEnv } from "../types";

/**
 * Cloudflare Turnstile on the web sign-in form. Off until TURNSTILE_SECRET is set, so nothing breaks before keys exist.
 * The phone app cannot show the widget, so it identifies itself and relies on the per-email limits instead.
 */
export const turnstileOn = (c: Context<AppEnv>) => !!c.env.TURNSTILE_SECRET && !!c.env.TURNSTILE_SITE_KEY;

export async function turnstileOk(c: Context<AppEnv>, token: string | undefined): Promise<boolean> {
  if (!turnstileOn(c)) return true;
  if (c.req.header("X-Kakushin-Client") === "mobile") return true;
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
