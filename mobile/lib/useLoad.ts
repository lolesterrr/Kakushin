import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { SignedOut } from "./api";
import { readJSON, writeJSON } from "./store";

/**
 * Loads data when a screen is first shown and again each time it regains focus; supports pull to refresh.
 * With `cache`, the last good answer is kept on the phone: it shows at once on the next open, and stays
 * on screen (marked `stale`) when the network fails, instead of a blank page.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { cache?: string | null } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const key = opts.cache ? `cache.${opts.cache}` : null;
  const fresh = useRef(false);

  // Show the saved copy while the network answers, unless the network was faster.
  useEffect(() => {
    fresh.current = false;
    if (!key) return;
    let alive = true;
    void readJSON<T>(key).then((v) => { if (alive && v !== null && !fresh.current) { setData(v); setStale(true); } });
    return () => { alive = false; };
  }, [key]);

  const run = useCallback(async () => {
    try {
      const v = await fn();
      fresh.current = true;
      setData(v); setErr(""); setStale(false);
      if (key) void writeJSON(key, v);
    } catch (e) {
      // A saved copy is better than an error, except when the person was signed out.
      if (e instanceof SignedOut) setData(null);
      setErr((e as Error).message);
    }
    setLoaded(true);
  }, [key, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void run(); }, [run]));
  const refresh = useCallback(async () => { setRefreshing(true); await run(); setRefreshing(false); }, [run]);
  return { data, err, stale: stale && !!err, loaded, refreshing, refresh, reload: run };
}
