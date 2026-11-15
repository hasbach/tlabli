import type { BusinessHours } from "./types";
import { toBeirutWallClock } from "./beirut-time";

const DAY_ORDER: BusinessHours["day"][] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Beirut wall-clock day-of-week and minutes-since-midnight for `date` — this
 * app serves exclusively Lebanese restaurants, so "what day/hour is it right
 * now" must never be read from the server process's local timezone (typically
 * UTC on Vercel and most hosts). DST-aware via lib/beirut-time.ts.
 */
function beirutDayAndMinutes(date: Date): { dayIndex: number; minutes: number } {
  const shifted = toBeirutWallClock(date);
  return {
    dayIndex: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Whether the restaurant is open at `now` (defaults to the current time), in Beirut time. */
export function isOpenNow(hours: BusinessHours[], now: Date = new Date()): boolean {
  const { dayIndex, minutes: current } = beirutDayAndMinutes(now);
  const today = hours.find((h) => h.day === DAY_ORDER[dayIndex]);
  const yesterday = hours.find((h) => h.day === DAY_ORDER[(dayIndex + 6) % 7]);

  if (today && !today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    // close <= open means the shift runs past midnight into tomorrow.
    if (close <= open ? current >= open : current >= open && current <= close) return true;
  }
  // Still inside yesterday's shift that ran past midnight (e.g. 18:00–02:00).
  if (yesterday && !yesterday.closed) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (close <= open && current <= close) return true;
  }
  return false;
}

export function isItemInTimeWindow(availableFrom?: string, availableUntil?: string, now: Date = new Date()): boolean {
  if (!availableFrom || !availableUntil) return true;
  const { minutes: current } = beirutDayAndMinutes(now);
  const [fromH, fromM] = availableFrom.split(":").map(Number);
  const [untilH, untilM] = availableUntil.split(":").map(Number);
  return current >= fromH * 60 + fromM && current <= untilH * 60 + untilM;
}
