import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { newId } from "../lib/crypto";
import { RESERVED_SLUGS, SLUG_RE, slugify } from "../lib/slug";
import { ORG_TYPES } from "../lib/topics";
import { fileUrl, loadOrg, type OrgRow } from "../lib/access";
import { saveImage } from "../lib/upload";
import { challengeOut, orgChallenges } from "./challenges";
import { orgTeams } from "./teams";
import { orgApplications } from "./applications";
import { orgJudging } from "./judging";
import { orgResults } from "./results";
import { orgAnnouncements } from "./announcements";
import { orgMembers } from "./members";
import { orgMessages } from "./messages";

export const orgs = new Hono<AppEnv>();
const MAX_ORGS_PER_USER = 5;

const orgOut = (o: OrgRow) => ({
  id: o.id, slug: o.slug, name: o.name, type: o.type, website: o.website, logo_url: fileUrl(o.logo_key), created_at: o.created_at,
});

const website = z
  .string().trim().max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), { message: "Website must start with http:// or https://" })
  .transform((v) => (v === "" ? null : v));

const createBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().optional(),
  type: z.enum(ORG_TYPES).default("other"),
  website: website.optional(),
});

orgs.get("/mine", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = ? ORDER BY o.created_at DESC`,
  ).bind(user.id).all<OrgRow & { role: string }>();
  return c.json({ orgs: results.map((o) => ({ ...orgOut(o), role: o.role })) });
});

orgs.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the organisation details" }, 400);
  const { name, type } = parsed.data;
  const slug = parsed.data.slug || slugify(name);
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    return c.json({ error: "Web address must be 3 to 40 letters, numbers or dashes, and not a reserved word" }, 400);
  }
  const owned = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE user_id = ? AND role = 'owner'")
    .bind(user.id).first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_ORGS_PER_USER) return c.json({ error: `You can own up to ${MAX_ORGS_PER_USER} organisations` }, 409);

  const id = newId();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO organizations (id, slug, name, type, website, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, slug, name, type, parsed.data.website ?? null, Date.now()),
      c.env.DB.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'owner')").bind(id, user.id),
    ]);
  } catch {
    return c.json({ error: "That web address is already taken" }, 409);
  }
  return c.json({ ok: true, slug }, 201);
});

// Public org page. Drafts are only included for the organisation's own admins.
orgs.get("/:slug", async (c) => {
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  const { org, role } = access;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM challenges WHERE org_id = ? ${role ? "" : "AND status != 'draft'"} ORDER BY created_at DESC`,
  ).bind(org.id).all<Parameters<typeof challengeOut>[0]>();
  return c.json({ org: orgOut(org), role, challenges: results.map((r) => challengeOut(r, org)) });
});

orgs.put("/:slug", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const parsed = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(ORG_TYPES), website })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Check the organisation details" }, 400);
  await c.env.DB.prepare("UPDATE organizations SET name = ?, type = ?, website = ? WHERE id = ?")
    .bind(parsed.data.name, parsed.data.type, parsed.data.website, access.org.id).run();
  return c.json({ ok: true });
});

orgs.put("/:slug/logo", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  const saved = await saveImage(c, "logos", 2 * 1024 * 1024);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  // A new logo makes the old print copy wrong, so it goes too; the web app sends a fresh one straight after.
  await c.env.DB.prepare("UPDATE organizations SET logo_key = ?, logo_print_key = NULL WHERE id = ?").bind(saved.key, access.org.id).run();
  const old = [access.org.logo_key, access.org.logo_print_key].filter((k): k is string => !!k);
  if (old.length) await c.env.FILES.delete(old);
  return c.json({ ok: true, logo_url: fileUrl(saved.key) });
});

/** The JPEG copy of the logo that certificates print (see migrations/0010_logo_print.sql). */
orgs.put("/:slug/logo/print", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not signed in" }, 401);
  const access = await loadOrg(c, c.req.param("slug"));
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!access.role) return c.json({ error: "Only organisation admins can do that" }, 403);
  if ((c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase() !== "image/jpeg") return c.json({ error: "Send a JPEG" }, 400);
  const saved = await saveImage(c, "logos", 300 * 1024);
  if (!saved.ok) return c.json({ error: saved.error }, 400);
  await c.env.DB.prepare("UPDATE organizations SET logo_print_key = ? WHERE id = ?").bind(saved.key, access.org.id).run();
  if (access.org.logo_print_key) await c.env.FILES.delete(access.org.logo_print_key);
  return c.json({ ok: true });
});

orgs.route("/", orgChallenges);
orgs.route("/", orgTeams);
orgs.route("/", orgApplications);
orgs.route("/", orgJudging);
orgs.route("/", orgResults);
orgs.route("/", orgAnnouncements);
orgs.route("/", orgMembers);
orgs.route("/", orgMessages);
