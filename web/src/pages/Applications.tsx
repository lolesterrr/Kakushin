import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";

interface App {
  team_id: string; name: string; status: string; submitted_at: number; answers: Record<string, string>; reviewer_note: string;
  members: { name: string | null; email: string; institution: string | null; is_lead: boolean }[];
}
interface Data { questions: { id: string; label: string }[]; applications: App[] }
type Msg = { kind: "ok" | "err"; text: string } | null;
const FILTERS = [["all", "All"], ["applied", "New"], ["shortlisted", "Shortlisted"], ["rejected", "Rejected"]] as const;
const LABEL: Record<string, string> = { applied: "New", shortlisted: "Shortlisted", rejected: "Rejected", finalist: "Finalist", winner: "Winner" };
const TONE: Record<string, string> = { applied: "sand", shortlisted: "moss", rejected: "ink", finalist: "gold", winner: "indigo" };

export function AdminApplications() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Msg>(null);
  const base = `/orgs/${slug}/challenges/${cslug}/applications`;
  const load = () => api<Data>(base).then(setData).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { if (me) void load(); }, [slug, cslug, me?.id]);

  const rows = useMemo(() => (data?.applications ?? []).filter((a) =>
    (filter === "all" || a.status === filter) &&
    (!q || (a.name + a.members.map((m) => `${m.name} ${m.email} ${m.institution}`).join(" ")).toLowerCase().includes(q.toLowerCase())),
  ), [data, filter, q]);

  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/applications`} replace />;
  if (!data) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;
  const count = (s: string) => data.applications.filter((a) => s === "all" || a.status === s).length;
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.team_id));
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };

  async function setStatus(ids: string[], status: "applied" | "shortlisted" | "rejected") {
    setMsg(null);
    try {
      const r = await api<{ updated: number }>(`${base}/status`, { method: "POST", json: { team_ids: ids, status } });
      setSel(new Set()); await load();
      setMsg({ kind: "ok", text: status === "applied" ? `${r.updated} moved back to New` : `${r.updated} ${status}. Applicants were emailed.` });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }

  return (
    <>
      <div className="hero">
        <Link className="muted" to={`/admin/o/${slug}/c/${cslug}`}>← Back to challenge</Link>
        <div className="head-row" style={{ marginTop: 8 }}>
          <h1>Applications</h1>
          <a className="btn ghost" href={`/api${base}.csv`}>Download CSV</a>
        </div>
        <div className="pills" style={{ marginTop: 16 }} role="group" aria-label="Filter by status">
          {FILTERS.map(([k, l]) => <button key={k} className={`pill ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l} ({count(k)})</button>)}
        </div>
      </div>
      <div className="bulkbar">
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.team_id)))} />Select all</label>
        <button className="small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "shortlisted")}>Shortlist ({sel.size})</button>
        <button className="ghost small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "rejected")}>Reject ({sel.size})</button>
        <button className="ghost small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "applied")}>Move back to New</button>
        <input type="search" placeholder="Search teams, people, institutions" aria-label="Search applications" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className="section" style={{ padding: "12px 24px" }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {rows.length === 0 && <div className="empty"><p className="hand">{data.applications.length === 0 ? "No applications yet" : "Nothing matches"}</p></div>}
      {rows.map((a) => <Row key={a.team_id} a={a} questions={data.questions} checked={sel.has(a.team_id)} toggle={() => toggle(a.team_id)} setStatus={setStatus} base={base} />)}
    </>
  );
}

function Row({ a, questions, checked, toggle, setStatus, base }: {
  a: App; questions: Data["questions"]; checked: boolean; toggle: () => void; base: string;
  setStatus: (ids: string[], s: "applied" | "shortlisted" | "rejected") => Promise<void>;
}) {
  const [note, setNote] = useState(a.reviewer_note);
  const [saved, setSaved] = useState(false);
  async function saveNote() {
    try { await api(`${base}/${a.team_id}/note`, { method: "PUT", json: { note } }); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch { /* shown by next load */ }
  }
  return (
    <details className="app-row">
      <summary>
        <input type="checkbox" style={{ width: "auto" }} checked={checked} onChange={toggle} onClick={(e) => e.stopPropagation()} aria-label={`Select ${a.name}`} />
        <b>{a.name}</b><span className={`pill ${TONE[a.status] ?? "sand"}`}>{LABEL[a.status] ?? a.status}</span>
        <span className="muted">{a.members.length} {a.members.length === 1 ? "person" : "people"} · {fmtDate(a.submitted_at)}</span>
      </summary>
      <div style={{ marginTop: 12, maxWidth: 760 }}>
        <p className="label">Members</p>
        <ul className="members">{a.members.map((m) => <li key={m.email}>{m.name ?? "(no name)"}{m.is_lead && " (lead)"} · <a href={`mailto:${m.email}`}>{m.email}</a>{m.institution && ` · ${m.institution}`}</li>)}</ul>
        {questions.map((qq) => <div className="answer" key={qq.id}><p className="label" style={{ margin: 0 }}>{qq.label}</p><p>{a.answers[qq.id] || <span className="muted">No answer</span>}</p></div>)}
        <label htmlFor={`n-${a.team_id}`}>Private note</label>
        <textarea id={`n-${a.team_id}`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
        <div className="actions">
          <button className="small" onClick={() => setStatus([a.team_id], "shortlisted")} disabled={a.status === "shortlisted"}>Shortlist</button>
          <button className="ghost small" onClick={() => setStatus([a.team_id], "rejected")} disabled={a.status === "rejected"}>Reject</button>
          {saved && <span className="ok" style={{ margin: 0 }}>Note saved</span>}
        </div>
      </div>
    </details>
  );
}
