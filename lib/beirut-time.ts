// -----------------------------------------------------------------------------
// This app serves exclusively Lebanese restaurants, so "today" / "this hour" /
// day-of-week bucketing for the dashboard must be computed in Beirut wall-clock
// time — never the server process's local timezone (typically UTC on most
// hosting platforms). Lebanon observes daylight saving time (UTC+2 in winter,
// UTC+3 in summer), so the offset is always derived from the Asia/Beirut zone
// for the instant in question — never a hard-coded number of hours.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const BEIRUT_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Beirut",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Beirut's UTC offset in ms at the instant `date` (+2h in winter, +3h in summer). */
export function beirutOffsetMs(date: Date): number {
  const p: Record<string, number> = {};
  for (const part of BEIRUT_PARTS.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * `date` shifted so its getUTC*() accessors read Beirut wall-clock values
 * (year, month, day, weekday, hour, minute).
 */
export function toBeirutWallClock(date: Date): Date {
  return new Date(date.getTime() + beirutOffsetMs(date));
}

/** Real UTC instant for Beirut midnight at the start of the given Beirut calendar date. */
function beirutMidnight(y: number, m: number, d: number, offsetHintMs: number): Date {
  const wallMidnight = Date.UTC(y, m, d);
  // The offset at midnight can differ from the hint on a DST-change day, so
  // re-read it at the first guess.
  const guess = new Date(wallMidnight - offsetHintMs);
  return new Date(wallMidnight - beirutOffsetMs(guess));
}

/** ISO instant for the start (00:00:00) of the Beirut calendar day containing `date`. */
export function beirutStartOfDay(date: Date): Date {
  const offset = beirutOffsetMs(date);
  const shifted = new Date(date.getTime() + offset);
  return beirutMidnight(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), offset);
}

/**
 * Start-of-day instant `daysAgo` Beirut calendar days before `now`. Passing
 * `daysAgo: 6` together with "now" gives a window covering exactly 7 distinct
 * calendar days (today and the 6 preceding it), avoiding a partial 8th day.
 */
export function beirutStartOfDaysAgo(daysAgo: number, now: Date = new Date()): Date {
  // Step back from Beirut noon so a 23h/25h DST-change day can't skip or repeat a date.
  const noonToday = beirutStartOfDay(now).getTime() + DAY_MS / 2;
  return beirutStartOfDay(new Date(noonToday - daysAgo * DAY_MS));
}

/** ISO instant for the start (00:00:00, day 1) of the Beirut calendar month containing `date`. */
export function beirutStartOfMonth(date: Date): Date {
  const offset = beirutOffsetMs(date);
  const shifted = new Date(date.getTime() + offset);
  return beirutMidnight(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1, offset);
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
