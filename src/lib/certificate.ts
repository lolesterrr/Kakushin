import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import qrcode from "qrcode-generator";

export interface CertData {
  name: string; title: string; kind: "participant" | "finalist" | "winner";
  challenge: string; org: string; issuedAt: number; code: string; verifyUrl: string;
}

const PAPER = rgb(0.961, 0.949, 0.929), INK = rgb(0.067, 0.067, 0.067), RED = rgb(0.784, 0.196, 0.122), MUTED = rgb(0.38, 0.37, 0.35);

/** Standard PDF fonts only cover Latin text, so anything else becomes "?" instead of crashing. */
function safe(font: PDFFont, s: string) {
  const ok = new Set(font.getCharacterSet());
  return [...s.replace(/\s+/g, " ").trim()].map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

/** Shrinks text until it fits the width, so long names and titles stay on the page. */
function fit(font: PDFFont, text: string, size: number, max: number) {
  let s = size;
  while (s > 10 && font.widthOfTextAtSize(text, s) > max) s -= 1;
  return s;
}

export async function makeCertificate(d: CertData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate: ${d.title}`); doc.setAuthor("Kakushin"); doc.setCreator("Kakushin");
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width: W, height: H } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: INK, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: INK, borderWidth: 0.75 });

  // Logo: red dot and the name, same as the site.
  page.drawCircle({ x: 76, y: H - 80, size: 7, color: RED });
  page.drawText("Kakushin", { x: 90, y: H - 86, size: 20, font: bold, color: INK });

  const centre = (text: string, y: number, size: number, font: PDFFont, color = INK) => {
    const t = safe(font, text); const s = fit(font, t, size, W - 160);
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
  };

  const label = d.kind === "winner" ? "Certificate of achievement" : d.kind === "finalist" ? "Certificate of merit" : "Certificate of participation";
  centre(label.toUpperCase(), H - 160, 13, bold, RED);
  centre("This certifies that", H - 205, 14, reg, MUTED);
  centre(d.name, H - 262, 44, bold);
  page.drawLine({ start: { x: 200, y: H - 276 }, end: { x: W - 200, y: H - 276 }, thickness: 1, color: INK });
  const what = d.kind === "winner" ? `won ${d.title} in` : d.kind === "finalist" ? "was a finalist in" : "took part in";
  centre(what, H - 315, 14, reg, MUTED);
  centre(d.challenge, H - 360, 28, bold);
  centre(`organised by ${d.org}`, H - 392, 14, reg, MUTED);

  const date = new Date(d.issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  page.drawText(`Issued ${date}`, { x: 70, y: 92, size: 11, font: reg, color: MUTED });
  page.drawText(`Certificate ${d.code}`, { x: 70, y: 74, size: 11, font: bold, color: INK });
  page.drawText("Check it is genuine at", { x: 70, y: 56, size: 9, font: reg, color: MUTED });
  page.drawText(safe(reg, d.verifyUrl.replace(/^https?:\/\//, "")), { x: 70, y: 44, size: 9, font: reg, color: MUTED });

  // QR code to the verify page, drawn as squares.
  const qr = qrcode(0, "M"); qr.addData(d.verifyUrl); qr.make();
  const n = qr.getModuleCount(), cell = 3, size = n * cell, qx = W - 70 - size, qy = 48;
  page.drawRectangle({ x: qx - 6, y: qy - 6, width: size + 12, height: size + 12, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) page.drawRectangle({ x: qx + c * cell, y: qy + (n - 1 - r) * cell, width: cell, height: cell, color: INK });
  }
  return doc.save();
}
