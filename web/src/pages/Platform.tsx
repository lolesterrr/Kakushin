import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, fmtDate, fromLocalInput, toLocalInput } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection, topicLabel } from "../ui";
import { AnnounceBox } from "./OrgTeam";

const tabs = [
  { to: "/platform", label: "Overview", end: true },
  { to: "/platform/review", label: "Review" },
  { to: "/platform/events", label: "Global events" },
  { to: "/platform/reports", label: "Reports" },
  { to: "/platform/orgs", label: "Organisations" },
  { to: "/platform/users", label: "Users" },
  { to: "/platform/news", label: "News" },
  { to: "/platform/audit", label: "Activity" },
];
type Msg = { kind: "ok" | "err"; text: string } | null;

/** Wraps every platform page: sign-in and platform-admin checks, header and tabs. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Navigate to="/login?next=/platform" replace />;
  if (!me.is_platform_admin) return <div className="empty"><p className="hand">Page not found</p></div>;
  return (
    <>
      <Band title={title} tags={<span className="tag ink">Platform admin</span>} tabs={tabs} />
      {children}
    </>
  );
}

export function PlatformOverview() {
  const [s, setS] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Record<string, number>>("/platform/stats").then(setS).catch((e: Error) => setErr(e.message)); }, []);
  const cell = (label: string, key: string, note?: string) => (
    <div><p className="label">{label}</p><b>{s?.[key] ?? "-"}</b>{note && <span className="muted" style={{ display: "block", fontSize: 13 }}>{note}</span>}</div>
  );
  return (
    <Shell title="Platform">
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {s && (s.awaiting_review ?? 0) > 0 && (
        <div className="section"><Link className="btn" to="/platform/review">{s.awaiting_review} {s.awaiting_review === 1 ? "event is" : "events are"} waiting for review</Link></div>
      )}
      {s && ((s.pending_events ?? 0) > 0 || (s.open_reports ?? 0) > 0) && (
        <div className="section"><div className="actions" style={{ marginTop: 0 }}>
          {(s.pending_events ?? 0) > 0 && <Link className="btn ghost" to="/platform/events">{s.pending_events} global {s.pending_events === 1 ? "event" : "events"} to check</Link>}
          {(s.open_reports ?? 0) > 0 && <Link className="btn ghost" to="/platform/reports">{s.open_reports} {s.open_reports === 1 ? "report" : "reports"} to settle</Link>}
        </div></div>
      )}
      <div className="spec">
        {cell("Users", "users", `${s?.new_users_7d ?? 0} new this week`)}
        {cell("Organisations", "orgs", `${s?.verified_orgs ?? 0} verified, ${s?.suspended_orgs ?? 0} suspended`)}
        {cell("Live challenges", "challenges_live")}
        {cell("Awaiting review", "awaiting_review")}
      </div>
      <div className="spec">
        {cell("Teams", "teams")}
        {cell("Applications", "applications")}
        {cell("Certificates issued", "certificates")}
        {cell("Global events listed", "global_events", `${s?.pending_events ?? 0} waiting`)}
        {cell("Open reports", "open_reports")}
      </div>
    </Shell>
  );
}

interface ReviewItem {
  id: string; slug: string; title: string; summary: string; description: string; prizes: string; topics: string[]; team_min: number; team_max: number;
  submitted_at: number; org_slug: string; org_name: string; org_verified: number; org_type: string; org_website: string | null; org_approved_before: number;
}

export function PlatformReview() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const load = () => api<{ items: ReviewItem[] }>("/platform/review").then((r) => setItems(r.items)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(); }, []);
  async function approve(i: ReviewItem) {
    setMsg(null);
    try { await api(`/platform/challenges/${i.id}/approve`, { method: "POST" }); setMsg({ kind: "ok", text: `Approved "${i.title}". It is public now.` }); await load(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  async function reject(i: ReviewItem) {
    setMsg(null);
    try { await api(`/platform/challenges/${i.id}/reject`, { method: "POST", json: { note } }); setRejecting(null); setNote(""); setMsg({ kind: "ok", text: `Sent "${i.title}" back with your note.` }); await load(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <Shell title="Review events">
      {msg && <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {items && items.length === 0 && <div className="section"><p className="muted">Nothing is waiting. New challenges from organisations that are not verified show up here before they go public.</p></div>}
      {items?.map((i, n) => (
        <NumSection key={i.id} n={String(n + 1).padStart(2, "0")} title={i.title}>
          <p className="muted" style={{ marginTop: 0 }}>
            From <b>{i.org_name}</b> ({i.org_type}){i.org_website ? <> · <a href={i.org_website} target="_blank" rel="noopener noreferrer">{i.org_website.replace(/^https?:\/\//, "")}</a></> : null}
            {" · "}{i.org_approved_before > 0 ? `${i.org_approved_before} earlier challenge${i.org_approved_before === 1 ? "" : "s"} approved` : "first challenge from this organisation"} · sent {fmtDate(i.submitted_at)}
          </p>
          {i.summary && <p><b>{i.summary}</b></p>}
          <div className="prose">{i.description}</div>
          {i.prizes && <p><span className="label">Prizes</span><br />{i.prizes}</p>}
          <p className="muted">Teams of {i.team_min === i.team_max ? i.team_min : `${i.team_min} to ${i.team_max}`}{i.topics.length ? ` · ${i.topics.join(", ")}` : ""}</p>
          {rejecting === i.id ? (
            <div className="form">
              <label htmlFor={`n${i.id}`}>What should the organiser fix?</label>
              <textarea id={`n${i.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions"><button onClick={() => void reject(i)}>Send back</button><button className="ghost" onClick={() => setRejecting(null)}>Cancel</button></div>
            </div>
          ) : (
            <div className="actions"><button onClick={() => void approve(i)}>Approve and publish</button><button className="ghost" onClick={() => { setRejecting(i.id); setNote(""); }}>Send back with a note</button></div>
          )}
        </NumSection>
      ))}
    </Shell>
  );
}

interface OrgRow { id: string; slug: string; name: string; type: string; verified: number; suspended: number; members: number; live_challenges: number; pending: number; owner_email: string | null; created_at: number }

export function PlatformOrgs() {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const load = (term = q) => api<{ orgs: OrgRow[] }>(`/platform/orgs?q=${encodeURIComponent(term)}`).then((r) => setRows(r.orgs)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(""); }, []);
  async function set(o: OrgRow, patch: { verified?: boolean; suspended?: boolean }) {
    if (patch.suspended && !confirm(`Suspend ${o.name}? Its page and challenges disappear from the public site.`)) return;
    setMsg(null);
    try { await api(`/platform/orgs/${o.id}`, { method: "PUT", json: patch }); await load(); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <Shell title="Organisations">
      <div className="section form">
        <form onSubmit={(e) => { e.preventDefault(); void load(); }} style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input aria-label="Search organisations" placeholder="Search by name or web address" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit">Search</button>
        </form>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {rows && rows.length === 0 && <p className="muted">No organisations found.</p>}
        {rows && rows.length > 0 && (
          <div className="table-wrap wide"><table className="admin-table">
            <thead><tr><th>Organisation</th><th>Owner</th><th className="num">Live</th><th className="num">In review</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td><a href={`/o/${o.slug}`}><b>{o.name}</b></a><br /><span className="muted">{o.type} · {o.members} {o.members === 1 ? "member" : "members"}</span></td>
                <td className="email">{o.owner_email ?? "-"}</td><td className="num">{o.live_challenges}</td><td className="num">{o.pending}</td>
                <td>{o.suspended ? <span className="tag ink">Suspended</span> : o.verified ? <span className="tag moss">Verified</span> : <span className="tag sand">Unverified</span>}</td>
                <td><div className="row-actions">
                  <button className="ghost small" onClick={() => void set(o, { verified: !o.verified })}>{o.verified ? "Unverify" : "Verify"}</button>
                  <button className="ghost small" onClick={() => void set(o, { suspended: !o.suspended })}>{o.suspended ? "Restore" : "Suspend"}</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Verified organisations publish challenges without waiting for review. Everyone else goes through the review queue.</p>
      </div>
    </Shell>
  );
}

interface UserRow { id: string; email: string; name: string | null; is_platform_admin: number; is_super_admin?: number; suspended: number; orgs: number; teams: number; created_at: number }

export function PlatformUsers() {
  const { me } = useAuth();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const load = (term = q) => api<{ users: UserRow[] }>(`/platform/users?q=${encodeURIComponent(term)}`).then((r) => setRows(r.users)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(""); }, []);
  async function set(u: UserRow, patch: { suspended?: boolean; is_platform_admin?: boolean }) {
    if (patch.suspended && !confirm(`Suspend ${u.email}? They are signed out everywhere and cannot sign in.`)) return;
    if (patch.is_platform_admin && !confirm(`Make ${u.email} a platform admin? They can approve events and suspend organisations and users.`)) return;
    setMsg(null);
    try { await api(`/platform/users/${u.id}`, { method: "PUT", json: patch }); await load(); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <Shell title="Users">
      <div className="section form">
        <form onSubmit={(e) => { e.preventDefault(); void load(); }} style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input aria-label="Search users" placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit">Search</button>
        </form>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {rows && rows.length === 0 && <p className="muted">No users found.</p>}
        {rows && rows.length > 0 && (
          <div className="table-wrap wide"><table className="admin-table">
            <thead><tr><th>User</th><th>Joined</th><th className="num">Orgs</th><th className="num">Teams</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name || u.email.split("@")[0]}</b><br /><span className="muted email">{u.email}</span></td>
                <td className="nowrap">{fmtDate(u.created_at)}</td><td className="num">{u.orgs}</td><td className="num">{u.teams}</td>
                <td>{u.is_super_admin ? <span className="tag red">Owner</span> : u.suspended ? <span className="tag ink">Suspended</span> : u.is_platform_admin ? <span className="tag indigo">Admin</span> : <span className="tag sand">Active</span>}</td>
                <td>{u.id !== me?.id && !u.is_super_admin && (<div className="row-actions">
                  <button className="ghost small" onClick={() => void set(u, { suspended: !u.suspended })}>{u.suspended ? "Restore" : "Suspend"}</button>
                  {!!me?.is_super_admin && <button className="ghost small" onClick={() => void set(u, { is_platform_admin: !u.is_platform_admin })}>{u.is_platform_admin ? "Remove admin" : "Make admin"}</button>}
                </div>)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </Shell>
  );
}

export function PlatformAudit() {
  const [items, setItems] = useState<{ id: string; actor_email: string; action: string; detail: string; created_at: number }[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ items: NonNullable<typeof items> }>("/platform/audit").then((r) => setItems(r.items)).catch((e: Error) => setErr(e.message)); }, []);
  return (
    <Shell title="Activity">
      <div className="section">
        {err && <Notice kind="err">{err}</Notice>}
        {items && items.length === 0 && <p className="muted">No admin actions yet.</p>}
        {items && items.length > 0 && (
          <div className="table-wrap wide"><table className="admin-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{new Date(a.created_at).toLocaleString()}</td><td className="email">{a.actor_email}</td><td><code>{a.action}</code></td><td>{a.detail}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </Shell>
  );
}

export function PlatformNews() {
  return (
    <Shell title="News">
      <AnnounceBox listPath="/platform/news" postPath="/platform/news" heading="Platform news" hint="A note for every active user, in their inbox and as a phone push. Use it sparingly."
        audience={() => "It goes to everyone who is not suspended."} />
    </Shell>
  );
}

// ---- global events ----
interface GEvent {
  id: string; slug: string; title: string; summary: string; description: string; url: string; host: string; source: string; organizer: string; location: string; is_online: boolean;
  starts_at: number | null; ends_at: number | null; deadline_at: number | null; topics: string[]; state: string; created_at: number; submitter: { email: string; name: string | null } | null;
}
interface Source { id: string; name: string; kind: string; url: string; topics: string[]; keywords: string; auto_publish: boolean; enabled: boolean; last_fetched_at: number | null; last_status: string; listed: number; waiting: number }
interface Preview { count: number; items: { title: string; url: string; summary: string; topics: string[]; deadline_at: number | null; starts_at: number | null; location: string }[] }
const TOPIC_LIST = ["fintech", "health", "agritech", "climate", "education", "ai", "energy", "transport", "social-impact"];
/** Sources worth trying. Nothing is read until an admin previews one and adds it. */
const SUGGESTED: { name: string; kind: string; url: string; keywords: string }[] = [
  { name: "Hack Club hackathons", kind: "hackclub", url: "https://hackathons.hackclub.com/api/events/upcoming", keywords: "" },
  { name: "Opportunities for Africans", kind: "rss", url: "https://www.opportunitiesforafricans.com/feed/", keywords: "hackathon, challenge, competition, innovation, accelerator, incubator, prize" },
  { name: "Opportunity Desk", kind: "rss", url: "https://opportunitydesk.org/feed/", keywords: "hackathon, challenge, competition, innovation, accelerator, incubator, prize" },
];

function TopicPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <div className="chips" role="group" aria-label="Topics">{TOPIC_LIST.map((t) => <button type="button" key={t} className="chip" aria-pressed={value.includes(t)} onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : value.length < 5 ? [...value, t] : value)}>{topicLabel(t)}</button>)}</div>;
}

/** One event in the queue or on the list, with an edit form for fixing what a feed got wrong. */
function EventRow({ e, n, onDone, say }: { e: GEvent; n: number; onDone: () => Promise<unknown>; say: (m: Msg) => void }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [f, setF] = useState({ title: e.title, url: e.url, summary: e.summary, description: e.description, organizer: e.organizer, location: e.location, is_online: e.is_online, deadline: toLocalInput(e.deadline_at), starts: toLocalInput(e.starts_at), ends: toLocalInput(e.ends_at), topics: e.topics });
  const run = async (fn: () => Promise<unknown>, ok: string) => { say(null); try { await fn(); say({ kind: "ok", text: ok }); await onDone(); } catch (err) { say({ kind: "err", text: (err as Error).message }); } };
  const save = () => run(async () => {
    await api(`/platform/events/${e.id}`, { method: "PUT", json: { title: f.title, url: f.url, summary: f.summary, description: f.description, organizer: f.organizer, location: f.location, is_online: f.is_online, deadline_at: fromLocalInput(f.deadline), starts_at: fromLocalInput(f.starts), ends_at: fromLocalInput(f.ends), topics: f.topics } });
    setEdit(false);
  }, `Saved "${f.title}".`);
  const dates = [e.deadline_at ? `apply by ${fmtDate(e.deadline_at)}` : "", e.starts_at ? `starts ${fmtDate(e.starts_at)}` : "", e.is_online ? "online" : e.location].filter(Boolean).join(" · ");
  return (
    <NumSection n={String(n).padStart(2, "0")} title={e.title}>
      <p className="muted" style={{ marginTop: 0 }}>
        {e.submitter ? <>Suggested by <b>{e.submitter.name || e.submitter.email}</b> <span className="email">({e.submitter.email})</span></> : e.source && e.source !== "Suggested by the community" ? <>From <b>{e.source}</b></> : <>Suggested by an account that has since been deleted</>}
        {" · "}<a href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.host}</a> · added {fmtDate(e.created_at)}
      </p>
      {!edit && <>
        {e.summary && <p><b>{e.summary}</b></p>}
        {e.description && <div className="prose" style={{ whiteSpace: "pre-line", maxHeight: 180, overflow: "auto" }}>{e.description}</div>}
        <p className="muted">{dates || "No dates found"}{e.topics.length ? ` · ${e.topics.map(topicLabel).join(", ")}` : " · no topics, so nobody is notified"}</p>
      </>}
      {edit && (
        <div className="form">
          <label htmlFor={`t${e.id}`}>Name</label><input id={`t${e.id}`} value={f.title} maxLength={160} onChange={(x) => setF({ ...f, title: x.target.value })} />
          <label htmlFor={`u${e.id}`}>Official page</label><input id={`u${e.id}`} value={f.url} maxLength={500} onChange={(x) => setF({ ...f, url: x.target.value })} />
          <label htmlFor={`s${e.id}`}>One line</label><input id={`s${e.id}`} value={f.summary} maxLength={200} onChange={(x) => setF({ ...f, summary: x.target.value })} />
          <label htmlFor={`o${e.id}`}>Who runs it</label><input id={`o${e.id}`} value={f.organizer} maxLength={80} onChange={(x) => setF({ ...f, organizer: x.target.value })} />
          <label htmlFor={`l${e.id}`}>Where</label><input id={`l${e.id}`} value={f.location} maxLength={120} onChange={(x) => setF({ ...f, location: x.target.value })} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.is_online} onChange={(x) => setF({ ...f, is_online: x.target.checked })} style={{ width: "auto" }} /> Online</label>
          <label htmlFor={`d${e.id}`}>Apply by</label><input id={`d${e.id}`} type="datetime-local" value={f.deadline} onChange={(x) => setF({ ...f, deadline: x.target.value })} />
          <label htmlFor={`a${e.id}`}>Starts</label><input id={`a${e.id}`} type="datetime-local" value={f.starts} onChange={(x) => setF({ ...f, starts: x.target.value })} />
          <label htmlFor={`b${e.id}`}>Ends</label><input id={`b${e.id}`} type="datetime-local" value={f.ends} onChange={(x) => setF({ ...f, ends: x.target.value })} />
          <p className="label">Topics</p><TopicPicker value={f.topics} onChange={(topics) => setF({ ...f, topics })} />
          <label htmlFor={`x${e.id}`}>Details</label><textarea id={`x${e.id}`} rows={5} maxLength={4000} value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} />
          <div className="actions"><button onClick={() => void save()}>Save changes</button><button className="ghost" onClick={() => setEdit(false)}>Cancel</button></div>
        </div>
      )}
      {note !== null && (
        <div className="form">
          <label htmlFor={`n${e.id}`}>{e.submitter ? "Why not? This goes to the person who suggested it (optional)" : "Note for the record (optional)"}</label>
          <textarea id={`n${e.id}`} rows={2} maxLength={500} value={note} onChange={(x) => setNote(x.target.value)} />
          <div className="actions"><button onClick={() => void run(async () => { await api(`/platform/events/${e.id}/reject`, { method: "POST", json: { note } }); setNote(null); }, e.state === "published" ? `Took "${e.title}" off the list.` : `Turned down "${e.title}".`)}>{e.state === "published" ? "Take it off the list" : "Turn it down"}</button><button className="ghost" onClick={() => setNote(null)}>Cancel</button></div>
        </div>
      )}
      {!edit && note === null && (
        <div className="actions">
          {e.state !== "published" && <button onClick={() => void run(() => api(`/platform/events/${e.id}/approve`, { method: "POST" }), `Listed "${e.title}".`)}>Approve and list</button>}
          <button className="ghost" onClick={() => setEdit(true)}>Edit</button>
          {(e.state === "pending" || e.state === "published") && <button className="ghost" onClick={() => setNote("")}>{e.state === "published" ? "Take off the list" : "Turn down"}</button>}
          {e.state === "published" && <a className="btn ghost" href={`/events/${e.slug}`}>View</a>}
        </div>
      )}
    </NumSection>
  );
}

