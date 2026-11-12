import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ user: null });
  const full = await c.env.DB.prepare(
    "SELECT id, email, name, bio, institution, location, skills, links, gender, is_platform_admin FROM users WHERE id = ?",
  ).bind(u.id).first<Record<string, unknown>>();
  return c.json({
    user: { ...full, skills: JSON.parse(String(full?.skills ?? "[]")), links: JSON.parse(String(full?.links ?? "{}")) },
  });
});

const profile = z.object({
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).default(""),
  institution: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  skills: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  // Only web addresses: z.string().url() alone would let javascript: and data: links through.
  links: z.record(z.string().trim().max(300).url().regex(/^https?:\/\/[^\s/]/i, "Links must start with http:// or https://")).refine((l) => Object.keys(l).length <= 10).optional(),
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable().optional(),
});

me.put("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Not signed in" }, 401);
  const parsed = profile.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the profile fields", issues: parsed.error.issues }, 400);
  const p = parsed.data;
  // links and gender are kept as they are unless the request sends them, so a form without those fields cannot wipe them.
  await c.env.DB.prepare(
    `UPDATE users SET name=?, bio=?, institution=?, location=?, skills=?,
       links = CASE WHEN ? THEN ? ELSE links END,
       gender = CASE WHEN ? THEN ? ELSE gender END
     WHERE id=?`,
  ).bind(
    p.name, p.bio, p.institution, p.location, JSON.stringify(p.skills),
    p.links !== undefined ? 1 : 0, JSON.stringify(p.links ?? {}),
    p.gender !== undefined ? 1 : 0, p.gender ?? null,
    u.id,
  ).run();
  return c.json({ ok: true });
});
