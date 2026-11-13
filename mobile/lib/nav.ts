import type { useRouter } from "expo-router";

type AppRouter = ReturnType<typeof useRouter>;

/** Sends someone to sign in, then back to where they were (an app path such as /apply/org/slug). */
export const toSignIn = (router: AppRouter, next?: string) => router.push({ pathname: "/sign-in", params: next ? { next } : {} } as never);

/** Only app paths are accepted as a place to return to after sign-in. */
export const safeNext = (next: unknown): string => (typeof next === "string" && /^\/[a-zA-Z0-9/_-]*$/.test(next) && !next.startsWith("//") ? next : "/");
