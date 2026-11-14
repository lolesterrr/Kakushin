/**
 * Media helpers shared by pitches, project pages and recaps.
 * Every piece of media is optional: callers get null or an empty list, never an error, when something is missing.
 */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The YouTube video id in a watch, share, shorts, live or embed link, or null for anything else. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = u.pathname.split("/");
    if (first === "watch") id = u.searchParams.get("v");
    else if (first === "embed" || first === "shorts" || first === "live" || first === "v") id = second ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** A privacy-friendly embed address, or null when the link is not a YouTube video. */
export function youtubeEmbed(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export const MAX_PITCH_IMAGES = 6;
export const MAX_RECAP_PHOTOS = 60;
export const MAX_PHOTOS_PER_PERSON = 3;
export const MEDIA_BYTES = 3 * 1024 * 1024;

/** Public address of a stored image. */
export const fileUrl = (key: string) => `/api/files/${key}`;

/** Captions arrive URI-encoded in a header (headers cannot carry most non-Latin text). Bad input becomes an empty caption. */
export function headerCaption(v: string | undefined): string {
  if (!v) return "";
  try { return decodeURIComponent(v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120); } catch { return ""; }
}
