import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";

interface Cert { code: string; kind: string; title: string; challenge: string; org: string; issued_at: number; link: string }

export function CertificatesList({ onCount }: { onCount?: (n: number) => void } = {}) {
  const [certs, setCerts] = useState<Cert[]>([]);
  useEffect(() => { api<{ certificates: Cert[] }>("/certificates/mine").then((r) => { setCerts(r.certificates); onCount?.(r.certificates.length); }).catch(() => {}); }, []);
  if (certs.length === 0) return null;
  return (
    <div className="section" id="certificates">
      <h2>Your certificates</h2>
      <ul className="todo" style={{ marginTop: 16 }}>
        {certs.map((c) => (
          <li key={c.code}>
            <span><b>{c.challenge}</b> <span className="muted">· {c.org} · {c.title} · {fmtDate(c.issued_at)}</span></span>
            <span style={{ display: "flex", gap: 8 }}>
              <a className="btn small" href={`/api/certificates/${c.code}/pdf`} target="_blank" rel="noopener noreferrer">Download PDF</a>
              <Link className="btn ghost small" to={`/verify/${c.code}`}>Verify page</Link>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: 13 }}>The name on the certificate is the one on your profile when you first download it, so set your name first.</p>
    </div>
  );
}

/** Public page anyone can open from the QR code on a certificate. */
export function Verify() {
  const { code } = useParams();
  const [r, setR] = useState<{ valid: boolean; revoked?: boolean; name?: string; title?: string; kind?: string; challenge?: string; org?: string; issued_at?: number; code?: string } | null>(null);
  useEffect(() => { api<NonNullable<typeof r>>(`/certificates/${encodeURIComponent(code ?? "")}`).then(setR).catch(() => setR({ valid: false })); }, [code]);
  if (!r) return null;
  if (!r.name) return (
    <div className="section narrow"><p className="hand">Not found</p><h1>We could not verify that certificate</h1>
      <p className="muted">No certificate has the code <b>{code}</b>. Check the code on the certificate and try again.</p></div>
  );
  return (
    <div className="section narrow">
      <p className="hand">{r.valid ? "Genuine certificate" : "Revoked certificate"}</p>
      <h1>{r.valid ? "This certificate is genuine" : "This certificate has been revoked"}</h1>
      <ul className="todo" style={{ marginTop: 16 }}>
        <li><span className="muted">Awarded to</span><b>{r.name}</b></li>
        <li><span className="muted">For</span><b>{r.kind === "winner" ? `${r.title}, ` : r.kind === "finalist" ? "Finalist, " : "Participant, "}{r.challenge}</b></li>
        <li><span className="muted">Organised by</span><b>{r.org}</b></li>
        <li><span className="muted">Issued</span><b>{fmtDate(r.issued_at ?? null)}</b></li>
        <li><span className="muted">Code</span><b>{r.code}</b></li>
      </ul>
      {r.valid && <div className="actions"><a className="btn ghost" href={`/api/certificates/${r.code}/pdf`} target="_blank" rel="noopener noreferrer">View the PDF</a></div>}
    </div>
  );
}
