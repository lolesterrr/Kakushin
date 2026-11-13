import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { loadOrg } from "../lib/access";
import { sendEmail } from "../lib/email";
import { pushLater } from "../lib/push";
import { audit } from "../lib/audit";

/** Organisation admins: list, invite by email, remove. Mounted under /api/orgs. */
export const orgMembers = new Hono<AppEnv>();

async function adminOrg(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) return { err: c.json({ error: "Not signed in" }, 401) };
  const a = await loadOrg(c, c.req.param("slug")!);
  if (!a) return { err: c.json({ error: "Not found" }, 404) };
  if (!a.role) return { err: c.json({ error: "Only organisation admins can do that" }, 403) };
  return { org: a.org, role: a.role, user };
}

orgMembers.get("/:slug/members", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  const { results: members } = await c.env.DB.prepare(
    "SELECT u.id, u.email, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.role = 'owner' DESC, u.email",
  ).bind(x.org.id).all();
  const { results: invites } = await c.env.DB.prepare("SELECT email, invited_at FROM org_invites WHERE org_id = ? ORDER BY invited_at").bind(x.org.id).all();
  return c.json({ members, invites, you: x.user.id, your_role: x.role });
});

orgMembers.post("/:slug/members", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid email address" }, 400);
  const email = parsed.data.email;
  const n = (await c.env.DB.prepare("SELECT (SELECT COUNT(*) FROM memberships WHERE org_id = ?1) + (SELECT COUNT(*) FROM org_invites WHERE org_id = ?1) AS n").bind(x.org.id).first<{ n: number }>())?.n ?? 0;
  if (n >= 20) return c.json({ error: "An organisation can have up to 20 admins" }, 409);

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  let added = false;
  if (existing) {
    const r = await c.env.DB.prepare("INSERT OR IGNORE INTO memberships (org_id, user_id, role) VALUES (?, ?, 'admin')").bind(x.org.id, existing.id).run();
    added = !!r.meta.changes;
    if (added) await c.env.DB.prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (lower(hex(randomblob(12))), ?, 'org.added', ?, ?, ?, ?)")
      .bind(existing.id, `You are now an admin of ${x.org.name}`, "Open the organiser area to manage its challenges.", `/admin/o/${x.org.slug}`, Date.now()).run();
    if (added) pushLater(c);
  } else {
    // No account yet: the invite turns into a membership the first time they sign in with this email.
    const r = await c.env.DB.prepare("INSERT OR IGNORE INTO org_invites (org_id, email, role, invited_at) VALUES (?, ?, 'admin', ?)").bind(x.org.id, email, Date.now()).run();
    added = !!r.meta.changes;
  }
  if (added) {
    const url = `${c.env.APP_URL}/admin/o/${x.org.slug}`;
    const text = `You have been added as an admin of ${x.org.name} on Kakushin.\n\nSign in with this email address to manage its challenges:\n${url}`;
    const html = `<p>You have been added as an admin of <b>${x.org.name.replace(/</g, "&lt;")}</b> on Kakushin.</p><p><a href="${url}">Open the organiser area</a></p>`;
    c.executionCtx.waitUntil(sendEmail(c.env, email, `You are an admin of ${x.org.name}`, html, text).catch((e) => console.error(`admin invite email failed: ${e instanceof Error ? e.message : e}`)));
  }
  return c.json({ ok: true, added, pending: !existing });
});

orgMembers.delete("/:slug/members/:userId", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  const target = await c.env.DB.prepare("SELECT role FROM memberships WHERE org_id = ? AND user_id = ?").bind(x.org.id, c.req.param("userId")).first<{ role: string }>();
  if (!target) return c.json({ error: "Not found" }, 404);
  if (target.role === "owner") return c.json({ error: "The owner cannot be removed" }, 409);
  if (x.role !== "owner" && c.req.param("userId") !== x.user.id) return c.json({ error: "Only the owner can remove other admins" }, 403);
  await c.env.DB.prepare("DELETE FROM memberships WHERE org_id = ? AND user_id = ?").bind(x.org.id, c.req.param("userId")).run();
  return c.json({ ok: true });
});

orgMembers.delete("/:slug/invites", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  const parsed = z.object({ email: z.string().trim().toLowerCase() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Check the request" }, 400);
  await c.env.DB.prepare("DELETE FROM org_invites WHERE org_id = ? AND email = ?").bind(x.org.id, parsed.data.email).run();
  return c.json({ ok: true });
});

/** The owner hands the owner role to another admin and stays on as an admin. */
orgMembers.post("/:slug/owner", async (c) => {
  const x = await adminOrg(c); if ("err" in x) return x.err;
  if (x.role !== "owner") return c.json({ error: "Only the owner can hand over the organisation" }, 403);
  const parsed = z.object({ user_id: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick the admin who becomes the owner" }, 400);
  if (parsed.data.user_id === x.user.id) return c.json({ error: "You are already the owner" }, 400);
  const target = await c.env.DB.prepare("SELECT u.name, u.email, u.suspended FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.user_id = ? AND m.role = 'admin'")
    .bind(x.org.id, parsed.data.user_id).first<{ name: string | null; email: string; suspended: number }>();
  if (!target) return c.json({ error: "Only an existing admin of this organisation can become its owner" }, 404);
  if (target.suspended) return c.json({ error: "That account is suspended" }, 409);
  // Both rows change in one batch, so the organisation always has exactly one owner.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE memberships SET role = 'owner' WHERE org_id = ? AND user_id = ? AND role = 'admin'").bind(x.org.id, parsed.data.user_id),
    c.env.DB.prepare("UPDATE memberships SET role = 'admin' WHERE org_id = ? AND user_id = ? AND role = 'owner'").bind(x.org.id, x.user.id),
    c.env.DB.prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (lower(hex(randomblob(12))), ?, 'org.owner', ?, ?, ?, ?)")
      .bind(parsed.data.user_id, `You are now the owner of ${x.org.name}`, `${x.user.name || x.user.email} handed the organisation over to you.`, `/admin/o/${x.org.slug}`, Date.now()),
  ]);
  await audit(c, "org.owner_transferred", "organization", x.org.slug, `to ${target.email}`);
  pushLater(c);
  return c.json({ ok: true });
});
