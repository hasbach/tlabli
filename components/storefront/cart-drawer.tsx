"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "./cart-provider";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatMoney } from "@/lib/currency";
import { buildWhatsAppLink, buildWhatsAppOrderMessage } from "@/lib/whatsapp";
import { createOrder } from "@/lib/actions/order-actions";
import type { Currency } from "@/lib/types";

type OrderType = "delivery" | "pickup" | "table";

export function CartDrawer({
  restaurantId,
  restaurantName,
  whatsappNumber,
  currency,
}: {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string;
  currency: Currency;
}) {
  const { lines, subtotal, itemCount, updateQuantity, isOpen, setIsOpen, clear } = useCart();
  const { t } = useLocale();
  const [step, setStep] = useState<"cart" | "checkout" | "done">("cart");
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) setStep("cart");
  }

  async function handleSubmitOrder() {
    setSubmitting(true);
    const orderItems = lines.map((l) => ({
      itemId: l.itemId,
      title: l.title,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      addons: l.addons.map((a) => a.name),
    }));

    const message = buildWhatsAppOrderMessage(
      {
        items: orderItems,
        total: subtotal,
        currency,
        customerName: name || "Guest",
        customerPhone: phone,
        orderType,
        tableNumber,
        address,
      },
      restaurantName
    );

    // The wa.me link is today's real order record for the restaurant — it
    // must open even if the database write below fails, so a Supabase outage
    // never blocks a customer's order.
    const link = buildWhatsAppLink(whatsappNumber, message);
    if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");

    const result = await createOrder({
      restaurantId,
      customerName: name || "Guest",
      customerPhone: phone,
      orderType,
      tableNumber: orderType === "table" ? tableNumber : undefined,
      address: orderType === "delivery" ? address : undefined,
      items: orderItems,
      total: subtotal,
      currency,
    });
    setSubmitting(false);
    if ("data" in result) setPlacedOrderId(result.data.id);
    setStep("done");
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto scrollbar-thin">
        <SheetHeader>
          <SheetTitle>{step === "checkout" ? t("checkout") : t("yourCart")}</SheetTitle>
        </SheetHeader>

        {step === "cart" && (
          <div className="mt-4 flex flex-1 flex-col gap-4">
            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <ShoppingBag className="h-10 w-10 opacity-40" />
                <p className="text-sm">{t("emptyCart")}</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto scrollbar-thin">
                {lines.map((l) => (
                  <div key={l.key} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{l.title}</p>
                      {l.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground">+ {l.addons.map((a) => a.name).join(", ")}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border w-fit">
                        <button
                          type="button"
                          className="flex h-7 w-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={() => updateQuantity(l.key, l.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-4 text-center text-xs font-medium">{l.quantity}</span>
                        <button
                          type="button"
                          className="flex h-7 w-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={() => updateQuantity(l.key, l.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm font-semibold">
                        {formatMoney((l.unitPrice + l.addons.reduce((s, a) => s + a.extraPrice, 0)) * l.quantity, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(l.key, 0)}
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {lines.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>{t("subtotal")}</span>
                  <span>{formatMoney(subtotal, currency)}</span>
                </div>
                <Button size="lg" onClick={() => setStep("checkout")} className="w-full">
                  {t("checkout")}
                </Button>
              </>
            )}
          </div>
        )}

        {step === "checkout" && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <Label>{t("orderType")}</Label>
              <div className="flex gap-2">
                {(["delivery", "pickup", "table"] as OrderType[]).map((ot) => (
                  <button
                    key={ot}
                    type="button"
                    onClick={() => setOrderType(ot)}
                    className={`flex-1 cursor-pointer rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      orderType === ot ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    {t(ot === "delivery" ? "delivery" : ot === "pickup" ? "pickup" : "table")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="checkout-name">{t("name")}</Label>
              <Input id="checkout-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nour Abboud" />
            </div>
            <div>
              <Label htmlFor="checkout-phone">{t("phone")}</Label>
              <Input id="checkout-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 70 000 000" />
            </div>
            {orderType === "delivery" && (
              <div>
                <Label htmlFor="checkout-address">{t("address")}</Label>
                <Input id="checkout-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, area" />
              </div>
            )}
            {orderType === "table" && (
              <div>
                <Label htmlFor="checkout-table">{t("tableNumber")}</Label>
                <Input id="checkout-table" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="5" />
              </div>
            )}

            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>{t("subtotal")}</span>
              <span>{formatMoney(subtotal, currency)}</span>
            </div>

            <Button size="lg" onClick={handleSubmitOrder} disabled={!name || !phone || submitting} className="w-full">
              {submitting ? "Placing…" : t("placeOrder")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("previewNotice")}</p>
          </div>
        )}

        {step === "done" && (
          <div className="mt-8 flex flex-1 flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <ShoppingBag className="h-7 w-7 text-success" />
            </div>
            <p className="font-medium">{t("orderPlaced")}</p>
            {placedOrderId && (
              <a href={`/order/${placedOrderId}`} className="text-sm text-primary underline">
                Track your order
              </a>
            )}
            <Button
              variant="outline"
              onClick={() => {
                clear();
                setStep("cart");
                setPlacedOrderId(null);
                setIsOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
