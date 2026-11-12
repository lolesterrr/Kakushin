import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, Tag } from "../ui";
import { challengeTabs } from "./Admin";

type Msg = { kind: "ok" | "err"; text: string } | null;
interface RTeam { id: string; name: string; status: string; placement: number | null }
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export function AdminResults() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const base = `/orgs/${slug}/challenges/${cslug}`;
  const [title, setTitle] = useState("");
  const [data, setData] = useState<{ published: boolean; stage: string; teams: RTeam[]; certificates: number } | null>(null);
  const [place, setPlace] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);

  async function load() {
    try {
      const ch = await api<{ challenge: { title: string }; role: string | null }>(base);
      if (!ch.role) { setErr("You are not an admin of this organisation."); return; }
      setTitle(ch.challenge.title);
      const r = await api<NonNullable<typeof data>>(`${base}/results`);
      setData(r); setPlace(Object.fromEntries(r.teams.map((t) => [t.id, t.placement ? String(t.placement) : ""])));
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { if (me) void load(); }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}/results`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!data) return null;

  const placements = () => data!.teams.filter((t) => place[t.id]).map((t) => ({ team_id: t.id, placement: Number(place[t.id]) }));
  async function save(): Promise<boolean> {
    setMsg(null);
    try { await api(`${base}/results`, { method: "PUT", json: { placements: placements() } }); await load(); setMsg({ kind: "ok", text: "Placements saved" }); return true; }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); return false; }
  }
  async function publish() {
    setConfirm(false);
    if (!(await save())) return;
    try { const r = await api<{ certificates: number }>(`${base}/results/publish`, { method: "POST" }); await load(); setMsg({ kind: "ok", text: `Results are public and ${r.certificates} certificates are ready.` }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  const placed = placements().length;

  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={title} tags={<Tag status={data.stage} />} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Winners">
        {data.teams.length === 0 ? <p className="muted">No finalists yet. Mark teams as finalist in Applications first.</p> : (
          <>
            <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>
              {data.published ? "Results are published, so placements are locked." : "Give a placement to the teams that won. Leave the rest as finalists. Check the Judging tab for the scores first."}
            </p>
            <ul className="todo">
              {data.teams.map((t) => (
                <li key={t.id}>
                  <span><b>{t.name}</b> <span className="muted">· {t.status === "winner" ? "winner" : "finalist"}</span></span>
                  <span>
                    <label htmlFor={`p${t.id}`} className="muted" style={{ marginRight: 8, display: "inline" }}>Placement</label>
                    <select id={`p${t.id}`} disabled={data.published} value={place[t.id] ?? ""} onChange={(e) => setPlace({ ...place, [t.id]: e.target.value })} style={{ width: "auto" }}>
                      <option value="">Not placed</option>
                      {data.teams.map((_, i) => <option key={i} value={i + 1}>{ordinal(i + 1)} place</option>)}
                    </select>
                  </span>
                </li>
              ))}
            </ul>
            {!data.published && <div className="actions"><button className="ghost" onClick={() => void save()}>Save placements</button></div>}
          </>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </NumSection>
      <NumSection n="02" title="Publish and certificates">
        {data.published ? (
          <>
            <p>Results are public on the challenge page. {data.certificates} certificates were issued, one per participant on a shortlisted, finalist or winning team. Each person downloads theirs from their profile.</p>
            <div className="actions"><a className="btn ghost" href={`/o/${slug}/c/${cslug}`}>View public results</a></div>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>Publishing shows the winners on the challenge page, moves the challenge to completed, and gives a verifiable certificate to every member of a shortlisted, finalist or winning team. You cannot change placements afterwards.</p>
            {confirm ? (
              <div className="actions"><span>Publish with {placed} placed {placed === 1 ? "team" : "teams"}?</span><button onClick={() => void publish()}>Yes, publish</button><button className="ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
            ) : (
              <div className="actions"><button disabled={placed === 0} onClick={() => setConfirm(true)}>Publish results</button>{placed === 0 && <span className="muted">Place at least one team first.</span>}</div>
            )}
          </>
        )}
      </NumSection>
    </>
  );
}

/** Shown on the public challenge page once results are published. */
export function PublicResults({ orgSlug, cslug }: { orgSlug: string; cslug: string }) {
  const [r, setR] = useState<{ published: boolean; winners: { placement: number; team: string; members: string }[]; finalists: string[] } | null>(null);
  useEffect(() => { api<NonNullable<typeof r>>(`/orgs/${orgSlug}/challenges/${cslug}/public-results`).then(setR).catch(() => {}); }, [orgSlug, cslug]);
  if (!r?.published) return null;
  return (
    <div className="section" id="results">
      <h2>Results</h2>
      <ol className="results">
        {r.winners.map((w) => (
          <li key={w.placement}><b className="place">{ordinal(w.placement)}</b><span><b>{w.team}</b>{w.members && <span className="muted"> · {w.members}</span>}</span></li>
        ))}
      </ol>
      {r.finalists.length > 0 && <p className="muted">Finalists: {r.finalists.join(", ")}</p>}
    </div>
  );
}
