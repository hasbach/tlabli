import type { BusinessHours } from "./types";

const DAY_ORDER: BusinessHours["day"][] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Pure function (no Date.now()) so it's safe in any rendering context —
 * pass in the current time explicitly (defaults to a fixed demo time when
 * omitted, since this repo has no live clock dependency yet).
 */
export function isOpenNow(hours: BusinessHours[], now: Date = new Date()): boolean {
  const day = DAY_ORDER[now.getDay()];
  const today = hours.find((h) => h.day === day);
  if (!today || today.closed) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = today.open.split(":").map(Number);
  const [closeH, closeM] = today.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;
  if (closeMinutes <= openMinutes) closeMinutes += 24 * 60; // crosses midnight
  return current >= openMinutes && current <= closeMinutes;
}

export function isItemInTimeWindow(availableFrom?: string, availableUntil?: string, now: Date = new Date()): boolean {
  if (!availableFrom || !availableUntil) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = availableFrom.split(":").map(Number);
  const [untilH, untilM] = availableUntil.split(":").map(Number);
  return current >= fromH * 60 + fromM && current <= untilH * 60 + untilM;
}
