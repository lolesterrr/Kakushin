import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Notice } from "../ui";

interface Credit { title: string; slug: string; org: string; org_slug: string; author: string; license: string; source: string; license_url?: string }

/** Where the photos on challenge covers come from, with their licences. Cropped and resized from the originals. */
export function Credits() {
  const [rows, setRows] = useState<Credit[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ credits: Credit[] }>("/challenges/credits").then((r) => setRows(r.credits)).catch((e: Error) => setErr(e.message)); }, []);
  return (
    <div className="section">
      <h1>Photo credits</h1>
      <p className="muted">Challenge cover photos are openly licensed images from Wikimedia Commons. We cropped and resized them. Each stays under its original licence, linked below.</p>
      {err && <Notice kind="err">{err}</Notice>}
      {rows && rows.length === 0 && <p className="muted">No credited photos yet.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Challenge</th><th>Photographer</th><th>Licence</th><th>Original</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.org_slug}/${r.slug}`}>
              <td><Link to={`/o/${r.org_slug}/c/${r.slug}`}>{r.title}</Link><br /><span className="muted">{r.org}</span></td>
              <td>{r.author}</td>
              <td>{r.license_url ? <a href={r.license_url} target="_blank" rel="noreferrer">{r.license}</a> : r.license}</td>
              <td><a href={r.source} target="_blank" rel="noreferrer">Wikimedia Commons</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
