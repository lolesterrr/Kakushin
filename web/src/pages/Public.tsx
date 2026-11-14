import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { NextStep, TeamPanel, useMyTeam, type Question } from "./Team";
import { CheckinPass, type Block } from "./Live";
import { FollowButton } from "./Inbox";
import { PublicResults } from "./Results";
import { Banner, ChallengeCard, type ChallengeCardData, DeadlineStamp, Logo, Notice, Stamp, StatusPill, TopicPills } from "../ui";
import { Markdown } from "../markdown";
import { Gallery, ShowProject, WhosComing } from "./People";
import { Recap } from "../media";

/**
 * Banner bulb: grows in once per page load, then loops a gentle turn. Reduced motion gets the still.
 * Both videos carry the still as their poster, so a phone shows the bulb (not a black box) until playback starts.
 * A reload plays the intro again; moving around inside the app and back to the homepage does not.
 * The intro waits until the banner is on screen and the tab is in front, so it is not used up
 * while someone is scrolled away (the banner sits below the text on phones).
 */
let bulbIntroPlayed = false;
function HeroBulb() {
  const ref = useRef<HTMLVideoElement>(null);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [intro, setIntro] = useState(() => !bulbIntroPlayed);
  useEffect(() => {
    const v = ref.current;
    if (!intro || !v) return;
    let onScreen = false;
    // If the phone refuses to play (Low Power Mode, data saver), skip to the loop, which shows the still as its poster.
    const sync = () => { if (onScreen && document.visibilityState === "visible") v.play().catch(() => { bulbIntroPlayed = true; setIntro(false); }); else v.pause(); };
    const io = new IntersectionObserver((es) => { const e = es[es.length - 1]; onScreen = !!e && e.isIntersecting && e.intersectionRatio >= 0.5; sync(); }, { threshold: [0, 0.5, 1] });
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [intro]);
  function done() { bulbIntroPlayed = true; setIntro(false); }
  if (still) return <img className="glyph" src="/hero/bulb-poster.jpg" width={640} height={800} alt="" />;
  return intro
    ? <video key="intro" ref={ref} className="glyph" src="/hero/bulb-intro.mp4" poster="/hero/bulb-poster.jpg" muted playsInline preload="auto" onEnded={done} onError={() => setIntro(false)} />
    : <video key="loop" className="glyph" src="/hero/bulb-loop.mp4" poster="/hero/bulb-poster.jpg" autoPlay muted loop playsInline preload="auto" />;
}

export function Home() {
  const { me } = useAuth();
  const [items, setItems] = useState<ChallengeCardData[] | null>(null);
  useEffect(() => { api<{ challenges: ChallengeCardData[] }>("/challenges?limit=3").then((r) => setItems(r.challenges.slice(0, 3))).catch(() => setItems([])); }, []);
  useEffect(() => { if (window.location.hash === "#how") document.getElementById("how")?.scrollIntoView(); }, []);
  const steps: [string, string, string][] = [
    ["01", "Pick", "Browse open challenges. Each one shows its deadline, team size and prize up front."],
    ["02", "Apply", "Create a team, share the invite link and answer a few questions. Your lead sends it."],
    ["03", "Pitch", "Shortlisted teams pitch to judges, who score against the organiser's criteria."],
    ["04", "Certificate", "Everyone who takes part gets a certificate that anyone can verify online."],
  ];
  const [deleted] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("deleted"));
  return (
    <>
      {deleted && <div className="section" style={{ paddingTop: 16, paddingBottom: 16 }}><Notice kind="ok">Your account has been deleted.</Notice></div>}
      <section className="home-hero">
        <div className="copy">
          <p className="hand" style={{ margin: 0 }}>Hackathons, without the spreadsheets</p>
          <h1>Find a challenge.<br />Build a team.<br />Pitch your idea.</h1>
          <p className="lead">Kakushin is where universities, hubs and companies run innovation challenges, and where you go to find them. One profile for every event.</p>
          <div className="actions">{!me && <Link className="btn" to="/login?mode=signup">Create your account</Link>}<Link className={me ? "btn" : "btn ghost"} to="/challenges">Browse challenges</Link><Link className="btn ghost" to="/admin">I run events</Link></div>
        </div>
        <div className="art" aria-hidden>
          <HeroBulb />
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
        <div><p className="hand" style={{ margin: 0 }}>For participants</p><h2 style={{ margin: "6px 0 10px", fontSize: 26 }}>One profile for every event</h2><p>Keep your skills, teams and certificates in one place.</p>{me ? <Link to="/profile" style={{ fontWeight: 600 }}>Go to your profile</Link> : <Link to="/login" style={{ fontWeight: 600 }}>Sign in with your email</Link>}</div>
        <div><p className="hand" style={{ margin: 0 }}>For organisers</p><h2 style={{ margin: "6px 0 10px", fontSize: 26 }}>Run the whole challenge here</h2><p>Post a challenge, review applications, invite judges, score pitches and issue certificates.</p><Link className="btn" to="/admin">Set up your organisation</Link></div>
      </section>
    </>
  );
}

