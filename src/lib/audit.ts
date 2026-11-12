import type { Context } from "hono";
import type { AppEnv } from "../types";
import { newId } from "./crypto";

/** Records something a platform admin did, for disputes later. */
export async function audit(c: Context<AppEnv>, action: string, targetType: string, targetId: string, detail = "") {
  const u = c.get("user");
  if (!u) return;
  await c.env.DB.prepare("INSERT INTO audit_log (id, actor_user_id, actor_email, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), u.id, u.email, action, targetType, targetId, detail.slice(0, 500), Date.now()).run();
}
