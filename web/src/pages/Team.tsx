import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Logo, Notice, Stamp } from "../ui";

export interface Question { id: string; label: string; type: "short_text" | "long_text" | "choice" | "url"; required: boolean; options: string[] }
interface TeamData {
  id: string; name: string; status: string; invite_code: string; is_lead: boolean;
  members: { id: string; name: string; is_lead: boolean }[];
  application: { answers: Record<string, string>; submitted_at: number } | null;
}
type Msg = { kind: "ok" | "err"; text: string } | null;

export function StatusStamp({ status }: { status: string }) {
  if (status === "applied") return <Stamp big="Sent" small="under review" tone="indigo" />;
  if (status === "shortlisted") return <Stamp big="Yes!" small="shortlisted" tone="moss" />;
  if (status === "rejected") return <Stamp big="Thanks" small="not selected" tone="ink" />;
  if (status === "finalist") return <Stamp big="Final" small="finalist" tone="gold" />;
  if (status === "winner") return <Stamp big="Won" small="winner" tone="red" />;
  return <Stamp big="Team" small="forming" tone="gold" />;
}

interface Props {
  orgSlug: string; cslug: string;
  challenge: { status: string; team_min: number; team_max: number; questions: Question[]; applications_open_at: number | null; applications_close_at: number | null };
}

