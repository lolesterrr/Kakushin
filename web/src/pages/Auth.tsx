import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { rememberNext, takeNext, useAuth } from "../auth";
import { Notice } from "../ui";

export function Login() {
  const { me } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const next = params.get("next");
  useEffect(() => { if (next && next.startsWith("/")) rememberNext(next); }, [next]);
  if (me) return <Navigate to={next && next.startsWith("/") ? next : "/"} replace />;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState("sending");
    try { await api("/auth/request", { method: "POST", json: { email, kind: "link" } }); setState("sent"); }
    catch (err) { setState("error"); setMsg((err as Error).message); }
  }
  return (
    <div className="narrow">
      <p className="hand">Welcome</p>
      <h1>Sign in</h1><p className="muted">Use your email. No password needed.</p>
      {state === "sent" ? <Notice kind="ok">Check your inbox for a sign-in link.</Notice> : (
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="actions"><button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending..." : "Email me a link"}</button></div>
          {state === "error" && <Notice kind="err">{msg}</Notice>}
        </form>
      )}
    </div>
  );
}

export function Verify() {
  const { reload } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // links are single use, so never verify twice (StrictMode, re-renders)
    ran.current = true;
    const token = params.get("token");
    if (!token) { setErr("Missing token"); return; }
    api("/auth/verify", { method: "POST", json: { token } })
      .then(async () => { await reload(); nav(takeNext(), { replace: true }); })
      .catch((e: Error) => setErr(e.message));
  }, []);
  return <div className="narrow">{err ? <Notice kind="err">{err}</Notice> : <p>Signing you in...</p>}</div>;
}
