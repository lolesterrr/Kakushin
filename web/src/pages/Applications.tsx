import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, Tag } from "../ui";
import { challengeTabs } from "./Admin";
import { RubricEditor } from "./Rubric";

interface App {
  team_id: string; name: string; status: string; submitted_at: number; answers: Record<string, string>; reviewer_note: string;
  members: { name: string | null; email: string; institution: string | null; is_lead: boolean }[];
  review: { average: number | null; reviewers: number; mine: { criterion_id: string; score: number; comment: string }[] };
}
interface Crit { id: string; name: string; description: string; weight: number; max_score: number }
interface Data { questions: { id: string; label: string }[]; criteria: Crit[]; stage: string; applications: App[] }
type Msg = { kind: "ok" | "err"; text: string } | null;
const FILTERS = [["all", "All"], ["applied", "New"], ["shortlisted", "Shortlisted"], ["rejected", "Rejected"], ["finalist", "Finalists"]] as const;
const LABEL: Record<string, string> = { applied: "New", shortlisted: "Shortlisted", rejected: "Rejected", finalist: "Finalist", winner: "Winner" };
const TONE: Record<string, string> = { applied: "sand", shortlisted: "moss", rejected: "ink", finalist: "gold", winner: "indigo" };

export function AdminApplications() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [qs] = useSearchParams();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>((FILTERS.find(([k]) => k === qs.get("f"))?.[0]) ?? "all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Msg>(null);
  const [sort, setSort] = useState<"newest" | "score">("newest");
  const [topN, setTopN] = useState(10);
  const base = `/orgs/${slug}/challenges/${cslug}/applications`;
  const load = () => api<Data>(base).then(setData).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { if (me) void load(); }, [slug, cslug, me?.id]);

  const rows = useMemo(() => {
    const list = (data?.applications ?? []).filter((a) =>
      (filter === "all" || a.status === filter) &&
      (!q || (a.name + a.members.map((m) => `${m.name} ${m.email} ${m.institution}`).join(" ")).toLowerCase().includes(q.toLowerCase())));
    return sort === "score" ? [...list].sort((a, b) => (b.review.average ?? -1) - (a.review.average ?? -1)) : list;
  }, [data, filter, q, sort]);

  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/applications`} replace />;
  if (!data) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;
  const count = (s: string) => data.applications.filter((a) => s === "all" || a.status === s).length;
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.team_id));
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };

  async function setStatus(ids: string[], status: "applied" | "shortlisted" | "rejected" | "finalist") {
    setMsg(null);
    try {
      // The server takes up to 90 teams per request, so large selections go in batches.
      const r = { updated: 0 };
      for (let i = 0; i < ids.length; i += 90) r.updated += (await api<{ updated: number }>(`${base}/status`, { method: "POST", json: { team_ids: ids.slice(i, i + 90), status } })).updated;
      setSel(new Set()); await load();
      setMsg({ kind: "ok", text: status === "applied" ? `${r.updated} moved back to New` : status === "finalist" ? `${r.updated} marked as finalist. Judges can now see them.` : `${r.updated} ${status}. Applicants were emailed.` });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }

  /** Picks the highest-scored new applications for the organiser to confirm with the Shortlist button. */
  function selectTop() {
    const n = Math.max(1, Number(topN) || 0);
    const top = data!.applications.filter((a) => a.status === "applied" && a.review.average !== null)
      .sort((a, b) => b.review.average! - a.review.average!).slice(0, n);
    setSel(new Set(top.map((a) => a.team_id))); setFilter("applied"); setSort("score");
    setMsg(top.length
      ? { kind: "ok", text: `Selected the top ${top.length} new ${top.length === 1 ? "application" : "applications"} by review score. Check them, then press Shortlist to confirm.` }
      : { kind: "err", text: "No new applications have a review score yet. Score some first." });
  }
  const rubricLocked = data.stage === "judging" || data.stage === "completed";

  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title="Applications" tags={<a href={`/api${base}.csv`} style={{ color: "inherit" }}>Download CSV</a>} tabs={challengeTabs(slug!, cslug!)} />
      <div className="section" style={{ paddingBottom: 0 }}>
        <details>
          <summary><b>Application rubric</b> <span className="muted">· {data.criteria.length ? `${data.criteria.length} criteria. Every admin scores on their own, and the list shows the average.` : "Not set up. Add criteria to score applications."}</span></summary>
          <div style={{ marginTop: 12, maxWidth: 760 }}><RubricEditor path={`/orgs/${slug}/challenges/${cslug}/application-criteria`} locked={rubricLocked} status={data.stage} onSaved={load} who="Reviewers" /></div>
        </details>
      </div>
      <div className="section" style={{ paddingBottom: 16 }}>
        <div className="pills" role="group" aria-label="Filter by status">
          {FILTERS.map(([k, l]) => <button key={k} className={`pill ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l} ({count(k)})</button>)}
        </div>
      </div>
      <div className="bulkbar">
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.team_id)))} />Select all</label>
        <button className="small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "shortlisted")}>Shortlist ({sel.size})</button>
        <button className="ghost small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "finalist")}>Make finalist ({sel.size})</button>
        <button className="ghost small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "rejected")}>Reject ({sel.size})</button>
        <button className="ghost small" disabled={sel.size === 0} onClick={() => setStatus([...sel], "applied")}>Move back to New</button>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "score")} style={{ width: "auto" }}><option value="newest">Newest first</option><option value="score">Highest score</option></select>
        {data.criteria.length > 0 && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="number" min={1} max={500} aria-label="How many to shortlist" value={topN} onChange={(e) => setTopN(e.target.value as unknown as number)} style={{ width: 70 }} /><button className="ghost small" onClick={selectTop}>Select top {Number(topN) || 0}</button></span>}
        <input type="search" placeholder="Search teams, people, institutions" aria-label="Search applications" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className="section" style={{ padding: "12px 24px" }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {rows.length === 0 && <div className="empty"><p className="hand">{data.applications.length === 0 ? "No applications yet" : "Nothing matches"}</p></div>}
      {rows.map((a) => <Row key={a.team_id} a={a} questions={data.questions} criteria={data.criteria} reload={load} checked={sel.has(a.team_id)} toggle={() => toggle(a.team_id)} setStatus={setStatus} base={base} />)}
    </>
  );
}

