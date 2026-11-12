import { describe, expect, it } from "vitest";
import { leaderboard, judgeTotal, type Criterion } from "./scoring";

const criteria: Criterion[] = [
  { id: "a", name: "Innovation", weight: 0.5, max_score: 10, position: 0 },
  { id: "b", name: "Impact", weight: 0.3, max_score: 10, position: 1 },
  { id: "c", name: "Pitch", weight: 0.2, max_score: 5, position: 2 },
];
const s = (judge: string, team: string, a: number, b: number, c: number) => [
  { judge, team, criterion: "a", score: a }, { judge, team, criterion: "b", score: b }, { judge, team, criterion: "c", score: c },
];

describe("scoring", () => {
  it("weights each criterion by score over max", () => {
    // 0.5*0.8 + 0.3*0.6 + 0.2*1.0 = 0.78
    expect(judgeTotal(criteria, new Map([["a", 8], ["b", 6], ["c", 5]]))).toBe(78);
  });
  it("is null until every criterion is scored", () => {
    expect(judgeTotal(criteria, new Map([["a", 8]]))).toBeNull();
  });
  it("averages judges who finished a team and ranks teams", () => {
    const rows = [...s("j1", "t1", 8, 6, 5), ...s("j2", "t1", 6, 6, 5), ...s("j1", "t2", 10, 10, 5), ...s("j2", "t2", 10, 10, 5), ...s("j1", "t3", 5, 5, 2)];
    const lb = leaderboard(criteria, [{ id: "t1", name: "One" }, { id: "t2", name: "Two" }, { id: "t3", name: "Three" }], rows, ["j1", "j2"]);
    expect(lb.map((r) => [r.name, r.total, r.rank])).toEqual([["Two", 100, 1], ["One", 73, 2], ["Three", 48, 3]]);
    expect(lb[2]!.finished).toBe(1); // only j1 scored Three
  });
  it("breaks ties on the first criterion and flags real ties", () => {
    // x beats y on total here; the tie case below uses identical scores
    const rows = [...s("j1", "x", 6, 6, 5), ...s("j1", "y", 8, 2, 5)]; // x: 30+18+20=68, y: 40+6+20=66
    const lb = leaderboard(criteria, [{ id: "x", name: "X" }, { id: "y", name: "Y" }], rows, ["j1"]);
    expect(lb[0]!.name).toBe("X");
    const tie = leaderboard(criteria, [{ id: "p", name: "P" }, { id: "q", name: "Q" }], [...s("j1", "p", 5, 5, 5), ...s("j1", "q", 5, 5, 5)], ["j1"]);
    expect(tie.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true]]);
  });
  it("puts unscored teams last", () => {
    const lb = leaderboard(criteria, [{ id: "n", name: "None" }, { id: "y", name: "Yes" }], s("j1", "y", 1, 1, 1), ["j1"]);
    expect(lb.map((r) => r.name)).toEqual(["Yes", "None"]);
    expect(lb[1]!.total).toBeNull();
  });
});
