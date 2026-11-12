import type { Env } from "../types";

/** "Kakushin <hello@example.org>" or a bare address, split for providers that want the parts. */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { ...(m[1] ? { name: m[1].replace(/^"|"$/g, "") } : {}), email: m[2]!.trim() } : { email: from.trim() };
}

/**
 * Sends one email. Brevo is used when BREVO_API_KEY is set (it accepts senders that Resend refuses, such as a free
 * domain or a single verified address), otherwise Resend. With neither key, local dev logs the email instead.
 */
export async function sendEmail(env: Env, to: string, subject: string, html: string, text: string) {
  if (env.BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: parseFrom(env.EMAIL_FROM), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
    return;
  }
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
