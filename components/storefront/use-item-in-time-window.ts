"use client";

import { useEffect, useState } from "react";
import { isItemInTimeWindow } from "@/lib/hours";

/**
 * Whether a scheduled item is inside its availability window right now
 * (Beirut time). Re-checked every 30s so a menu left open on a phone flips
 * when the window starts or ends. Always true for items with no window.
 */
export function useItemInTimeWindow(availableFrom?: string, availableUntil?: string): boolean {
  const [inWindow, setInWindow] = useState(() => isItemInTimeWindow(availableFrom, availableUntil));

  useEffect(() => {
    const check = () => setInWindow(isItemInTimeWindow(availableFrom, availableUntil));
    check();
    if (!availableFrom || !availableUntil) return;
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [availableFrom, availableUntil]);

  return inWindow;
}
