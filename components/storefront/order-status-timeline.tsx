import { Check, Package, ChefHat, Truck, PartyPopper } from "lucide-react";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: { key: Order["status"]; label: string; icon: typeof Check }[] = [
  { key: "received", label: "Order received", icon: Package },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "out_for_delivery", label: "On the way", icon: Truck },
  { key: "completed", label: "Delivered", icon: PartyPopper },
];

export function OrderStatusTimeline({ status }: { status: Order["status"] }) {
  const stepOrder = ["received", "preparing", "out_for_delivery", "ready_for_pickup", "completed"];
  const currentIndex = stepOrder.indexOf(status);

  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((step, idx) => {
        const stepIndex = stepOrder.indexOf(step.key);
        const done = stepIndex <= currentIndex;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                  done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? <Check className="h-5 w-5" /> : <step.icon className="h-4 w-4" />}
              </div>
              {!isLast && <div className={cn("h-10 w-0.5", done ? "bg-primary" : "bg-border")} />}
            </div>
            <div className="pb-8 pt-1.5">
              <p className={cn("font-semibold", done ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
