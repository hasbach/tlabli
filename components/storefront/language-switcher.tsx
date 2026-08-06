"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { localeMeta } from "@/lib/i18n/dictionaries";

export function LanguageSwitcher() {
  const { locale, setLocale, availableLocales } = useLocale();
  if (availableLocales.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-soft">
      <Languages className="mx-1.5 h-4 w-4 text-muted-foreground" />
      {availableLocales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={`cursor-pointer rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {localeMeta[l].label}
        </button>
      ))}
    </div>
  );
}
