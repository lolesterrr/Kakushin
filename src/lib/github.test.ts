import { describe, expect, it } from "vitest";
import { loginFromProfile, matchContributors, parseRepo } from "./github";

describe("parseRepo", () => {
  it("takes plain github.com repo links", () => {
    expect(parseRepo("https://github.com/amy/solar-map")).toBe("amy/solar-map");
    expect(parseRepo("https://www.github.com/amy/solar.map.git")).toBe("amy/solar.map");
    expect(parseRepo(" https://github.com/Team-1/app/ ")).toBe("Team-1/app");
  });
  it("refuses anything else", () => {
    for (const bad of ["https://gitlab.com/a/b", "https://github.com/amy", "https://github.com/amy/app/tree/main", "javascript:alert(1)",
      "https://github.com/-amy/app", "https://github.com/amy/..", "https://github.com.evil.com/a/b", "https://gist.github.com/a/b"]) expect(parseRepo(bad)).toBeNull();
  });
});

describe("loginFromProfile", () => {
  it("reads a profile link", () => { expect(loginFromProfile("https://github.com/AmyK")).toBe("amyk"); expect(loginFromProfile("https://github.com/amyk/")).toBe("amyk"); });
  it("ignores repo links and other sites", () => { expect(loginFromProfile("https://github.com/amyk/repo")).toBeNull(); expect(loginFromProfile("https://x.com/amyk")).toBeNull(); expect(loginFromProfile(undefined)).toBeNull(); });
});

describe("matchContributors", () => {
  it("names members, counts strangers and lists members with no commits", () => {
    const m = matchContributors([{ login: "ben", commits: 3 }, { login: "AmyK", commits: 42 }, { login: "zed", commits: 1 }],
      [{ name: "Amy", login: "amyk" }, { name: "Ben", login: "ben" }, { name: "Cy", login: null }, { name: "Di", login: "di" }]);
    expect(m.contributors).toEqual([{ login: "AmyK", commits: 42, member: "Amy" }, { login: "ben", commits: 3, member: "Ben" }, { login: "zed", commits: 1, member: null }]);
    expect(m.not_on_team).toBe(1);
    expect(m.no_commits).toEqual([{ name: "Cy", linked: false }, { name: "Di", linked: true }]);
  });
});
