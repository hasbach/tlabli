"use client";

import { useState } from "react";
import type { Restaurant, Currency, Locale, BusinessHours } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { QRCodeBlock } from "@/components/storefront/qr-code-block";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";

const LOCALE_ORDER: Locale[] = ["en", "ar", "fr"];
const LOCALE_LABELS: Record<Locale, string> = { en: "English", ar: "Arabic (العربية)", fr: "French (Français)" };

const DAY_ORDER: BusinessHours["day"][] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<BusinessHours["day"], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function getDayHours(hours: BusinessHours[], day: BusinessHours["day"]): BusinessHours {
  return hours.find((h) => h.day === day) ?? { day, open: "09:00", close: "22:00", closed: false };
}

// The hours editor shows a 9:00-22:00 default for any day with no saved
// entry — but that's only ever a *display* fallback. Filling every day in
// up front (rather than lazily adding one only when its own row is
// touched) means clicking Save persists the full week actually shown,
// even for an owner who never touches a single day's inputs.
function normalizeHours(hours: BusinessHours[]): BusinessHours[] {
  return DAY_ORDER.map((day) => getDayHours(hours, day));
}

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [form, setForm] = useState(() => ({ ...restaurant, hours: normalizeHours(restaurant.hours) }));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [temporarilyClosed, setTemporarilyClosed] = useState(restaurant.temporarilyClosed);
  const [temporarilyClosedError, setTemporarilyClosedError] = useState<string | null>(null);

  function update<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function toggleLanguage(locale: Locale) {
    setForm((f) => {
      const has = f.languages.includes(locale);
      if (has && f.languages.length === 1) return f; // keep at least one language enabled
      const next = has ? f.languages.filter((l) => l !== locale) : [...f.languages, locale];
      // Keep canonical order so languages[0] (the default locale shown to customers) stays predictable.
      return { ...f, languages: LOCALE_ORDER.filter((l) => next.includes(l)) };
    });
    setSaved(false);
  }

  function updateDayHours(day: BusinessHours["day"], patch: Partial<BusinessHours>) {
    setForm((f) => {
      const updated = { ...getDayHours(f.hours, day), ...patch };
      return { ...f, hours: [...f.hours.filter((h) => h.day !== day), updated] };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, {
      name: form.name,
      whatsappNumber: form.whatsappNumber,
      tagline: form.tagline,
      address: form.address,
      currency: form.currency,
      lbpExchangeRate: form.lbpExchangeRate,
      showBothCurrencies: form.showBothCurrencies,
      languages: form.languages,
      hours: form.hours,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  // Kept as an immediate, independent save (like the WhatsApp/printer toggles
  // elsewhere in Settings) rather than folded into handleSave's single
  // update — temporarily_closed is the newest column here, and bundling it
  // into the same atomic update as name/tagline/currency/etc. would mean a
  // restaurant on a database that hasn't run this migration yet can't save
  // *any* profile change, not just this one, until it does.
  async function toggleTemporarilyClosed(value: boolean) {
    setTemporarilyClosed(value);
    setTemporarilyClosedError(null);
    const result = await updateRestaurantSettings(restaurant.id, { temporarilyClosed: value });
    if ("error" in result) {
      setTemporarilyClosed(!value);
      setTemporarilyClosedError(result.error);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Restaurant profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-name">Business name</Label>
              <Input id="s-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-phone">WhatsApp number</Label>
              <Input id="s-phone" value={form.whatsappNumber} onChange={(e) => update("whatsappNumber", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="s-tagline">Tagline</Label>
              <Input id="s-tagline" value={form.tagline} onChange={(e) => update("tagline", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="s-address">Address</Label>
              <Input id="s-address" value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Menu languages</Label>
              <div className="flex flex-wrap gap-4">
                {LOCALE_ORDER.map((l) => {
                  const checked = form.languages.includes(l);
                  return (
                    <div key={l} className="flex items-center gap-2">
                      <Switch
                        id={`s-lang-${l}`}
                        checked={checked}
                        disabled={checked && form.languages.length === 1}
                        onCheckedChange={() => toggleLanguage(l)}
                      />
                      <Label htmlFor={`s-lang-${l}`} className="mb-0 cursor-pointer text-sm">
                        {LOCALE_LABELS[l]}
                      </Label>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Customers can switch between these languages on your live menu. The first one enabled is shown by
                default.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business hours</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch id="s-temp-closed" checked={temporarilyClosed} onCheckedChange={toggleTemporarilyClosed} />
                <Label htmlFor="s-temp-closed" className="mb-0 cursor-pointer">
                  Temporarily closed — overrides the schedule below (use for holidays or emergencies)
                </Label>
              </div>
              {temporarilyClosedError && <p className="text-xs text-destructive">{temporarilyClosedError}</p>}
            </div>
            <div className="flex flex-col gap-2">
              {DAY_ORDER.map((day) => {
                const dh = getDayHours(form.hours, day);
                return (
                  <div key={day} className="flex flex-wrap items-center gap-3">
                    <span className="w-24 shrink-0 text-sm font-medium">{DAY_LABELS[day]}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`s-hours-closed-${day}`}
                        checked={!!dh.closed}
                        onCheckedChange={(v) => updateDayHours(day, { closed: v })}
                      />
                      <Label htmlFor={`s-hours-closed-${day}`} className="mb-0 cursor-pointer text-xs text-muted-foreground">
                        Closed all day
                      </Label>
                    </div>
                    {!dh.closed && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={dh.open}
                          onChange={(e) => updateDayHours(day, { open: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={dh.close}
                          onChange={(e) => updateDayHours(day, { close: e.target.value })}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Currency</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-currency">Primary display currency</Label>
              <div className="flex gap-2">
                {(["USD", "LBP"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update("currency", c)}
                    className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.currency === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    {c === "USD" ? "$ USD" : "L.L. LBP"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="s-rate">LBP exchange rate (per $1)</Label>
              <Input
                id="s-rate"
                type="number"
                value={form.lbpExchangeRate}
                onChange={(e) => update("lbpExchangeRate", Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="s-both"
                checked={form.showBothCurrencies}
                onCheckedChange={(v) => update("showBothCurrencies", v)}
              />
              <Label htmlFor="s-both" className="mb-0 cursor-pointer">
                Show both $ and L.L. on the menu
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan &amp; billing</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-semibold capitalize">{form.planId} plan</p>
                <p className="text-sm text-muted-foreground">
                  Billing is manual — pay via OMT, Whish Money, or cash. We activate your plan once payment is confirmed.
                </p>
              </div>
              <Badge variant={form.status === "active" ? "success" : "secondary"} className="capitalize">
                {form.status}
              </Badge>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              To upgrade your plan, contact us at{" "}
              <a href="tel:+96179170372" className="underline">
                +961 79 170 372
              </a>{" "}
              or{" "}
              <a href="mailto:support@salloumservices.com" className="underline">
                support@salloumservices.com
              </a>
              .
            </p>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <p className="text-sm text-success">Saved.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Your menu link &amp; QR</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 pt-0">
            <QRCodeBlock url={`https://tlabli.com/${form.slug}`} label={`tlabli.com/${form.slug}`} />
            <p className="text-center text-xs text-muted-foreground">
              Print this on tables, or share the link on Instagram and WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
