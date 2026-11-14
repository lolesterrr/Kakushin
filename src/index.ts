import { Hono } from "hono";
import type { AppEnv } from "./types";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { orgs } from "./routes/orgs";
import { explore } from "./routes/challenges";
import { files } from "./routes/files";
import { teams } from "./routes/teams";
import { pitch, decks } from "./routes/pitch";
import { judge } from "./routes/judging";
import { certificates } from "./routes/certificates";
import { inbox, follows } from "./routes/inbox";
import { platform } from "./routes/platform";
import { people, teamFinder } from "./routes/people";
import { events, reports, saved } from "./routes/events";
import { readToken, userFromToken } from "./lib/session";
import { withMeta } from "./lib/meta";
import { runHourly } from "./lib/jobs";
import { LIVE_CRON, runLive } from "./lib/live";
import { handleOutbox, type OutboxMessage } from "./lib/outbox";
import type { Env } from "./types";

const app = new Hono<AppEnv>();

// Basic hardening on every API response. Certificate PDFs and uploads are served by their own routes and keep their own types.
app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

// Attach the current user (or null) to every API request.
app.use("/api/*", async (c, next) => {
  const token = readToken(c);
  c.set("user", token ? await userFromToken(c, token) : null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
app.route("/api/me", me);
app.route("/api/orgs", orgs);
app.route("/api/challenges", explore);
app.route("/api/files", files);
app.route("/api/teams", teams);
app.route("/api/teams", pitch);
app.route("/api/teams", teamFinder);
app.route("/api/people", people);
app.route("/api/decks", decks);
app.route("/api/judge", judge);
app.route("/api/certificates", certificates);
app.route("/api/inbox", inbox);
app.route("/api/follows", follows);
app.route("/api/platform", platform);
app.route("/api/events", events);
app.route("/api/saved", saved);
app.route("/api/reports", reports);

// Everything outside /api is the web app. Pages come through here (see run_worker_first) so their link-preview tags can be filled in.
app.notFound(async (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : withMeta(c, await c.env.ASSETS.fetch(c.req.raw))));
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path} failed: ${err instanceof Error ? err.message : String(err)}`);
  return c.json({ error: "Something went wrong" }, 500);
});

export default {
  fetch: app.fetch,
  // Hourly: close applications, reminders, clean-up and push retries (src/lib/jobs.ts).
  // Every 5 minutes: agenda and pitch cutoff pushes for live events (src/lib/live.ts).
  scheduled(event, env, ctx) { ctx.waitUntil(event.cron === LIVE_CRON ? runLive(env) : runHourly(env)); },
  // Results emails and pushes, a few at a time (src/lib/outbox.ts).
  queue: (batch, env) => handleOutbox(batch, env),
} satisfies ExportedHandler<Env, OutboxMessage>;
