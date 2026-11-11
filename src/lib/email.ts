import type { Env } from "../types";

export async function sendEmail(env: Env, to: string, subject: string, html: string, text: string) {
  if (!env.RESEND_API_KEY) {
    // Local dev without a key: log instead of sending.
    console.log(`[email:dev] to=${to}\nsubject=${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
