const MIN = 60_000;
const HOUR = 60 * MIN;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Short, email-style relative time: "just now", "5 min ago", "3 h ago",
 * "yesterday", "Nov 20", "Jan 5, 2025". Uses the local calendar for days.
 */
export function formatRelative(ms: number, nowMs: number): string {
  const diff = nowMs - ms;
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;

  const then = new Date(ms);
  const now = new Date(nowMs);
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay || diff < 12 * HOUR) return `${Math.floor(diff / HOUR)} h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "yesterday";

  const date = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return then.getFullYear() === now.getFullYear() ? date : `${date}, ${then.getFullYear()}`;
}

/** Full local timestamp for tooltips. */
export function formatFull(ms: number): string {
  return new Date(ms).toLocaleString();
}
