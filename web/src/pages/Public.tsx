import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { TeamPanel, type Question } from "./Team";
import { ChallengeCard, type ChallengeCardData, DeadlineStamp, Logo, Notice, Stamp, StatusPill, TopicPills } from "../ui";

export function Explore() {
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [items, setItems] = useState<ChallengeCardData[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ topics: string[] }>("/challenges/topics").then((r) => setTopics(r.topics)).catch(() => {}); }, []);
  useEffect(() => {
    setItems(null);
    api<{ challenges: ChallengeCardData[] }>(`/challenges${topic ? `?topic=${topic}` : ""}`)
      .then((r) => setItems(r.challenges)).catch((e: Error) => setErr(e.message));
  }, [topic]);
  return (
    <>
      <div className="hero">
        <p className="hand">Open now</p>
        <h1>Challenges worth your next weekend</h1>
        <p>Hackathons and innovation challenges from universities, hubs and companies. Find one, form a team, apply.</p>
        <div className="pills" style={{ marginTop: 20 }} role="group" aria-label="Filter by topic">
          <button className={`pill ${topic === null ? "on" : ""}`} onClick={() => setTopic(null)}>all</button>
          {topics.map((t) => <button key={t} className={`pill ${topic === t ? "on" : ""}`} onClick={() => setTopic(t)}>{t}</button>)}
        </div>
      </div>
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {items && items.length > 0 && <div className="grid">{items.map((c) => <ChallengeCard key={`${c.org.slug}/${c.slug}`} c={c} />)}</div>}
      {items && items.length === 0 && (
        <div className="empty"><p className="hand">Nothing here yet</p><p className="muted">{topic ? "No open challenges for this topic." : "No open challenges right now. Check back soon."}</p></div>
      )}
    </>
  );
}

interface OrgPage { org: { slug: string; name: string; type: string; website: string | null; logo_url: string | null }; role: string | null; challenges: ChallengeCardData[] }

export function OrgPublic() {
  const { slug } = useParams();
  const [data, setData] = useState<OrgPage | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<OrgPage>(`/orgs/${slug}`).then(setData).catch((e: Error) => setErr(e.message)); }, [slug]);
  if (err) return <div className="section"><Notice kind="err">{err === "Not found" ? "We could not find that organisation." : err}</Notice></div>;
  if (!data) return null;
  const { org, role, challenges } = data;
  const visible = challenges.filter((c) => c.status !== "draft");
  return (
    <>
      <div className="hero">
        <div className="head-row">
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Logo url={org.logo_url} name={org.name} size={64} />
            <div>
              <p className="label" style={{ margin: 0 }}>{org.type}</p>
              <h1>{org.name}</h1>
              {org.website && <a className="muted" href={org.website} rel="noopener noreferrer" target="_blank">{org.website.replace(/^https?:\/\//, "")}</a>}
            </div>
          </div>
          <Stamp big={String(visible.length)} small={visible.length === 1 ? "challenge" : "challenges"} tone="indigo" size="lg" />
        </div>
        {role && <div className="actions"><Link className="btn ghost" to={`/admin/o/${org.slug}`}>Manage organisation</Link></div>}
      </div>
      {visible.length > 0
        ? <div className="grid">{visible.map((c) => <ChallengeCard key={c.slug} c={{ ...c, org }} />)}</div>
        : <div className="empty"><p className="hand">No public challenges yet</p></div>}
    </>
  );
}

interface ChallengeFull extends ChallengeCardData {
  description: string; prizes: string; status: string; applications_open_at: number | null; pitch_due_at: number | null; questions: Question[];
}

export function ChallengePublic() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<{ challenge: ChallengeFull; role: string | null } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<{ challenge: ChallengeFull; role: string | null }>(`/orgs/${slug}/challenges/${cslug}`).then(setData).catch((e: Error) => setErr(e.message)); }, [slug, cslug]);
  if (err) return <div className="section"><Notice kind="err">{err === "Not found" ? "We could not find that challenge." : err}</Notice></div>;
  if (!data) return null;
  const { challenge: c, role } = data;
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }
  return (
    <>
      {c.cover_url && <img className="cover" style={{ aspectRatio: "16 / 6" }} src={c.cover_url} alt="" />}
      <div className="hero">
        <div className="head-row">
          <div style={{ maxWidth: 680 }}>
            <Link to={`/o/${c.org.slug}`} className="org-line" style={{ textDecoration: "none", marginBottom: 12 }}>
              <Logo url={c.org.logo_url} name={c.org.name} size={24} /><span>{c.org.name}</span>
            </Link>
            <h1>{c.title}</h1>
            {c.summary && <p>{c.summary}</p>}
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><StatusPill status={c.status} /><TopicPills topics={c.topics} /></div>
          </div>
          <DeadlineStamp closeAt={c.applications_close_at} size="lg" />
        </div>
        <div className="actions">
          {c.status === "open" && <a className="btn" href="#apply">Apply</a>}
          <button className="ghost" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          {role && <Link className="btn ghost" to={`/admin/o/${c.org.slug}/c/${c.slug}`}>Edit challenge</Link>}
        </div>
      </div>
      <div className="spec">
        <div><p className="label">Applications open</p><b>{fmtDate(c.applications_open_at)}</b></div>
        <div><p className="label">Applications close</p><b>{fmtDate(c.applications_close_at)}</b></div>
        <div><p className="label">Team size</p><b>{c.team_min === c.team_max ? c.team_min : `${c.team_min} to ${c.team_max}`}</b></div>
        <div><p className="label">Pitch due</p><b>{fmtDate(c.pitch_due_at)}</b></div>
      </div>
      {c.description && <div className="section"><p className="label" style={{ marginTop: 0 }}>About</p><div className="prose">{c.description}</div></div>}
      {c.prizes && <div className="section"><p className="label" style={{ marginTop: 0 }}>Prizes</p><div className="prose">{c.prizes}</div></div>}
      {c.status !== "draft" && <div id="apply"><TeamPanel orgSlug={c.org.slug} cslug={c.slug} challenge={c} /></div>}
    </>
  );
}
