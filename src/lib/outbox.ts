import type { Env } from "../types";
import { sendEmail } from "./email";
import { pushPending } from "./push";

/**
 * Work that should reach everyone but cannot all happen inside one request, because a request may only make 50
 * outgoing calls on the free plan. It goes on the OUTBOX queue (wrangler.jsonc) and the queue handler below sends it
 * a few at a time, retrying failures.
 */
export type OutboxMessage =
  | { type: "email"; to: string; subject: string; html: string; text: string }
  | { type: "push" };

const SEND_BATCH = 100; // the most messages Queues takes in one sendBatch call

/** Queues emails, 100 per call. Returns false when there is no queue (local setups without the binding). */
export async function queueEmails(env: Env, emails: Omit<Extract<OutboxMessage, { type: "email" }>, "type">[]): Promise<boolean> {
  if (!env.OUTBOX) return false;
  for (let i = 0; i < emails.length; i += SEND_BATCH) {
    await env.OUTBOX.sendBatch(emails.slice(i, i + SEND_BATCH).map((e) => ({ body: { type: "email", ...e } as OutboxMessage })));
  }
  return true;
}

const PUSH_ROUNDS_PER_MESSAGE = 5;

/** The queue consumer. Each email is its own message, so one bad address never holds up the rest. */
export async function handleOutbox(batch: MessageBatch<OutboxMessage>, env: Env): Promise<void> {
  let pushQueued = false;
  for (const msg of batch.messages) {
    const m = msg.body;
    try {
      if (m.type === "email") {
        await sendEmail(env, m.to, m.subject, m.html, m.text);
      } else if (m.type === "push") {
        // Several push messages in one batch would only race each other; one is enough.
        if (pushQueued) { msg.ack(); continue; }
        pushQueued = true;
        let more = true;
        for (let i = 0; i < PUSH_ROUNDS_PER_MESSAGE && more; i++) more = (await pushPending(env, Date.now() - 24 * 3600 * 1000)).more;
        if (more) await env.OUTBOX?.send({ type: "push" });
      }
      msg.ack();
    } catch (e) {
      console.error(`outbox ${m.type} failed (attempt ${msg.attempts}): ${e instanceof Error ? e.message : e}`);
      msg.retry({ delaySeconds: 60 * msg.attempts });
    }
  }
}
