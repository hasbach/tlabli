"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Order } from "@/lib/types";
import { formatMoney } from "@/lib/currency";

export type PrintRole = "pos" | "kitchen" | "bar";

export interface PrintJob {
  order: Order;
  role: PrintRole;
  restaurantName: string;
}

const ROLE_HEADING: Record<PrintRole, string | null> = {
  pos: null,
  kitchen: "KITCHEN TICKET",
  bar: "BAR TICKET",
};

function fulfillmentLine(order: Order): string {
  if (order.orderType === "table") return `Table ${order.tableNumber ?? "-"}`;
  if (order.orderType === "delivery") return order.address ?? "Delivery";
  return "Pickup";
}

export function PrintTicket({ job, onDone }: { job: PrintJob | null; onDone: () => void }) {
  useEffect(() => {
    if (!job) return;
    document.body.classList.add("printing-ticket");
    window.addEventListener("afterprint", onDone);
    window.print();
    const fallback = setTimeout(onDone, 5000);
    return () => {
      document.body.classList.remove("printing-ticket");
      window.removeEventListener("afterprint", onDone);
      clearTimeout(fallback);
    };
  }, [job, onDone]);

  if (!job || typeof document === "undefined") return null;

  const { order, role, restaurantName } = job;
  const heading = ROLE_HEADING[role];
  const showPrices = role === "pos";
  const itemsSubtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const addonsTotal = order.total - itemsSubtotal;

  return createPortal(
    <div id="print-ticket" className="font-mono text-xs leading-relaxed text-black">
      <p className="text-center text-sm font-bold">{restaurantName}</p>
      {heading && <p className="text-center font-bold">{heading}</p>}
      <p>
        Order #{order.queueNumber} — {fulfillmentLine(order)}
      </p>
      <hr className="my-1 border-black" />
      {order.items.map((item, idx) => (
        <div key={idx}>
          <div className="flex justify-between gap-2">
            <span>
              {item.quantity}x {item.title}
            </span>
            {showPrices && <span>{formatMoney(item.unitPrice * item.quantity, order.currency)}</span>}
          </div>
          {item.addons.length > 0 && <p className="pl-3">+ {item.addons.join(", ")}</p>}
        </div>
      ))}
      <hr className="my-1 border-black" />
      {showPrices && (
        <>
          {addonsTotal > 0.005 && (
            <div className="flex justify-between">
              <span>Add-ons</span>
              <span>{formatMoney(addonsTotal, order.currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
          <p>
            {order.customerName} — {order.customerPhone}
          </p>
        </>
      )}
      <p>{new Date(order.createdAt).toLocaleString()}</p>
    </div>,
    document.body
  );
}
