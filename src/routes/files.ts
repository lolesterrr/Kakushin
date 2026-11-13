import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";

export const files = new Hono<AppEnv>();

// Only public image folders are served. Keys are random, so they can be cached for a long time.
files.get("/:folder{logos|covers}/:name", (c) => serve(c, `${c.req.param("folder")}/${c.req.param("name")}`));
// Sponsor logos and images in challenge pages sit in a folder per challenge.
files.get("/:folder{sponsors|pages}/:sub{[a-f0-9]{8,40}}/:name", (c) => serve(c, `${c.req.param("folder")}/${c.req.param("sub")}/${c.req.param("name")}`));

async function serve(c: Context<AppEnv>, key: string) {
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
