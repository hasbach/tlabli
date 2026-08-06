"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Locale } from "../types";
import { dictionaries, localeMeta, type DictionaryKey } from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
  t: (key: DictionaryKey) => string;
  availableLocales: Locale[];
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  availableLocales,
  defaultLocale = "en",
}: {
  children: React.ReactNode;
  availableLocales: Locale[];
  defaultLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const dir = localeMeta[locale].dir;

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      dir,
      t: (key: DictionaryKey) => dictionaries[locale][key],
      availableLocales,
    }),
    [locale, dir, availableLocales]
  );

  return (
    <LocaleContext.Provider value={value}>
      <div dir={dir} className={dir === "rtl" ? "font-arabic" : "font-sans"}>
        {children}
      </div>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