export function TeamPanel({ orgSlug, cslug, challenge }: Props) {
  const { me } = useAuth();
  const [team, setTeam] = useState<TeamData | null | undefined>(undefined);
  const [msg, setMsg] = useState<Msg>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const base = `/orgs/${orgSlug}/challenges/${cslug}/team`;

  const now = Date.now();
  const closedWhy =
    challenge.status !== "open" ? "This challenge is not taking applications."
    : challenge.applications_open_at && now < challenge.applications_open_at ? "Applications have not opened yet."
    : challenge.applications_close_at && now > challenge.applications_close_at ? "Applications are closed."
    : null;

  async function load() {
    try { const r = await api<{ team: TeamData | null }>(base); setTeam(r.team); setAnswers(r.team?.application?.answers ?? {}); }
    catch { setTeam(null); }
  }
  useEffect(() => { if (me) void load(); else setTeam(null); }, [me?.id, orgSlug, cslug]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setMsg(null);
    try { await fn(); await load(); if (ok) setMsg({ kind: "ok", text: ok }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }

  if (!me) {
    return (
      <div className="section">
        <p className="hand">Want in?</p>
        <p className="muted">Sign in to create a team or join one with an invite code.</p>
        <div className="actions"><Link className="btn" to={`/login?next=/o/${orgSlug}/c/${cslug}`}>Sign in to apply</Link></div>
      </div>
    );
  }
  if (team === undefined) return null;

  if (!team) {
    return (
      <div className="section form">
        <h2>Apply</h2>
        {closedWhy ? <p className="muted">{closedWhy}</p> : (
          <>
            <p className="muted">Teams of {challenge.team_min === challenge.team_max ? challenge.team_min : `${challenge.team_min} to ${challenge.team_max}`}. Create a team and invite your teammates, or join one with a code.</p>
            <div className="row" style={{ marginTop: 8 }}>
              <form onSubmit={(e) => { e.preventDefault(); void run(() => api(base, { method: "POST", json: { name } }), "Team created"); }}>
                <label htmlFor="tn">Create a team</label>
                <input id="tn" required minLength={2} maxLength={60} placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="actions"><button type="submit">Create team</button></div>
              </form>
              <form onSubmit={(e) => { e.preventDefault(); void run(() => api("/teams/join", { method: "POST", json: { code } }), "You joined the team"); }}>
                <label htmlFor="tc">Join with a code</label>
                <input id="tc" required minLength={6} maxLength={12} placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <div className="actions"><button type="submit" className="ghost">Join team</button></div>
              </form>
            </div>
          </>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/join/${team.invite_code}`;
  const editable = (team.status === "forming" || team.status === "applied") && !closedWhy;
  const size = team.members.length;
  const needMore = Math.max(0, challenge.team_min - size);
  async function copy() { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ } }

  return (
    <>
      <div className="section">
        <div className="head-row">
          <div>
            <p className="label" style={{ marginTop: 0 }}>Your team</p>
            <h2>{team.name}</h2>
            <ul className="members">{team.members.map((m) => <li key={m.id}>{m.name}{m.is_lead && <span className="pill" style={{ marginLeft: 8 }}>lead</span>}
              {team.is_lead && !m.is_lead && team.status === "forming" && <button className="link" style={{ marginLeft: 8 }} onClick={() => run(() => api(`/teams/${team.id}/members/${m.id}`, { method: "DELETE" }))}>remove</button>}</li>)}</ul>
          </div>
          <StatusStamp status={team.status} />
        </div>
        {team.status === "forming" && (
          <div style={{ marginTop: 16, maxWidth: 560 }}>
            <label htmlFor="inv">Invite teammates</label>
            <div style={{ display: "flex", gap: 8 }}><input id="inv" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} /><button className="ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
            <p className="muted" style={{ fontSize: 13 }}>Or share the code <b>{team.invite_code}</b>. {needMore > 0 ? `You need ${needMore} more ${needMore === 1 ? "member" : "members"} to apply.` : ""}</p>
          </div>
        )}
        {team.status === "forming" && <div className="actions"><button className="ghost" onClick={() => run(() => api(`/teams/${team.id}/leave`, { method: "POST" }))}>Leave team</button></div>}
      </div>

      {(team.status === "forming" || team.status === "applied") && (
        <div className="section form">
          <h2>{team.status === "applied" ? "Your application" : "Application"}</h2>
          {!team.is_lead && <p className="muted">Your team lead submits the application.</p>}
          {closedWhy && <p className="muted">{closedWhy}</p>}
          <form onSubmit={(e) => { e.preventDefault(); void run(() => api(`/teams/${team.id}/application`, { method: "PUT", json: { answers } }), team.status === "applied" ? "Application updated" : "Application sent"); }}>
            {challenge.questions.length === 0 && <p className="muted">No extra questions for this challenge.</p>}
            {challenge.questions.map((q) => {
              const id = `q-${q.id}`, v = answers[q.id] ?? "", set = (val: string) => setAnswers({ ...answers, [q.id]: val });
              const dis = !team.is_lead || !editable;
              return (
                <div key={q.id}>
                  <label htmlFor={id}>{q.label}{q.required ? " *" : ""}</label>
                  {q.type === "long_text" ? <textarea id={id} rows={5} maxLength={3000} disabled={dis} value={v} onChange={(e) => set(e.target.value)} />
                    : q.type === "choice" ? <select id={id} disabled={dis} value={v} onChange={(e) => set(e.target.value)}><option value="">Choose...</option>{q.options.map((o) => <option key={o}>{o}</option>)}</select>
                    : <input id={id} type={q.type === "url" ? "url" : "text"} maxLength={300} disabled={dis} placeholder={q.type === "url" ? "https://" : ""} value={v} onChange={(e) => set(e.target.value)} />}
                </div>
              );
            })}
            {team.is_lead && editable && (
              <div className="actions">
                <button type="submit" disabled={team.status === "forming" && needMore > 0}>{team.status === "applied" ? "Update application" : "Submit application"}</button>
                {team.status === "applied" && <button type="button" className="ghost" onClick={() => run(() => api(`/teams/${team.id}/application`, { method: "DELETE" }), "Application withdrawn")}>Withdraw</button>}
              </div>
            )}
          </form>
        </div>
      )}
      {msg && <div className="section" style={{ paddingTop: 0 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
    </>
  );
}

export function Join() {
  const { code } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ team: any }>(`/teams/preview/${code}`).then((r) => setInfo(r.team)).catch((e: Error) => setErr(e.message)); }, [code]);
  async function join() {
    try { const r = await api<{ org: string; challenge: string }>("/teams/join", { method: "POST", json: { code } }); nav(`/o/${r.org}/c/${r.challenge}`); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="narrow">
      <p className="hand">You're invited</p>
      {info ? (
        <>
          <h1>Join {info.name}</h1>
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}><Logo url={info.logo_url} name={info.oname} size={22} />{info.title} by {info.oname}</p>
          <p className="muted">{info.size} of {info.team_max} places taken.</p>
          <div className="actions">
            {me ? <button onClick={join}>Join this team</button> : <Link className="btn" to={`/login?next=/join/${code}`}>Sign in to join</Link>}
          </div>
        </>
      ) : !err ? null : <h1>Invite not found</h1>}
      {err && <Notice kind="err">{err}</Notice>}
    </div>
  );
}
