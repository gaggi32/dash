/** Local-time date helpers. We store dates as `YYYY-MM-DD` (no timezone). */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** ISO date `days` days from today (negative goes backwards). */
export function daysFromTodayISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/**
 * ISO date of the Sunday that ends next week (weeks run Monday to Sunday), so
 * "next week" covers what is left of this week and the whole of the next one.
 * On a Monday that is 13 days ahead; on a Sunday, 7.
 */
export function endOfNextWeekISO(now: Date = new Date()): string {
  const d = new Date(now);
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday + 7);
  return toISODate(d);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Short, human label for a stored date, with relative hints for near dates. */
export function formatDue(s: string | null): string {
  if (!s) return "";
  const d = parseISODate(s);
  const today = new Date();
  const diffDays = Math.round(
    (parseISODate(toISODate(d)).getTime() -
      parseISODate(toISODate(today)).getTime()) /
      86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** True if the date is in the past (before today). */
export function isOverdue(s: string | null): boolean {
  if (!s) return false;
  return s < todayISO();
}
