import { describe, expect, it } from "vitest";
import { stageMoveError } from "./topics";

describe("stageMoveError", () => {
  it("allows staying put and moving forward, including skipping a stage", () => {
    expect(stageMoveError("open", "open", false)).toBeNull();
    expect(stageMoveError("open", "reviewing", false)).toBeNull();
    expect(stageMoveError("open", "judging", undefined)).toBeNull();
    expect(stageMoveError("draft", "completed", false)).toBeNull();
  });
  it("refuses going back unless reopen is confirmed", () => {
    expect(stageMoveError("completed", "open", false)).toMatch(/re-opens/);
    expect(stageMoveError("judging", "reviewing", undefined)).toMatch(/re-opens/);
    expect(stageMoveError("open", "draft", false)).toMatch(/re-opens/);
    expect(stageMoveError("completed", "open", true)).toBeNull();
  });
});
