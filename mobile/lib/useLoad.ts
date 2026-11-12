import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/** Loads data when a screen is first shown and again each time it regains focus; supports pull to refresh. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const run = useCallback(async () => {
    try { setData(await fn()); setErr(""); } catch (e) { setErr((e as Error).message); }
    setLoaded(true);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void run(); }, [run]));
  const refresh = useCallback(async () => { setRefreshing(true); await run(); setRefreshing(false); }, [run]);
  return { data, err, loaded, refreshing, refresh, reload: run };
}
