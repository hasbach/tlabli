"use client";

import { useState } from "react";
import type { Restaurant, WhatsAppSettings } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWhatsAppSettings } from "@/lib/actions/whatsapp-actions";

const PLAN_CAPS: Record<Restaurant["planId"], number | null> = {
  free: 0,
  basic: 20,
  pro: 50,
  custom: null,
};

const TEMPLATE_TEXT = "🔔 New order at {{1}}\n\n{{2}}\n\nTotal: {{3}}\nCustomer: {{4}}\n{{5}}";

export function WhatsAppSettingsForm({
  restaurant,
  initialSettings,
  sentThisMonth,
}: {
  restaurant: Restaurant;
  initialSettings: WhatsAppSettings | null;
  sentThisMonth: number;
}) {
  const [mode, setMode] = useState<WhatsAppSettings["mode"]>(initialSettings?.mode ?? "tlabli");
  const [ownAccessToken, setOwnAccessToken] = useState(initialSettings?.ownAccessToken ?? "");
  const [ownPhoneNumberId, setOwnPhoneNumberId] = useState(initialSettings?.ownPhoneNumberId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = PLAN_CAPS[restaurant.planId];

  function selectMode(next: WhatsAppSettings["mode"]) {
    setMode(next);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateWhatsAppSettings(restaurant.id, { mode, ownAccessToken, ownPhoneNumberId });
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
        <CardTitle>WhatsApp notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => selectMode("tlabli")}
            className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              mode === "tlabli" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            }`}
          >
            Use Tlabli&apos;s WhatsApp number
          </button>
          <button
            type="button"
            onClick={() => selectMode("own")}
            className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              mode === "own" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            }`}
          >
            Use my own WhatsApp Business API
          </button>
        </div>

        {mode === "tlabli" && (
          <p className="text-sm text-muted-foreground">
            {cap === null
              ? "Unlimited automatic notifications on your plan."
              : cap === 0
                ? "Your plan doesn't include automatic notifications — orders still open a WhatsApp deep link for the customer to send."
                : `${sentThisMonth} / ${cap} messages used this month — falls back to a WhatsApp deep link after that.`}
          </p>
        )}

        {mode === "own" && (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="wa-token">Access token</Label>
              <Input
                id="wa-token"
                type="password"
                value={ownAccessToken}
                onChange={(e) => {
                  setOwnAccessToken(e.target.value);
                  setSaved(false);
                }}
                placeholder="Permanent access token from Meta Business"
              />
            </div>
            <div>
              <Label htmlFor="wa-phone-id">Phone number ID</Label>
              <Input
                id="wa-phone-id"
                value={ownPhoneNumberId}
                onChange={(e) => {
                  setOwnPhoneNumberId(e.target.value);
                  setSaved(false);
                }}
                placeholder="From your WhatsApp Business API settings"
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Submit this exact template for Meta approval first:</p>
              <p className="mt-1">
                Name: <code>new_order_notification</code>, category: <code>UTILITY</code>
              </p>
              <pre className="mt-1 whitespace-pre-wrap font-mono">{TEMPLATE_TEXT}</pre>
              <p className="mt-1">
                Notifications won&apos;t send until this template is approved on your own WhatsApp Business Account.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button
            onClick={handleSave}
            disabled={saving || (mode === "own" && (!ownAccessToken || !ownPhoneNumberId))}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
