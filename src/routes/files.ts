import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";

export const files = new Hono<AppEnv>();

// Only public image folders are served. Profile pictures and banners are public too: they only show next to a name that is already shown. Keys are random, so they can be cached for a long time.
files.get("/:folder{logos|covers|avatars|banners}/:name", (c) => serve(c, `${c.req.param("folder")}/${c.req.param("name")}`));
// Sponsor logos, page images and recap photos sit in a folder per challenge; pitch screenshots in a folder per team.
// Keys are random and unlisted, so a screenshot is only reachable by someone who was shown its address.
files.get("/:folder{sponsors|pages|shots|photos}/:sub{[a-f0-9]{8,40}}/:name", (c) => serve(c, `${c.req.param("folder")}/${c.req.param("sub")}/${c.req.param("name")}`));

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
