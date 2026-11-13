import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, confirmStageMove } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, Tag } from "../ui";
import { challengeTabs } from "./Admin";
import { RubricEditor } from "./Rubric";

interface Row {
  team_id: string; name: string; total: number | null; finished: number; expected: number; judges: { judge: string; total: number | null }[];
  rank: number; tied: boolean; normalised: number | null; norm_rank: number | null;
}
interface Asg { blind_judging: boolean; judges_per_team: number; has_assignments: boolean; judges: string[]; teams: { id: string; name: string; judges: string[]; conflicts: string[]; finished: number }[] }
interface Cal { judge: string; teams: number; average: number | null; spread: number | null; gap: number | null; flagged: boolean }
type Msg = { kind: "ok" | "err"; text: string } | null;
const STAGES = ["open", "reviewing", "judging", "completed"];
const short = (email: string) => email.split("@")[0];

export function AdminJudging() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const base = `/orgs/${slug}/challenges/${cslug}`;
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("open");
  const [judges, setJudges] = useState<{ email: string; teams_scored: number }[]>([]);
  const [board, setBoard] = useState<{ judges: string[]; leaderboard: Row[] } | null>(null);
  const [asg, setAsg] = useState<Asg | null>(null);
  const [cal, setCal] = useState<Cal[]>([]);
  const [per, setPer] = useState(3);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [amsg, setAmsg] = useState<Msg>(null);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [rankBy, setRankBy] = useState<"raw" | "normalised">("raw");

  async function loadAll() {
    try {
      const ch = await api<{ challenge: { title: string; status: string }; role: string | null }>(base);
      if (!ch.role) { setErr("You are not an admin of this organisation."); return; }
      setTitle(ch.challenge.title); setStatus(ch.challenge.status);
      const [j, b, a, k] = await Promise.all([
        api<{ judges: { email: string; teams_scored: number }[] }>(`${base}/judges`),
        api<{ judges: string[]; leaderboard: Row[] }>(`${base}/leaderboard`),
        api<Asg>(`${base}/assignments`),
        api<{ judges: Cal[] }>(`${base}/calibration`),
      ]);
      setJudges(j.judges); setBoard(b); setAsg(a); setPer(a.judges_per_team); setCal(k.judges);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { if (me) void loadAll(); }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/judging`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!board || !asg) return null;

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { const r = await api<{ link: string }>(`${base}/judges`, { method: "POST", json: { email } }); setLink(r.link); setEmail(""); await loadAll(); setMsg({ kind: "ok", text: "Judge added and emailed. You can also share the link below." }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function stage(s: string) {
    setMsg(null);
    if (s === status) return;
    const reopen = confirmStageMove(status, s);
    if (reopen === null) return;
    try { await api(`${base}/status`, { method: "PUT", json: { status: s, ...(reopen ? { reopen } : {}) } }); setStatus(s); setMsg({ kind: "ok", text: reopen ? `Reopened. Stage is now ${s}` : `Stage is now ${s}` }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  /** Runs an assignment change and reloads, showing the result in the assignments section. */
  async function act(fn: () => Promise<string | void>) {
    setAmsg(null);
    try { const text = await fn(); await loadAll(); if (text) setAmsg({ kind: "ok", text }); }
    catch (e) { setAmsg({ kind: "err", text: (e as Error).message }); }
  }
  const autoAssign = () => act(async () => {
    if (asg.has_assignments && !confirm("This replaces every assignment, including ones you added by hand. Continue?")) return;
    const r = await api<{ assigned: number; short: string[] }>(`${base}/assignments/auto`, { method: "POST", json: { per_team: Number(per) } });
    return r.short.length ? `Assigned. ${r.short.join(", ")} got fewer than ${per} judges, because not enough judges are free of conflicts. Invite more judges or lower the number.` : `Every finalist now has ${per} judges.`;
  });

  const locked = status === "judging" || status === "completed";
  const rows = rankBy === "raw" ? board.leaderboard : [...board.leaderboard].sort((a, b) => (b.normalised ?? -1) - (a.normalised ?? -1));
  const flagged = asg.teams.flatMap((t) => t.conflicts.map((c) => ({ team: t, email: c })));
  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={title} tags={<Tag status={status} />} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Criteria">
        <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>Judges score each finalist on every criterion. Weights are percentages and must add up to 100.</p>
        <RubricEditor path={`${base}/criteria`} locked={locked} status={status} onSaved={loadAll} />
      </NumSection>

      <NumSection n="02" title="Judges">
        <form onSubmit={invite} className="form">
          <label htmlFor="je" style={{ marginTop: 0 }}>Invite a judge by email</label>
          <div style={{ display: "flex", gap: 8 }}><input id="je" type="email" required placeholder="judge@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /><button type="submit">Invite</button></div>
        </form>
        {link && <p className="muted" style={{ fontSize: 13 }}>Judging link: <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ maxWidth: 420 }} /></p>}
        {judges.length > 0 && (
          <ul className="todo" style={{ marginTop: 16 }}>{judges.map((j) => (
            <li key={j.email}><span>{j.email} <span className="muted">· scored {j.teams_scored} teams</span></span>
              <button className="ghost small" onClick={async () => { await api(`${base}/judges`, { method: "DELETE", json: { email: j.email } }); await loadAll(); }}>Remove</button></li>
          ))}</ul>
        )}
        <label className="check">
          <input type="checkbox" checked={asg.blind_judging} onChange={(e) => act(async () => { await api(`${base}/judging/settings`, { method: "PUT", json: { blind_judging: e.target.checked } }); return e.target.checked ? "Blind review is on. Judges see team names and pitches, but not who is on the team." : "Blind review is off."; })} />
          Blind review: hide member names and institutions from judges
        </label>
        <p className="label">Stage</p>
        <div className="pills" role="group" aria-label="Challenge stage">{STAGES.map((s) => <button key={s} className={`pill ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => stage(s)}>{s}</button>)}</div>
        <p className="muted" style={{ fontSize: 13 }}>Judges can score only while the stage is <b>judging</b>. Judges score teams you mark as <b>finalist</b> in Applications.</p>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </NumSection>

      <NumSection n="03" title="Who judges which team">
        <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>
          {asg.has_assignments ? "Each judge only sees the teams assigned to them." : "Right now every judge sees every finalist. Auto-assign spreads the finalists so each team gets the same number of judges and no judge has too many."}
          {" "}Judges never get their own team or a team they said they know.
        </p>
        <div className="actions" style={{ alignItems: "end" }}>
          <div><label htmlFor="per" style={{ marginTop: 0 }}>Judges per team</label><input id="per" type="number" min={1} max={20} value={per} onChange={(e) => setPer(e.target.value as unknown as number)} style={{ width: 90 }} /></div>
          <button disabled={!asg.judges.length || !asg.teams.length} onClick={autoAssign}>Auto-assign</button>
          {asg.has_assignments && <button className="ghost" onClick={() => act(async () => { if (!confirm("Remove every assignment? Every judge will see every finalist again.")) return; await api(`${base}/assignments/all`, { method: "DELETE" }); return "Assignments cleared. Every judge sees every finalist."; })}>Clear assignments</button>}
        </div>
        {flagged.length > 0 && (
          <Notice kind="err">{flagged.length === 1 ? "A judge" : `${flagged.length} judges`} said they know a team. Their scores for it were removed. Give {flagged.length === 1 ? "that team" : "those teams"} another judge below.</Notice>
        )}
        {asg.teams.length === 0 ? <p className="muted">No finalists yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Team</th><th>Judges</th><th>Progress</th><th>Add a judge</th></tr></thead>
            <tbody>{asg.teams.map((t) => {
              const free = asg.judges.filter((j) => !t.judges.includes(j) && !t.conflicts.includes(j));
              return (
                <tr key={t.id}>
                  <td><b>{t.name}</b>{t.conflicts.map((c) => (
                    <div key={c} style={{ fontSize: 13, marginTop: 4 }}><span className="tag gold">Conflict</span> {short(c)} knows this team{" "}
                      <button className="link" onClick={() => act(async () => { await api(`${base}/conflicts`, { method: "DELETE", json: { email: c, team_id: t.id } }); return `Cleared the flag for ${short(c)}.`; })}>Clear flag</button></div>
                  ))}</td>
                  <td>{t.judges.length === 0 ? <span className="muted">Nobody</span> : t.judges.map((j) => (
                    <span key={j} style={{ display: "inline-flex", gap: 4, marginRight: 10 }}>{short(j)}
                      <button className="link" aria-label={`Remove ${j} from ${t.name}`} onClick={() => act(() => api(`${base}/assignments`, { method: "DELETE", json: { email: j, team_id: t.id } }).then(() => undefined))}>×</button></span>
                  ))}</td>
                  <td>{t.finished} of {t.judges.length} done</td>
                  <td>{free.length === 0 ? <span className="muted">-</span> : (
                    <select aria-label={`Add a judge to ${t.name}`} value="" onChange={(e) => { const v = e.target.value; if (v) void act(() => api(`${base}/assignments`, { method: "POST", json: { email: v, team_id: t.id } }).then(() => undefined)); }}>
                      <option value="">Add…</option>{free.map((j) => <option key={j} value={j}>{j}</option>)}
                    </select>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {amsg && <Notice kind={amsg.kind}>{amsg.text}</Notice>}
      </NumSection>

      <NumSection n="04" title="Leaderboard">
        {board.leaderboard.length === 0 ? <p className="muted">No finalists yet. Mark teams as finalist in Applications.</p> : (
          <>
            <div className="pills" role="group" aria-label="Rank by">
              <button className={`pill ${rankBy === "raw" ? "on" : ""}`} aria-pressed={rankBy === "raw"} onClick={() => setRankBy("raw")}>Rank by average</button>
              <button className={`pill ${rankBy === "normalised" ? "on" : ""}`} aria-pressed={rankBy === "normalised"} onClick={() => setRankBy("normalised")}>Rank by normalised</button>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Rank</th><th>Team</th><th>Average</th><th>Normalised</th><th>Judges done</th>{board.judges.map((j) => <th key={j}>{short(j)}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.team_id}>
                  <td>{rankBy === "raw" ? (r.total === null ? "-" : r.rank) : (r.norm_rank ?? "-")}{rankBy === "raw" && r.tied && <span className="tag gold" style={{ marginLeft: 6 }}>tied</span>}
                    {r.total !== null && r.norm_rank !== null && r.rank !== r.norm_rank && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>({rankBy === "raw" ? `#${r.norm_rank} normalised` : `#${r.rank} by average`})</span>}</td>
                  <td><b>{r.name}</b></td><td>{r.total ?? "-"}</td><td>{r.normalised ?? "-"}</td><td>{r.finished} of {r.expected}</td>
                  {r.judges.map((j) => <td key={j.judge}>{j.total === null ? "-" : j.total}</td>)}
                </tr>
              ))}</tbody>
            </table></div>
          </>
        )}
        <p className="muted" style={{ fontSize: 13, maxWidth: 700 }}>
          Average is the plain average of the judges who finished a team. Normalised rescales each judge to their own average and spread first, so a team is not helped or hurt by drawing a generous or a strict judge. Ties are broken by the first criterion; a flagged tie is yours to settle.
        </p>
        <div className="actions"><a className="btn ghost" href={`/api${base}/leaderboard.csv`}>Download scores CSV</a><button className="ghost" onClick={loadAll}>Refresh</button></div>
      </NumSection>

      <NumSection n="05" title="Judge calibration">
        <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>How each judge scores compared with the rest of the panel on the same teams. A judge more than 15 points (out of 100) away from the others is flagged, so you can check whether they read the criteria differently.</p>
        {cal.length === 0 ? <p className="muted">No judges yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Judge</th><th>Teams scored</th><th>Their average</th><th>Spread</th><th>Gap to panel</th></tr></thead>
            <tbody>{cal.map((j) => (
              <tr key={j.judge}><td>{j.judge}</td><td>{j.teams}</td><td>{j.average ?? "-"}</td><td>{j.spread ?? "-"}</td>
                <td>{j.gap === null ? "-" : `${j.gap > 0 ? "+" : ""}${j.gap}`}{j.flagged && <span className="tag gold" style={{ marginLeft: 6 }}>{j.gap! > 0 ? "generous" : "strict"}</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </NumSection>
    </>
  );
}
