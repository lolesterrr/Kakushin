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
  links: z.record(z.string().url().max(300)).default({}),
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable().default(null),
});

me.put("/", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Not signed in" }, 401);
  const parsed = profile.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the profile fields", issues: parsed.error.issues }, 400);
  const p = parsed.data;
  await c.env.DB.prepare(
    "UPDATE users SET name=?, bio=?, institution=?, location=?, skills=?, links=?, gender=? WHERE id=?",
  ).bind(p.name, p.bio, p.institution, p.location, JSON.stringify(p.skills), JSON.stringify(p.links), p.gender, u.id).run();
  return c.json({ ok: true });
});
