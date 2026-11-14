import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, Tag } from "../ui";

interface Ch {
  slug: string; title: string; status: string; teams: number; applied: number; finalists: number; winners: number;
  participants: number; pitches: number; judges: number; checked_in: number; certificates: number;
}
interface Report {
  org: { name: string; slug: string };
  totals: { challenges: number; people: number; returning: number; institutions: number; teams: number; pitches: number; finalists: number; checked_in: number; certificates: number };
  gender: { label: string; count: number }[];
  challenges: Ch[];
}

/** Day 7: what an organisation's challenges added up to, for sponsors and funders. */
export function AdminImpact() {
  const { slug } = useParams();
  const { me } = useAuth();
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (me) api<Report>(`/orgs/${slug}/impact`).then(setR).catch((e) => setErr((e as Error).message)); }, [slug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/impact`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!r) return null;
  const t = r.totals;
  const tiles: [number, string][] = [
    [t.people, "People took part"], [t.teams, "Teams applied"], [t.pitches, "Pitches"], [t.institutions, "Institutions"], [t.returning, "Came back again"], [t.certificates, "Certificates"],
  ];
  const genderTotal = r.gender.reduce((a, g) => a + g.count, 0);
  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title="Impact report" tags={<span>{r.org.name} · {t.challenges} published challenge{t.challenges === 1 ? "" : "s"}</span>} />
      <NumSection n="01" title="At a glance">
        <div className="pipeline">{tiles.map(([n, label]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}</div>
        <p className="muted" style={{ fontSize: 13, maxWidth: 680 }}>Counts people on teams that applied, each person once. "Came back again" is people who applied to more than one of your challenges. Drafts are left out.</p>
        <div className="actions"><a className="btn ghost" href={`/api/orgs/${slug}/impact.csv`}>Download CSV</a><button className="ghost" onClick={() => window.print()}>Print or save as PDF</button></div>
      </NumSection>
      <NumSection n="02" title="By challenge">
        {r.challenges.length === 0 ? <p className="muted">No published challenges yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Challenge</th><th>Stage</th><th>Teams applied</th><th>People</th><th>Pitches</th><th>Finalists</th><th>Judges</th><th>Checked in</th><th>Certificates</th></tr></thead>
            <tbody>{r.challenges.map((c) => (
              <tr key={c.slug}><td><b>{c.title}</b></td><td><Tag status={c.status} /></td><td>{c.applied} <span className="muted">of {c.teams}</span></td><td>{c.participants}</td><td>{c.pitches}</td><td>{c.finalists}</td><td>{c.judges}</td><td>{c.checked_in}</td><td>{c.certificates}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </NumSection>
      <NumSection n="03" title="Who took part">
        {r.gender.length === 0 ? <p className="muted">Shown once at least 5 people have taken part.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Gender</th><th>People</th><th>Share</th></tr></thead>
            <tbody>{r.gender.map((g) => <tr key={g.label}><td>{g.label}</td><td>{g.count}</td><td>{Math.round((g.count / genderTotal) * 100)}%</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 13, maxWidth: 680 }}>Gender is optional on profiles. Groups under 5 people are combined so nobody can be picked out, and no names are ever shown here.</p>
      </NumSection>
    </>
  );
}
