import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api, dayMonth } from "./api";
import { useAuth } from "./auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, reload } = useAuth();
  const nav = useNavigate();
  async function logout() { await api("/auth/logout", { method: "POST" }); await reload(); nav("/"); }
  return (
    <>
      <header className="topbar">
        <div className="bar">
          <Link to="/" className="brand"><span className="sun" aria-hidden />Kakushin</Link>
          <nav aria-label="Main">
            <NavLink to="/" end>Explore</NavLink>
            {me && <NavLink to="/admin">Organise</NavLink>}
            {me && <NavLink to="/profile">Profile</NavLink>}
            {me ? <button className="link" onClick={logout}>Sign out</button> : <NavLink to="/login" className="signin">Sign in</NavLink>}
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="foot"><span>Kakushin</span><span className="muted">Run innovation challenges end to end</span></footer>
    </>
  );
}

/** Postage-stamp badge: perforated edge, one big number, a short label. */
export function Stamp({ big, small, tone = "red", size = "md" }: { big: string; small?: string; tone?: "red" | "indigo" | "gold" | "moss"; size?: "sm" | "md" | "lg" }) {
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
  team_min: number; team_max: number; applications_close_at: number | null; status?: string;
  org: { slug: string; name: string; logo_url: string | null };
}

export function ChallengeCard({ c }: { c: ChallengeCardData }) {
  return (
    <Link to={`/o/${c.org.slug}/c/${c.slug}`} className="cell card-link">
      {c.cover_url ? <img className="cover" src={c.cover_url} alt="" loading="lazy" /> : <div className="cover ph" aria-hidden />}
      <div className="cell-body">
        <div className="org-line"><Logo url={c.org.logo_url} name={c.org.name} size={22} /><span>{c.org.name}</span>{c.status && c.status !== "open" && <StatusPill status={c.status} />}</div>
        <h3>{c.title}</h3>
        {c.summary && <p className="muted">{c.summary}</p>}
        <TopicPills topics={c.topics} />
        <div className="meta">Teams of {c.team_min === c.team_max ? c.team_min : `${c.team_min} to ${c.team_max}`}</div>
      </div>
      <div className="corner"><DeadlineStamp closeAt={c.applications_close_at} size="sm" /></div>
    </Link>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  return <p className={kind === "ok" ? "ok" : "err"} role={kind === "err" ? "alert" : "status"}>{children}</p>;
}
