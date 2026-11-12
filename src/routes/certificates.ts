import { Hono } from "hono";
import type { AppEnv } from "../types";
import { makeCertificate } from "../lib/certificate";

export const certificates = new Hono<AppEnv>();

interface Row {
  id: string; code: string; user_id: string; kind: "participant" | "finalist" | "winner"; title: string; recipient_name: string | null;
  pdf_key: string | null; issued_at: number; revoked: number; ctitle: string; oname: string; oslug: string; cslug: string; uname: string | null; uemail: string;
}
const SQL = `SELECT ce.id, ce.code, ce.user_id, ce.kind, ce.title, ce.recipient_name, ce.pdf_key, ce.issued_at, ce.revoked,
    ch.title AS ctitle, ch.slug AS cslug, o.name AS oname, o.slug AS oslug, u.name AS uname, u.email AS uemail
  FROM certificates ce JOIN challenges ch ON ch.id = ce.challenge_id JOIN organizations o ON o.id = ch.org_id JOIN users u ON u.id = ce.user_id`;
const nameOf = (r: Row) => r.recipient_name || r.uname?.trim() || r.uemail.split("@")[0]!;

/** The signed-in person's own certificates. */
certificates.get("/mine", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ certificates: [] });
  const { results } = await c.env.DB.prepare(`${SQL} WHERE ce.user_id = ? AND ce.revoked = 0 ORDER BY ce.issued_at DESC`).bind(user.id).all<Row>();
  return c.json({ certificates: results.map((r) => ({ code: r.code, kind: r.kind, title: r.title, challenge: r.ctitle, org: r.oname, issued_at: r.issued_at, link: `/o/${r.oslug}/c/${r.cslug}` })) });
});

/** Public verification. The code is the secret, so only the facts printed on the certificate are returned. */
certificates.get("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const r = await c.env.DB.prepare(`${SQL} WHERE ce.code = ?`).bind(code).first<Row>();
  if (!r) return c.json({ valid: false }, 404);
  return c.json({ valid: !r.revoked, revoked: !!r.revoked, code: r.code, name: nameOf(r), kind: r.kind, title: r.title, challenge: r.ctitle, org: r.oname, issued_at: r.issued_at });
});

/** The PDF is made the first time it is asked for, then kept in R2. */
certificates.get("/:code/pdf", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const r = await c.env.DB.prepare(`${SQL} WHERE ce.code = ?`).bind(code).first<Row>();
  if (!r || r.revoked) return c.json({ error: "Not found" }, 404);
  const headers = { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="kakushin-certificate-${r.code}.pdf"`, "Cache-Control": "private, max-age=300" };
  if (r.pdf_key) {
    const obj = await c.env.FILES.get(r.pdf_key);
    if (obj) return new Response(obj.body, { headers });
  }
  const name = nameOf(r);
  const bytes = await makeCertificate({
    name, title: r.title, kind: r.kind, challenge: r.ctitle, org: r.oname, issuedAt: r.issued_at, code: r.code,
    verifyUrl: `${c.env.APP_URL}/verify/${r.code}`,
  });
  const key = `certificates/${r.code}.pdf`;
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
  await c.env.DB.prepare("UPDATE certificates SET pdf_key = ?, recipient_name = COALESCE(recipient_name, ?) WHERE id = ?").bind(key, name, r.id).run();
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers });
});
