import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, loadToken, saveToken, setSignedOutHandler } from "./api";
import { me as meSchema, type Me } from "./schemas";
import { registerForPush, unregisterPush } from "./push";

interface AuthState {
  ready: boolean; me: Me | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => { const v = useContext(Ctx); if (!v) throw new Error("AuthProvider missing"); return v; };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    try { setMe((await api("/me", { schema: meSchema })).user); } catch { setMe(null); }
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    (async () => { if (await loadToken()) await reload(); setReady(true); })();
  }, [reload]);

  // Once signed in, make sure the server knows this phone so pushes can reach it. The server honours the on/off setting.
  useEffect(() => { if (me) void registerForPush(); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AuthState = {
    ready, me, reload,
    requestCode: async (email) => { await api("/auth/request", { method: "POST", json: { email: email.trim().toLowerCase(), kind: "code" } }); },
    verify: async (email, code) => {
      const r = await api<{ token: string }>("/auth/verify", { method: "POST", json: { email: email.trim().toLowerCase(), code } });
      await saveToken(r.token); await reload();
    },
    signOut: async () => { await unregisterPush(); try { await api("/auth/logout", { method: "POST" }); } catch { /* already gone */ } await clearToken(); setMe(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
