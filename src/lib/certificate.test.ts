import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { makeCertificate, type CertData } from "./certificate";

const base: CertData = { name: "Ada Lovelace", title: "1st Place", kind: "winner", challenge: "Clean Cookstoves Challenge", org: "Kampala Hub", issuedAt: Date.UTC(2026, 10, 12), code: "ABCD-EFGH-JKLM", verifyUrl: "https://example.org/verify/ABCD-EFGH-JKLM" };
// Vitest runs in Node; the project's type settings are for the Worker, so Node's own types are not loaded here.
// @ts-expect-error node:fs has no types in this project
import { readFileSync } from "node:fs";

const file = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../${p}`, import.meta.url)));
const fonts = async () => ({ regular: file("web/public/fonts/NotoSans-Regular.ttf").slice().buffer, bold: file("web/public/fonts/NotoSans-Bold.ttf").slice().buffer });

/** The BaseFont of every font the PDF embeds. */
const fontNames = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).context.enumerateIndirectObjects()
  .flatMap(([, o]) => (o instanceof PDFDict && o.get(PDFName.of("BaseFont")) ? [String(o.get(PDFName.of("BaseFont")))] : [])).join(" ");
const hasImage = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).context.enumerateIndirectObjects()
  .some(([, o]) => o instanceof PDFRawStream && String(o.dict.get(PDFName.of("Subtype"))) === "/Image");

describe("certificate", () => {
  it("keeps the built-in fonts for Western European names and never loads Noto", async () => {
    let loaded = false;
    const pdf = await makeCertificate({ ...base, name: "José Müller" }, { loadFonts: async () => { loaded = true; return fonts(); } });
    expect(loaded).toBe(false);
    expect(await fontNames(pdf)).toContain("Helvetica");
  });
  it("switches to Noto Sans for names Helvetica cannot draw", async () => {
    const pdf = await makeCertificate({ ...base, name: "Ŋaali Łukasz Жанна Nguyễn" }, { loadFonts: fonts });
    const text = await fontNames(pdf);
    expect(text).toContain("NotoSans");
    expect(pdf.byteLength).toBeLessThan(60_000); // subset to the letters used, not the whole font
  });
  it("skips a logo that is not a JPEG instead of failing", async () => {
    const pdf = await makeCertificate(base, { logo: file("scripts/demo/media/logos/agri.png") });
    expect(await hasImage(pdf)).toBe(false);
  });
  it("still makes a PDF when the fonts cannot load", async () => {
    const pdf = await makeCertificate({ ...base, name: "Жанна" }, { loadFonts: async () => { throw new Error("offline"); } });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
  it("draws the organiser's logo", async () => {
    const jpg = file("scripts/demo/media/covers/clean-cookstoves-challenge.jpg");
    const without = await makeCertificate(base);
    const withLogo = await makeCertificate(base, { logo: jpg });
    expect(withLogo.byteLength).toBeGreaterThan(without.byteLength + 500);
    expect(await hasImage(without)).toBe(false);
    expect(await hasImage(withLogo)).toBe(true);
  });
});
