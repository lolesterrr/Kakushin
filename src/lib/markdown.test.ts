import { describe, expect, it } from "vitest";
// @ts-ignore Node types are not installed for the Worker build; vitest runs this file in Node.
import fs from "node:fs";
import { parseInline, parseMarkdown, safeHref, safeImage } from "../../shared/markdown";

describe("markdown", () => {
  it("reads headings, lists and paragraphs", () => {
    const md = parseMarkdown("# Rules\n\nBe **kind**.\n\n- one\n- two\n\n1. first\n2. second\n\n---\n> note");
    expect(md.map((b) => b.t)).toEqual(["h", "p", "ul", "ol", "hr", "quote"]);
    expect(md[0]).toEqual({ t: "h", level: 1, c: [{ t: "text", v: "Rules" }] });
    expect(md[1]).toEqual({ t: "p", c: [{ t: "text", v: "Be " }, { t: "b", c: [{ t: "text", v: "kind" }] }, { t: "text", v: "." }] });
    expect(md[2]).toMatchObject({ t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] });
  });

  it("only links to http and https", () => {
    expect(parseInline("[x](https://a.com)")).toEqual([{ t: "a", href: "https://a.com", c: [{ t: "text", v: "x" }] }]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x" }, { t: "text", v: ")" }]);
    expect(parseInline("[x](data:text/html,hi)")).toEqual([{ t: "text", v: "x" }]);
    expect(safeHref("mailto:a@b.c")).toBeNull();
    expect(parseInline("see https://kakushinhub.site.")).toEqual([{ t: "text", v: "see " }, { t: "a", href: "https://kakushinhub.site", c: [{ t: "text", v: "https://kakushinhub.site" }] }, { t: "text", v: "." }]);
  });

  it("only shows images we host", () => {
    expect(parseInline("![map](/api/files/pages/0123456789abcdef0123ab/0123456789abcdef.png)")).toEqual([{ t: "img", src: "/api/files/pages/0123456789abcdef0123ab/0123456789abcdef.png", alt: "map" }]);
    expect(parseInline("![map](https://evil.example/x.png)")).toEqual([{ t: "text", v: "map" }]);
    expect(safeImage("/api/files/../secret.png")).toBeNull();
  });

  it("keeps raw HTML as text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([{ t: "p", c: [{ t: "text", v: "<script>alert(1)</script>" }] }]);
  });

  it("leaves snake_case and lone stars alone", () => {
    expect(parseInline("a_b_c and 2 * 3 * 4")).toEqual([{ t: "text", v: "a_b_c and 2 * 3 * 4" }]);
  });

  it("has the same copy in the mobile app", () => {
    const a = fs.readFileSync(new URL("../../shared/markdown.ts", import.meta.url), "utf8");
    const b = fs.readFileSync(new URL("../../mobile/lib/markdown.ts", import.meta.url), "utf8");
    expect(b).toBe(a);
  });
});
