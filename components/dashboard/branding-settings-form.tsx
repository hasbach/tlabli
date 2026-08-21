"use client";

import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BRAND_PRESETS } from "@/lib/branding";
import { updateRestaurantSettings } from "@/lib/actions/settings-actions";
import { supabase } from "@/lib/supabase/client";

const MAX_HEADER_IMAGE_BYTES = 5 * 1024 * 1024;

export function BrandingSettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [palette, setPalette] = useState(restaurant.brandPalette);
  const [primaryColor, setPrimaryColor] = useState(restaurant.brandPrimaryColor ?? "#dc2626");
  const [secondaryColor, setSecondaryColor] = useState(restaurant.brandSecondaryColor ?? "#f59e0b");
  const [headerImageUrl, setHeaderImageUrl] = useState(restaurant.headerImageUrl ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPalette(id: string) {
    setPalette(id);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, {
      brandPalette: palette,
      brandPrimaryColor: palette === "custom" ? primaryColor : undefined,
      brandSecondaryColor: palette === "custom" ? secondaryColor : undefined,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  async function uploadHeaderImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_HEADER_IMAGE_BYTES) {
      setError("Image must be smaller than 5MB.");
      return;
    }
    setError(null);
    setUploadingImage(true);

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${restaurant.id}/header.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("menu-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploadingImage(false);
      setError(uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from("menu-photos").getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;
    const result = await updateRestaurantSettings(restaurant.id, { headerImageUrl: url });
    setUploadingImage(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setHeaderImageUrl(url);
  }

  async function removeHeaderImage() {
    setError(null);
    const result = await updateRestaurantSettings(restaurant.id, { headerImageUrl: null });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setHeaderImageUrl(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-0">
        <div>
          <Label>Color palette</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Pick a preset that matches your brand, go custom with your own two colors, or keep your template&apos;s
            default look.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectPalette("template-default")}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                palette === "template-default" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
              }`}
            >
              Template default
            </button>
            {BRAND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPalette(preset.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  palette === preset.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                }`}
              >
                <span className="flex h-4 w-4 overflow-hidden rounded-full border border-black/10">
                  <span className="h-full w-1/2" style={{ background: preset.colors.primary }} />
                  <span className="h-full w-1/2" style={{ background: preset.colors.secondary }} />
                </span>
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectPalette("custom")}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                palette === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {palette === "custom" && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="brand-primary">Primary color</Label>
              <input
                id="brand-primary"
                type="color"
                value={primaryColor}
                onChange={(e) => {
                  setPrimaryColor(e.target.value);
                  setSaved(false);
                }}
                className="block h-10 w-16 cursor-pointer rounded-md border border-input"
              />
            </div>
            <div>
              <Label htmlFor="brand-secondary">Secondary color</Label>
              <input
                id="brand-secondary"
                type="color"
                value={secondaryColor}
                onChange={(e) => {
                  setSecondaryColor(e.target.value);
                  setSaved(false);
                }}
                className="block h-10 w-16 cursor-pointer rounded-md border border-input"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>

        <div className="border-t border-border pt-4">
          <Label>Header image</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Shown as the background behind your name, tagline, address, and phone number on your live menu — leave
            it empty to keep your template&apos;s default header.
          </p>
          {headerImageUrl && (
            <div
              className="mb-2 h-24 w-full rounded-lg bg-cover bg-center"
              style={{ backgroundImage: `url(${headerImageUrl})` }}
            />
          )}
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              disabled={uploadingImage}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadHeaderImage(file);
                e.target.value = "";
              }}
              className="text-xs"
            />
            {uploadingImage && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {headerImageUrl && !uploadingImage && (
              <button
                type="button"
                onClick={removeHeaderImage}
                className="cursor-pointer text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
