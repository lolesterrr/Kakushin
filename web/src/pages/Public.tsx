import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { NextStep, TeamPanel, useMyTeam, type Question } from "./Team";
import { FollowButton } from "./Inbox";
import { PublicResults } from "./Results";
import { ChallengeCard, type ChallengeCardData, DeadlineStamp, Logo, Notice, Stamp, StatusPill, TopicPills } from "../ui";

export function Home() {
  const [items, setItems] = useState<ChallengeCardData[] | null>(null);
  useEffect(() => { api<{ challenges: ChallengeCardData[] }>("/challenges").then((r) => setItems(r.challenges.slice(0, 3))).catch(() => setItems([])); }, []);
  useEffect(() => { if (window.location.hash === "#how") document.getElementById("how")?.scrollIntoView(); }, []);
  const steps: [string, string, string][] = [
    ["01", "Pick", "Browse open challenges. Each one shows its deadline, team size and prize up front."],
    ["02", "Apply", "Create a team, share the invite link and answer a few questions. Your lead sends it."],
    ["03", "Pitch", "Shortlisted teams pitch to judges, who score against the organiser's criteria."],
    ["04", "Certificate", "Everyone who takes part gets a certificate that anyone can verify online."],
  ];
  return (
    <>
      <section className="home-hero">
        <div className="copy">
          <p className="hand" style={{ margin: 0 }}>Hackathons, without the spreadsheets</p>
          <h1>Find a challenge.<br />Build a team.<br />Pitch your idea.</h1>
          <p className="lead">Kakushin is where universities, hubs and companies run innovation challenges, and where you go to find them. One profile for every event.</p>
          <div className="actions"><Link className="btn" to="/login?mode=signup">Create your account</Link><Link className="btn ghost" to="/challenges">Browse challenges</Link><Link className="btn ghost" to="/admin">I run events</Link></div>
        </div>
        <div className="art" aria-hidden>
          <img className="glyph" src="/hero/rocket.webp" width={322} height={569} alt="" decoding="async" />
        </div>
      </section>
      <section id="how" className="section" style={{ paddingBottom: 0 }}>
        <p className="label" style={{ margin: 0 }}>How it works</p><h2 style={{ marginTop: 6, fontSize: 28 }}>From curious to certified in four steps</h2>
        <div className="steps" style={{ margin: "28px -24px 0" }}>{steps.map(([n, t, d]) => <div key={n}><b className="n">{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>
      <section style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="section" style={{ borderBottom: 0, paddingBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><p className="label" style={{ margin: 0 }}>Open now</p><h2 style={{ marginTop: 6, fontSize: 28 }}>Challenges accepting applications</h2></div>
          <Link to="/challenges" style={{ fontWeight: 600 }}>See all challenges</Link>
        </div>
        {items && items.length > 0 && <div className="grid" style={{ borderTop: "1px solid var(--line)" }}>{items.map((c) => <ChallengeCard key={`${c.org.slug}/${c.slug}`} c={c} />)}</div>}
        {items && items.length === 0 && <div className="empty" style={{ borderTop: "1px solid var(--line)" }}><p className="hand">No open challenges right now</p><p className="muted">Check back soon, or run your own.</p></div>}
      </section>
      <section className="split">
        <div><p className="hand" style={{ margin: 0 }}>For participants</p><h2 style={{ margin: "6px 0 10px", fontSize: 26 }}>One profile for every event</h2><p>Keep your skills, teams and certificates in one place.</p><Link to="/login" style={{ fontWeight: 600 }}>Sign in with your email</Link></div>
        <div><p className="hand" style={{ margin: 0 }}>For organisers</p><h2 style={{ margin: "6px 0 10px", fontSize: 26 }}>Run the whole challenge here</h2><p>Post a challenge, review applications, invite judges, score pitches and issue certificates.</p><Link className="btn" to="/admin">Set up your organisation</Link></div>
      </section>
    </>
  );
}

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
        <h1>Challenges</h1>
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
        <div className="actions"><FollowButton slug={org.slug} />{role && <Link className="btn ghost" to={`/admin/o/${org.slug}`}>Manage organisation</Link>}</div>
      </div>
      {visible.length > 0
        ? <div className="grid">{visible.map((c) => <ChallengeCard key={c.slug} c={{ ...c, org }} />)}</div>
        : <div className="empty"><p className="hand">No public challenges yet</p></div>}
    </>
  );
}

interface ChallengeFull extends ChallengeCardData {
  description: string; prizes: string; status: string; results_published?: number; applications_open_at: number | null; pitch_due_at: number | null; questions: Question[];
}

export function ChallengePublic() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<{ challenge: ChallengeFull; role: string | null } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const { team, reload } = useMyTeam(slug ?? "", cslug ?? "");
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
            <div className="actions">
          <button className="ghost" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          {role && <Link className="btn ghost" to={`/admin/o/${c.org.slug}/c/${c.slug}`}>Manage challenge</Link>}
        </div>
          </div>
          {c.status !== "draft" && <NextStep orgSlug={c.org.slug} cslug={c.slug} challenge={c} team={team} />}
        </div>
      </div>
      <div className="spec">
        <div><p className="label">Applications open</p><b>{fmtDate(c.applications_open_at)}</b></div>
        <div><p className="label">Applications close</p><b>{fmtDate(c.applications_close_at)}</b></div>
        <div><p className="label">Team size</p><b>{c.team_min === c.team_max ? c.team_min : `${c.team_min} to ${c.team_max}`}</b></div>
        <div><p className="label">Pitch due</p><b>{fmtDate(c.pitch_due_at)}</b></div>
      </div>
      {c.results_published && <PublicResults orgSlug={c.org.slug} cslug={c.slug} />}
      {c.description && <div className="section"><p className="label" style={{ marginTop: 0 }}>About</p><div className="prose">{c.description}</div></div>}
      {c.prizes && <div className="section"><p className="label" style={{ marginTop: 0 }}>Prizes</p><div className="prose">{c.prizes}</div></div>}
      {c.status !== "draft" && <div id="apply"><TeamPanel orgSlug={c.org.slug} cslug={c.slug} challenge={c} team={team} reload={reload} /></div>}
    </>
  );
}
