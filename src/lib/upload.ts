import type { Context } from "hono";
import type { AppEnv } from "../types";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Checks the first bytes so a file cannot claim to be an image and be something else. */
function looksLike(type: string, b: Uint8Array): boolean {
  if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp") return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

export type UploadResult = { ok: true; key: string } | { ok: false; error: string };

/** Stores a raw image request body in R2 under a random key. SVG is refused on purpose (script risk). */
export async function saveImage(c: Context<AppEnv>, prefix: string, maxBytes: number): Promise<UploadResult> {
  const type = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return { ok: false, error: "Use a PNG, JPEG or WebP image" };
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > maxBytes) return { ok: false, error: `Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` };
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > maxBytes) {
    return { ok: false, error: `Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` };
  }
  if (!looksLike(type, new Uint8Array(body, 0, Math.min(16, body.byteLength)))) {
    return { ok: false, error: "That file is not a valid image" };
  }
  const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const key = `${prefix}/${rand}.${ext}`;
  await c.env.FILES.put(key, body, { httpMetadata: { contentType: type } });
  return { ok: true, key };
}
