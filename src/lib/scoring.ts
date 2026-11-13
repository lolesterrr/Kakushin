export interface Criterion { id: string; name: string; weight: number; max_score: number; position: number }
export interface ScoreRow { judge: string; team: string; criterion: string; score: number }
export interface LeaderRow {
  team_id: string; name: string;
  total: number | null;            // average of the judges who finished this team, 0 to 100
  first_criterion: number | null;  // tie-break: average normalised score on the first criterion, 0 to 100
  judges: { judge: string; total: number | null }[];
  finished: number;                // how many judges finished this team
  rank: number; tied: boolean;
  normalised: number | null;       // average of each judge's total rescaled to the panel (see normalisedTotals)
  norm_rank: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** judge_total = sum of (score / max_score) * weight * 100. Null until the judge scored every criterion. */
export function judgeTotal(criteria: Criterion[], scores: Map<string, number>): number | null {
  let t = 0;
  for (const c of criteria) {
    const s = scores.get(c.id);
    if (s === undefined) return null;
    t += (s / c.max_score) * c.weight * 100;
  }
  return r2(t);
}

export function leaderboard(criteria: Criterion[], teams: { id: string; name: string }[], rows: ScoreRow[], judges: string[]): LeaderRow[] {
  const sorted = [...criteria].sort((a, b) => a.position - b.position);
  const first = sorted[0];
  const out = teams.map((t) => {
    const per = judges.map((j) => {
      const m = new Map(rows.filter((r) => r.team === t.id && r.judge === j).map((r) => [r.criterion, r.score]));
      return { judge: j, total: judgeTotal(sorted, m), firstScore: first ? m.get(first.id) : undefined };
    });
    const done = per.filter((p) => p.total !== null);
    const total = done.length ? r2(done.reduce((a, p) => a + (p.total as number), 0) / done.length) : null;
    const fc = first && done.length ? r2(done.reduce((a, p) => a + ((p.firstScore ?? 0) / first.max_score) * 100, 0) / done.length) : null;
    return { team_id: t.id, name: t.name, total, first_criterion: fc, judges: per.map(({ judge, total }) => ({ judge, total })), finished: done.length, rank: 0, tied: false, normalised: null as number | null, norm_rank: null as number | null };
  });
  const norm = normalisedTotals(out);
  for (const row of out) row.normalised = norm.get(row.team_id) ?? null;
  const byNorm = out.filter((r) => r.normalised !== null).sort((a, b) => (b.normalised as number) - (a.normalised as number));
  byNorm.forEach((row, i) => { const prev = byNorm[i - 1]; row.norm_rank = prev && prev.normalised === row.normalised ? prev.norm_rank : i + 1; });
  out.sort((a, b) =>
    (b.total ?? -1) - (a.total ?? -1) || (b.first_criterion ?? -1) - (a.first_criterion ?? -1) || a.name.localeCompare(b.name));
  out.forEach((row, i) => {
    const prev = out[i - 1];
    const same = prev && prev.total === row.total && prev.first_criterion === row.first_criterion && row.total !== null;
    row.rank = same ? prev.rank : i + 1;
    if (same) { row.tied = true; prev.tied = true; }
  });
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

/**
 * Judges score on different scales: one gives everyone 80, another gives 40 to 70. Each judge's totals are turned into
 * "how far above or below their own average" (in their own spreads), then put back on the panel's scale, so a team is
 * not helped or hurt by which judges it drew. A judge with only one finished team has no scale yet, so their raw total is used.
 */
export function normalisedTotals(rows: Pick<LeaderRow, "team_id" | "judges">[]): Map<string, number> {
  const all = rows.flatMap((r) => r.judges.map((j) => j.total).filter((t): t is number => t !== null));
  const out = new Map<string, number>();
  if (!all.length) return out;
  const pm = mean(all), ps = sd(all);
  const stats = new Map<string, { m: number; s: number; n: number }>();
  for (const j of new Set(rows.flatMap((r) => r.judges.map((x) => x.judge)))) {
    const ts = rows.map((r) => r.judges.find((x) => x.judge === j)?.total).filter((t): t is number => t !== null && t !== undefined);
    if (ts.length) stats.set(j, { m: mean(ts), s: sd(ts), n: ts.length });
  }
  for (const r of rows) {
    const vals = r.judges.filter((j) => j.total !== null).map((j) => {
      const st = stats.get(j.judge)!;
      if (st.n < 2) return j.total as number;
      if (st.s === 0) return pm;
      return pm + (((j.total as number) - st.m) / st.s) * ps;
    });
    if (vals.length) out.set(r.team_id, r2(mean(vals)));
  }
  return out;
}

export interface JudgeCalibration {
  judge: string;
  teams: number;              // teams this judge finished
  average: number | null;     // their average total, 0 to 100
  spread: number | null;      // standard deviation of their totals
  gap: number | null;         // average of (their total minus the other judges' average) on the teams they share
  flagged: boolean;
}

/** Flag judges more than 1.5 points out of 10 (15 out of 100) away from the rest of the panel. */
export const CALIBRATION_FLAG = 15;

export function calibration(rows: Pick<LeaderRow, "judges">[], judges: string[]): JudgeCalibration[] {
  return judges.map((judge) => {
    const mine: number[] = [], gaps: number[] = [];
    for (const r of rows) {
      const t = r.judges.find((j) => j.judge === judge)?.total;
      if (t === null || t === undefined) continue;
      mine.push(t);
      const others = r.judges.filter((j) => j.judge !== judge && j.total !== null).map((j) => j.total as number);
      if (others.length) gaps.push(t - mean(others));
    }
    const gap = gaps.length ? r2(mean(gaps)) : null;
    return {
      judge, teams: mine.length,
      average: mine.length ? r2(mean(mine)) : null,
      spread: mine.length ? r2(sd(mine)) : null,
      gap, flagged: gap !== null && Math.abs(gap) > CALIBRATION_FLAG,
    };
  });
}
