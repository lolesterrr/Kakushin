import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Notice, topicLabel } from "../ui";

interface Item { id: string; kind: string; title: string; body: string; link: string; read_at: number | null; created_at: number }
interface Page { items: Item[]; unread: number; next: string | null }

export function Inbox() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const changed = () => window.dispatchEvent(new Event("kk-inbox")); // the badge in the top bar reloads
  useEffect(() => {
    if (!me) return;
    api<Page>("/inbox").then((r) => { setItems(r.items); setNext(r.next); setUnread(r.unread); }).catch(() => setItems([]));
  }, [me?.id]);
  if (!me) return <Navigate to="/login?next=/inbox" replace />;
  if (!items) return null;
  async function more() {
    if (!next) return;
    setBusy(true); setErr("");
    try { const r = await api<Page>(`/inbox?before=${encodeURIComponent(next)}`); setItems((xs) => [...(xs ?? []), ...r.items]); setNext(r.next); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function markRead(n: Item) {
    if (n.read_at) return;
    const at = Date.now();
    setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, read_at: at } : x)) ?? null);
    setUnread((u) => Math.max(0, u - 1));
    void api(`/inbox/${n.id}/read`, { method: "POST" }).then(changed).catch(() => {});
  }
  async function readAll() {
    try { await api("/inbox/read", { method: "POST" }); const at = Date.now(); setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? at })) ?? null); setUnread(0); changed(); }
    catch (e) { setErr((e as Error).message); }
  }
  function open(n: Item) { markRead(n); if (n.link) { if (/^https?:\/\//i.test(n.link)) window.open(n.link, "_blank", "noopener"); else nav(n.link); } }
  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1>Inbox</h1>
        {unread > 0 && <button className="ghost small" onClick={() => void readAll()}>Mark all as read</button>}
      </div>
      {items.length === 0 ? <p className="muted">Nothing yet. You get a note here when results come out, and when an organisation you follow opens a new challenge.</p> : (
        <ul className="todo" style={{ marginTop: 16 }}>
          {items.map((n) => (
            <li key={n.id} style={n.read_at ? undefined : { borderLeft: "4px solid var(--red)" }}>
              <span>
                <b>{n.link ? <a href={n.link} onClick={(e) => { e.preventDefault(); open(n); }}>{n.title}</a> : n.title}</b>
                {n.body && <span className="muted"> · {n.body}</span>}
                {!n.read_at && <span className="sr-only"> (unread)</span>}
              </span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {!n.read_at && !n.link && <button className="link" onClick={() => markRead(n)}>Mark read</button>}
                <span className="muted">{fmtDate(n.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {next && <div className="actions"><button className="ghost" disabled={busy} onClick={() => void more()}>{busy ? "Loading..." : "Show older"}</button></div>}
      {err && <Notice kind="err">{err}</Notice>}
    </div>
  );
}

export function TopicPicker() {
  const [all, setAll] = useState<string[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<{ slug: string; name: string }[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    api<{ topics: string[] }>("/challenges/topics").then((r) => setAll(r.topics)).catch(() => {});
    api<{ topics: string[]; orgs: { slug: string; name: string }[] }>("/follows").then((r) => { setMine(r.topics); setOrgs(r.orgs); }).catch(() => {});
  }, []);
  async function toggle(t: string) {
    const next = mine.includes(t) ? mine.filter((x) => x !== t) : [...mine, t];
    setMine(next);
    try { await api("/follows/topics", { method: "PUT", json: { topics: next } }); setMsg({ kind: "ok", text: "Saved" }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <div className="section" id="interests">
      <h2>What you want to hear about</h2>
      <p className="muted">Pick topics and we tell you in your inbox when a new challenge matches.</p>
      <div className="chips" role="group" aria-label="Topics">{all.map((t) => <button type="button" key={t} className="chip" aria-pressed={mine.includes(t)} onClick={() => void toggle(t)}>{topicLabel(t)}</button>)}</div>
      {orgs.length > 0 && <p className="muted" style={{ marginTop: 16 }}>Following: {orgs.map((o, i) => <span key={o.slug}>{i > 0 && ", "}<Link to={`/o/${o.slug}`}>{o.name}</Link></span>)}</p>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

export function FollowButton({ slug }: { slug: string }) {
  const { me } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { if (me) api<{ orgs: { slug: string }[] }>("/follows").then((r) => setOn(r.orgs.some((o) => o.slug === slug))).catch(() => setOn(false)); }, [me?.id, slug]);
  if (!me) return <Link className="btn ghost" to={`/login?next=/o/${slug}`}>Sign in to follow</Link>;
  if (on === null) return null;
  return <button className={on ? "ghost" : ""} onClick={async () => { await api(`/follows/orgs/${slug}`, { method: on ? "DELETE" : "PUT" }); setOn(!on); }}>{on ? "Following" : "Follow"}</button>;
}
