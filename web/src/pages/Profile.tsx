import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";

export function Profile() {
  const { me, reload } = useAuth();
  const [form, setForm] = useState({ name: me?.name ?? "", bio: me?.bio ?? "", institution: me?.institution ?? "", location: me?.location ?? "", skills: me?.skills.join(", ") ?? "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
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
  );
}
