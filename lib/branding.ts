// -----------------------------------------------------------------------------
// Per-restaurant color overrides for the storefront's .theme-* CSS variables
// (app/globals.css). A restaurant either keeps its template's own hardcoded
// palette ('template-default' — resolveBrandColors returns null, meaning
// "don't touch the CSS vars"), picks one of the curated presets below, or
// goes 'custom' with two owner-picked colors.
//
// Presets carry a full, hand-tuned token set (safe to be rich, since a
// designer chose every value). Custom mode only ever takes two colors from
// the owner, so it derives the rest programmatically and keeps every
// derived value on the safe side (readable text, neutral backgrounds) —
// there is no way to type in a combination that ends up unreadable.
// -----------------------------------------------------------------------------

import type { CSSProperties } from "react";
import type { Restaurant } from "@/lib/types";

export interface BrandColorSet {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface BrandPreset {
  id: string;
  label: string;
  colors: BrandColorSet;
}

// Shared neutral base for every preset/custom palette, independent of the
// template's own default background — keeps a brand's primary/secondary
// popping consistently regardless of which of the 4 templates it's applied
// to, rather than clashing with e.g. bakery's yellow-tinted default background.
const NEUTRAL = {
  background: "#faf9f7",
  foreground: "#201a14",
  card: "#ffffff",
  muted: "#f2f0ec",
  mutedForeground: "#6b655c",
  border: "#e6e2da",
};

function palette(
  primary: string,
  secondary: string,
  primaryForeground: string,
  secondaryForeground: string,
  accent: string,
  accentForeground: string
): BrandColorSet {
  return {
    background: NEUTRAL.background,
    foreground: NEUTRAL.foreground,
    card: NEUTRAL.card,
    cardForeground: NEUTRAL.foreground,
    popover: NEUTRAL.card,
    popoverForeground: NEUTRAL.foreground,
    primary,
    primaryForeground,
    secondary,
    secondaryForeground,
    muted: NEUTRAL.muted,
    mutedForeground: NEUTRAL.mutedForeground,
    accent,
    accentForeground,
    border: NEUTRAL.border,
    input: NEUTRAL.border,
    ring: primary,
  };
}

export const BRAND_PRESETS: BrandPreset[] = [
  { id: "classic-red", label: "Classic Red", colors: palette("#dc2626", "#f59e0b", "#ffffff", "#201a14", "#fee2e2", "#201a14") },
  { id: "ocean-blue", label: "Ocean Blue", colors: palette("#2563eb", "#38bdf8", "#ffffff", "#201a14", "#dbeafe", "#201a14") },
  { id: "emerald", label: "Emerald", colors: palette("#16a34a", "#84cc16", "#ffffff", "#201a14", "#dcfce7", "#201a14") },
  { id: "sunset-orange", label: "Sunset Orange", colors: palette("#ea580c", "#fbbf24", "#ffffff", "#201a14", "#ffedd5", "#201a14") },
  { id: "charcoal-gold", label: "Charcoal & Gold", colors: palette("#1c1917", "#a16207", "#ffffff", "#ffffff", "#f5f0e6", "#1c1917") },
  { id: "rose-gold", label: "Rose Gold", colors: palette("#be185d", "#f472b6", "#ffffff", "#201a14", "#fce7f3", "#201a14") },
  { id: "royal-purple", label: "Royal Purple", colors: palette("#7c3aed", "#c084fc", "#ffffff", "#201a14", "#f3e8ff", "#201a14") },
  { id: "warm-terracotta", label: "Warm Terracotta", colors: palette("#b5651d", "#c67b5c", "#ffffff", "#ffffff", "#f0e2d6", "#201a14") },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16) || 0;
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

/** Picks white or near-black text, whichever reads clearly against `hex`. */
function readableForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? NEUTRAL.foreground : "#ffffff";
}

/** Mixes `hex` toward white by `amount` (0-1) — used for a safe light accent tint of the owner's primary color. */
function tint(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function buildCustomPalette(primary: string, secondary: string): BrandColorSet {
  return palette(primary, secondary, readableForeground(primary), readableForeground(secondary), tint(primary, 0.88), NEUTRAL.foreground);
}

/** Returns null when the restaurant should keep its template's own hardcoded colors (no override). */
export function resolveBrandColors(restaurant: Pick<Restaurant, "brandPalette" | "brandPrimaryColor" | "brandSecondaryColor">): BrandColorSet | null {
  if (restaurant.brandPalette === "custom") {
    if (!restaurant.brandPrimaryColor || !restaurant.brandSecondaryColor) return null;
    return buildCustomPalette(restaurant.brandPrimaryColor, restaurant.brandSecondaryColor);
  }
  const preset = BRAND_PRESETS.find((p) => p.id === restaurant.brandPalette);
  return preset ? preset.colors : null;
}

export function brandColorsToCssVars(colors: BrandColorSet): CSSProperties {
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.card,
    "--card-foreground": colors.cardForeground,
    "--popover": colors.popover,
    "--popover-foreground": colors.popoverForeground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.secondaryForeground,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--accent": colors.accent,
    "--accent-foreground": colors.accentForeground,
    "--border": colors.border,
    "--input": colors.input,
    "--ring": colors.ring,
  } as CSSProperties;
}
