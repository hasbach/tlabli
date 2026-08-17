// -----------------------------------------------------------------------------
// This app serves exclusively Lebanese restaurants, so "today" / "this hour" /
// day-of-week bucketing for the dashboard must be computed in Beirut wall-clock
// time — never the server process's local timezone (typically UTC on most
// hosting platforms). Lebanon has used a fixed UTC+3 offset with no DST since
// 2022, so a simple fixed-offset shift is sufficient for date-boundary math;
// weekday/hour *labels* use Intl with an explicit Asia/Beirut timeZone so the
// display strings are unambiguous even if that assumption ever changes.
// -----------------------------------------------------------------------------

const BEIRUT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO instant for the start (00:00:00) of the Beirut calendar day containing `date`. */
export function beirutStartOfDay(date: Date): Date {
  const shifted = new Date(date.getTime() + BEIRUT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  // Midnight Beirut time, expressed as the equivalent real UTC instant.
  return new Date(Date.UTC(y, m, d) - BEIRUT_OFFSET_MS);
}

/**
 * Start-of-day instant `daysAgo` Beirut calendar days before `now`. Passing
 * `daysAgo: 6` together with "now" gives a window covering exactly 7 distinct
 * calendar days (today and the 6 preceding it), avoiding a partial 8th day.
 */
export function beirutStartOfDaysAgo(daysAgo: number, now: Date = new Date()): Date {
  return new Date(beirutStartOfDay(now).getTime() - daysAgo * DAY_MS);
}

/** ISO instant for the start (00:00:00, day 1) of the Beirut calendar month containing `date`. */
export function beirutStartOfMonth(date: Date): Date {
  const shifted = new Date(date.getTime() + BEIRUT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - BEIRUT_OFFSET_MS);
}

/** Short weekday label ("Mon", "Tue", ...) for `date`, using the Beirut calendar day. */
export function beirutWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", weekday: "short" }).format(date);
}

/** Hour label ("3pm", "12am", ...) for `date`, using the Beirut local hour. */
export function beirutHourLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", hour: "numeric" })
    .format(date)
    .toLowerCase()
    .replace(" ", "");
}
