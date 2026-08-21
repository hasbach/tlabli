"use client";

import { useState } from "react";
import type { Restaurant, Currency } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { QRCodeBlock } from "@/components/storefront/qr-code-block";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [form, setForm] = useState(restaurant);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
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
