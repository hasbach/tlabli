import type { BusinessHours } from "./types";
import { BEIRUT_OFFSET_MS } from "./beirut-time";

const DAY_ORDER: BusinessHours["day"][] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Beirut wall-clock day-of-week and minutes-since-midnight for `date` — this
 * app serves exclusively Lebanese restaurants, so "what day/hour is it right
 * now" must never be read from the server process's local timezone (typically
 * UTC on Vercel and most hosts). Same fixed +3h shift as lib/beirut-time.ts.
 */
function beirutDayAndMinutes(date: Date): { day: BusinessHours["day"]; minutes: number } {
  const shifted = new Date(date.getTime() + BEIRUT_OFFSET_MS);
  return {
    day: DAY_ORDER[shifted.getUTCDay()],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Pure function (no Date.now()) so it's safe in any rendering context —
 * pass in the current time explicitly (defaults to a fixed demo time when
 * omitted, since this repo has no live clock dependency yet).
 */
export function isOpenNow(hours: BusinessHours[], now: Date = new Date()): boolean {
  const { day, minutes: current } = beirutDayAndMinutes(now);
  const today = hours.find((h) => h.day === day);
  if (!today || today.closed) return false;
  const [openH, openM] = today.open.split(":").map(Number);
  const [closeH, closeM] = today.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;
  if (closeMinutes <= openMinutes) closeMinutes += 24 * 60; // crosses midnight
  return current >= openMinutes && current <= closeMinutes;
}

export function isItemInTimeWindow(availableFrom?: string, availableUntil?: string, now: Date = new Date()): boolean {
  if (!availableFrom || !availableUntil) return true;
  const { minutes: current } = beirutDayAndMinutes(now);
  const [fromH, fromM] = availableFrom.split(":").map(Number);
  const [untilH, untilM] = availableUntil.split(":").map(Number);
  return current >= fromH * 60 + fromM && current <= untilH * 60 + untilM;
}
