"use client";

import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";

export function PrinterSettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [posEnabled, setPosEnabled] = useState(restaurant.posPrinterEnabled);
  const [kitchenEnabled, setKitchenEnabled] = useState(restaurant.kitchenPrinterEnabled);
  const [barEnabled, setBarEnabled] = useState(restaurant.barPrinterEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, {
      posPrinterEnabled: posEnabled,
      kitchenPrinterEnabled: kitchenEnabled,
      barPrinterEnabled: barEnabled,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <p className="text-sm text-muted-foreground">
          Tickets print through your device&apos;s own browser print dialog — there&apos;s no printer IP or hardware
          setup here. Just make sure your receipt printer is set up as a printer on whichever computer or tablet is
          running this dashboard, then use the Print buttons on each order in the queue.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-pos"
            checked={posEnabled}
            onCheckedChange={(checked) => {
              setPosEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-pos" className="mb-0 cursor-pointer">
            POS printer — receipt for the customer or delivery driver
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-kitchen"
            checked={kitchenEnabled}
            onCheckedChange={(checked) => {
              setKitchenEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-kitchen" className="mb-0 cursor-pointer">
            Kitchen printer — prep ticket for kitchen staff
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="printer-bar"
            checked={barEnabled}
            onCheckedChange={(checked) => {
              setBarEnabled(checked);
              setSaved(false);
            }}
          />
          <Label htmlFor="printer-bar" className="mb-0 cursor-pointer">
            Bar printer — drink ticket, only if your restaurant has a separate bar station
          </Label>
        </div>

        <div className="flex items-center justify-between">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
