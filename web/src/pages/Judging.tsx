import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, Tag } from "../ui";
import { challengeTabs } from "./Admin";

interface Crit { id?: string; name: string; description: string; weight: number; max_score: number }
interface Row { team_id: string; name: string; total: number | null; finished: number; judges: { judge: string; total: number | null }[]; rank: number; tied: boolean }
type Msg = { kind: "ok" | "err"; text: string } | null;
const STAGES = ["open", "reviewing", "judging", "completed"];

export function AdminJudging() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const base = `/orgs/${slug}/challenges/${cslug}`;
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("open");
  const [crit, setCrit] = useState<Crit[] | null>(null);
  const [judges, setJudges] = useState<{ email: string; teams_scored: number }[]>([]);
  const [board, setBoard] = useState<{ judges: string[]; leaderboard: Row[] } | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [cmsg, setCmsg] = useState<Msg>(null);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");

  async function loadAll() {
    try {
      const ch = await api<{ challenge: { title: string; status: string }; role: string | null }>(base);
      if (!ch.role) { setErr("You are not an admin of this organisation."); return; }
      setTitle(ch.challenge.title); setStatus(ch.challenge.status);
      const [c, j, b] = await Promise.all([
        api<{ criteria: { id: string; name: string; description: string; weight: number; max_score: number }[] }>(`${base}/criteria`),
        api<{ judges: { email: string; teams_scored: number }[] }>(`${base}/judges`),
        api<{ judges: string[]; leaderboard: Row[] }>(`${base}/leaderboard`),
      ]);
      setCrit(c.criteria.map((r) => ({ ...r, weight: Math.round(r.weight * 10000) / 100 })));
      setJudges(j.judges); setBoard(b);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { if (me) void loadAll(); }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/judging`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!crit || !board) return null;

  const sum = Math.round(crit.reduce((a, r) => a + (Number(r.weight) || 0), 0) * 100) / 100;
  const setC = (i: number, patch: Partial<Crit>) => setCrit(crit.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => { const a = [...crit]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; setCrit(a); };

  async function saveCriteria() {
    setCmsg(null);
    try { await api(`${base}/criteria`, { method: "PUT", json: { criteria: crit!.map((r) => ({ ...r, weight: Number(r.weight), max_score: Number(r.max_score) })) } }); await loadAll(); setCmsg({ kind: "ok", text: "Criteria saved" }); }
    catch (e) { setCmsg({ kind: "err", text: (e as Error).message }); }
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { const r = await api<{ link: string }>(`${base}/judges`, { method: "POST", json: { email } }); setLink(r.link); setEmail(""); await loadAll(); setMsg({ kind: "ok", text: "Judge added and emailed. You can also share the link below." }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function stage(s: string) {
    setMsg(null);
    try { await api(`${base}/status`, { method: "PUT", json: { status: s } }); setStatus(s); setMsg({ kind: "ok", text: `Stage is now ${s}` }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }

  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={title} tags={<Tag status={status} />} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Criteria">
        <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>Judges score each finalist on every criterion. Weights are percentages and must add up to 100.</p>
        {crit.map((r, i) => (
          <div className="qcard" key={r.id ?? `n${i}`}>
            <div className="row" style={{ gridTemplateColumns: "1fr 110px 110px", alignItems: "end" }}>
              <div><label htmlFor={`cn${i}`} style={{ marginTop: 0 }}>Criterion {i + 1}</label><input id={`cn${i}`} value={r.name} onChange={(e) => setC(i, { name: e.target.value })} /></div>
              <div><label htmlFor={`cw${i}`} style={{ marginTop: 0 }}>Weight %</label><input id={`cw${i}`} type="number" min={1} max={100} step="any" value={r.weight} onChange={(e) => setC(i, { weight: e.target.value as unknown as number })} /></div>
              <div><label htmlFor={`cm${i}`} style={{ marginTop: 0 }}>Out of</label><input id={`cm${i}`} type="number" min={1} max={100} value={r.max_score} onChange={(e) => setC(i, { max_score: e.target.value as unknown as number })} /></div>
            </div>
            <label htmlFor={`cd${i}`}>What judges look for (optional)</label><input id={`cd${i}`} maxLength={300} value={r.description} onChange={(e) => setC(i, { description: e.target.value })} />
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="ghost small" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
              <button type="button" className="ghost small" disabled={i === crit.length - 1} onClick={() => move(i, 1)}>Down</button>
              <button type="button" className="ghost small" onClick={() => setCrit(crit.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button type="button" className="ghost" disabled={crit.length >= 10} onClick={() => setCrit([...crit, { name: "", description: "", weight: 0, max_score: 10 }])}>Add a criterion</button>
          <button type="button" onClick={saveCriteria} disabled={crit.length === 0}>Save criteria</button>
          <span className={sum === 100 ? "ok" : "err"} style={{ margin: 0 }}>Weights total {sum}%</span>
        </div>
        {cmsg && <Notice kind={cmsg.kind}>{cmsg.text}</Notice>}
      </NumSection>

      <NumSection n="02" title="Judges">
        <form onSubmit={invite} className="form">
          <label htmlFor="je" style={{ marginTop: 0 }}>Invite a judge by email</label>
          <div style={{ display: "flex", gap: 8 }}><input id="je" type="email" required placeholder="judge@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /><button type="submit">Invite</button></div>
        </form>
        {link && <p className="muted" style={{ fontSize: 13 }}>Judging link: <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ maxWidth: 420 }} /></p>}
        {judges.length > 0 && (
          <ul className="todo" style={{ marginTop: 16 }}>{judges.map((j) => (
            <li key={j.email}><span>{j.email} <span className="muted">· scored {j.teams_scored} of {board.leaderboard.length} teams</span></span>
              <button className="ghost small" onClick={async () => { await api(`${base}/judges`, { method: "DELETE", json: { email: j.email } }); await loadAll(); }}>Remove</button></li>
          ))}</ul>
        )}
        <p className="label">Stage</p>
        <div className="pills" role="group" aria-label="Challenge stage">{STAGES.map((s) => <button key={s} className={`pill ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => stage(s)}>{s}</button>)}</div>
        <p className="muted" style={{ fontSize: 13 }}>Judges can score only while the stage is <b>judging</b>. Judges score teams you mark as <b>finalist</b> in Applications.</p>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </NumSection>

      <NumSection n="03" title="Leaderboard">
        {board.leaderboard.length === 0 ? <p className="muted">No finalists yet. Mark teams as finalist in Applications.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Rank</th><th>Team</th><th>Average</th><th>Judges done</th>{board.judges.map((j) => <th key={j}>{j.split("@")[0]}</th>)}</tr></thead>
            <tbody>{board.leaderboard.map((r) => (
              <tr key={r.team_id}><td>{r.total === null ? "-" : r.rank}{r.tied && <span className="tag gold" style={{ marginLeft: 6 }}>tied</span>}</td><td><b>{r.name}</b></td><td>{r.total === null ? "-" : r.total}</td><td>{r.finished} of {board.judges.length}</td>
                {r.judges.map((j) => <td key={j.judge}>{j.total === null ? "-" : j.total}</td>)}</tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Average of the judges who finished scoring a team. Ties are broken by the first criterion; a flagged tie is yours to settle.</p>
        <div className="actions"><a className="btn ghost" href={`/api${base}/leaderboard.csv`}>Download scores CSV</a><button className="ghost" onClick={loadAll}>Refresh</button></div>
      </NumSection>
    </>
  );
}
