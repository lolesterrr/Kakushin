import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ImageStrip, Video } from "../media";
import { api } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, Tag } from "../ui";

type Msg = { kind: "ok" | "err"; text: string } | null;

export function JudgeHome() {
  const { me } = useAuth();
  const [items, setItems] = useState<{ slug: string; title: string; status: string; oslug: string; oname: string; teams: number }[] | null>(null);
  useEffect(() => { if (me) api<{ challenges: typeof items }>("/judge/challenges").then((r) => setItems(r.challenges)).catch(() => setItems([])); }, [me?.id]);
  if (!me) return <Navigate to="/login?next=/judge" replace />;
  return (
    <>
      <Band title="Judging" tags={<span>Challenges you are invited to judge</span>} />
      <NumSection n="01" title="Your challenges">
        {items && items.length === 0 && <p className="muted">You have no judging invites for {me.email}. Ask the organiser to invite this email address.</p>}
        <ul className="todo">{(items ?? []).map((c) => (
          <li key={`${c.oslug}/${c.slug}`}><span><b>{c.title}</b> <span className="muted">· {c.oname} · {c.teams} finalists</span></span><span><Tag status={c.status} /> <Link className="btn small" to={`/judge/${c.oslug}/${c.slug}`}>Open</Link></span></li>
        ))}</ul>
      </NumSection>
    </>
  );
}

/** The name and title shown in the judges section of the public page, if the organiser turns it on. */
function JudgeProfile({ slug, cslug }: { slug: string; cslug: string }) {
  const [f, setF] = useState<{ display_name: string; title: string; shown: boolean } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => { api<NonNullable<typeof f>>(`/judge/${slug}/${cslug}/profile`).then(setF).catch(() => {}); }, [slug, cslug]);
  if (!f) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await api(`/judge/${slug}/${cslug}/profile`, { method: "PUT", json: { display_name: f!.display_name, title: f!.title } }); setMsg({ kind: "ok", text: "Saved" }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  return (
    <NumSection n="03" title="On the challenge page">
      <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>
        Add the name and title you want participants to see. {f.shown ? "The organiser shows judges on the page, so this appears once you save it." : "The organiser has not turned on the judges section, so nothing shows yet."} Leave the name empty to stay off the page. Your email is never shown.
      </p>
      <form className="form" onSubmit={save} style={{ maxWidth: 480 }}>
        <label htmlFor="jdn">Display name</label><input id="jdn" maxLength={80} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
        <label htmlFor="jdt">Title</label><input id="jdt" maxLength={120} placeholder="CTO, Example Ltd" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="actions"><button type="submit">Save</button></div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </form>
    </NumSection>
  );
}

interface Crit { id: string; name: string; description: string; weight: number; max_score: number }

