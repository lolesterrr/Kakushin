/**
 * A small, safe Markdown reader for challenge pages: headings, paragraphs, lists, bold, italic, code, links and images.
 * It returns a tree, never HTML, so raw HTML in the text shows as plain text. Links must be http or https, and images
 * must be files we host (/api/files/...), so a challenge page cannot pull in other sites' images or run scripts.
 *
 * The web app renders this tree in web/src/markdown.tsx. The mobile app has an identical copy in mobile/lib/markdown.ts
 * (Metro cannot import outside the app folder); src/lib/markdown.test.ts checks the two files stay the same.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" };

/** Only plain web links. Anything else (javascript:, data:, mailto:, relative paths) stays as text. */
export const safeHref = (href: string): string | null => (/^https?:\/\/[^\s<>"']+$/i.test(href.trim()) ? href.trim() : null);

/** Only images uploaded to Kakushin. */
export const safeImage = (src: string): string | null =>
  /^\/api\/files\/(covers|logos|pages|sponsors)\/([a-f0-9]{8,40}\/)?[a-f0-9]{16}\.(png|jpg|webp)$/.test(src.trim()) ? src.trim() : null;

const MAX_DEPTH = 4;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", v: text }); text = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i]!;
    if (ch === "\\" && i + 1 < src.length && /[\\`*_[\]()!#>-]/.test(src[i + 1]!)) { text += src[i + 1]; i += 2; continue; }
    if (ch === "`") {
      const m = /^`([^`\n]+)`/.exec(rest);
      if (m) { flush(); out.push({ t: "code", v: m[1]! }); i += m[0].length; continue; }
    }
    if (ch === "!" && src[i + 1] === "[") {
      const m = /^!\[([^\]\n]*)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const ok = safeImage(m[2]!);
        flush();
        out.push(ok ? { t: "img", src: ok, alt: m[1]! } : { t: "text", v: m[1]! });
        i += m[0].length; continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const ok = safeHref(m[2]!);
        const inner = depth < MAX_DEPTH ? parseInline(m[1]!, depth + 1) : [{ t: "text" as const, v: m[1]! }];
        flush();
        if (ok) out.push({ t: "a", href: ok, c: inner }); else out.push(...inner);
        i += m[0].length; continue;
      }
    }
    if ((ch === "*" || ch === "_") && src[i + 1] === ch) {
      const end = src.indexOf(ch + ch, i + 2);
      if (end > i + 2) {
        flush();
        const inner = src.slice(i + 2, end);
        out.push({ t: "b", c: depth < MAX_DEPTH ? parseInline(inner, depth + 1) : [{ t: "text", v: inner }] });
        i = end + 2; continue;
      }
    }
    if (ch === "*" || ch === "_") {
      // A single _ inside a word (snake_case) is not emphasis.
      const prev = i > 0 ? src[i - 1]! : " ";
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && !(ch === "_" && /\w/.test(prev)) && src[i + 1] !== " " && src[end - 1] !== " ") {
        flush();
        const inner = src.slice(i + 1, end);
        out.push({ t: "i", c: depth < MAX_DEPTH ? parseInline(inner, depth + 1) : [{ t: "text", v: inner }] });
        i = end + 1; continue;
      }
    }
    // Bare web addresses become links too.
    if ((ch === "h" || ch === "H") && /^https?:\/\//i.test(rest) && !/\w/.test(i > 0 ? src[i - 1]! : " ")) {
      const m = /^https?:\/\/[^\s<>"')\]]+/i.exec(rest)!;
      const url = m[0].replace(/[.,;:!?]+$/, "");
      flush();
      out.push({ t: "a", href: url, c: [{ t: "text", v: url }] });
      i += url.length; continue;
    }
    text += ch; i++;
  }
  flush();
  return out;
}

const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: "p", c: parseInline(para.join("\n")) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) { flush(); continue; }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { flush(); out.push({ t: "h", level: Math.min(3, h[1]!.length) as 1 | 2 | 3, c: parseInline(h[2]!) }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ t: "hr" }); continue; }
    if (/^\s{0,3}>/.test(line)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i]!)) { q.push(lines[i]!.replace(/^\s{0,3}>\s?/, "")); i++; }
      i--;
      out.push({ t: "quote", c: parseInline(q.join("\n")) });
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      flush();
      const ordered = !UL.test(line);
      const re = ordered ? OL : UL;
      const start = ordered ? Number(OL.exec(line)![1]) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = re.exec(l);
        if (m) items.push(ordered ? m[2]! : m[1]!);
        else if (l.trim() && /^\s{2,}/.test(l) && items.length) items[items.length - 1] += `\n${l.trim()}`;
        else break;
        i++;
      }
      i--;
      const parsed = items.map((it) => parseInline(it));
      out.push(ordered ? { t: "ol", start, items: parsed } : { t: "ul", items: parsed });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** The text alone, for previews and search. */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "img" ? n.alt : plainText(n.c))).join("");
}
