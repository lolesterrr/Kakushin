export interface Env {
  DB: D1Database;
  FILES?: R2Bucket; // not bound until R2 is enabled (Day 2)
  ASSETS: Fetcher;
  APP_URL: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_platform_admin: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
