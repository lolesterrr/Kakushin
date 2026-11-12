import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface Me { id: string; email: string; name: string | null; bio: string | null; institution: string | null; location: string | null; skills: string[] }
interface Ctx { me: Me | null; reload: () => Promise<void> }

const AuthCtx = createContext<Ctx>({ me: null, reload: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = () => api<{ user: Me | null }>("/me").then((r) => setMe(r.user)).catch(() => setMe(null));
  useEffect(() => { void reload(); }, []);
  if (me === undefined) return null;
  return <AuthCtx.Provider value={{ me, reload }}>{children}</AuthCtx.Provider>;
}

const NEXT_KEY = "kk_next";
export const rememberNext = (path: string) => { try { localStorage.setItem(NEXT_KEY, path); } catch { /* storage blocked */ } };
export const takeNext = () => {
  try { const v = localStorage.getItem(NEXT_KEY); localStorage.removeItem(NEXT_KEY); return v && v.startsWith("/") ? v : "/"; }
  catch { return "/"; }
};
