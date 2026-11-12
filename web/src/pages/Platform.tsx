import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Band, Notice, NumSection } from "../ui";

const tabs = [
  { to: "/platform", label: "Overview", end: true },
  { to: "/platform/review", label: "Review" },
  { to: "/platform/orgs", label: "Organisations" },
  { to: "/platform/users", label: "Users" },
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
          <div className="table-wrap"><table>
            <thead><tr><th>Organisation</th><th>Owner</th><th>Live</th><th>In review</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td><a href={`/o/${o.slug}`}><b>{o.name}</b></a><br /><span className="muted">{o.type} · {o.members} {o.members === 1 ? "member" : "members"}</span></td>
                <td>{o.owner_email ?? "-"}</td><td>{o.live_challenges}</td><td>{o.pending}</td>
                <td>{o.suspended ? <span className="tag ink">Suspended</span> : o.verified ? <span className="tag moss">Verified</span> : <span className="tag sand">Unverified</span>}</td>
                <td>
                  <button className="ghost small" onClick={() => void set(o, { verified: !o.verified })}>{o.verified ? "Remove verified" : "Verify"}</button>{" "}
                  <button className="ghost small" onClick={() => void set(o, { suspended: !o.suspended })}>{o.suspended ? "Restore" : "Suspend"}</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Verified organisations publish challenges without waiting for review. Everyone else goes through the review queue.</p>
      </div>
    </Shell>
  );
}

interface UserRow { id: string; email: string; name: string | null; is_platform_admin: number; suspended: number; orgs: number; teams: number; created_at: number }

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
          <div className="table-wrap"><table>
            <thead><tr><th>User</th><th>Joined</th><th>Orgs</th><th>Teams</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name || u.email.split("@")[0]}</b><br /><span className="muted">{u.email}</span></td>
                <td>{fmtDate(u.created_at)}</td><td>{u.orgs}</td><td>{u.teams}</td>
                <td>{u.suspended ? <span className="tag ink">Suspended</span> : u.is_platform_admin ? <span className="tag indigo">Admin</span> : <span className="tag sand">Active</span>}</td>
                <td>{u.id !== me?.id && (<>
                  <button className="ghost small" onClick={() => void set(u, { suspended: !u.suspended })}>{u.suspended ? "Restore" : "Suspend"}</button>{" "}
                  <button className="ghost small" onClick={() => void set(u, { is_platform_admin: !u.is_platform_admin })}>{u.is_platform_admin ? "Remove admin" : "Make admin"}</button>
                </>)}</td>
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
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{new Date(a.created_at).toLocaleString()}</td><td>{a.actor_email}</td><td>{a.action}</td><td>{a.detail}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </Shell>
  );
}
