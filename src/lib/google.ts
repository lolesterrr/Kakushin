import type { Env } from "../types";

/**
 * Google sign-in. The web page gets a signed ID token from Google (Google Identity Services) and posts it to
 * /api/auth/google; this file checks it. Nothing is trusted until the signature verifies against Google's published
 * keys and the token is for this app (aud), from Google (iss), unexpired, with an email Google has verified.
 */
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let cache: { keys: Jwk[]; until: number; url: string } | null = null;

async function keys(env: Env): Promise<Jwk[]> {
  const url = env.GOOGLE_CERTS_URL ?? CERTS_URL;
  if (cache && cache.url === url && cache.until > Date.now()) return cache.keys;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`google keys ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const list = body.keys ?? [];
  const age = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
  cache = { keys: list, url, until: Date.now() + Math.min(Number(age ?? 3600), 24 * 3600) * 1000 };
  return list;
}

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64(s))) as Record<string, unknown>;

/** picture is Google's profile photo address; hd is the Google Workspace domain (a school or company), if any. */
export interface GoogleIdentity { email: string; name: string | null; picture: string | null; hd: string | null }

/** Returns who the token says they are, or null when anything about it does not check out. */
export async function verifyGoogleToken(env: Env, token: unknown, now = Date.now()): Promise<GoogleIdentity | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId || typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = json(parts[0]!), claims = json(parts[1]!);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    let jwk = (await keys(env)).find((k) => k.kid === header.kid);
    if (!jwk) { cache = null; jwk = (await keys(env)).find((k) => k.kid === header.kid); } // Google rotates keys
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    if (!ISSUERS.includes(String(claims.iss))) return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    if (typeof claims.iat === "number" && claims.iat * 1000 > now + 5 * 60 * 1000) return null;
    if (claims.email_verified !== true && claims.email_verified !== "true") return null;
    if (typeof claims.email !== "string" || !claims.email.includes("@") || claims.email.length > 254) return null;
    return {
      email: claims.email.trim().toLowerCase(),
      name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 80) : null,
      picture: typeof claims.picture === "string" && claims.picture.length <= 500 && /^https?:\/\//.test(claims.picture) ? claims.picture : null, // the host is checked again before fetching
      hd: typeof claims.hd === "string" && /^[a-z0-9.-]{3,120}$/i.test(claims.hd) ? claims.hd.toLowerCase() : null,
    };
  } catch (e) {
    console.error(`google token check failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Fetches a Google profile photo, at 256px. Only Google's photo host is fetched (never an address of the token's
 * choosing elsewhere), with a short timeout and the usual image checks. Null when anything is off.
 */
export async function fetchGooglePicture(env: Env, url: string): Promise<{ type: string; body: ArrayBuffer } | null> {
  try {
    const u = new URL(url);
    const test = env.GOOGLE_PICTURE_TEST_HOST;
    const allowed = (u.protocol === "https:" && /^[a-z0-9-]+\.googleusercontent\.com$/.test(u.hostname)) || (!!test && u.host === test);
    if (!allowed || u.username || u.password) return null;
    // Google photo addresses end in a size option like =s96-c; ask for a sharper one.
    const sized = /=s\d+(-c)?$/.test(u.href) ? u.href.replace(/=s\d+(-c)?$/, "=s256-c") : u.href;
    const res = await fetch(sized, { redirect: "manual", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 2 * 1024 * 1024) return null;
    return { type: res.headers.get("content-type") ?? "", body: await res.arrayBuffer() };
  } catch {
    return null;
  }
}
