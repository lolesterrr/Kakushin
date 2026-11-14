import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ProjectCards, type ProjectCard } from "../media";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";

type Msg = { kind: "ok" | "err"; text: string } | null;

interface PeopleData {
  teams: number; participants: number; looking: number;
  looking_list: { id: string; name: string; handle: string | null; note: string; skills: string[]; institution: string }[] | null;
  people: { id: string; name: string; handle: string; team: string }[] | null;
  me: { looking: { note: string } | null } | null;
}
interface MyTeam { id: string; status: string; is_lead: boolean; members: unknown[] }

const PersonName = ({ name, handle }: { name: string; handle: string | null }) => (handle ? <Link to={`/u/${handle}`}><b>{name}</b></Link> : <b>{name}</b>);

/**
 * Who's coming and the team finder. Counts show for everyone; names only to signed-in people, and only of those
 * looking for a team or with a public profile. A team lead can invite anyone who is looking.
 */
export function WhosComing({ orgSlug, cslug, open, teamMax, team }: { orgSlug: string; cslug: string; open: boolean; teamMax: number; team: MyTeam | null | undefined }) {
  const { me } = useAuth();
  const base = `/orgs/${orgSlug}/challenges/${cslug}`;
  const [d, setD] = useState<PeopleData | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const load = () => api<PeopleData>(`${base}/people`).then((r) => { setD(r); setNote(r.me?.looking?.note ?? ""); }).catch(() => {});
  useEffect(() => { void load(); }, [base, me?.id, team?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const looking = !!d.me?.looking;
  async function setLooking(on: boolean) {
    setMsg(null);
    try {
      await api(`${base}/looking`, on ? { method: "PUT", json: { note } } : { method: "DELETE" });
      await load(); setMsg({ kind: "ok", text: on ? (looking ? "Note updated" : "You are on the list. Team leads can now invite you.") : "You are off the list." });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  async function invite(id: string, name: string) {
    if (!team) return;
    setMsg(null);
    try { const r = await api<{ already: boolean }>(`/teams/${team.id}/invite`, { method: "POST", json: { user_id: id } }); setInvited(new Set([...invited, id])); setMsg({ kind: "ok", text: r.already ? `You already invited ${name}.` : `Invite sent to ${name}. It is in their inbox.` }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const canInvite = !!team && team.is_lead && team.status === "forming" && open && team.members.length < teamMax;
  const others = (d.looking_list ?? []).filter((p) => p.id !== me?.id);
  return (
    <div className="section" id="people">
      <p className="label" style={{ marginTop: 0 }}>Who's coming</p>
      <p style={{ marginTop: 0 }}><b>{d.participants}</b> {d.participants === 1 ? "person" : "people"} in <b>{d.teams}</b> {d.teams === 1 ? "team" : "teams"} so far{d.looking ? `, and ${d.looking} looking for a team` : ""}.</p>
      {!me && <p className="muted">Sign in to see who is looking for a team.</p>}
      {me && open && !team && team !== undefined && (
        <div className="form" style={{ maxWidth: 560 }}>
          <label className="check"><input type="checkbox" checked={looking} onChange={(e) => void setLooking(e.target.checked)} />Looking for a team</label>
          <label htmlFor="seek-note">A short note for team leads (optional)</label>
          <input id="seek-note" maxLength={280} placeholder="Designer, free on weekends, keen on health" value={note} onChange={(e) => setNote(e.target.value)} />
          {looking && <div className="actions" style={{ marginTop: 8 }}><button className="ghost small" onClick={() => void setLooking(true)}>Update note</button></div>}
          <p className="muted" style={{ fontSize: 13 }}>Signed-in people see your name, note and skills while you are on the list. You come off it when you join a team.</p>
        </div>
      )}
      {me && others.length > 0 && (
        <>
          <h3 style={{ marginBottom: 8 }}>Looking for a team</h3>
          <ul className="todo" style={{ maxWidth: 760 }}>
            {others.map((p) => (
              <li key={p.id}>
                <span><PersonName name={p.name} handle={p.handle} />{p.institution && <span className="muted"> · {p.institution}</span>}
                  {p.note && <><br /><span>{p.note}</span></>}
                  {p.skills.length > 0 && <><br /><span className="muted" style={{ fontSize: 13 }}>{p.skills.join(", ")}</span></>}</span>
                {canInvite && <button className="ghost small" disabled={invited.has(p.id)} onClick={() => void invite(p.id, p.name)}>{invited.has(p.id) ? "Invited" : "Invite to my team"}</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {me && d.people && d.people.length > 0 && (
        <>
          <h3 style={{ marginBottom: 8 }}>In a team</h3>
          <p className="muted" style={{ marginTop: 0 }}>{d.people.map((p, i) => <React.Fragment key={p.id}>{i > 0 && ", "}<Link to={`/u/${p.handle}`}>{p.name}</Link> ({p.team})</React.Fragment>)}</p>
        </>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

/** Finalist and winning projects whose teams chose to show them. Each card opens the project's own page. */
export function Gallery({ path, heading = "Project gallery", showChallenge = false }: { path: string; heading?: string; showChallenge?: boolean }) {
  const [items, setItems] = useState<ProjectCard[] | null>(null);
  useEffect(() => { api<{ projects: ProjectCard[] }>(path).then((r) => setItems(r.projects)).catch(() => setItems([])); }, [path]);
  if (!items || items.length === 0) return null;
  return (
    <div className="section" id="gallery">
      <h2>{heading}</h2>
      <ProjectCards items={items} showChallenge={showChallenge} />
    </div>
  );
}

/** Team lead's switch for the project gallery (decision D2: projects only show when the team opts in). */
export function ShowProject({ team, onChange }: { team: { id: string; status: string; is_lead: boolean; show_project?: boolean }; onChange: () => Promise<void> }) {
  const [msg, setMsg] = useState<Msg>(null);
  if (!["finalist", "winner"].includes(team.status)) return null;
  async function flip(show: boolean) {
    setMsg(null);
    try { await api(`/teams/${team.id}/showcase`, { method: "PUT", json: { show } }); await onChange(); setMsg({ kind: "ok", text: show ? "Your project will show in the gallery once results are out." : "Your project is hidden from the gallery." }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <div className="section form">
      <h2>Project gallery</h2>
      <p className="muted" style={{ marginTop: 0 }}>Once results are published, finalist and winning teams can show their project on the challenge and organisation pages: the team name, members, video and demo links and pitch notes. The deck stays private.</p>
      {team.is_lead
        ? <label className="check"><input type="checkbox" checked={!!team.show_project} onChange={(e) => void flip(e.target.checked)} />Show our project</label>
        : <p>{team.show_project ? "Your team lead chose to show your project." : "Your team lead can choose to show your project."}</p>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

interface Profile {
  handle: string; name: string; bio: string; institution: string; location: string; skills: string[]; links: Record<string, string>;
  certificates: { code: string; kind: string; title: string; issued_at: number; challenge: string; cslug: string; oslug: string; org: string }[];
  teams: { team: string; challenge: string; org: string; oslug: string; cslug: string; outcome: string }[];
}

/** /u/:handle. A private profile is a 404 from the server, shown like any missing page. */
export function PersonPage() {
  const { handle } = useParams();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setP(null); setErr(""); api<{ profile: Profile }>(`/people/${handle}`).then((r) => setP(r.profile)).catch((e: Error) => setErr(e.message)); }, [handle]);
  useEffect(() => { if (p) document.title = `${p.name} · Kakushin`; }, [p]);
  if (err) return <div className="empty"><p className="hand">{err === "Not found" ? "No public profile here" : err}</p><p className="muted">The address may be wrong, or the profile is private.</p></div>;
  if (!p) return null;
  const links = Object.entries(p.links).filter(([, u]) => /^https?:\/\//i.test(u));
  return (
    <>
      <div className="hero">
        <p className="label" style={{ margin: 0 }}>@{p.handle}</p>
        <h1>{p.name}</h1>
        {(p.institution || p.location) && <p className="muted" style={{ marginTop: 4 }}>{[p.institution, p.location].filter(Boolean).join(" · ")}</p>}
        {p.bio && <p style={{ whiteSpace: "pre-wrap", maxWidth: 680 }}>{p.bio}</p>}
        {p.skills.length > 0 && <div className="pills" style={{ marginTop: 12 }}>{p.skills.map((s) => <span key={s} className="pill topic">{s}</span>)}</div>}
        {links.length > 0 && <div className="actions">{links.map(([k, u]) => <a key={k} className="btn small ghost" href={u} target="_blank" rel="noopener noreferrer nofollow me">{k}</a>)}</div>}
      </div>
      {p.teams.length > 0 && (
        <div className="section">
          <h2>Teams</h2>
          <ul className="todo" style={{ maxWidth: 760 }}>
            {p.teams.map((t, i) => <li key={i}><span><b>{t.team}</b> <span className="muted">· <Link to={`/o/${t.oslug}/c/${t.cslug}`}>{t.challenge}</Link> by {t.org}</span></span><span className="tag sand">{t.outcome}</span></li>)}
          </ul>
        </div>
      )}
      {p.certificates.length > 0 && (
        <div className="section">
          <h2>Certificates</h2>
          <ul className="todo" style={{ maxWidth: 760 }}>
            {p.certificates.map((c) => <li key={c.code}><span><b>{c.title}</b> <span className="muted">· {c.challenge} by {c.org} · {fmtDate(c.issued_at)}</span></span><Link className="btn small ghost" to={`/verify/${c.code}`}>Verify</Link></li>)}
          </ul>
        </div>
      )}
      {p.teams.length === 0 && p.certificates.length === 0 && <div className="empty"><p className="muted">No challenges yet.</p></div>}
    </>
  );
}
