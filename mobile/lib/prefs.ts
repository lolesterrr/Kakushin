import { api } from "./api";
import { readJSON, writeJSON, removeJSON } from "./store";

/** What someone picked in first-run onboarding. Kept on the phone until they sign in, then sent to their account. */
export interface Prefs { topics: string[]; orgs: string[] }
const KEY = "prefs";
const DONE = "onboarded";

export const loadPrefs = async (): Promise<Prefs> => (await readJSON<Prefs>(KEY)) ?? { topics: [], orgs: [] };
export const savePrefs = (p: Prefs) => writeJSON(KEY, p);
export const onboarded = async () => !!(await readJSON<boolean>(DONE));
export const markOnboarded = () => writeJSON(DONE, true);

/**
 * After sign-in, adds the topics and organisations picked while signed out to the account.
 * It only adds: anything the person already follows stays followed.
 */
export async function syncPrefs(): Promise<void> {
  const p = await readJSON<Prefs>(KEY);
  if (!p || (!p.topics.length && !p.orgs.length)) return;
  try {
    if (p.topics.length) {
      const now = await api<{ topics: string[] }>("/follows");
      const merged = [...new Set([...(now.topics ?? []), ...p.topics])];
      await api("/follows/topics", { method: "PUT", json: { topics: merged } });
    }
    for (const o of p.orgs) await api(`/follows/orgs/${o}`, { method: "PUT" }).catch(() => {});
    await removeJSON(KEY);
  } catch { /* try again next time the app opens signed in */ }
}
