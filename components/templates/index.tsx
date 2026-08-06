import type { Restaurant } from "@/lib/types";
import type { MenuSection } from "@/lib/menu";
import { FastFoodTemplate } from "./fast-food-template";
import { BakeryTemplate } from "./bakery-template";
import { FineDiningTemplate } from "./fine-dining-template";
import { CafeTemplate } from "./cafe-template";

export function TemplateRenderer({ restaurant, sections }: { restaurant: Restaurant; sections: MenuSection[] }) {
  switch (restaurant.templateId) {
    case "fast-food":
      return <FastFoodTemplate restaurant={restaurant} sections={sections} />;
    case "bakery":
      return <BakeryTemplate restaurant={restaurant} sections={sections} />;
    case "fine-dining":
      return <FineDiningTemplate restaurant={restaurant} sections={sections} />;
    case "cafe":
      return <CafeTemplate restaurant={restaurant} sections={sections} />;
    default:
      return <FastFoodTemplate restaurant={restaurant} sections={sections} />;
  }
}
