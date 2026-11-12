import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Notice } from "../ui";

type Msg = { kind: "ok" | "err"; text: string } | null;
interface Item { id: string; title: string; body: string; link: string | null; recipients: number; created_at: number }

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Announcements sent to everyone who follows an organisation (inbox plus phone push). Also used for platform news. */
export function AnnounceBox({ listPath, postPath, audience, heading, hint }: { listPath: string; postPath: string; audience: (r: { followers?: number }) => string; heading: string; hint: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [followers, setFollowers] = useState<number | undefined>();
  const [form, setForm] = useState({ title: "", body: "", link: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ items: Item[]; followers?: number }>(listPath).then((r) => { setItems(r.items); setFollowers(r.followers); }).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(); }, [listPath]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const r = await api<{ recipients: number }>(postPath, { method: "POST", json: { title: form.title, ...(form.body ? { body: form.body } : {}), ...(form.link ? { link: form.link } : {}) } });
      setForm({ title: "", body: "", link: "" });
      setMsg({ kind: "ok", text: r.recipients === 0 ? "Posted, but nobody is listening yet." : `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.` });
      await load();
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <div className="section form">
      <h2>{heading}</h2>
      <p className="muted">{hint} {audience({ followers })}</p>
      <form onSubmit={send}>
        <label htmlFor="at">Headline</label><input id="at" required minLength={3} maxLength={100} placeholder="Info session on Friday" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label htmlFor="ab">Details (optional)</label><textarea id="ab" rows={3} maxLength={500} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <label htmlFor="al">Link (optional)</label><input id="al" placeholder="https://… or /challenges" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        <div className="actions"><button type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</button></div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </form>
      {items && items.length === 0 && <p className="muted">Nothing sent yet.</p>}
      {items && items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Sent</th><th>Headline</th><th>Reached</th></tr></thead>
          <tbody>{items.map((a) => <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{when(a.created_at)}</td><td>{a.title}</td><td>{a.recipients}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

interface Members { members: { id: string; email: string; name: string | null; role: string }[]; invites: { email: string; invited_at: number }[]; you: string; your_role: string }

/** Who can run this organisation. The owner adds people by email, even before they have an account. */
export function OrgMembers({ slug }: { slug: string }) {
  const [d, setD] = useState<Members | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => api<Members>(`/orgs/${slug}/members`).then(setD).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { void load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      const r = await api<{ pending: boolean }>(`/orgs/${slug}/members`, { method: "POST", json: { email } });
      setEmail(""); setMsg({ kind: "ok", text: r.pending ? "Invite saved. They become an admin the first time they sign in with that email." : "Added. They have been told." });
      await load();
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function remove(id: string, label: string) {
    if (!confirm(`Remove ${label} as an admin?`)) return;
    try { await api(`/orgs/${slug}/members/${id}`, { method: "DELETE" }); await load(); } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function cancelInvite(em: string) {
    try { await api(`/orgs/${slug}/invites`, { method: "DELETE", json: { email: em } }); await load(); } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  return (
    <div className="section form">
      <h2>Admins</h2>
      <p className="muted">Admins can create challenges, review applications and send announcements for this organisation.</p>
      {d && (
        <div className="table-wrap"><table>
          <thead><tr><th>Person</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {d.members.map((m) => (
              <tr key={m.id}><td><b>{m.name || m.email.split("@")[0]}</b><br /><span className="muted">{m.email}</span></td><td>{m.role}</td>
                <td>{m.role !== "owner" && (d.your_role === "owner" || m.id === d.you) && <button className="ghost small" onClick={() => void remove(m.id, m.email)}>{m.id === d.you ? "Leave" : "Remove"}</button>}</td></tr>
            ))}
            {d.invites.map((i) => (
              <tr key={i.email}><td><span className="muted">{i.email}</span></td><td><span className="tag sand">Invited</span></td><td><button className="ghost small" onClick={() => void cancelInvite(i.email)}>Cancel</button></td></tr>
            ))}
          </tbody>
        </table></div>
      )}
      <form onSubmit={add} style={{ display: "flex", gap: 8, maxWidth: 480, marginTop: 12 }}>
        <input type="email" required aria-label="Email of the new admin" placeholder="colleague@example.org" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit">Add admin</button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

/** Phone push on or off. Everything still lands in the inbox either way. */
export function PushSetting() {
  const [s, setS] = useState<{ push: boolean; devices: number } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { api<{ push: boolean; devices: number }>("/inbox/settings").then(setS).catch(() => {}); }, []);
  if (!s) return null;
  async function flip(push: boolean) {
    setMsg(null);
    try { await api("/inbox/settings", { method: "PUT", json: { push } }); setS({ ...s!, push }); } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  return (
    <div className="section form">
      <h2>Notifications</h2>
      <p className="muted">Everything lands in your <a href="/inbox">inbox</a>. Push sends a ping to the Kakushin phone app too{s.devices === 0 ? " (no phone is signed in yet)" : ` (${s.devices} ${s.devices === 1 ? "phone" : "phones"} signed in)`}.</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
        <input type="checkbox" checked={s.push} onChange={(e) => void flip(e.target.checked)} style={{ width: "auto" }} /> Send me push notifications
      </label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
