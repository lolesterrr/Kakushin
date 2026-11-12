import type { OutboxMessage } from "./lib/outbox";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  RESEND_ONLY_TO?: string; // secret; comma-separated addresses that always go through Resend (the admin's own)
  BREVO_API_KEY?: string; // secret; when set, email goes through Brevo instead of Resend
  TURNSTILE_SECRET?: string; // secret; sign-in check is off until both Turnstile values exist
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_HOSTNAMES?: string; // where the widget may run, comma-separated; defaults to the APP_URL host
  TURNSTILE_VERIFY_URL?: string; // only set in tests
  // Per-IP limits on sign-in (wrangler.jsonc "ratelimits"). Optional so a setup without them still runs.
  AUTH_REQUEST_LIMIT?: RateLimit;
  AUTH_VERIFY_LIMIT?: RateLimit;
  // Results emails and pushes that must reach everyone (src/lib/outbox.ts). Optional so a setup without it still runs.
  OUTBOX?: Queue<OutboxMessage>;
  EXPO_PUSH_URL?: string; // only set in tests, to point pushes at a fake server
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_platform_admin: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
