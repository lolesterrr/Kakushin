import type { ChallengeCard } from "./schemas";

export interface Suggestion { slug: string; name: string; logo_url?: string | null; open: number; match: number }

/** Organisations with open challenges, best match for the picked topics first. */
export function suggestOrgs(list: ChallengeCard[], picked: string[], n = 3): Suggestion[] {
  const by = new Map<string, Suggestion>();
  for (const c of list) {
    const s = by.get(c.org.slug) ?? { slug: c.org.slug, name: c.org.name, logo_url: c.org.logo_url, open: 0, match: 0 };
    s.open += 1;
    s.match += c.topics.filter((x) => picked.includes(x)).length;
    by.set(c.org.slug, s);
  }
  return [...by.values()].sort((a, b) => b.match - a.match || b.open - a.open || a.name.localeCompare(b.name)).slice(0, n);
}

/**
 * The "For you" row: open challenges that share at least one topic with what the person follows,
 * most shared topics first, then the one closing soonest.
 */
export function forYou(list: ChallengeCard[], topics: string[], now = Date.now(), n = 6): ChallengeCard[] {
  if (!topics.length) return [];
  return list
    .filter((c) => !c.applications_close_at || c.applications_close_at > now)
    .map((c) => ({ c, score: c.topics.filter((x) => topics.includes(x)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.c.applications_close_at ?? Infinity) - (b.c.applications_close_at ?? Infinity))
    .slice(0, n)
    .map((x) => x.c);
}
