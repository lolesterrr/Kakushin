const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 6-digit numeric code, uniformly random. */
export function randomCode(): string {
  const a = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return String(a % 1_000_000).padStart(6, "0");
}

export function newId(): string {
  // time-sortable id: 10 hex chars of ms timestamp + 12 random hex chars
  const t = Date.now().toString(16).padStart(12, "0");
  const r = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return t + r;
}
