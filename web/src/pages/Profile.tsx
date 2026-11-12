import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";
import { StatusStamp } from "./Team";
import { CertificatesList } from "./Certificates";
import { TopicPicker } from "./Inbox";

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
      await api("/me", { method: "PUT", json: { ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean), links: {}, gender: null } });
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
    </>
  );
}
