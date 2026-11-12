import type { Context } from "hono";
import type { AppEnv } from "../types";
import { sendEmail } from "./email";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

interface Ctx { team: string; challenge: string; org: string; url: string }

const TEXT: Record<string, (x: Ctx) => { subject: string; lines: string[] }> = {
  received: (x) => ({
    subject: `Application received: ${x.challenge}`,
    lines: [`We received the application from team "${x.team}" for ${x.challenge} by ${x.org}.`, "You will hear from the organisers once they have reviewed it."],
  }),
  shortlisted: (x) => ({
    subject: `You are shortlisted: ${x.challenge}`,
    lines: [`Good news. Team "${x.team}" has been shortlisted for ${x.challenge} by ${x.org}.`, "The organisers will share next steps."],
  }),
  rejected: (x) => ({
    subject: `Update on your application: ${x.challenge}`,
    lines: [`Thank you for applying to ${x.challenge} by ${x.org}. Team "${x.team}" was not selected this time.`, "We hope you will apply to other challenges soon."],
  }),
};

/** Sends in the background so a slow or failing email never blocks the request. */
export function notifyTeam(c: Context<AppEnv>, kind: keyof typeof TEXT, emails: string[], x: Ctx) {
  const { subject, lines } = TEXT[kind]!(x);
  const html = lines.map((l) => `<p>${esc(l)}</p>`).join("") + `<p><a href="${esc(x.url)}">View the challenge</a></p>`;
  const text = lines.join("\n\n") + `\n\n${x.url}`;
  c.executionCtx.waitUntil(
    Promise.all(emails.map((to) => sendEmail(c.env, to, subject, html, text).catch((e) => console.error(`email to a team member failed: ${e instanceof Error ? e.message : e}`)))),
  );
}
