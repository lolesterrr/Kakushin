import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, dayMonth } from "./api";
import { useAuth } from "./auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, reload } = useAuth();
  const nav = useNavigate();
  const admin = useLocation().pathname.startsWith("/admin");
  async function logout() { await api("/auth/logout", { method: "POST" }); await reload(); nav("/"); }
  return (
    <>
      <header className="topbar">
        <div className="bar">
          <Link to="/" className="brand"><span className="sun" aria-hidden />Kakushin</Link>
          <nav aria-label="Main">
            <NavLink to="/challenges">Challenges</NavLink>
            {!me && <Link to="/#how" className="hide-sm">How it works</Link>}
            <NavLink to="/admin" className={me ? undefined : "hide-sm"}>{me ? "Organise" : "For organisers"}</NavLink>
            {me && <NavLink to="/profile">Profile</NavLink>}
            {me ? <button className="link" onClick={logout}>Sign out</button> : <NavLink to="/login" className="signin">Sign in</NavLink>}
          </nav>
        </div>
      </header>
      <main className={admin ? "page admin" : "page"}>{children}</main>
      <footer className="foot"><span><b>Kakushin</b> <span className="muted">Innovation challenges, end to end</span></span><span className="muted"><Link to="/challenges">Challenges</Link> · <Link to="/admin">For organisers</Link></span></footer>
    </>
  );
}

/** Postage-stamp badge: perforated edge, one big number, a short label. */
export function Stamp({ big, small, tone = "red", size = "md" }: { big: string; small?: string; tone?: "red" | "indigo" | "gold" | "moss" | "ink"; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`stamp ${tone} ${size}`} role="img" aria-label={`${big} ${small ?? ""}`.trim()}>
      <b>{big}</b>{small && <span>{small}</span>}
    </div>
  );
}

export function DeadlineStamp({ closeAt, size = "md" }: { closeAt: number | null; size?: "sm" | "md" | "lg" }) {
  const d = dayMonth(closeAt);
  return d ? <Stamp big={d.day} small={`closes ${d.month}`} size={size} /> : <Stamp big="Open" small="no deadline" tone="indigo" size={size} />;
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", open: "Open", reviewing: "Reviewing", judging: "Judging", completed: "Completed" };
const STATUS_TONE: Record<string, string> = { draft: "sand", open: "moss", reviewing: "gold", judging: "indigo", completed: "ink" };
export const StatusPill = ({ status }: { status: string }) => <span className={`pill ${STATUS_TONE[status] ?? "sand"}`}>{STATUS_LABEL[status] ?? status}</span>;

export const TopicPills = ({ topics }: { topics: string[] }) => (
  <div className="pills">{topics.map((t) => <span key={t} className="pill topic">{t}</span>)}</div>
);

export function Logo({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  return url
    ? <img className="logo" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="logo ph" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>{name.slice(0, 1).toUpperCase()}</span>;
}

export interface ChallengeCardData {
  slug: string; title: string; summary: string; cover_url: string | null; topics: string[];
  team_min: number; team_max: number; applications_close_at: number | null; status?: string; prize?: string;
  org: { slug: string; name: string; logo_url: string | null };
}

export function ChallengeCard({ c }: { c: ChallengeCardData }) {
  return (
    <Link to={`/o/${c.org.slug}/c/${c.slug}`} className="cell card-link">
      {c.cover_url ? <img className="cover" src={c.cover_url} alt="" loading="lazy" /> : <div className="cover ph" aria-hidden />}
      <div className="cell-body">
        <div className="org-line"><Logo url={c.org.logo_url} name={c.org.name} size={22} /><span>{c.org.name}</span>{c.status && <StatusPill status={c.status} />}</div>
        <h3>{c.title}</h3>
        {c.summary && <p className="muted">{c.summary}</p>}
        <TopicPills topics={c.topics} />
        {c.prize && <div className="prize">Prize: {c.prize}</div>}
        <div className="meta">Teams of {c.team_min === c.team_max ? c.team_min : `${c.team_min} to ${c.team_max}`}</div>
      </div>
      <div className="corner"><DeadlineStamp closeAt={c.applications_close_at} size="sm" /></div>
    </Link>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  return <p className={kind === "ok" ? "ok" : "err"} role={kind === "err" ? "alert" : "status"}>{children}</p>;
}

export const Tag = ({ status }: { status: string }) => {
  const label: Record<string, string> = { draft: "Draft", open: "Open", reviewing: "Reviewing", judging: "Judging", completed: "Completed", applied: "New", shortlisted: "Shortlisted", rejected: "Rejected", finalist: "Finalist", winner: "Winner", forming: "Forming" };
  const tone: Record<string, string> = { draft: "sand", open: "moss", reviewing: "gold", judging: "indigo", completed: "ink", applied: "gold", shortlisted: "moss", rejected: "ink", finalist: "gold", winner: "indigo", forming: "sand" };
  return <span className={`tag ${tone[status] ?? "sand"}`}>{label[status] ?? status}</span>;
};

/** Ink band across the top of organiser pages, with the section tabs underlined in red. */
export function Band({ crumb, to, title, tags, tabs }: { crumb?: string; to?: string; title: string; tags?: React.ReactNode; tabs?: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="band">
      {crumb && to && <Link className="crumb" to={to}>← {crumb}</Link>}
      <h1>{title}</h1>
      {tags && <div className="sub">{tags}</div>}
      {tabs && <nav className="tabs" aria-label="Sections">{tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>)}</nav>}
    </div>
  );
}

export const NumSection = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="numsec"><div className="nh"><b>{n}</b><h2>{title}</h2></div>{children}</section>
);
