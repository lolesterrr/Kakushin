import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Notice } from "../ui";

interface Crit { id?: string; name: string; description: string; weight: number; max_score: number }
type Msg = { kind: "ok" | "err"; text: string } | null;

/** Edits one rubric (the pitch rubric judges use, or the application rubric reviewers use). Weights are percentages. */
export function RubricEditor({ path, locked, status, onSaved, who = "Judges" }: { path: string; locked: boolean; status: string; onSaved?: () => void; who?: string }) {
  const [crit, setCrit] = useState<Crit[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => api<{ criteria: Crit[] }>(path).then((r) => setCrit(r.criteria.map((c) => ({ ...c, weight: Math.round(c.weight * 10000) / 100 })))).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(); }, [path]);
  if (!crit) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null;

  const sum = Math.round(crit.reduce((a, r) => a + (Number(r.weight) || 0), 0) * 100) / 100;
  const setC = (i: number, patch: Partial<Crit>) => setCrit(crit.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => { const a = [...crit]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; setCrit(a); };
  async function save() {
    setMsg(null);
    try { await api(path, { method: "PUT", json: { criteria: crit!.map((r) => ({ ...r, weight: Number(r.weight), max_score: Number(r.max_score) })) } }); await load(); onSaved?.(); setMsg({ kind: "ok", text: "Criteria saved" }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const key = path.replace(/\W/g, "");
  return (
    <>
      {locked && <Notice kind="ok">The rubric is locked while the stage is {status}, so {who.toLowerCase()}' scores stay comparable. To change it, move the stage back to reviewing.</Notice>}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {crit.map((r, i) => (
          <div className="qcard" key={r.id ?? `n${i}`}>
            <div className="row" style={{ gridTemplateColumns: "1fr 110px 110px", alignItems: "end" }}>
              <div><label htmlFor={`${key}n${i}`} style={{ marginTop: 0 }}>Criterion {i + 1}</label><input id={`${key}n${i}`} value={r.name} onChange={(e) => setC(i, { name: e.target.value })} /></div>
              <div><label htmlFor={`${key}w${i}`} style={{ marginTop: 0 }}>Weight %</label><input id={`${key}w${i}`} type="number" min={1} max={100} step="any" value={r.weight} onChange={(e) => setC(i, { weight: e.target.value as unknown as number })} /></div>
              <div><label htmlFor={`${key}m${i}`} style={{ marginTop: 0 }}>Out of</label><input id={`${key}m${i}`} type="number" min={1} max={100} value={r.max_score} onChange={(e) => setC(i, { max_score: e.target.value as unknown as number })} /></div>
            </div>
            <label htmlFor={`${key}d${i}`}>What {who.toLowerCase()} look for (optional)</label><input id={`${key}d${i}`} maxLength={300} value={r.description} onChange={(e) => setC(i, { description: e.target.value })} />
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="ghost small" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
              <button type="button" className="ghost small" disabled={i === crit.length - 1} onClick={() => move(i, 1)}>Down</button>
              <button type="button" className="ghost small" onClick={() => setCrit(crit.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button type="button" className="ghost" disabled={crit.length >= 10} onClick={() => setCrit([...crit, { name: "", description: "", weight: 0, max_score: 10 }])}>Add a criterion</button>
          <button type="button" onClick={save} disabled={crit.length === 0}>Save criteria</button>
          <span className={sum === 100 ? "ok" : "err"} style={{ margin: 0 }}>Weights total {sum}%</span>
        </div>
      </fieldset>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </>
  );
}
