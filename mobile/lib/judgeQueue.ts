import { api } from "./api";
import { readJSON, writeJSON } from "./store";

/**
 * Scores a judge saved while the phone had no network. They stay on the phone and are sent when it is back,
 * so nobody loses work in a venue with weak signal. One entry per team: a newer save replaces the older one.
 */
export interface QueuedScores { path: string; team: string; teamName: string; scores: { criterion_id: string; score: number; comment: string }[]; saved_at: number }

const key = (userId: string) => `judge.queue.${userId}`;
export const NETWORK_ERROR = "Could not reach Kakushin";

export async function queued(userId: string): Promise<QueuedScores[]> { return (await readJSON<QueuedScores[]>(key(userId))) ?? []; }

export async function enqueue(userId: string, item: QueuedScores): Promise<void> {
  const list = (await queued(userId)).filter((q) => q.path !== item.path);
  await writeJSON(key(userId), [...list, item]);
}

let running: Promise<{ sent: number; failed: { teamName: string; error: string }[] }> | null = null;

/** Sends what is waiting. Network failures stay queued; a refusal from the server (scoring closed) is dropped and reported. */
export function flush(userId: string) {
  running ??= (async () => {
    const list = await queued(userId);
    const keep: QueuedScores[] = [], failed: { teamName: string; error: string }[] = [];
    let sent = 0;
    for (const q of list) {
      try { await api(q.path, { method: "PUT", json: { scores: q.scores } }); sent++; }
      catch (e) {
        const msg = (e as Error).message;
        if (msg.startsWith(NETWORK_ERROR)) keep.push(q); else failed.push({ teamName: q.teamName, error: msg });
      }
    }
    // Saves made while this ran are kept too.
    const now = await queued(userId);
    await writeJSON(key(userId), [...keep, ...now.filter((n) => !list.some((q) => q.path === n.path && q.saved_at === n.saved_at))]);
    return { sent, failed };
  })().finally(() => { running = null; });
  return running;
}
