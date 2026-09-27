"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, MapPin, Phone, RefreshCw, Truck } from "lucide-react";
import type { Locale, OrderStatus } from "@/lib/types";
import type { DriverViewOrder, DriverViewResult } from "@/lib/driver-view";
import { localeMeta, type DictionaryKey } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDualCurrency, formatMoney } from "@/lib/currency";
import { markDelivered, markPickedUp, type DriverActionCode } from "@/lib/actions/driver-page-actions";

const REFRESH_MS = 30_000;
const LOCALE_STORAGE_KEY = "tlabli-driver-locale";

const STATUS_KEY: Partial<Record<OrderStatus, DictionaryKey>> = {
  received: "driverStatusReceived",
  preparing: "driverStatusPreparing",
  out_for_delivery: "driverStatusOnTheWay",
};

const ERROR_KEY: Record<DriverActionCode, DictionaryKey> = {
  invalid_link: "driverLinkInactive",
  not_assigned: "driverReassigned",
  bad_status: "driverAlreadyUpdated",
  unknown: "driverUpdateFailed",
};

export function DriverDashboard({ token, result }: { token: string; result: DriverViewResult }) {
  const router = useRouter();
  const { t, locale, setLocale, availableLocales } = useLocale();
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // Remember the driver's language on this phone (per-device convenience only).
  // Persisting is done in chooseLocale (below), triggered only by a user click —
  // not by a [locale]-keyed effect, which would misfire under React Strict
  // Mode's double-invoke (it would write "en" on mount before the saved value
  // loads, then re-read that "en" on the second pass).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "en" || saved === "ar" || saved === "fr") setLocale(saved as Locale);
    } catch {
      // Storage blocked (private mode) — fall back to the default language.
    }
  }, [setLocale]);

  function chooseLocale(l: Locale) {
    setLocale(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // Storage blocked (private mode) — the choice just won't survive reload.
    }
  }

  // Poll instead of Realtime: the driver has no session, and we don't want to
  // build on the public orders read policy (a known gap).
  useEffect(() => {
    const id = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function act(order: DriverViewOrder, kind: "picked_up" | "delivered") {
    if (kind === "delivered" && !window.confirm(`#${order.queueNumber} — ${t("driverConfirmDelivered")}`)) return;
    setPendingId(order.id);
    setMessage(null);
    try {
      const res = kind === "picked_up" ? await markPickedUp(token, order.id) : await markDelivered(token, order.id);
      if (!res.ok) setMessage(t(ERROR_KEY[res.code]));
    } catch {
      setMessage(t("driverUpdateFailed"));
    } finally {
      setPendingId(null);
      refresh();
    }
  }

  if (result.kind === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-sm p-6 text-center">
          <p className="text-sm font-semibold">{t("driverLinkInactive")}</p>
        </Card>
      </div>
    );
  }

  if (result.kind === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-sm p-6 text-center">
          <p className="text-sm">{t("driverLoadFailed")}</p>
          <Button size="sm" variant="outline" onClick={refresh} className="mt-4 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> {t("driverRefresh")}
          </Button>
        </Card>
      </div>
    );
  }

  const { view } = result;

  function money(order: DriverViewOrder) {
    if (order.currency === "USD" && view.showBothCurrencies && view.lbpExchangeRate > 0) {
      return formatDualCurrency(order.total, view.lbpExchangeRate, "USD");
    }
    return formatMoney(order.total, order.currency);
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{view.restaurantName}</p>
            <h1 className="truncate text-xl font-extrabold">
              {t("driverGreeting")} {view.driverName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {view.restaurantPhone && (
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <a href={`tel:${view.restaurantPhone}`}>
                  <Phone className="h-3.5 w-3.5" /> {t("driverCallRestaurant")}
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={refresh} disabled={isRefreshing} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> {t("driverRefresh")}
            </Button>
          </div>
        </header>

        {availableLocales.length > 1 && (
          <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-soft">
            <Languages className="mx-1.5 h-4 w-4 text-muted-foreground" />
            {availableLocales.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => chooseLocale(l)}
                className={`cursor-pointer rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {localeMeta[l].label}
              </button>
            ))}
          </div>
        )}

        {message && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}

        {view.orders.length === 0 ? (
          <Card className="p-8 text-center">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("driverNoOrders")}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {view.orders.map((order) => {
              const statusKey = STATUS_KEY[order.status];
              const canPickUp = order.status === "received" || order.status === "preparing";
              return (
                <Card key={order.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-extrabold">
                        {t("driverOrder")} #{order.queueNumber}
                      </span>
                      {statusKey && <Badge variant={order.status === "out_for_delivery" ? "default" : "secondary"}>{t(statusKey)}</Badge>}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">{order.customerName}</p>
                      <Button size="sm" variant="outline" asChild className="shrink-0 gap-1.5">
                        <a href={`tel:${order.customerPhone}`}>
                          <Phone className="h-3.5 w-3.5" /> {t("driverCall")}
                        </a>
                      </Button>
                    </div>

                    {order.address && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{order.address}</span>
                        </p>
                        <Button size="sm" variant="outline" asChild className="shrink-0">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("driverOpenMaps")}
                          </a>
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {order.items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}
                    </p>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("driverToCollect")}</p>
                        <p className="text-base font-extrabold">{money(order)}</p>
                      </div>
                      <Button
                        onClick={() => act(order, canPickUp ? "picked_up" : "delivered")}
                        disabled={pendingId === order.id}
                        className="min-w-32"
                      >
                        {canPickUp ? t("driverPickedUp") : t("driverDelivered")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
