const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (ms: number | null | undefined) => {
  if (!ms) return "Not set";
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const teamSize = (min: number, max: number) => (min === max ? `${min}` : `${min} to ${max}`);
export const daysLeft = (ms: number | null) => (ms ? Math.ceil((ms - Date.now()) / 86400000) : null);
