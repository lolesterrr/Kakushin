/** Day 7: the impact report. Pure helpers so the small-group rule is tested on its own. */

/** Groups smaller than this are never shown on their own, so nobody can be picked out of a count. */
export const MIN_GROUP = 5;

const GENDER_LABEL: Record<string, string> = { female: "Female", male: "Male", other: "Another gender", prefer_not_to_say: "Prefer not to say" };

/**
 * Turns raw gender counts (null for people who did not say) into rows that are safe to show:
 * each group of MIN_GROUP or more on its own, every smaller group folded into "Smaller groups".
 * Returns no rows at all when there are fewer than MIN_GROUP people in total.
 */
export function genderRows(counts: { gender: string | null; n: number }[]): { label: string; count: number }[] {
  const total = counts.reduce((a, r) => a + r.n, 0);
  if (total < MIN_GROUP) return [];
  const merged = new Map<string, number>();
  for (const r of counts) {
    const label = r.gender && GENDER_LABEL[r.gender] ? GENDER_LABEL[r.gender]! : "Not given";
    merged.set(label, (merged.get(label) ?? 0) + r.n);
  }
  const rows: { label: string; count: number }[] = [];
  let small = 0;
  for (const [label, count] of merged) (count >= MIN_GROUP ? rows.push({ label, count }) : (small += count));
  rows.sort((a, b) => b.count - a.count);
  if (small > 0) {
    // A single small group folded alone would still show its exact size, so fold the smallest shown group in with it.
    if (small < MIN_GROUP && rows.length > 0 && [...merged.values()].filter((v) => v > 0 && v < MIN_GROUP).length === 1) small += rows.pop()!.count;
    rows.push({ label: "Smaller groups", count: small });
  }
  return rows;
}
