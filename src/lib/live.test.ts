import { describe, expect, it } from "vitest";
import { MIN, currentBlock, cutoffMark, minutesText, overlap, passCode, readPass } from "./live";

const b = (id: string, from: number, to: number) => ({ id, kind: "build", label: id, starts_at: from * MIN, ends_at: to * MIN });

describe("currentBlock", () => {
  const blocks = [b("pitch", 300, 360), b("brief", 0, 30), b("build", 30, 300)];
  it("finds the running block and the next one", () => {
    expect(currentBlock(blocks, 45 * MIN)).toMatchObject({ current: { id: "build" }, next: { id: "pitch" } });
  });
  it("a block ends exactly at its end time", () => {
    expect(currentBlock(blocks, 30 * MIN).current?.id).toBe("build");
  });
  it("before and after the event", () => {
    expect(currentBlock(blocks, -5 * MIN)).toMatchObject({ current: null, next: { id: "brief" } });
    expect(currentBlock(blocks, 400 * MIN)).toEqual({ current: null, next: null });
  });
});

describe("overlap", () => {
  it("touching blocks are fine", () => expect(overlap([b("a", 0, 30), b("b", 30, 60)])).toBeNull());
  it("finds a clash in any order", () => expect(overlap([b("b", 20, 60), b("a", 0, 30)])?.map((x) => x.id)).toEqual(["a", "b"]));
});

describe("cutoffMark", () => {
  it("sends each mark on the 5-minute run before it", () => {
    expect(cutoffMark(36 * MIN)).toBeNull();
    expect(cutoffMark(34 * MIN)).toBe(30);
    expect(cutoffMark(29 * MIN)).toBe(30);
    expect(cutoffMark(16 * MIN)).toBe(30);
    expect(cutoffMark(14 * MIN)).toBe(10);
    expect(cutoffMark(7 * MIN)).toBe(10);
    expect(cutoffMark(6 * MIN)).toBe(1);
    expect(cutoffMark(4 * MIN)).toBe(1);
  });
  it("nothing once the cutoff has passed", () => { expect(cutoffMark(0)).toBeNull(); expect(cutoffMark(-MIN)).toBeNull(); });
  it("says the real time left", () => { expect(minutesText(4 * MIN + 10_000)).toBe("4 minutes"); expect(minutesText(20_000)).toBe("1 minute"); });
});

describe("check-in passes", () => {
  it("a pass reads back only for its own challenge and secret", async () => {
    const code = await passCode("secret-1", "ch1", "user42");
    expect(code).toMatch(/^KK1\.user42\.[A-Za-z0-9_-]{22}$/);
    expect(await readPass("secret-1", "ch1", code)).toBe("user42");
    expect(await readPass("secret-1", "ch2", code)).toBeNull();
    expect(await readPass("secret-2", "ch1", code)).toBeNull();
  });
  it("a changed user id or signature is refused", async () => {
    const code = await passCode("s", "ch1", "user42");
    expect(await readPass("s", "ch1", code.replace("user42", "user43"))).toBeNull();
    expect(await readPass("s", "ch1", code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await readPass("s", "ch1", "ABCD2345")).toBeNull();
  });
});
