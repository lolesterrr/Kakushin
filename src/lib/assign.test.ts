import { describe, expect, it } from "vitest";
import { autoAssign } from "./assign";

const loads = (pairs: { email: string }[]) => pairs.reduce((m, p) => m.set(p.email, (m.get(p.email) ?? 0) + 1), new Map<string, number>());

describe("autoAssign", () => {
  it("gives every team N judges and spreads the load evenly", () => {
    const teams = ["t1", "t2", "t3", "t4", "t5", "t6"];
    const { pairs, short } = autoAssign(teams, ["a", "b", "c", "d"], 2, new Set());
    expect(short).toEqual([]);
    for (const t of teams) expect(pairs.filter((p) => p.team === t)).toHaveLength(2);
    expect([...loads(pairs).values()].sort()).toEqual([3, 3, 3, 3]);
  });
  it("never assigns a blocked pair", () => {
    const { pairs } = autoAssign(["t1", "t2"], ["a", "b", "c"], 2, new Set(["a|t1", "b|t2"]));
    expect(pairs.some((p) => p.email === "a" && p.team === "t1")).toBe(false);
    expect(pairs.some((p) => p.email === "b" && p.team === "t2")).toBe(false);
    expect(pairs.filter((p) => p.team === "t1").map((p) => p.email).sort()).toEqual(["b", "c"]);
  });
  it("reports teams that cannot get enough judges", () => {
    const { pairs, short } = autoAssign(["t1", "t2"], ["a", "b"], 3, new Set(["a|t2"]));
    expect(short.sort()).toEqual(["t1", "t2"]);
    expect(pairs.filter((p) => p.team === "t2").map((p) => p.email)).toEqual(["b"]);
  });
  it("fills the hardest team first", () => {
    // Only c can judge t2. Without hardest-first, t1 could take c and leave t2 with nobody.
    const { short } = autoAssign(["t1", "t2"], ["a", "b", "c"], 1, new Set(["a|t2", "b|t2"]));
    expect(short).toEqual([]);
  });
});
