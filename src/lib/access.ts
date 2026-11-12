import type { Context } from "hono";
import type { AppEnv } from "../types";

export interface OrgRow {
  id: string; slug: string; name: string; type: string;
  logo_key: string | null; website: string | null; plan: string; created_at: number; verified: number; suspended: number;
}
export type OrgRole = "owner" | "admin";

/** Loads an org by slug and the signed-in user's role in it (null when not a member). */
export async function loadOrg(c: Context<AppEnv>, slug: string): Promise<{ org: OrgRow; role: OrgRole | null } | null> {
  const org = await c.env.DB.prepare("SELECT * FROM organizations WHERE slug = ?").bind(slug).first<OrgRow>();
  if (!org) return null;
  const user = c.get("user");
  let role: OrgRole | null = null;
  if (user) {
    const m = await c.env.DB.prepare("SELECT role FROM memberships WHERE org_id = ? AND user_id = ?")
      .bind(org.id, user.id).first<{ role: OrgRole }>();
    role = m?.role ?? null;
  }
  // A suspended organisation disappears for everyone except its own members and platform admins.
  if (org.suspended && !role && !user?.is_platform_admin) return null;
  return { org, role };
}

export const fileUrl = (key: string | null) => (key ? `/api/files/${key}` : null);
