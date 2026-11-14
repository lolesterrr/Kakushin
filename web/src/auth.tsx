import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface Me { id: string; email: string; name: string | null; bio: string | null; institution: string | null; location: string | null; skills: string[]; links?: Record<string, string>; handle?: string | null; public_profile?: boolean; is_platform_admin?: number; is_super_admin?: number; avatar_url?: string | null; banner_url?: string | null }
interface Ctx { me: Me | null; ready: boolean; reload: () => Promise<void> }

const AuthCtx = createContext<Ctx>({ me: null, ready: false, reload: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = () => api<{ user: Me | null }>("/me").then((r) => setMe(r.user)).catch(() => setMe(null));
  useEffect(() => { void reload(); }, []);
  // Public pages render straight away as signed out; pages that need an account wait for `ready` (see <SignedInOnly>).
  return <AuthCtx.Provider value={{ me: me ?? null, ready: me !== undefined, reload }}>{children}</AuthCtx.Provider>;
}

/** Holds a signed-in-only page until /api/me answers, so it does not bounce to /login while the session is still loading. */
export function SignedInOnly({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth();
  if (!ready) return <div className="empty" aria-busy="true"><p className="hand">Loading…</p></div>;
  return <>{children}</>;
}

const NEXT_KEY = "kk_next";
/** A path on this site, never "//host" or "/\\host", which browsers read as another site. */
export const isLocalPath = (v: string | null | undefined): v is string => !!v && /^\/(?![/\\])/.test(v);
export const rememberNext = (path: string) => { try { localStorage.setItem(NEXT_KEY, path); } catch { /* storage blocked */ } };
export const takeNext = () => {
  try { const v = localStorage.getItem(NEXT_KEY); localStorage.removeItem(NEXT_KEY); return isLocalPath(v) ? v : "/"; }
  catch { return "/"; }
};