export function JudgeChallenge() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<{ challenge: { title: string; status: string; org: string; scoring_open: boolean; round?: string | null }; criteria: Crit[]; teams: { id: string; name: string; has_pitch: boolean; own_team: boolean; done: boolean; partial: boolean }[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (me) api<typeof data>(`/judge/${slug}/${cslug}`).then(setData).catch((e: Error) => setErr(e.message)); }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/judge/${slug}/${cslug}`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err === "Not found" ? `This page is only for judges invited with ${me.email}.` : err}</Notice></div>;
  if (!data) return null;
  const done = data.teams.filter((t) => t.done).length;
  return (
    <>
      <Band crumb="All judging" to="/judge" title={data.challenge.title} tags={<><Tag status={data.challenge.status} /><span>{data.challenge.org}</span>{data.challenge.round && <span>{data.challenge.round}</span>}</>} />
      <NumSection n="01" title="Your progress">
        <div className="pipeline" style={{ maxWidth: 420 }}><a style={{ cursor: "default" }} className={done < data.teams.length ? "hot" : ""}><b>{done}/{data.teams.length}</b><span>Teams scored</span></a></div>
        {!data.challenge.scoring_open && <p className="muted">Scoring opens when the organiser starts judging. You can look at the pitches now.</p>}
      </NumSection>
      <NumSection n="02" title="Teams">
        {data.teams.length === 0 && <p className="muted">No finalists yet.</p>}
        <ul className="todo">{data.teams.map((t) => (
          <li key={t.id}><span><b>{t.name}</b> <span className="muted">{t.has_pitch ? "" : "· no pitch yet"}{t.own_team ? "· your team" : ""}</span></span>
            <span>{t.done ? <span className="tag moss">Scored</span> : t.partial ? <span className="tag gold">In progress</span> : <span className="tag sand">Not scored</span>} {!t.own_team && <Link className="btn small" to={`/judge/${slug}/${cslug}/teams/${t.id}`}>{t.done ? "Review" : "Score"}</Link>}</span></li>
        ))}</ul>
      </NumSection>
      <JudgeProfile slug={slug!} cslug={cslug!} />
    </>
  );
}

export function JudgeTeam() {
  const { slug, cslug, teamId } = useParams();
  const { me } = useAuth();
  const [d, setD] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, { score: string; comment: string }>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    if (!me) return;
    api<any>(`/judge/${slug}/${cslug}/teams/${teamId}`).then((r) => {
      setD(r);
      const v: Record<string, { score: string; comment: string }> = {};
      for (const s of r.scores) v[s.criterion_id] = { score: String(s.score), comment: s.comment ?? "" };
      setVals(v);
    }).catch((e: Error) => setErr(e.message));
  }, [slug, cslug, teamId, me?.id]);
  if (!me) return <Navigate to={`/login?next=/judge/${slug}/${cslug}/teams/${teamId}`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!d) return null;
  const crit: Crit[] = d.criteria;
  const complete = crit.every((c) => vals[c.id]?.score !== undefined && vals[c.id]?.score !== "");
  const total = complete ? Math.round(crit.reduce((a, c) => a + (Number(vals[c.id]!.score) / c.max_score) * c.weight * 100, 0) * 100) / 100 : null;
  const locked = !d.scoring_open || d.own_team;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const scores = crit.filter((c) => vals[c.id]?.score !== undefined && vals[c.id]?.score !== "").map((c) => ({ criterion_id: c.id, score: Number(vals[c.id]!.score), comment: vals[c.id]!.comment }));
    if (scores.length === 0) { setMsg({ kind: "err", text: "Enter at least one score" }); return; }
    try { await api(`/judge/${slug}/${cslug}/teams/${teamId}/scores`, { method: "PUT", json: { scores } }); setMsg({ kind: "ok", text: complete ? "Scores saved. This team is fully scored." : "Scores saved. Score the remaining criteria to finish this team." }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function conflict() {
    if (!confirm(`Step back from judging ${d.team.name}? Use this if you know someone on the team or have another reason you cannot judge it fairly. Any scores you gave it are removed and the organiser is told, so they can give the team another judge.`)) return;
    try { await api(`/judge/${slug}/${cslug}/teams/${teamId}/conflict`, { method: "POST" }); nav(`/judge/${slug}/${cslug}`); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  const p = d.pitch;
  return (
    <>
      <Band crumb="All teams" to={`/judge/${slug}/${cslug}`} title={d.team.name} tags={d.blind ? <span>Blind review: member names are hidden</span> : <span>{d.team.members.map((m: any) => m.institution ? `${m.name} (${m.institution})` : m.name).join(", ")}</span>} />
      <NumSection n="01" title="Pitch">
        {!p && !(d.images?.length) ? <p className="muted">This team has not added a pitch yet.</p> : (
          <>
          {(p?.video_embed || d.images?.length > 0) && (
            <div className="judge-media">
              <Video embed={p?.video_embed} title={d.team.name} />
              <ImageStrip images={d.images ?? []} title={d.team.name} />
            </div>
          )}
          {p && <ul className="todo">
            {p.has_deck && <li><span>Pitch deck</span><a className="btn small" href={`/api/decks/${d.team.id}`} target="_blank" rel="noopener noreferrer">Open PDF</a></li>}
            {p.video_url && <li><span>Video</span><a href={p.video_url} target="_blank" rel="noopener noreferrer">{p.video_url}</a></li>}
            {p.demo_url && <li><span>Demo</span><a href={p.demo_url} target="_blank" rel="noopener noreferrer">{p.demo_url}</a></li>}
            {p.repo_url && <li><span>Code</span><a href={p.repo_url} target="_blank" rel="noopener noreferrer">{p.repo_url}</a></li>}
            {p.notes && <li><span style={{ whiteSpace: "pre-wrap" }}>{p.notes}</span></li>}
          </ul>}
          </>
        )}
      </NumSection>
      {p?.repo_url && <RepoStats path={`/judge/${slug}/${cslug}/teams/${teamId}/repo`} />}
      <NumSection n="02" title="Score">
        {!d.scoring_open && <Notice kind="err">Scoring is not open yet. The organiser starts judging.</Notice>}
        <form onSubmit={save} className="form">
          {crit.map((c) => {
            const v = vals[c.id] ?? { score: "", comment: "" };
            return (
              <div className="qcard" key={c.id}>
                <label htmlFor={`s${c.id}`} style={{ marginTop: 0 }}>{c.name} · out of {c.max_score} · weight {Math.round(c.weight * 100)}%</label>
                {c.description && <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>{c.description}</p>}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input type="range" min={0} max={c.max_score} step={1} disabled={locked} aria-label={`${c.name} slider`} value={v.score === "" ? 0 : Number(v.score)} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, score: e.target.value } })} />
                  <input id={`s${c.id}`} type="number" min={0} max={c.max_score} disabled={locked} style={{ width: 90 }} value={v.score} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, score: e.target.value } })} />
                </div>
                <label htmlFor={`c${c.id}`}>Comment (optional)</label><textarea id={`c${c.id}`} rows={2} maxLength={1000} disabled={locked} value={v.comment} onChange={(e) => setVals({ ...vals, [c.id]: { ...v, comment: e.target.value } })} />
              </div>
            );
          })}
          <p style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>Weighted total: {total === null ? "score every criterion to see it" : `${total} / 100`}</p>
          <div className="actions">
            {!locked && <button type="submit">Save scores</button>}
            {!d.own_team && <button type="button" className="ghost" onClick={conflict}>I know this team</button>}
          </div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      </NumSection>
    </>
  );
}

interface Repo {
  status: string; blind?: boolean; fetched_at?: number; not_on_team?: number;
  contributors?: { login: string | null; member: string | null; on_team: boolean; commits: number }[];
  no_commits?: { name: string; linked: boolean }[] | number;
}

/** Who pushed code to the team's repo, from GitHub (refreshed at most once an hour). */
export function RepoStats({ path }: { path: string }) {
  const [r, setR] = useState<Repo | null>(null);
  useEffect(() => { api<Repo>(path).then(setR).catch(() => setR({ status: "unavailable" })); }, [path]);
  if (!r) return <div className="section" style={{ paddingTop: 0 }}><p className="muted">Checking the repo on GitHub...</p></div>;
  const why: Record<string, string> = { not_found: "GitHub cannot see this repo. It may be private or renamed.", rate_limited: "GitHub is busy. Try again in a few minutes.", unavailable: "GitHub could not be reached. Try again later." };
  if (r.status !== "ok") return <div className="section" style={{ paddingTop: 0 }}><p className="muted">{why[r.status] ?? ""}</p></div>;
  const list = r.contributors ?? [];
  const missing = r.no_commits;
  return (
    <div className="section" style={{ paddingTop: 0 }}>
      <p className="label" style={{ marginTop: 0 }}>Who pushed code</p>
      {list.length === 0 ? <p className="muted">No commits yet.</p> : (
        <p>{list.map((c, i) => <span key={i}>{i ? ", " : ""}<b>{r.blind ? (c.on_team ? "Team member" : "Not on the team") : c.member ?? c.login}</b> {c.commits}{!r.blind && !c.member ? " (not on the team)" : ""}</span>)}</p>
      )}
      {typeof missing === "number" ? (missing > 0 && <p className="muted">{missing} {missing === 1 ? "member has" : "members have"} no commits matched.</p>)
        : missing && missing.length > 0 && <p className="muted">No commits matched for {missing.map((m) => m.linked ? m.name : `${m.name} (no GitHub link on their profile)`).join(", ")}.</p>}
      <p className="muted" style={{ fontSize: 13 }}>Commits on the default branch, matched by the GitHub link on each member's profile.</p>
    </div>
  );
}
