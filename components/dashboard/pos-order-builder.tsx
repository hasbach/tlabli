"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Printer, ShoppingCart, Trash2 } from "lucide-react";
import type { Currency, ItemAddon, MenuCategory, MenuItem, OrderLineItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/currency";
import { createOrder } from "@/lib/actions/order-actions";
import { PrintTicket } from "./print-ticket";
import type { PrintJob, PrintRole } from "./print-ticket";

type OrderType = "table" | "pickup" | "delivery";

interface CartLine {
  key: string; // itemId + sorted addon ids, so the same dish with different add-ons gets its own line
  itemId: string;
  title: string;
  unitPrice: number;
  quantity: number;
  addons: { id: string; name: string; extraPrice: number }[];
}

export function PosOrderBuilder({
  restaurantId,
  restaurantName,
  currency,
  categories,
  items,
  posPrinterEnabled,
  kitchenPrinterEnabled,
  barPrinterEnabled,
  receiptWidthMm,
}: {
  restaurantId: string;
  restaurantName: string;
  currency: Currency;
  categories: MenuCategory[];
  items: MenuItem[];
  posPrinterEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  barPrinterEnabled: boolean;
  receiptWidthMm: number;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0]?.id ?? "");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [addonItem, setAddonItem] = useState<MenuItem | null>(null);
  const [pendingAddonIds, setPendingAddonIds] = useState<string[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("table");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; queueNumber: number } | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  const visibleItems = useMemo(
    () => items.filter((i) => i.categoryId === activeCategoryId && i.isAvailable),
    [items, activeCategoryId]
  );

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, l) => sum + (l.unitPrice + l.addons.reduce((s, a) => s + a.extraPrice, 0)) * l.quantity, 0),
    [lines]
  );
  const itemCount = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);

  function addLine(item: MenuItem, addons: ItemAddon[]) {
    const key = [item.id, ...addons.map((a) => a.id).slice().sort()].join("|");
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key, itemId: item.id, title: item.title, unitPrice: item.price, quantity: 1, addons }];
    });
  }

  function handleItemTap(item: MenuItem) {
    if (item.addons.length > 0) {
      setAddonItem(item);
      setPendingAddonIds([]);
      return;
    }
    addLine(item, []);
  }

  function toggleAddon(id: string) {
    setPendingAddonIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function confirmAddons() {
    if (!addonItem) return;
    addLine(addonItem, addonItem.addons.filter((a) => pendingAddonIds.includes(a.id)));
    setAddonItem(null);
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  }

  function resetForNextOrder() {
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setTableNumber("");
    setAddress("");
    setPlacedOrder(null);
    setError(null);
  }

  async function handlePlaceOrder() {
    setSubmitting(true);
    setError(null);
    const orderItems: OrderLineItem[] = lines.map((l) => ({
      itemId: l.itemId,
      title: l.title,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      addons: l.addons.map((a) => a.name),
    }));

    const result = await createOrder({
      restaurantId,
      customerName: customerName || "Walk-in",
      customerPhone,
      orderType,
      tableNumber: orderType === "table" ? tableNumber : undefined,
      address: orderType === "delivery" ? address : undefined,
      items: orderItems,
      total: subtotal,
      currency,
    });

    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPlacedOrder({ id: result.data.id, queueNumber: result.data.queueNumber });
  }

  const printRoles: { role: PrintRole; label: string; enabled: boolean }[] = [
    { role: "pos", label: "Receipt", enabled: posPrinterEnabled },
    { role: "kitchen", label: "Kitchen", enabled: kitchenPrinterEnabled },
    { role: "bar", label: "Bar", enabled: barPrinterEnabled },
  ];

  function print(role: PrintRole) {
    if (!placedOrder) return;
    setPrintJob({
      order: {
        id: placedOrder.id,
        queueNumber: placedOrder.queueNumber,
        restaurantId,
        customerName: customerName || "Walk-in",
        customerPhone,
        orderType,
        tableNumber: orderType === "table" ? tableNumber : undefined,
        address: orderType === "delivery" ? address : undefined,
        items: lines.map((l) => ({
          itemId: l.itemId,
          title: l.title,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          addons: l.addons.map((a) => a.name),
        })),
        total: subtotal,
        currency,
        status: "received",
        createdAt: new Date().toISOString(),
      },
      role,
      restaurantName,
      receiptWidthMm,
    });
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add categories and dishes in Menu builder first — the POS grid fills in from there.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <Tabs value={activeCategoryId} onValueChange={setActiveCategoryId}>
          <TabsList>
            {categories.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {visibleItems.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No available items in this category.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemTap(item)}
                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left transition-shadow hover:shadow-card"
              >
                <span className="text-sm font-semibold leading-snug">{item.title}</span>
                <span className="text-sm font-semibold text-secondary">{formatMoney(item.price, currency)}</span>
                {item.addons.length > 0 && <span className="text-xs text-muted-foreground">Has add-ons</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit lg:sticky lg:top-6">
        <CardContent className="flex flex-col gap-4 p-4">
          {placedOrder ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                <ShoppingCart className="h-6 w-6 text-success" />
              </div>
              <p className="font-semibold">Order #{placedOrder.queueNumber} placed</p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {printRoles
                  .filter((p) => p.enabled)
                  .map((p) => (
                    <Button key={p.role} size="sm" variant="outline" onClick={() => print(p.role)} className="gap-1 text-xs">
                      <Printer className="h-3 w-3" /> {p.label}
                    </Button>
                  ))}
              </div>
              <Button onClick={resetForNextOrder} className="w-full">
                New order
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4" />
                Current order {itemCount > 0 && <span className="text-muted-foreground">({itemCount})</span>}
              </div>

              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Tap a dish to add it.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {lines.map((l) => (
                    <div key={l.key} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{l.title}</p>
                        {l.addons.length > 0 && (
                          <p className="text-xs text-muted-foreground">+ {l.addons.map((a) => a.name).join(", ")}</p>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border w-fit">
                          <button
                            type="button"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={() => updateQuantity(l.key, l.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center text-xs font-medium">{l.quantity}</span>
                          <button
                            type="button"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
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

              <Separator />

              <div>
                <Label>Order type</Label>
                <div className="flex gap-2">
                  {(["table", "pickup", "delivery"] as OrderType[]).map((ot) => (
                    <button
                      key={ot}
                      type="button"
                      onClick={() => setOrderType(ot)}
                      className={`flex-1 cursor-pointer rounded-lg border px-2 py-2 text-sm font-medium capitalize transition-colors ${
                        orderType === ot ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}
                    >
                      {ot}
                    </button>
                  ))}
                </div>
              </div>

              {orderType === "table" && (
                <div>
                  <Label htmlFor="pos-table">Table number</Label>
                  <Input id="pos-table" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="5" />
                </div>
              )}
              {orderType === "delivery" && (
                <div>
                  <Label htmlFor="pos-address">Address</Label>
                  <Input id="pos-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, area" />
                </div>
              )}

              <div>
                <Label htmlFor="pos-name">Customer name (optional)</Label>
                <Input id="pos-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" />
              </div>
              <div>
                <Label htmlFor="pos-phone">Phone (optional)</Label>
                <Input id="pos-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+961 70 000 000" />
              </div>

              <Separator />
              <div className="flex items-center justify-between font-semibold">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, currency)}</span>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button size="lg" onClick={handlePlaceOrder} disabled={lines.length === 0 || submitting} className="w-full">
                {submitting ? "Placing…" : "Place order"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={addonItem !== null} onOpenChange={(open) => !open && setAddonItem(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{addonItem?.title}</SheetTitle>
          </SheetHeader>
          {addonItem && (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                {addonItem.addons.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddon(a.id)}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      pendingAddonIds.includes(a.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    + {a.name} ({formatMoney(a.extraPrice, currency)})
                  </button>
                ))}
              </div>
              <Button onClick={confirmAddons} className="w-full">
                Add to order
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <PrintTicket job={printJob} onDone={() => setPrintJob(null)} />
    </div>
  );
}
