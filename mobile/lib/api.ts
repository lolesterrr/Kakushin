import * as SecureStore from "expo-secure-store";
import type { z } from "zod";
import { API_URL } from "./config";

const KEY = "kakushin.session";
let token: string | null = null;

export const loadToken = async () => { try { token = await SecureStore.getItemAsync(KEY); } catch { token = null; } return token; };
// If secure storage is unavailable the session still works until the app closes.
export const saveToken = async (t: string) => { token = t; try { await SecureStore.setItemAsync(KEY, t); } catch { /* keep in memory */ } };
export const clearToken = async () => { token = null; try { await SecureStore.deleteItemAsync(KEY); } catch { /* nothing stored */ } };
export const hasToken = () => !!token;

/** Raised when the server says the session is no longer valid, so the app can send the person back to sign in. */
export class SignedOut extends Error {}
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export async function api<T = unknown>(path: string, opts: { method?: string; json?: unknown; schema?: z.ZodType<T, z.ZodTypeDef, unknown> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Kakushin-Client": "mobile", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
    });
  } catch {
    throw new Error("Could not reach Kakushin. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (res.status === 401 && token && path !== "/auth/verify") { await clearToken(); onSignedOut(); throw new SignedOut("Please sign in again"); }
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Something went wrong (${res.status})`);
  if (opts.schema) {
    const parsed = opts.schema.safeParse(data);
    if (!parsed.success) throw new Error("The server sent something the app did not expect. Update the app and try again.");
    return parsed.data;
  }
  return data as T;
}

/** Headers every request carries, for calls that cannot go through api(), such as file uploads. */
export const authHeaders = (): Record<string, string> => ({ "X-Kakushin-Client": "mobile", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

/** Turns a raw upload response into the same errors api() raises. */
export async function uploadResult(status: number, text: string): Promise<unknown> {
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (status === 401 && token) { await clearToken(); onSignedOut(); throw new SignedOut("Please sign in again"); }
  if (status < 200 || status >= 300) throw new Error((data as { error?: string } | null)?.error ?? `Something went wrong (${status})`);
  return data;
}

export const pdfUrl = (code: string) => `${API_URL}/api/certificates/${code}/pdf`;
