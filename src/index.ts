import { Hono } from "hono";
import type { AppEnv } from "./types";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { readToken, userFromToken } from "./lib/session";

const app = new Hono<AppEnv>();

// Attach the current user (or null) to every API request.
app.use("/api/*", async (c, next) => {
  const token = readToken(c);
  c.set("user", token ? await userFromToken(c, token) : null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
app.route("/api/me", me);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path} failed: ${err instanceof Error ? err.message : String(err)}`);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;
