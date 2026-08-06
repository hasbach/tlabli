"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Currency } from "@/lib/types";

export interface CartLine {
  key: string; // itemId + sorted addon ids, so the same dish with different add-ons gets its own line
  itemId: string;
  title: string;
  unitPrice: number;
  quantity: number;
  addons: { id: string; name: string; extraPrice: number }[];
}

interface CartContextValue {
  lines: CartLine[];
  currency: Currency;
  addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  subtotal: number;
  itemCount: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  currency,
}: {
  children: React.ReactNode;
  currency: Currency;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addLine: CartContextValue["addLine"] = (line, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.key === line.key);
      if (existing) {
        return prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { ...line, quantity }];
    });
    setIsOpen(true);
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (key, quantity) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const clear = () => setLines([]);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const addonsTotal = l.addons.reduce((a, addon) => a + addon.extraPrice, 0);
        return sum + (l.unitPrice + addonsTotal) * l.quantity;
      }, 0),
    [lines]
  );

  const itemCount = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);

  return (
    <CartContext.Provider
      value={{ lines, currency, addLine, updateQuantity, removeLine, clear, subtotal, itemCount, isOpen, setIsOpen }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
