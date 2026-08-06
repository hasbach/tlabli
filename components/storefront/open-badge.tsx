import { Badge } from "@/components/ui/badge";
import type { BusinessHours } from "@/lib/types";
import { isOpenNow } from "@/lib/hours";

export function OpenBadge({ hours, openLabel, closedLabel }: { hours: BusinessHours[]; openLabel: string; closedLabel: string }) {
  const open = isOpenNow(hours);
  return <Badge variant={open ? "success" : "destructive"}>{open ? openLabel : closedLabel}</Badge>;
}
