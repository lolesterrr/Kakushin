import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

// A small JSON store on the phone, for saved copies of screens (so weak data does not show a blank page)
// and for choices made before signing in. Losing it is harmless: everything in it can be fetched again.
const dir = `${FileSystem.documentDirectory ?? ""}kakushin/`;
const fileFor = (key: string) => `${dir}${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
let made = false;

export async function readJSON<T>(key: string): Promise<T | null> {
  try {
    if (Platform.OS === "web") { const v = globalThis.localStorage?.getItem(`kakushin.${key}`); return v ? (JSON.parse(v) as T) : null; }
    if (!FileSystem.documentDirectory) return null;
    const path = fileFor(key);
    if (!(await FileSystem.getInfoAsync(path)).exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch { return null; }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    if (Platform.OS === "web") { globalThis.localStorage?.setItem(`kakushin.${key}`, JSON.stringify(value)); return; }
    if (!FileSystem.documentDirectory) return;
    if (!made) { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {}); made = true; }
    await FileSystem.writeAsStringAsync(fileFor(key), JSON.stringify(value));
  } catch { /* a missing saved copy only means the next load waits for the network */ }
}

export async function removeJSON(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") { globalThis.localStorage?.removeItem(`kakushin.${key}`); return; }
    if (FileSystem.documentDirectory) await FileSystem.deleteAsync(fileFor(key), { idempotent: true });
  } catch { /* nothing to remove */ }
}

/** Saved copies belong to the person who was signed in; signing out clears them so the next person starts clean. */
export async function clearSaved(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      const ls = globalThis.localStorage; if (!ls) return;
      for (let i = ls.length - 1; i >= 0; i--) { const k = ls.key(i); if (k?.startsWith("kakushin.cache.")) ls.removeItem(k); }
      return;
    }
    if (!FileSystem.documentDirectory || !(await FileSystem.getInfoAsync(dir)).exists) return;
    for (const f of await FileSystem.readDirectoryAsync(dir)) if (f.startsWith("cache_")) await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
  } catch { /* best effort */ }
}
