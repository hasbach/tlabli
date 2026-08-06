import {
  UtensilsCrossed,
  Coffee,
  Cookie,
  Sandwich,
  Soup,
  Salad,
  IceCream2,
  Beef,
  Pizza,
  GlassWater,
  CakeSlice,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KEYWORD_ICON_MAP: Array<[RegExp, LucideIcon]> = [
  [/burger|beef|steak|tartare/i, Beef],
  [/fries|combo|lunch/i, Sandwich],
  [/cake|cheesecake|dessert|soufflé|souffle/i, CakeSlice],
  [/croissant|pastry|manoushe|bread|loaf|baguette/i, Wheat],
  [/coffee|latte|cappuccino|espresso/i, Coffee],
  [/toast|salad|scallop|seabass|fish/i, Salad],
  [/soup|starter/i, Soup],
  [/ice ?cream/i, IceCream2],
  [/pizza/i, Pizza],
  [/drink|soda|cola|juice|water/i, GlassWater],
  [/cookie|biscuit/i, Cookie],
];

function pickIcon(label: string): LucideIcon {
  const match = KEYWORD_ICON_MAP.find(([re]) => re.test(label));
  return match ? match[1] : UtensilsCrossed;
}

/**
 * A designed placeholder used until a restaurant owner uploads their own item
 * photo — intentionally not a stock photo, since a menu should show *this*
 * bakery's own cake, not a generic one. Themed via the surrounding
 * .theme-* CSS variables, so it always matches the active template.
 */
export function FoodImagePlaceholder({
  label,
  className,
  aspect = "square",
}: {
  label: string;
  className?: string;
  aspect?: "square" | "video";
}) {
  const Icon = pickIcon(label);
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[inherit]",
        aspect === "square" ? "aspect-square" : "aspect-video",
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--muted)) 0%, color-mix(in srgb, var(--secondary) 22%, var(--muted)) 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--foreground) 0, var(--foreground) 1px, transparent 1px, transparent 12px)",
        }}
      />
      <Icon
        className="relative h-[38%] w-[38%] opacity-40"
        style={{ color: "var(--primary)" }}
        strokeWidth={1.5}
      />
    </div>
  );
}