type Page = { challenges: ChallengeCardData[]; next: string | null };

export function Explore() {
  const [topics, setTopics] = useState<string[]>([]);
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [topic, setTopic] = useState<string | null>(params.get("topic"));
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(q);
  const [size, setSize] = useState(params.get("size") ?? "");
  const [sort, setSort] = useState(params.get("sort") === "newest" ? "newest" : "closing");
  const [items, setItems] = useState<ChallengeCardData[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ topics: string[] }>("/challenges/topics").then((r) => setTopics(r.topics)).catch(() => {}); }, []);
  // Search as people type, a moment after they stop.
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const qs = (cursor?: string) => {
    const u = new URLSearchParams();
    if (topic) u.set("topic", topic);
    if (query) u.set("q", query);
    if (size) u.set("size", size);
    if (sort !== "closing") u.set("sort", sort);
    if (cursor) u.set("cursor", cursor);
    return u.toString();
  };
  useEffect(() => {
    let alive = true;
    setItems(null); setErr("");
    const shown = qs();
    // Keep the filters in the address, so a search can be shared or survives a reload.
    window.history.replaceState(null, "", `/challenges${shown ? `?${shown}` : ""}`);
    api<Page>(`/challenges?${shown}`).then((r) => { if (alive) { setItems(r.challenges); setNext(r.next); } }).catch((e: Error) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [topic, query, size, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  async function more() {
    if (!next) return;
    setBusy(true);
    try { const r = await api<Page>(`/challenges?${qs(next)}`); setItems([...(items ?? []), ...r.challenges]); setNext(r.next); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const filtered = !!(topic || query || size);
  return (
    <>
      <div className="hero">
        <p className="hand">Open now</p>
        <h1>Challenges</h1>
        <p>Hackathons and innovation challenges from universities, hubs and companies. Find one, form a team, apply. <Link to="/challenges/winners">See past winners</Link>.</p>
        <div className="search-row">
          <input type="search" aria-label="Search challenges" placeholder="Search by name, summary or organiser" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
          <select aria-label="Team size" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">Any team size</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 1 ? "Solo" : `Team of ${n}`}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="closing">Closing soon</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <div className="pills" style={{ marginTop: 16 }} role="group" aria-label="Filter by topic">
          <button className={`pill ${topic === null ? "on" : ""}`} onClick={() => setTopic(null)}>all</button>
          {topics.map((t) => <button key={t} className={`pill ${topic === t ? "on" : ""}`} onClick={() => setTopic(t)}>{t}</button>)}
        </div>
      </div>
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {items && items.length > 0 && <div className="grid">{items.map((c) => <ChallengeCard key={`${c.org.slug}/${c.slug}`} c={c} />)}</div>}
      {next && <div className="section" style={{ textAlign: "center" }}><button className="ghost" onClick={() => void more()} disabled={busy}>{busy ? "Loading…" : "Load more"}</button></div>}
      {items && items.length === 0 && (
        <div className="empty"><p className="hand">Nothing here yet</p><p className="muted">{filtered ? "No open challenges match. Try fewer filters." : "No open challenges right now. Check back soon."}</p></div>
      )}
    </>
  );
}

type Winner = ChallengeCardData & { results_published_at: number | null; winners: { placement: number; team: string }[] };

/** Completed challenges with published results, newest first. */
export function Winners() {
  const [items, setItems] = useState<Winner[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = (cursor?: string) => api<{ challenges: Winner[]; next: string | null }>(`/challenges/winners${cursor ? `?cursor=${cursor}` : ""}`)
    .then((r) => { setItems((old) => [...(cursor ? old ?? [] : []), ...r.challenges]); setNext(r.next); }).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  const ord = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  return (
    <>
      <div className="hero"><p className="hand">Hall of fame</p><h1>Past winners</h1><p>Winning teams from completed challenges. <Link to="/challenges">Back to open challenges</Link>.</p></div>
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {items && items.length > 0 && (
        <div className="grid">{items.map((c) => (
          <Link key={`${c.org.slug}/${c.slug}`} to={`/o/${c.org.slug}/c/${c.slug}#results`} className="cell card-link">
            <div className="ban"><Banner url={c.cover_url} seed={c.slug} lazy /></div>
            <div className="cell-body">
              <div className="org-line"><Logo url={c.org.logo_url} name={c.org.name} size={22} /><span>{c.org.name}</span></div>
              <h3>{c.title}</h3>
              <ol className="results" style={{ marginTop: 8 }}>{c.winners.map((w) => <li key={w.placement}><b className="place">{ord(w.placement)}</b><span>{w.team}</span></li>)}</ol>
            </div>
          </Link>
        ))}</div>
      )}
      {next && <div className="section" style={{ textAlign: "center" }}><button className="ghost" onClick={() => void load(next)}>Load more</button></div>}
      {items && items.length === 0 && <div className="empty"><p className="hand">No results yet</p><p className="muted">Winners show here once organisers publish results.</p></div>}
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
      <Gallery path={`/orgs/${org.slug}/gallery`} heading="Projects from past challenges" showChallenge />
    </>
  );
}

interface ChallengeFull extends ChallengeCardData {
  cover_credit?: { author: string; license: string; source: string; license_url?: string } | null; description: string; prizes: string; status: string; results_published?: number; applications_open_at: number | null; pitch_due_at: number | null; questions: Question[];
  criteria?: { name: string; description: string; weight: number; max_score: number }[];
  rules?: string; faq?: { q: string; a: string }[]; timeline?: { label: string; at: number }[];
  sponsors?: { name: string; url: string | null; logo_url: string | null }[]; judges?: { name: string; title: string }[];
  agenda?: Block[]; checkin_enabled?: boolean;
}

/** Application and pitch dates plus the organiser's own, in order. */
function timelineOf(c: ChallengeFull) {
  const rows: { label: string; at: number; end?: number }[] = [...(c.timeline ?? []), ...(c.agenda ?? []).map((b) => ({ label: b.label, at: b.starts_at, end: b.ends_at }))];
  if (c.applications_open_at) rows.push({ label: "Applications open", at: c.applications_open_at });
  if (c.applications_close_at) rows.push({ label: "Applications close", at: c.applications_close_at });
  if (c.pitch_due_at) rows.push({ label: "Pitches due", at: c.pitch_due_at });
  return rows.sort((a, b) => a.at - b.at);
}
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The judging rubric, so people know how they will be scored before they apply. */
function Rubric({ criteria }: { criteria: NonNullable<ChallengeFull["criteria"]> }) {
  return (
    <div className="section" id="scoring">
      <p className="label" style={{ marginTop: 0 }}>How you will be scored</p>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>Judges score each pitch on these criteria. The weights show how much each one counts towards the final score.</p>
      <ul className="todo" style={{ maxWidth: 720 }}>
        {criteria.map((r) => (
          <li key={r.name}>
            <span><b>{r.name}</b>{r.description && <span className="muted"> · {r.description}</span>}</span>
            <span className="pill" aria-label={`${r.weight} percent of the score`}>{r.weight}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChallengePublic() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<{ challenge: ChallengeFull; role: string | null } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const { team, reload } = useMyTeam(slug ?? "", cslug ?? "");
  useEffect(() => { api<{ challenge: ChallengeFull; role: string | null }>(`/orgs/${slug}/challenges/${cslug}`).then(setData).catch((e: Error) => setErr(e.message)); }, [slug, cslug]);
  useEffect(() => { if (data) document.title = `${data.challenge.title} · Kakushin`; }, [data]);
  if (err) return <div className="section"><Notice kind="err">{err === "Not found" ? "We could not find that challenge." : err}</Notice></div>;
  if (!data) return null;
  const { challenge: c, role } = data;
  const tl = timelineOf(c);
  const now = Date.now();
  const isOpen = c.status === "open" && (!c.applications_open_at || now >= c.applications_open_at) && (!c.applications_close_at || now < c.applications_close_at);
  const sections = ([
    ["overview", "Overview", !!c.description], ["rules", "Rules", !!c.rules], ["timeline", "Timeline", tl.length > 0], ["prizes", "Prizes", !!c.prizes],
    ["judges", "Judges", (c.judges?.length ?? 0) > 0], ["sponsors", "Sponsors", (c.sponsors?.length ?? 0) > 0], ["faq", "FAQ", (c.faq?.length ?? 0) > 0],
    ["scoring", "Scoring", (c.criteria?.length ?? 0) > 0], ["people", "Who's coming", c.status !== "draft"],
  ] as [string, string, boolean][]).filter(([, , on]) => on);
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }
  return (
    <>
      <div className="hero-ban"><Banner url={c.cover_url} seed={c.slug} /></div>
      {c.cover_credit && (
        <p className="muted" style={{ fontSize: 12, margin: "6px 24px 0", textAlign: "right" }}>
          Photo: <a href={c.cover_credit.source} target="_blank" rel="noreferrer">{c.cover_credit.author}</a>, {c.cover_credit.license_url ? <a href={c.cover_credit.license_url} target="_blank" rel="noreferrer">{c.cover_credit.license}</a> : c.cover_credit.license}
        </p>
      )}
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
        {c.applications_open_at ? <div><p className="label">Applications open</p><b>{fmtDate(c.applications_open_at)}</b></div> : null}
        {c.applications_close_at ? <div><p className="label">Applications close</p><b>{fmtDate(c.applications_close_at)}</b></div> : null}
        <div><p className="label">Team size</p><b>{c.team_min === c.team_max ? c.team_min : `${c.team_min} to ${c.team_max}`}</b></div>
        {c.pitch_due_at ? <div><p className="label">Pitch due</p><b>{fmtDate(c.pitch_due_at)}</b></div> : null}
      </div>
      <nav className="secnav" aria-label="On this page">
        {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      {c.results_published ? <><PublicResults orgSlug={c.org.slug} cslug={c.slug} /><Gallery path={`/orgs/${c.org.slug}/challenges/${c.slug}/gallery`} /></> : null}
      {(c.status === "judging" || c.status === "completed") && <Recap orgSlug={c.org.slug} cslug={c.slug} />}
      {c.description && <div className="section" id="overview"><p className="label" style={{ marginTop: 0 }}>Overview</p><Markdown text={c.description} /></div>}
      {c.rules && <div className="section" id="rules"><p className="label" style={{ marginTop: 0 }}>Rules</p><Markdown text={c.rules} /></div>}
      {tl.length > 0 && (
        <div className="section" id="timeline">
          <p className="label" style={{ marginTop: 0 }}>Timeline</p>
          <ol className="timeline">{tl.map((r, i) => <li key={i} className={r.at < Date.now() ? "past" : ""}><time dateTime={new Date(r.at).toISOString()}>{when(r.at)}{r.end ? ` to ${new Date(r.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}</time><b>{r.label}</b></li>)}</ol>
          {(c.agenda?.length ?? 0) > 0 && <div className="actions"><Link className="btn ghost" to={`/o/${c.org.slug}/c/${c.slug}/live`}>Open the live page</Link></div>}
        </div>
      )}
      {c.prizes && <div className="section" id="prizes"><p className="label" style={{ marginTop: 0 }}>Prizes</p><Markdown text={c.prizes} /></div>}
      {(c.judges?.length ?? 0) > 0 && (
        <div className="section" id="judges">
          <p className="label" style={{ marginTop: 0 }}>Judges</p>
          <ul className="judges">{c.judges!.map((j, i) => <li key={i}><span className="logo ph" aria-hidden style={{ width: 44, height: 44, fontSize: 20 }}>{j.name.slice(0, 1).toUpperCase()}</span><span><b>{j.name}</b>{j.title && <><br /><span className="muted">{j.title}</span></>}</span></li>)}</ul>
        </div>
      )}
      {(c.sponsors?.length ?? 0) > 0 && (
        <div className="section" id="sponsors">
          <p className="label" style={{ marginTop: 0 }}>Sponsors</p>
          <ul className="sponsors">{c.sponsors!.map((x, i) => {
            const inner = x.logo_url ? <img src={x.logo_url} alt={x.name} loading="lazy" /> : <b>{x.name}</b>;
            return <li key={i}>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" title={x.name}>{inner}</a> : inner}</li>;
          })}</ul>
        </div>
      )}
      {(c.faq?.length ?? 0) > 0 && (
        <div className="section" id="faq">
          <p className="label" style={{ marginTop: 0 }}>FAQ</p>
          <div className="faq">{c.faq!.map((x, i) => <details key={i}><summary>{x.q}</summary><Markdown text={x.a} /></details>)}</div>
        </div>
      )}
      {c.criteria && c.criteria.length > 0 && <Rubric criteria={c.criteria} />}
      {c.status !== "draft" && <WhosComing orgSlug={c.org.slug} cslug={c.slug} open={isOpen} teamMax={c.team_max} team={team} />}
      {team && c.checkin_enabled && team.status !== "rejected" && <CheckinPass orgSlug={c.org.slug} cslug={c.slug} />}
      {c.status !== "draft" && <div id="apply"><TeamPanel orgSlug={c.org.slug} cslug={c.slug} challenge={c} team={team} reload={reload} /></div>}
      {team && ["finalist", "winner"].includes(team.status) && <ShowProject team={team} onChange={reload} />}
    </>
  );
}
