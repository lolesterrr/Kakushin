/**
 * SQL that is true when the judge with `email` may see `team` in challenge `ch`. Each argument is an SQL expression
 * (a column or a numbered placeholder). A conflict always hides the team. Once a challenge has any assignments,
 * a judge only sees the teams assigned to them; before that they see every finalist, as they always did.
 */
export const judgeSees = (ch: string, email: string, team: string) =>
  `(NOT EXISTS (SELECT 1 FROM judge_conflicts jc WHERE jc.challenge_id = ${ch} AND jc.email = ${email} AND jc.team_id = ${team})
    AND (NOT EXISTS (SELECT 1 FROM judge_assignments ja WHERE ja.challenge_id = ${ch})
         OR EXISTS (SELECT 1 FROM judge_assignments ja WHERE ja.challenge_id = ${ch} AND ja.email = ${email} AND ja.team_id = ${team})))`;

export interface Pair { email: string; team: string }

/**
 * Spreads judges over teams so each team gets `perTeam` judges and every judge has a similar load.
 * `blocked` holds "email|team" pairs that must never be assigned (conflicts and a judge's own team).
 * Teams with the fewest possible judges are filled first, so they are not left short by earlier picks.
 * Returns the pairs and the teams that could not get `perTeam` judges.
 */
export function autoAssign(teams: string[], judges: string[], perTeam: number, blocked: Set<string>): { pairs: Pair[]; short: string[] } {
  const load = new Map(judges.map((j) => [j, 0]));
  const order = judges.map((j, i) => [j, i] as const);
  const eligible = (t: string) => judges.filter((j) => !blocked.has(`${j}|${t}`));
  const queue = teams.map((t, i) => ({ t, i, n: eligible(t).length })).sort((a, b) => a.n - b.n || a.i - b.i);
  const pairs: Pair[] = [], short: string[] = [];
  for (const { t } of queue) {
    const pick = order
      .filter(([j]) => !blocked.has(`${j}|${t}`))
      .sort((a, b) => load.get(a[0])! - load.get(b[0])! || a[1] - b[1])
      .slice(0, perTeam)
      .map(([j]) => j);
    for (const j of pick) { pairs.push({ email: j, team: t }); load.set(j, load.get(j)! + 1); }
    if (pick.length < perTeam) short.push(t);
  }
  return { pairs, short };
}
