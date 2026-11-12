import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";

interface Item { id: string; kind: string; title: string; body: string; link: string; read_at: number | null; created_at: number }

export function Inbox() {
  const { me } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    if (!me) return;
    api<{ items: Item[] }>("/inbox").then((r) => { setItems(r.items); void api("/inbox/read", { method: "POST" }).then(() => window.dispatchEvent(new Event("kk-inbox"))).catch(() => {}); }).catch(() => setItems([]));
  }, [me?.id]);
  if (!me) return <Navigate to="/login?next=/inbox" replace />;
  if (!items) return null;
  return (
    <div className="section">
      <h1>Inbox</h1>
      {items.length === 0 ? <p className="muted">Nothing yet. You get a note here when results come out, and when an organisation you follow opens a new challenge.</p> : (
        <ul className="todo" style={{ marginTop: 16 }}>
          {items.map((n) => (
            <li key={n.id} style={n.read_at ? undefined : { borderLeft: "4px solid var(--red)" }}>
              <span><b>{n.link ? <Link to={n.link}>{n.title}</Link> : n.title}</b>{n.body && <span className="muted"> · {n.body}</span>}</span>
              <span className="muted">{fmtDate(n.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
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
      <div className="pills" role="group" aria-label="Topics">{all.map((t) => <button key={t} className={`pill ${mine.includes(t) ? "on" : ""}`} aria-pressed={mine.includes(t)} onClick={() => void toggle(t)}>{t}</button>)}</div>
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
