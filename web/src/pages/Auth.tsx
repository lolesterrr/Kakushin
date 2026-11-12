import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { isLocalPath, rememberNext, takeNext, useAuth } from "../auth";
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
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState("");
  const widget = useRef<HTMLDivElement>(null);
  const next = params.get("next");
  useEffect(() => { api<{ turnstile_site_key: string | null }>("/auth/config").then((r) => setSiteKey(r.turnstile_site_key)).catch(() => {}); }, []);
  // Cloudflare Turnstile, only when the server has keys. The widget script loads from Cloudflare.
  useEffect(() => {
    if (!siteKey || !widget.current) return;
    const el = widget.current; let id: string | undefined;
    const draw = () => { const t = (window as unknown as { turnstile?: { render: (e: HTMLElement, o: object) => string; remove: (id: string) => void } }).turnstile; if (t && !id) id = t.render(el, { sitekey: siteKey, callback: (v: string) => setCaptcha(v), "expired-callback": () => setCaptcha("") }); };
    if ((window as unknown as { turnstile?: unknown }).turnstile) draw();
    else if (!document.getElementById("cf-turnstile")) { const s = document.createElement("script"); s.id = "cf-turnstile"; s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = draw; document.head.appendChild(s); }
    else document.getElementById("cf-turnstile")!.addEventListener("load", draw);
    return () => { const t = (window as unknown as { turnstile?: { remove: (id: string) => void } }).turnstile; if (t && id) t.remove(id); };
  }, [siteKey, state]);
  const signup = params.get("mode") === "signup";
  useEffect(() => { if (isLocalPath(next)) rememberNext(next); }, [next]);
  if (me) return <Navigate to={isLocalPath(next) ? next : "/"} replace />;

  async function send(kind: "link" | "code") {
    setState("sending"); setMsg("");
    try { await api("/auth/request", { method: "POST", json: { email, kind, ...(captcha ? { turnstile: captcha } : {}) } }); setState(kind); }
    catch (err) { setState("error"); setMsg((err as Error).message); }
    finally { setCaptcha(""); }
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
      <p className="hand">{signup ? "New here?" : "Welcome back"}</p>
      <h1>{signup ? "Create your account" : "Sign in"}</h1>
      <p className="muted">There is no password. Enter your email and we send you a one-time link, or a 6-digit code if you prefer.{signup ? " Your account is created the first time you confirm your email." : " New here? Enter your email and we create your account."}</p>
      <p className="muted">{signup ? <>Already have an account? <Link to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link></> : <>Or <Link to={next ? `/login?mode=signup&next=${encodeURIComponent(next)}` : "/login?mode=signup"}>create an account</Link></>}</p>
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
          {siteKey && <div ref={widget} style={{ margin: "12px 0" }} />}
          <div className="actions">
            <button type="submit" disabled={state === "sending" || (!!siteKey && !captcha)}>{state === "sending" ? "Sending..." : "Email me a link"}</button>
            <button type="button" className="ghost" disabled={state === "sending" || !email || (!!siteKey && !captcha)} onClick={() => void send("code")}>Email me a code instead</button>
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
