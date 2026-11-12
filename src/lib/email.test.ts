import { describe, expect, it } from "vitest";
import { parseFrom } from "./email";

describe("parseFrom", () => {
  it("splits a name and address", () => expect(parseFrom("Kakushin <hello@kakushin.dpdns.org>")).toEqual({ name: "Kakushin", email: "hello@kakushin.dpdns.org" }));
  it("keeps a bare address", () => expect(parseFrom(" hello@kakushin.dpdns.org ")).toEqual({ email: "hello@kakushin.dpdns.org" }));
  it("drops quotes around the name", () => expect(parseFrom('"Kakushin Team" <a@b.org>')).toEqual({ name: "Kakushin Team", email: "a@b.org" }));
});
