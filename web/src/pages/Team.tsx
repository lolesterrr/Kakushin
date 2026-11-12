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
  if (status === "applied") return <Stamp big="Received" small="under review" tone="indigo" size="sm" />;
  if (status === "shortlisted") return <Stamp big="Yes!" small="shortlisted" tone="moss" />;
  if (status === "rejected") return <Stamp big="Thanks" small="not selected" tone="ink" />;
  if (status === "finalist") return <Stamp big="Final" small="finalist" tone="gold" />;
  if (status === "winner") return <Stamp big="Won" small="winner" tone="red" />;
  return <Stamp big="Team" small="forming" tone="gold" />;
}

export function useMyTeam(orgSlug: string, cslug: string) {
  const { me } = useAuth();
  const [team, setTeam] = useState<TeamData | null | undefined>(undefined);
  const reload = async () => {
    if (!me) { setTeam(null); return; }
    try { setTeam((await api<{ team: TeamData | null }>(`/orgs/${orgSlug}/challenges/${cslug}/team`)).team); } catch { setTeam(null); }
  };
  useEffect(() => { void reload(); }, [me?.id, orgSlug, cslug]);
  return { team, reload };
}

type Chal = { status: string; team_min: number; team_max: number; applications_open_at: number | null; applications_close_at: number | null };

function windowClosed(c: Chal): string | null {
  const now = Date.now();
  return c.status !== "open" ? "This challenge is not taking applications."
    : c.applications_open_at && now < c.applications_open_at ? "Applications have not opened yet."
    : c.applications_close_at && now > c.applications_close_at ? "Applications are closed." : null;
}

/** One panel: the deadline countdown and the single thing to do next. */
export function NextStep({ orgSlug, cslug, challenge, team }: { orgSlug: string; cslug: string; challenge: Chal; team: TeamData | null | undefined }) {
  const { me } = useAuth();
  const closed = windowClosed(challenge);
  const close = challenge.applications_close_at;
  const days = close ? Math.ceil((close - Date.now()) / 86400000) : null;
  let text = "", action: React.ReactNode = null;
  if (closed) text = closed;
  else if (!me) { text = "Sign in to create a team and apply."; action = <Link className="btn" to={`/login?next=/o/${orgSlug}/c/${cslug}`}>Sign in to apply</Link>; }
  else if (team === undefined) text = "";
  else if (!team) { text = "Create a team, or join one with an invite code."; action = <a className="btn" href="#apply">Create or join a team</a>; }
  else if (team.status === "forming") {
    const need = Math.max(0, challenge.team_min - team.members.length);
    if (need > 0) { text = `Invite ${need} more ${need === 1 ? "teammate" : "teammates"} to be able to apply.`; action = <a className="btn" href="#apply">Get the invite link</a>; }
    else if (team.is_lead) { text = "Answer the questions and send your application."; action = <a className="btn" href="#apply">Finish application</a>; }
    else text = "Your team lead sends the application.";
  }
  else if (team.status === "applied") text = "Received. The organisers will review your application. You can edit it until the deadline.";
  else if (team.status === "shortlisted") text = "You are shortlisted. The organisers will share the next steps.";
  else if (team.status === "rejected") { text = "Not selected this time. Plenty of other challenges are open."; action = <Link className="btn ghost" to="/challenges">Browse challenges</Link>; }
  else text = "You are in. Check your email for updates.";
  return (
    <aside className="next" aria-label="Your next step">
      <div className="days">
        {days === null ? <b>Open</b> : days > 0 ? <><b>{days}</b><span className="muted">{days === 1 ? "day left" : "days left"}</span></> : <b>Closed</b>}
      </div>
      <div className="body"><p className="label" style={{ margin: 0 }}>Your next step</p><p>{text}</p>{action}</div>
    </aside>
  );
}

interface Props {
  orgSlug: string; cslug: string; team: TeamData | null | undefined; reload: () => Promise<void>;
  challenge: { status: string; team_min: number; team_max: number; questions: Question[]; applications_open_at: number | null; applications_close_at: number | null };
}

export function TeamPanel({ orgSlug, cslug, challenge, team, reload }: Props) {
  const { me } = useAuth();
  const [msg, setMsg] = useState<Msg>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const base = `/orgs/${orgSlug}/challenges/${cslug}/team`;

  useEffect(() => { setAnswers(team?.application?.answers ?? {}); }, [team?.id, team?.application?.submitted_at]);
  const closedWhy = windowClosed(challenge);
  const load = reload;

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
          <div className="progress" aria-hidden><i className={size >= challenge.team_min ? "on" : ""} /><i className={team.status === "applied" ? "on" : ""} /><i className={team.status === "applied" ? "on" : ""} /></div>
          <div className="progress-labels"><span>1 Team</span><span>2 Answers</span><span>3 Sent</span></div>
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
