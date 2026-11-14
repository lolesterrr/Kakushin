const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (ms: number | null | undefined) => {
  if (!ms) return "Not set";
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const teamSize = (min: number, max: number) => (min === max ? `${min}` : `${min} to ${max}`);
export const daysLeft = (ms: number | null) => (ms ? Math.ceil((ms - Date.now()) / 86400000) : null);
export const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** "1:04:09" or "12:09" for a span of time. */
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** When a global event happens, in a few words: "3 Feb 2027 to 5 Feb 2027", or its deadline when it has no dates. */
export function eventWhen(e: { starts_at: number | null; ends_at: number | null; deadline_at: number | null }): string {
  if (e.starts_at && e.ends_at && fmtDate(e.ends_at) !== fmtDate(e.starts_at)) return `${fmtDate(e.starts_at)} to ${fmtDate(e.ends_at)}`;
  if (e.starts_at) return fmtDate(e.starts_at);
  return e.deadline_at ? `Closes ${fmtDate(e.deadline_at)}` : "";
}
