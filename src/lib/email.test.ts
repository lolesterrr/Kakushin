import { describe, expect, it } from "vitest";
import { parseFrom } from "./email";

describe("parseFrom", () => {
  it("splits a name and address", () => expect(parseFrom("Kakushin <hello@kakushinhub.site>")).toEqual({ name: "Kakushin", email: "hello@kakushinhub.site" }));
  it("keeps a bare address", () => expect(parseFrom(" hello@kakushinhub.site ")).toEqual({ email: "hello@kakushinhub.site" }));
  it("drops quotes around the name", () => expect(parseFrom('"Kakushin Team" <a@b.org>')).toEqual({ name: "Kakushin Team", email: "a@b.org" }));
});
