import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import qrcode from "qrcode-generator";
import { api, fromLocalInput, toLocalInput } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection } from "../ui";
import { challengeTabs } from "./Admin";

export interface Block { id: string; kind: string; label: string; starts_at: number; ends_at: number }
interface LiveData {
  now: number;
  challenge: { title: string; slug: string; status: string; pitch_due_at: number | null; checkin_enabled: boolean; org: { slug: string; name: string } };
  agenda: Block[]; current: string | null; next: string | null; submissions_closed: boolean;
  messages: { id: string; title: string; body: string; created_at: number }[];
  me: { role: string | null; team: { id: string; name: string; status: string } | null; checked_in_at: number | null } | null;
}

export const KINDS: [string, string][] = [["briefing", "Briefing"], ["ideation", "Ideation"], ["build", "Build"], ["pitching", "Pitching"], ["results", "Results"], ["break", "Break"], ["other", "Other"]];
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** "1:04:09" or "12:09" until `ms`. */
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** A QR code as inline SVG. */
export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { d, n: n + 4 };
  }, [text]);
  return <svg role="img" aria-label="Check-in QR code" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} style={{ background: "#fff", borderRadius: 8 }} shapeRendering="crispEdges"><path d={path.d} fill="#111" /></svg>;
}

/** The live page: current block, a big countdown, the submission cutoff and the latest messages. Refreshes every 30 seconds. */
export function LivePage() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [d, setD] = useState<LiveData | null>(null);
  const [err, setErr] = useState("");
  const [skew, setSkew] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<LiveData>(`/orgs/${slug}/challenges/${cslug}/live`).then((r) => { if (alive) { setD(r); setSkew(r.now - Date.now()); setErr(""); } }).catch((e: Error) => alive && setErr(e.message));
    void load();
    const poll = window.setInterval(load, 30000), sec = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(sec); };
  }, [slug, cslug, me?.id]);
  useEffect(() => { if (d) document.title = `Live · ${d.challenge.title}`; }, [d?.challenge.title]);
  if (err && !d) return <div className="section"><Notice kind="err">{err === "Not found" ? "We could not find that challenge." : err}</Notice></div>;
  if (!d) return null;
  const now = Date.now() + skew;
  const cur = d.agenda.find((b) => b.starts_at <= now && now < b.ends_at) ?? null;
  const next = d.agenda.find((b) => b.starts_at > now) ?? null;
  const due = d.challenge.pitch_due_at;
  const closed = !!due && now >= due;
  return (
    <>
      <div className="live">
        <p className="label" style={{ marginTop: 0 }}><Link to={`/o/${slug}/c/${cslug}`}>{d.challenge.title}</Link> · {d.challenge.org.name}</p>
        {cur ? (
          <>
            <p className="live-now">Now: {cur.label}</p>
            <p className="live-big" aria-live="off">{countdown(cur.ends_at - now)}</p>
            <p className="muted">until {cur.label.toLowerCase()} ends at {clock(cur.ends_at)}</p>
          </>
        ) : next ? (
          <>
            <p className="live-now">Next: {next.label}</p>
            <p className="live-big">{countdown(next.starts_at - now)}</p>
            <p className="muted">starts at {clock(next.starts_at)}</p>
          </>
        ) : <p className="live-now">{d.agenda.length ? "The agenda is over. Thanks for taking part." : "No agenda yet."}</p>}
        {due ? (
          <div className={`live-cut ${closed ? "closed" : ""}`} role={closed ? "status" : undefined}>
            {closed ? <b>Submissions closed</b> : <><span className="label" style={{ margin: 0 }}>Submissions close in</span><b>{countdown(due - now)}</b><span className="muted">at {clock(due)}</span></>}
          </div>
        ) : null}
        {d.me?.team && d.challenge.checkin_enabled ? <p className="muted">{d.me.checked_in_at ? `You checked in at ${clock(d.me.checked_in_at)}.` : <>Not checked in yet. <Link to={`/o/${slug}/c/${cslug}#checkin`}>Show your pass</Link></>}</p> : null}
      </div>
      {d.agenda.length > 0 && (
        <div className="section">
          <p className="label" style={{ marginTop: 0 }}>Agenda</p>
          <ol className="timeline">{d.agenda.map((b) => <li key={b.id} className={b.ends_at <= now ? "past" : b.id === cur?.id ? "now" : ""}><time>{clock(b.starts_at)} to {clock(b.ends_at)}</time><b>{b.label}</b></li>)}</ol>
        </div>
      )}
      {d.messages.length > 0 && (
        <div className="section">
          <p className="label" style={{ marginTop: 0 }}>Latest messages</p>
          <ul className="todo">{d.messages.map((m) => <li key={m.id}><span><b>{m.title}</b> <span className="muted">· {clock(m.created_at)}</span><br /><span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span></span></li>)}</ul>
        </div>
      )}
      {err && <div className="section"><p className="muted">Could not refresh: {err}</p></div>}
    </>
  );
}

