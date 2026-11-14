import { describe, expect, it } from "vitest";
import { genderRows } from "./impact";

describe("genderRows", () => {
  it("shows nothing for fewer than 5 people", () => {
    expect(genderRows([{ gender: "female", n: 2 }, { gender: "male", n: 2 }])).toEqual([]);
  });
  it("shows groups of 5 or more and folds the rest", () => {
    expect(genderRows([{ gender: "female", n: 12 }, { gender: "male", n: 9 }, { gender: "other", n: 2 }, { gender: null, n: 3 }])).toEqual([
      { label: "Female", count: 12 }, { label: "Male", count: 9 }, { label: "Smaller groups", count: 5 },
    ]);
  });
  it("never leaves one small group visible by subtraction", () => {
    const rows = genderRows([{ gender: "female", n: 12 }, { gender: "male", n: 9 }, { gender: "other", n: 1 }]);
    expect(rows).toEqual([{ label: "Female", count: 12 }, { label: "Smaller groups", count: 10 }]);
  });
  it("counts people who did not say", () => {
    expect(genderRows([{ gender: null, n: 6 }])).toEqual([{ label: "Not given", count: 6 }]);
  });
});