function Row({ a, questions, criteria, reload, checked, toggle, setStatus, base }: {
  a: App; questions: Data["questions"]; criteria: Crit[]; reload: () => Promise<unknown>; checked: boolean; toggle: () => void; base: string;
  setStatus: (ids: string[], s: "applied" | "shortlisted" | "rejected" | "finalist") => Promise<void>;
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
        <b>{a.name}</b><Tag status={a.status} />
        <span className="muted">{a.members.length} {a.members.length === 1 ? "person" : "people"} · {fmtDate(a.submitted_at)}</span>
        {a.review.average !== null && <span className="tag moss" title={`Average of ${a.review.reviewers} reviewers, out of 100`}>{a.review.average} · {a.review.reviewers} {a.review.reviewers === 1 ? "reviewer" : "reviewers"}</span>}
      </summary>
      <div style={{ marginTop: 12, maxWidth: 760 }}>
        <p className="label">Members</p>
        <ul className="members">{a.members.map((m) => <li key={m.email}>{m.name ?? "(no name)"}{m.is_lead && " (lead)"} · <a href={`mailto:${m.email}`}>{m.email}</a>{m.institution && ` · ${m.institution}`}</li>)}</ul>
        {questions.map((qq) => <div className="answer" key={qq.id}><p className="label" style={{ margin: 0 }}>{qq.label}</p><p>{a.answers[qq.id] || <span className="muted">No answer</span>}</p></div>)}
        {criteria.length > 0 && <Score a={a} criteria={criteria} base={base} reload={reload} />}
        <label htmlFor={`n-${a.team_id}`}>Private note</label>
        <textarea id={`n-${a.team_id}`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
        <div className="actions">
          <button className="small" onClick={() => setStatus([a.team_id], "shortlisted")} disabled={a.status === "shortlisted"}>Shortlist</button>
          <button className="ghost small" onClick={() => setStatus([a.team_id], "finalist")} disabled={a.status === "finalist"}>Make finalist</button>
          <button className="ghost small" onClick={() => setStatus([a.team_id], "rejected")} disabled={a.status === "rejected"}>Reject</button>
          {saved && <span className="ok" style={{ margin: 0 }}>Note saved</span>}
        </div>
      </div>
    </details>
  );
}

/** One admin's scores for one application. Each admin scores on their own; the list shows the average. */
function Score({ a, criteria, base, reload }: { a: App; criteria: Crit[]; base: string; reload: () => Promise<unknown> }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(a.review.mine.map((s) => [s.criterion_id, String(s.score)])));
  const [msg, setMsg] = useState<Msg>(null);
  const filled = criteria.filter((c) => vals[c.id] !== undefined && vals[c.id] !== "");
  const total = filled.length === criteria.length ? Math.round(criteria.reduce((t, c) => t + (Number(vals[c.id]) / c.max_score) * c.weight * 100, 0) * 100) / 100 : null;
  async function save() {
    setMsg(null);
    if (!filled.length) { setMsg({ kind: "err", text: "Enter at least one score" }); return; }
    try {
      await api(`${base}/${a.team_id}/scores`, { method: "PUT", json: { scores: filled.map((c) => ({ criterion_id: c.id, score: Number(vals[c.id]), comment: "" })) } });
      await reload();
      setMsg({ kind: "ok", text: total === null ? "Saved. Score every criterion to count in the average." : "Saved" });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <div className="qcard" style={{ marginTop: 12 }}>
      <p className="label" style={{ marginTop: 0 }}>Your score{total !== null && `: ${total} / 100`}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{criteria.map((c) => (
        <div key={c.id} style={{ minWidth: 140 }}>
          <label htmlFor={`as-${a.team_id}-${c.id}`} style={{ marginTop: 0 }} title={c.description}>{c.name} (out of {c.max_score})</label>
          <input id={`as-${a.team_id}-${c.id}`} type="number" min={0} max={c.max_score} style={{ width: 90 }} value={vals[c.id] ?? ""} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} />
        </div>
      ))}</div>
      <div className="actions"><button className="small" onClick={save}>Save score</button>{msg && <span className={msg.kind === "ok" ? "ok" : "err"} style={{ margin: 0 }}>{msg.text}</span>}</div>
    </div>
  );
}
