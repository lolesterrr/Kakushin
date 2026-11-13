import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";
import { StatusStamp } from "./Team";
import { CertificatesList } from "./Certificates";
import { TopicPicker } from "./Inbox";
import { PushSetting } from "./OrgTeam";

export function Profile() {
  const { me, reload } = useAuth();
  const [form, setForm] = useState({ name: me?.name ?? "", bio: me?.bio ?? "", institution: me?.institution ?? "", location: me?.location ?? "", skills: me?.skills.join(", ") ?? "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string; status: string; title: string; cslug: string; oslug: string; oname: string }[]>([]);
  useEffect(() => { if (me) api<{ teams: typeof teams }>("/teams/mine").then((r) => setTeams(r.teams)).catch(() => {}); }, [me?.id]);
  if (!me) return <Navigate to="/login?next=/profile" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/me", { method: "PUT", json: { ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean) } });
      await reload(); setMsg({ kind: "ok", text: "Saved" });
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  return (
    <>
    {teams.length > 0 && (
      <div className="section">
        <h2>Your teams</h2>
        <div className="grid" style={{ marginTop: 16 }}>
          {teams.map((t) => (
            <Link key={t.id} to={`/o/${t.oslug}/c/${t.cslug}`} className="cell card-link"><div className="cell-body"><span className="muted">{t.oname}</span><h3>{t.title}</h3><p>{t.name}</p></div>
              <div className="corner"><StatusStamp status={t.status} /></div></Link>
          ))}
        </div>
      </div>
    )}
    <CertificatesList />
    <div className="section form">
      <h1>Your profile</h1><p className="muted">{me.email}</p>
      <form onSubmit={save}>
        <label htmlFor="n">Name</label><input id="n" required value={form.name} onChange={set("name")} />
        <label htmlFor="i">Institution</label><input id="i" value={form.institution} onChange={set("institution")} />
        <label htmlFor="l">Location</label><input id="l" value={form.location} onChange={set("location")} />
        <label htmlFor="s">Skills (comma separated)</label><input id="s" value={form.skills} onChange={set("skills")} />
        <label htmlFor="b">Bio</label><textarea id="b" rows={4} value={form.bio} onChange={set("bio")} />
        <div className="actions"><button type="submit">Save</button></div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </form>
    </div>
    <TopicPicker />
    <PushSetting />
    <DeleteAccount email={me.email} />
    </>
  );
}

/** Deleting is final, so it sits behind a button, a plain list of what goes, and the email typed back. */
function DeleteAccount({ email }: { email: string }) {
  const { reload } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true); setErr("");
    try { await api("/me", { method: "DELETE", json: { confirm: typed } }); await reload(); nav("/?deleted=1", { replace: true }); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="section form" id="delete">
      <h2>Delete your account</h2>
      {!open ? (
        <>
          <p className="muted">This removes your account and your data from Kakushin for good.</p>
          <div className="actions"><button className="ghost" onClick={() => setOpen(true)}>Delete my account</button></div>
        </>
      ) : (
        <form onSubmit={remove}>
          <p>This cannot be undone. Deleting your account removes:</p>
          <ul>
            <li>your profile, sign-in sessions and devices</li>
            <li>your place in every team (a team you lead passes to the teammate who joined first; a team with only you in it is removed, with its application and pitch)</li>
            <li>your certificates, which will stop verifying</li>
            <li>your inbox, follows and topics, and any scores you gave as a judge</li>
          </ul>
          <p className="muted">If you own an organisation, another admin becomes its owner. If you are its only admin and it has public challenges, add another admin first.</p>
          <label htmlFor="del-email">Type your email address to confirm</label>
          <input id="del-email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
          <div className="actions">
            <button type="submit" disabled={!matches || busy}>{busy ? "Deleting..." : "Delete my account for good"}</button>
            <button type="button" className="ghost" onClick={() => { setOpen(false); setTyped(""); setErr(""); }}>Cancel</button>
          </div>
          {err && <Notice kind="err">{err}</Notice>}
        </form>
      )}
    </div>
  );
}
