import { Badge } from "@/components/ui/badge";
import type { BusinessHours } from "@/lib/types";
import { isOpenNow } from "@/lib/hours";

export function OpenBadge({
  hours,
  openLabel,
  closedLabel,
  temporarilyClosed,
}: {
  hours: BusinessHours[];
  openLabel: string;
  closedLabel: string;
  temporarilyClosed?: boolean;
}) {
  const open = !temporarilyClosed && isOpenNow(hours);
  return <Badge variant={open ? "success" : "destructive"}>{open ? openLabel : closedLabel}</Badge>;
}
