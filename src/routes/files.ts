import { Hono } from "hono";
import type { AppEnv } from "../types";

export const files = new Hono<AppEnv>();

// Only public image folders are served. Keys are random, so they can be cached for a long time.
files.get("/:folder{logos|covers}/:name", async (c) => {
  const key = `${c.req.param("folder")}/${c.req.param("name")}`;
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
