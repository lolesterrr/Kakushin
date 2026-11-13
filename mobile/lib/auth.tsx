import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, loadToken, saveToken, setSignedOutHandler } from "./api";
import { me as meSchema, myTeams, type Me } from "./schemas";
import { registerForPush, unregisterPush } from "./push";
import { syncPrefs } from "./prefs";
import { clearSaved } from "./store";
import { clearReminders, setServerPushes, syncReminders } from "./reminders";

interface AuthState {
  ready: boolean; me: Me | null;
  requestCode: (email: string, turnstile?: string) => Promise<void>;
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
    setSignedOutHandler(() => { setMe(null); void clearSaved(); void clearReminders(); });
    (async () => { if (await loadToken()) await reload(); setReady(true); })();
  }, [reload]);

  // Once signed in: tell the server about this phone so pushes reach it (it honours the on/off setting), send any
  // onboarding picks to the account, and set deadline reminders on the phone when server pushes cannot reach it.
  useEffect(() => {
    if (!me) return;
    void syncPrefs();
    void (async () => {
      const state = await registerForPush();
      const settings = await api<{ push: boolean }>("/inbox/settings").catch(() => ({ push: true }));
      setServerPushes(state === "ready" && settings.push);
      await syncReminders((await api("/teams/mine", { schema: myTeams })).teams);
    })().catch(() => {});
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AuthState = {
    ready, me, reload,
    requestCode: async (email, turnstile) => { await api("/auth/request", { method: "POST", json: { email: email.trim().toLowerCase(), kind: "code", ...(turnstile ? { turnstile } : {}) } }); },
    verify: async (email, code) => {
      const r = await api<{ token: string }>("/auth/verify", { method: "POST", json: { email: email.trim().toLowerCase(), code } });
      await saveToken(r.token); await reload();
    },
    signOut: async () => { await unregisterPush(); try { await api("/auth/logout", { method: "POST" }); } catch { /* already gone */ } await clearToken(); setMe(null); await clearSaved(); await clearReminders(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