/** A participant's check-in pass, on the challenge page. */
export function CheckinPass({ orgSlug, cslug }: { orgSlug: string; cslug: string }) {
  const [p, setP] = useState<{ enabled: boolean; code: string | null; name?: string; team?: string; checked_in_at: number | null } | null>(null);
  useEffect(() => { api<NonNullable<typeof p>>(`/orgs/${orgSlug}/challenges/${cslug}/checkin/pass`).then(setP).catch(() => setP(null)); }, [orgSlug, cslug]);
  if (!p?.enabled || !p.code) return null;
  return (
    <div className="section" id="checkin">
      <p className="label" style={{ marginTop: 0 }}>Check-in pass</p>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <Qr text={p.code} />
        <div><h2>{p.name}</h2><p className="muted" style={{ margin: "4px 0" }}>{p.team}</p>
          <p>{p.checked_in_at ? <b>Checked in at {clock(p.checked_in_at)}</b> : "Show this at the door. It only works for you, for this event."}</p></div>
      </div>
    </div>
  );
}

type Row = { kind: string; label: string; starts_at: number | null; ends_at: number | null };

/** Organiser: the agenda editor and the check-in list. */
export function AdminLive() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const base = `/orgs/${slug}/challenges/${cslug}`;
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ci, setCi] = useState<{ enabled: boolean; total: number; checked_in: number; people: { user_id: string; name: string; team: string; checked_in_at: number | null; method: string | null }[] } | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cmsg, setCmsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const loadCi = () => api<NonNullable<typeof ci>>(`${base}/checkin`).then(setCi).catch((e: Error) => setCmsg({ kind: "err", text: e.message }));
  useEffect(() => {
    if (!me) return;
    api<{ challenge: { title: string; agenda?: Block[] } }>(base).then((r) => { setTitle(r.challenge.title); setRows((r.challenge.agenda ?? []).map(({ kind, label, starts_at, ends_at }) => ({ kind, label, starts_at, ends_at }))); }).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
    void loadCi();
  }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/live`} replace />;
  if (!rows) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  function add() {
    const last = rows![rows!.length - 1];
    const start = last?.ends_at ?? Math.ceil(Date.now() / 3600000) * 3600000;
    setRows([...rows!, { kind: "build", label: "", starts_at: start, ends_at: start + 3600000 }]);
  }
  async function save() {
    setMsg(null);
    if (rows!.some((r) => !r.starts_at || !r.ends_at)) { setMsg({ kind: "err", text: "Every block needs a start and an end" }); return; }
    try { const r = await api<{ agenda: Block[] }>(`${base}/agenda`, { method: "PUT", json: { blocks: rows } }); setRows(r.agenda.map(({ kind, label, starts_at, ends_at }) => ({ kind, label, starts_at, ends_at }))); setMsg({ kind: "ok", text: "Agenda saved" }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  async function ciRun(fn: () => Promise<unknown>, ok?: string) {
    setCmsg(null);
    try { await fn(); await loadCi(); if (ok) setCmsg({ kind: "ok", text: ok }); } catch (e) { setCmsg({ kind: "err", text: (e as Error).message }); }
  }
  const people = (ci?.people ?? []).filter((p) => !q || `${p.name} ${p.team}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={title} tags={<Link to={`/o/${slug}/c/${cslug}/live`} style={{ color: "inherit" }}>Open the live page</Link>} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Agenda">
        <p className="muted" style={{ marginTop: 0, maxWidth: 680 }}>The blocks of event day, one after another. The live page counts down each one, and everyone taking part gets a push as each block starts. The pitch cutoff is the pitch due date in the editor; teams get pushes 30, 10 and 1 minute before it.</p>
        <div className="form" style={{ maxWidth: 820 }}>
          {rows.map((r, i) => (
            <div className="qcard" key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px,1fr) minmax(120px,2fr) minmax(170px,2fr) minmax(170px,2fr) auto", gap: 8, alignItems: "end" }}>
              <div><label htmlFor={`k${i}`} style={{ marginTop: 0 }}>Block</label><select id={`k${i}`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label htmlFor={`l${i}`} style={{ marginTop: 0 }}>Name (optional)</label><input id={`l${i}`} maxLength={60} value={r.label} onChange={(e) => set(i, { label: e.target.value })} /></div>
              <div><label htmlFor={`s${i}`} style={{ marginTop: 0 }}>Starts</label><input id={`s${i}`} type="datetime-local" value={toLocalInput(r.starts_at)} onChange={(e) => set(i, { starts_at: fromLocalInput(e.target.value) })} /></div>
              <div><label htmlFor={`e${i}`} style={{ marginTop: 0 }}>Ends</label><input id={`e${i}`} type="datetime-local" value={toLocalInput(r.ends_at)} onChange={(e) => set(i, { ends_at: fromLocalInput(e.target.value) })} /></div>
              <button type="button" className="ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove block ${i + 1}`}>Remove</button>
            </div>
          ))}
          <div className="actions"><button type="button" className="ghost" onClick={add}>Add a block</button><button type="button" onClick={save}>Save agenda</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </div>
      </NumSection>
      <NumSection n="02" title="Check-in">
        <p className="muted" style={{ marginTop: 0, maxWidth: 680 }}>For in-person events. Each person in a team gets a QR pass on the challenge page and in the app. Scan passes with the Kakushin app (open the challenge, then Check people in), or check someone in by name here if their phone is dead. Turning check-in off and on again makes old passes stop working.</p>
        {ci && (
          <>
            <label className="check" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={ci.enabled} onChange={(e) => void ciRun(() => api(`${base}/checkin/settings`, { method: "PUT", json: { enabled: e.target.checked } }))} /> Check-in is on</label>
            <div className="pipeline" style={{ maxWidth: 420, marginTop: 12 }}><a style={{ cursor: "default" }}><b>{ci.checked_in}/{ci.total}</b><span>Checked in</span></a></div>
            <input aria-label="Find a person or team" placeholder="Find a person or team" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginTop: 12 }} />
            <ul className="todo">{people.map((p) => (
              <li key={p.user_id}><span><b>{p.name}</b> <span className="muted">· {p.team}{p.checked_in_at ? ` · in at ${clock(p.checked_in_at)}${p.method === "name" ? " (by name)" : ""}` : ""}</span></span>
                {p.checked_in_at ? <button className="ghost small" onClick={() => void ciRun(() => api(`${base}/checkin`, { method: "DELETE", json: { user_id: p.user_id } }))}>Undo</button>
                  : <button className="small" disabled={!ci.enabled} onClick={() => void ciRun(() => api(`${base}/checkin`, { method: "POST", json: { user_id: p.user_id } }), `${p.name} is checked in`)}>Check in</button>}</li>
            ))}</ul>
          </>
        )}
        {cmsg && <Notice kind={cmsg.kind}>{cmsg.text}</Notice>}
      </NumSection>
    </>
  );
}
