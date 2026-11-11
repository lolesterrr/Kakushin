import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import "./styles.css";

interface Me { id: string; email: string; name: string | null; bio: string | null; institution: string | null; location: string | null; skills: string[] }

function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = () => api<{ user: Me | null }>("/me").then((r) => setMe(r.user)).catch(() => setMe(null));
  useEffect(() => { void reload(); }, []);
  return { me, reload };
}

function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { await api("/auth/request", { method: "POST", json: { email, kind: "link" } }); setState("sent"); }
    catch (err) { setState("error"); setMsg((err as Error).message); }
  }
  return (
    <div className="wrap"><div className="card">
      <h1>Kakushin</h1><p className="muted">Sign in with your email. No password needed.</p>
      {state === "sent" ? <p className="ok">Check your inbox for a sign-in link.</p> : (
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Email me a link</button>
          {state === "error" && <p className="err">{msg}</p>}
        </form>
      )}
    </div></div>
  );
}

function Verify({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [err, setErr] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setErr("Missing token"); return; }
    api("/auth/verify", { method: "POST", json: { token } })
      .then(() => { onDone(); nav("/", { replace: true }); })
      .catch((e: Error) => setErr(e.message));
  }, []);
  return <div className="wrap"><div className="card">{err ? <p className="err">{err}</p> : <p>Signing you in...</p>}</div></div>;
}

function Profile({ me, reload }: { me: Me; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ name: me.name ?? "", bio: me.bio ?? "", institution: me.institution ?? "", location: me.location ?? "", skills: me.skills.join(", ") });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/me", { method: "PUT", json: { ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean), links: {}, gender: null } });
      await reload(); setMsg("Saved");
    } catch (err) { setMsg((err as Error).message); }
  }
  async function logout() { await api("/auth/logout", { method: "POST" }); await reload(); }
  return (
    <div className="wrap">
      <nav><strong>Kakushin</strong><button className="link" onClick={logout}>Sign out</button></nav>
      <div className="card">
        <h1>Your profile</h1><p className="muted">{me.email}</p>
        <form onSubmit={save}>
          <label>Name</label><input required value={form.name} onChange={set("name")} />
          <label>Institution</label><input value={form.institution} onChange={set("institution")} />
          <label>Location</label><input value={form.location} onChange={set("location")} />
          <label>Skills (comma separated)</label><input value={form.skills} onChange={set("skills")} />
          <label>Bio</label><textarea rows={4} value={form.bio} onChange={set("bio")} />
          <button type="submit">Save</button>{msg && <p className="ok">{msg}</p>}
        </form>
      </div>
    </div>
  );
}

function App() {
  const { me, reload } = useMe();
  if (me === undefined) return null;
  return (
    <Routes>
      <Route path="/auth/verify" element={<Verify onDone={reload} />} />
      <Route path="*" element={me ? <Profile me={me} reload={reload} /> : <Login />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