export function PlatformEvents() {
  const [state, setState] = useState("pending");
  const [items, setItems] = useState<GEvent[] | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const blank = { name: "", kind: "rss", url: "", keywords: "", topics: [] as string[], auto_publish: false };
  const [f, setF] = useState(blank);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState("");
  const load = (st = state) => api<{ items: GEvent[] }>(`/platform/events?state=${st}`).then((r) => setItems(r.items)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  const loadSources = () => api<{ sources: Source[] }>("/platform/sources").then((r) => setSources(r.sources)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { setItems(null); void load(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadSources(); }, []);
  const both = async () => { await Promise.all([load(), loadSources()]); };
  const act = async (key: string, fn: () => Promise<unknown>, ok?: (r: unknown) => string) => {
    setMsg(null); setBusy(key);
    try { const r = await fn(); if (ok) setMsg({ kind: "ok", text: ok(r) }); await both(); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy("");
  };
  async function tryIt() {
    setMsg(null); setPreview(null); setBusy("preview");
    try { setPreview(await api<Preview>("/platform/sources/preview", { method: "POST", json: { kind: f.kind, url: f.url, keywords: f.keywords, topics: f.topics } })); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy("");
  }
  const flip = (s: Source, patch: Partial<Source>) => act(s.id, () => api(`/platform/sources/${s.id}`, { method: "PUT", json: { name: s.name, kind: s.kind, url: s.url, topics: s.topics, keywords: s.keywords, auto_publish: s.auto_publish, enabled: s.enabled, ...patch } }));
  return (
    <Shell title="Global events">
      {msg && <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="section">
        <div className="chips" role="group" aria-label="Show">
          {[["pending", "Waiting"], ["published", "Listed"], ["rejected", "Turned down"], ["removed", "Taken off"]].map(([v, label]) => <button type="button" key={v} className="chip" aria-pressed={state === v} onClick={() => setState(v!)}>{label}</button>)}
        </div>
        {state === "pending" && items && items.length > 1 && <div className="actions"><button className="ghost" disabled={busy === "all"} onClick={() => { if (confirm(`List all ${items.length} waiting events?`)) void act("all", () => api<{ approved: number }>("/platform/events/approve", { method: "POST", json: { ids: items.map((i) => i.id) } }), (r) => `Listed ${(r as { approved: number }).approved} events.`); }}>Approve all {items.length}</button></div>}
        {items && items.length === 0 && <p className="muted">{state === "pending" ? "Nothing is waiting. Events from sources that are not trusted, and events people suggest, show up here before they are listed." : "Nothing here."}</p>}
      </div>
      {items?.map((e, n) => <EventRow key={e.id} e={e} n={n + 1} onDone={both} say={setMsg} />)}

      <div className="section form">
        <h2>Sources</h2>
        <p className="muted">Kakushin reads each source about every six hours. A trusted source lists its events straight away; the others send theirs to the queue above. Only feeds and lists that sites publish for readers are supported.</p>
        {sources && sources.length === 0 && <p className="muted">No sources yet. Add one below.</p>}
        {sources && sources.length > 0 && (
          <div className="table-wrap wide"><table className="admin-table">
            <thead><tr><th>Source</th><th>Last read</th><th className="num">Listed</th><th className="num">Waiting</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{sources.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b><br /><span className="muted" style={{ wordBreak: "break-all" }}>{s.url}</span>{s.keywords && <><br /><span className="muted">Only items mentioning: {s.keywords}</span></>}</td>
                <td>{s.last_fetched_at ? <>{new Date(s.last_fetched_at).toLocaleString()}<br /><span className="muted">{s.last_status}</span></> : <span className="muted">Not yet</span>}</td>
                <td className="num">{s.listed}</td><td className="num">{s.waiting}</td>
                <td>{!s.enabled ? <span className="tag ink">Paused</span> : s.auto_publish ? <span className="tag moss">Trusted</span> : <span className="tag gold">Reviewed</span>}</td>
                <td><div className="row-actions">
                  <button className="ghost small" disabled={busy === s.id} onClick={() => void act(s.id, () => api<{ status: string }>(`/platform/sources/${s.id}/fetch`, { method: "POST" }), (r) => `${s.name}: ${(r as { status: string }).status}`)}>Read now</button>
                  <button className="ghost small" onClick={() => { if (s.auto_publish || confirm(`Trust ${s.name}? Its events will be listed without review.`)) void flip(s, { auto_publish: !s.auto_publish }); }}>{s.auto_publish ? "Review first" : "Trust"}</button>
                  <button className="ghost small" onClick={() => void flip(s, { enabled: !s.enabled })}>{s.enabled ? "Pause" : "Resume"}</button>
                  <button className="ghost small" onClick={() => { if (confirm(`Remove ${s.name}? The events it already brought stay.`)) void act(s.id, () => api(`/platform/sources/${s.id}`, { method: "DELETE" })); }}>Remove</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <h2 style={{ marginTop: 28 }}>Add a source</h2>
        <p className="muted">Start from one of these, or paste the address of any RSS or Atom feed: {SUGGESTED.map((x, i) => <React.Fragment key={x.url}>{i > 0 && ", "}<button type="button" className="link" onClick={() => { setF({ ...blank, ...x }); setPreview(null); }}>{x.name}</button></React.Fragment>)}.</p>
        <label htmlFor="src-name">Name people will see</label>
        <input id="src-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label htmlFor="src-kind">Kind</label>
        <select id="src-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="rss">RSS or Atom feed</option><option value="hackclub">Hack Club hackathons list</option></select>
        <label htmlFor="src-url">Address</label>
        <input id="src-url" type="url" placeholder="https://" maxLength={500} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        <label htmlFor="src-kw">Only take items that mention one of these words (comma-separated, empty takes everything)</label>
        <input id="src-kw" maxLength={300} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
        <p className="label">Topics to give every item (others are guessed from the text)</p>
        <TopicPicker value={f.topics} onChange={(topics) => setF({ ...f, topics })} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.auto_publish} onChange={(e) => setF({ ...f, auto_publish: e.target.checked })} style={{ width: "auto" }} /> Trust this source: list its events without review</label>
        <div className="actions">
          <button className="ghost" disabled={busy === "preview" || !f.url} onClick={() => void tryIt()}>{busy === "preview" ? "Reading…" : "Preview"}</button>
          <button disabled={!f.name || !f.url || busy === "add"} onClick={() => void act("add", async () => { await api("/platform/sources", { method: "POST", json: f }); setF(blank); setPreview(null); }, () => "Source added. Press Read now to bring its events in.")}>Add source</button>
        </div>
        {preview && (
          <div className="note-box" style={{ marginTop: 12 }}>
            <p style={{ marginTop: 0 }}><b>{preview.count === 0 ? "Nothing matched." : `${preview.count} ${preview.count === 1 ? "item" : "items"} would come in.`}</b>{preview.count > preview.items.length ? ` The first ${preview.items.length}:` : ""}</p>
            <ul className="todo">{preview.items.map((i) => <li key={i.url}><span><a href={i.url} target="_blank" rel="noopener noreferrer nofollow"><b>{i.title}</b></a>{i.summary && <span className="muted"> · {i.summary}</span>}</span><span className="muted" style={{ whiteSpace: "nowrap" }}>{i.deadline_at ? `by ${fmtDate(i.deadline_at)}` : i.starts_at ? fmtDate(i.starts_at) : ""}</span></li>)}</ul>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ---- reports ----
interface ReportGroup { kind: "challenge" | "event"; item_id: string; title: string; link: string | null; where: string; first_at: number; reports: { reason: string; details: string; reporter: string | null; created_at: number }[] }
const REASON: Record<string, string> = { spam: "Spam", scam: "Scam", offensive: "Offensive", wrong: "Wrong details", other: "Other" };

export function PlatformReports() {
  const [items, setItems] = useState<ReportGroup[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [taking, setTaking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const load = () => api<{ items: ReportGroup[] }>("/platform/reports").then((r) => setItems(r.items)).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(); }, []);
  async function resolve(g: ReportGroup, action: "dismiss" | "takedown") {
    setMsg(null);
    try {
      await api("/platform/reports/resolve", { method: "POST", json: { kind: g.kind, item_id: g.item_id, action, note } });
      setTaking(null); setNote("");
      setMsg({ kind: "ok", text: action === "dismiss" ? `Left "${g.title}" up and closed its reports.` : `Took "${g.title}" down.` });
      await load();
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <Shell title="Reports">
      {msg && <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {items && items.length === 0 && <div className="section"><p className="muted">No open reports. When someone reports a challenge or a global event, it shows up here.</p></div>}
      {items?.map((g, n) => {
        const key = `${g.kind}:${g.item_id}`;
        return (
          <NumSection key={key} n={String(n + 1).padStart(2, "0")} title={g.title}>
            <p className="muted" style={{ marginTop: 0 }}>{g.where} · {g.reports.length} {g.reports.length === 1 ? "report" : "reports"} · first on {fmtDate(g.first_at)}{g.link ? <> · <a href={g.link} target="_blank" rel="noopener noreferrer">Open it</a></> : " · no longer public"}</p>
            <ul className="todo">{g.reports.map((r, i) => <li key={i}><span><b>{REASON[r.reason] ?? r.reason}</b>{r.details && <span> · {r.details}</span>}</span><span className="muted email">{r.reporter ?? "deleted account"}</span></li>)}</ul>
            {taking === key ? (
              <div className="form">
                <label htmlFor={`rn${g.item_id}`}>{g.kind === "challenge" ? "What must the organiser fix? They get this note, and the challenge goes back to a draft that needs review again." : "Note for the record (optional)"}</label>
                <textarea id={`rn${g.item_id}`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="actions"><button onClick={() => void resolve(g, "takedown")}>Take it down</button><button className="ghost" onClick={() => setTaking(null)}>Cancel</button></div>
              </div>
            ) : (
              <div className="actions"><button onClick={() => { setTaking(key); setNote(""); }}>Take it down</button><button className="ghost" onClick={() => void resolve(g, "dismiss")}>It is fine, leave it up</button></div>
            )}
          </NumSection>
        );
      })}
    </Shell>
  );
}
