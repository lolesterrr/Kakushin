import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection } from "../ui";
import { challengeTabs } from "./Admin";

type Audience = "applied" | "shortlisted" | "finalists" | "not_selected" | "team";
interface Data {
  items: { id: string; title: string; body: string; audience: string; recipients: number; created_at: number }[];
  reach: Record<Exclude<Audience, "team">, number>;
  teams: { id: string; name: string; status: string }[];
  left_today: number;
}
const AUDIENCES: [Audience, string][] = [["applied", "Everyone who applied"], ["shortlisted", "Shortlisted"], ["finalists", "Finalists"], ["not_selected", "Not selected"], ["team", "One team"]];
type Msg = { kind: "ok" | "err"; text: string } | null;

export function AdminMessages() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const base = `/orgs/${slug}/challenges/${cslug}/messages`;
  const [data, setData] = useState<Data | null>(null);
  const [audience, setAudience] = useState<Audience>("applied");
  const [team, setTeam] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => api<Data>(base).then(setData).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { if (me) void load(); }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/messages`} replace />;
  if (!data) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;

  const label = (a: string) => a.startsWith("team:") ? `Team ${data.teams.find((t) => t.id === a.slice(5))?.name ?? ""}` : AUDIENCES.find(([k]) => k === a)?.[1] ?? a;
  async function send(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const r = await api<{ recipients: number }>(base, { method: "POST", json: { audience, ...(audience === "team" ? { team_id: team } : {}), title, body } });
      setTitle(""); setBody(""); await load();
      setMsg({ kind: "ok", text: `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}. They get it in their inbox, as a push on the app and by email.` });
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    finally { setBusy(false); }
  }
  const reach = audience === "team" ? null : data.reach[audience];
  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title="Messages" tags={<span>{data.left_today} of 10 left today</span>} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Send a message">
        <form onSubmit={send} className="form">
          <p className="label" style={{ marginTop: 0 }}>To</p>
          <div className="pills" role="group" aria-label="Who gets it">{AUDIENCES.map(([k, l]) => (
            <button type="button" key={k} className={`pill ${audience === k ? "on" : ""}`} aria-pressed={audience === k} onClick={() => setAudience(k)}>{l}{k !== "team" && ` (${data.reach[k]})`}</button>
          ))}</div>
          {audience === "team" && (
            <><label htmlFor="mt">Team</label>
              <select id="mt" required value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Pick a team</option>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>
          )}
          <label htmlFor="ms">Subject</label><input id="ms" required minLength={3} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pitch day moves to room 2" />
          <label htmlFor="mb">Message</label><textarea id="mb" required rows={6} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="muted" style={{ fontSize: 13 }}>Each person gets it in their Kakushin inbox, as a push on the app and by email. The message links to the challenge page.</p>
          <div className="actions"><button type="submit" disabled={busy || data.left_today === 0 || reach === 0}>{reach === null ? "Send" : `Send to ${reach} ${reach === 1 ? "person" : "people"}`}</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      </NumSection>
      <NumSection n="02" title="Sent">
        {data.items.length === 0 ? <p className="muted">Nothing sent yet.</p> : (
          <ul className="todo">{data.items.map((m) => (
            <li key={m.id}><span><b>{m.title}</b> <span className="muted">· {label(m.audience)} · {m.recipients} {m.recipients === 1 ? "person" : "people"} · {fmtDate(m.created_at)}</span><br /><span className="muted" style={{ whiteSpace: "pre-wrap" }}>{m.body}</span></span></li>
          ))}</ul>
        )}
      </NumSection>
    </>
  );
}
