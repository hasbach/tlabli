import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/types";

const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Received",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "success" | "destructive" | "muted"> = {
  received: "secondary",
  preparing: "default",
  out_for_delivery: "default",
  ready_for_pickup: "success",
  completed: "muted",
  cancelled: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const ORDER_STATUS_FLOW: OrderStatus[] = ["received", "preparing", "out_for_delivery", "completed"];

export function nextStatus(current: OrderStatus): OrderStatus {
  const idx = ORDER_STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return current;
  return ORDER_STATUS_FLOW[idx + 1];
}
