export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  EXPO_PUSH_URL?: string; // only set in tests, to point pushes at a fake server
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_platform_admin: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
