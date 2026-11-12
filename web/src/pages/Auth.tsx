import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { rememberNext, takeNext, useAuth } from "../auth";
import { Notice } from "../ui";

export function Login() {
  const { me, reload } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "link" | "code" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const next = params.get("next");
  useEffect(() => { if (next && next.startsWith("/")) rememberNext(next); }, [next]);
  if (me) return <Navigate to={next && next.startsWith("/") ? next : "/"} replace />;

  async function send(kind: "link" | "code") {
    setState("sending"); setMsg("");
    try { await api("/auth/request", { method: "POST", json: { email, kind } }); setState(kind); }
    catch (err) { setState("error"); setMsg((err as Error).message); }
  }
  function submit(e: React.FormEvent) { e.preventDefault(); void send("link"); }
  async function verify(code: string) {
    try { await api("/auth/verify", { method: "POST", json: { email, code } }); await reload(); nav(takeNext(), { replace: true }); }
    catch (err) { setMsg((err as Error).message); setDigits(["", "", "", "", "", ""]); boxes.current[0]?.focus(); }
  }
  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) { // pasted code
      const arr = d.slice(0, 6).split("").concat(Array(6).fill("")).slice(0, 6); setDigits(arr);
      if (d.length >= 6) void verify(d.slice(0, 6)); return;
    }
    const arr = [...digits]; arr[i] = d; setDigits(arr);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (arr.every(Boolean)) void verify(arr.join(""));
  }

  return (
    <div className="narrow">
      <p className="hand">Welcome</p>
      <h1>Sign in</h1>
      <p className="muted">There is no password. Enter your email and we send you a one-time link, or a 6-digit code if you prefer.</p>
      {state === "link" ? <Notice kind="ok">Check your inbox for the sign-in link. It works for 15 minutes.</Notice>
      : state === "code" ? (
        <div>
          <Notice kind="ok">We emailed a 6-digit code to {email}.</Notice>
          <label>Enter the code</label>
          <div className="codeboxes">{digits.map((d, i) => (
            <input key={i} ref={(el) => { boxes.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} value={d} aria-label={`Digit ${i + 1}`}
              onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus(); }} />
          ))}</div>
          {msg && <Notice kind="err">{msg}</Notice>}
        </div>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="actions">
            <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending..." : "Email me a link"}</button>
            <button type="button" className="ghost" disabled={state === "sending" || !email} onClick={() => void send("code")}>Email me a code instead</button>
          </div>
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
