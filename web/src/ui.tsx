import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, dayMonth } from "./api";
import { useAuth } from "./auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, ready, reload } = useAuth();
  const nav = useNavigate();
  const [judging, setJudging] = React.useState(false);
  React.useEffect(() => { if (me) api<{ challenges: unknown[] }>("/judge/challenges").then((r) => setJudging(r.challenges.length > 0)).catch(() => {}); else setJudging(false); }, [me?.id]);
  const [unread, setUnread] = React.useState(0);
  const loadUnread = React.useCallback(() => { if (me) api<{ unread: number }>("/inbox").then((r) => setUnread(r.unread)).catch(() => {}); else setUnread(0); }, [me?.id]);
  React.useEffect(() => { loadUnread(); window.addEventListener("kk-inbox", loadUnread); return () => window.removeEventListener("kk-inbox", loadUnread); }, [loadUnread]);
  const { pathname } = useLocation();
  const admin = pathname.startsWith("/admin");
  // The Worker puts a page's own title in the HTML for link previews; reset it as people move around the app.
  React.useEffect(() => { document.title = "Kakushin"; }, [pathname]);
  async function logout() { await api("/auth/logout", { method: "POST" }); await reload(); nav("/"); }
  return (
    <>
      <header className="topbar">
        <div className="bar">
          <Link to="/" className="brand"><span className="sun" aria-hidden />Kakushin</Link>
          <nav aria-label="Main">
            <NavLink to="/challenges" className={judging ? "hide-sm" : undefined}>Challenges</NavLink>
            {!me && <Link to="/#how" className="hide-sm">How it works</Link>}
            <NavLink to="/admin" className="hide-sm">{me ? "Organise" : "For organisers"}</NavLink>
            {judging && <NavLink to="/judge">Judge</NavLink>}
            {me?.is_platform_admin ? <NavLink to="/platform" className="hide-sm">Platform</NavLink> : null}
            {me && <NavLink to="/inbox">Inbox{unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread}</span>}</NavLink>}
            {me && <NavLink to="/profile">Profile</NavLink>}
            {!ready ? null : me ? <button className="link" onClick={logout}>Sign out</button> : <><NavLink to="/login">Sign in</NavLink><NavLink to="/login?mode=signup" className="signin">Sign up</NavLink></>}
          </nav>
        </div>
      </header>
      <main className={admin ? "page admin" : "page"}>{children}</main>
      <footer className="foot"><span><b>Kakushin</b> <span className="muted">Innovation challenges, end to end</span></span><span className="muted"><Link to="/challenges">Challenges</Link> · <Link to="/admin">For organisers</Link> · <Link to="/credits">Photo credits</Link></span></footer>
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

const SCENES = [
  { sky: ["#F4E4D2", "#E6E1D7"], sun: "#C8321F", sx: 470, hills: ["#CFC8BA", "#4A6AAE", "#2F4F8F", "#111111"] },
  { sky: ["#F3E6BF", "#EBD9A8"], sun: "#F6F4EE", sx: 150, hills: ["#B9CFA0", "#6E9A55", "#4E7A3A", "#26421D"] },
  { sky: ["#DCE6F6", "#C9D6EE"], sun: "#C9A15A", sx: 520, hills: ["#9DB4E2", "#5A7DC4", "#2F4F8F", "#111111"] },
];
const hashOf = (seed: string) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Paper-cut scene shown when a challenge has no banner yet. The colours come from the slug so each challenge keeps its own. */
export function PaperScene({ seed }: { seed: string }) {
  const s = SCENES[hashOf(seed) % SCENES.length]!;
  const id = "sky" + React.useId().replace(/:/g, "");
  const shade = (a: number) => ({ filter: `drop-shadow(0 -4px 7px rgba(17,17,17,${a}))` });
  return (
    <svg viewBox="0 0 640 280" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrated banner" style={{ display: "block", width: "100%", height: "100%" }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.sky[0]} /><stop offset="1" stopColor={s.sky[1]} /></linearGradient></defs>
      <rect width="640" height="280" fill={`url(#${id})`} />
      <circle cx={s.sx} cy="108" r="74" fill={s.sun} opacity={0.16} /><circle cx={s.sx} cy="108" r="52" fill={s.sun} />
      <ellipse cx="130" cy="70" rx="46" ry="12" fill="#F6F4EE" opacity={0.9} /><ellipse cx="190" cy="86" rx="34" ry="9" fill="#F6F4EE" opacity={0.9} />
      <path d="M0 178Q110 112 230 166T470 150T640 140V280H0Z" fill={s.hills[0]} style={shade(0.18)} />
      <path d="M0 214Q150 150 310 206T640 178V280H0Z" fill={s.hills[1]} style={shade(0.28)} />
      <path d="M0 244Q190 200 380 238T640 222V280H0Z" fill={s.hills[2]} style={shade(0.3)} />
      <path d="M0 266Q220 238 420 262T640 252V280H0Z" fill={s.hills[3]} style={shade(0.35)} />
    </svg>
  );
}

/** The challenge banner: the organiser's image, or the paper-cut scene when there is none. */
export function Banner({ url, seed, alt = "", lazy = false }: { url: string | null; seed: string; alt?: string; lazy?: boolean }) {
  return url ? <img src={url} alt={alt} loading={lazy ? "lazy" : undefined} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} /> : <PaperScene seed={seed} />;
}

export interface ChallengeCardData {
  slug: string; title: string; summary: string; cover_url: string | null; topics: string[];
  team_min: number; team_max: number; applications_close_at: number | null; status?: string; prize?: string;
  org: { slug: string; name: string; logo_url: string | null };
}

export function ChallengeCard({ c }: { c: ChallengeCardData }) {
  return (
    <Link to={`/o/${c.org.slug}/c/${c.slug}`} className="cell card-link">
      <div className="ban"><Banner url={c.cover_url} seed={c.slug} lazy /></div>
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
  const label: Record<string, string> = { draft: "Draft", pending: "In review", rejected_review: "Changes needed", open: "Open", reviewing: "Reviewing", judging: "Judging", completed: "Completed", applied: "New", shortlisted: "Shortlisted", rejected: "Rejected", finalist: "Finalist", winner: "Winner", forming: "Forming" };
  const tone: Record<string, string> = { draft: "sand", pending: "gold", rejected_review: "ink", open: "moss", reviewing: "gold", judging: "indigo", completed: "ink", applied: "gold", shortlisted: "moss", rejected: "ink", finalist: "gold", winner: "indigo", forming: "sand" };
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
