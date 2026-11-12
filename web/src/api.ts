export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Sends an image file as the raw request body (the API reads the Content-Type). */
export async function uploadImage<T = unknown>(path: string, file: File): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "PUT", headers: { "Content-Type": file.type }, body: file, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
  return data as T;
}

/** Same as uploadImage, but also sends the original file name (used for pitch decks). */
export async function uploadFile<T = unknown>(path: string, file: File): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "PUT", headers: { "Content-Type": file.type, "X-File-Name": file.name }, body: file, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
  return data as T;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (ms: number | null) => {
  if (!ms) return "Not set";
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const dayMonth = (ms: number | null) => (ms ? { day: String(new Date(ms).getDate()), month: MONTHS[new Date(ms).getMonth()]!.toUpperCase() } : null);

/** <input type="datetime-local"> works in local time without a zone. */
export const toLocalInput = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);
