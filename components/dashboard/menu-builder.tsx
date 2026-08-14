"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Clock } from "lucide-react";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodImagePlaceholder } from "@/components/storefront/food-image-placeholder";
import { formatMoney } from "@/lib/currency";
import { createMenuItem, updateMenuItem, deleteMenuItem } from "@/lib/actions/menu-actions";

type Draft = Partial<MenuItem> & { categoryId: string };

export function MenuBuilder({
  categories,
  initialItems,
}: {
  categories: MenuCategory[];
  initialItems: MenuItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<Draft | null>(null);

  const [error, setError] = useState<string | null>(null);

  async function toggleAvailable(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: !i.isAvailable } : i)));
    const result = await updateMenuItem(id, { isAvailable: !item.isAvailable });
    if ("error" in result) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: item.isAvailable } : i)));
      setError(result.error);
    }
  }

  async function removeItem(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const result = await deleteMenuItem(id);
    if ("error" in result) {
      setItems(previous);
      setError(result.error);
    }
  }

  function openNew(categoryId: string) {
    setEditing({ categoryId, addons: [], isAvailable: true });
  }

  function openEdit(item: MenuItem) {
    setEditing({ ...item });
  }

  async function saveDraft() {
    if (!editing || !editing.title || editing.price === undefined) return;
    setError(null);

    if (editing.id) {
      const result = await updateMenuItem(editing.id, {
        title: editing.title,
        description: editing.description ?? "",
        price: Number(editing.price),
        isAvailable: editing.isAvailable ?? true,
        availableFrom: editing.availableFrom,
        availableUntil: editing.availableUntil,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === result.data.id ? result.data : i)));
    } else {
      const result = await createMenuItem({
        categoryId: editing.categoryId,
        title: editing.title,
        description: editing.description ?? "",
        price: Number(editing.price) || 0,
        isAvailable: editing.isAvailable ?? true,
        availableFrom: editing.availableFrom,
        availableUntil: editing.availableUntil,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setItems((prev) => [...prev, result.data]);
    }
    setEditing(null);
  }

  return (
    <div className="space-y-8">
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        return (
          <section key={cat.id}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{cat.name}</h2>
              <Button size="sm" variant="outline" onClick={() => openNew(cat.id)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add item
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {catItems.map((item) => (
                <Card key={item.id} className="flex gap-3 p-3" style={{ opacity: item.isAvailable ? 1 : 0.55 }}>
                  <FoodImagePlaceholder label={item.title} className="h-16 w-16 shrink-0 rounded-lg" />
                  <CardContent className="flex flex-1 flex-col gap-1 p-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">{item.title}</p>
                      <span className="whitespace-nowrap text-sm font-bold text-primary">
                        {formatMoney(item.price, "USD")}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.availableFrom && (
                        <Badge variant="muted" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {item.availableFrom}–{item.availableUntil}
                        </Badge>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <button onClick={() => openEdit(item)} className="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="cursor-pointer text-muted-foreground hover:text-destructive" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Switch checked={item.isAvailable} onCheckedChange={() => toggleAvailable(item.id)} id={`avail-${item.id}`} />
                      <Label htmlFor={`avail-${item.id}`} className="mb-0 cursor-pointer text-xs">
                        {item.isAvailable ? "Available" : "Sold out"}
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {catItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No items yet in this category.</p>
              )}
            </div>
          </section>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit item" : "Add item"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <Label htmlFor="item-title">Title</Label>
                <Input id="item-title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Classic Smash Burger" />
              </div>
              <div>
                <Label htmlFor="item-desc">Description</Label>
                <Textarea id="item-desc" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Beef patty, cheddar, pickles..." />
              </div>
              <div>
                <Label htmlFor="item-price">Price (USD)</Label>
                <Input id="item-price" type="number" step="0.25" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} placeholder="6.50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-from">Available from</Label>
                  <Input id="item-from" type="time" value={editing.availableFrom ?? ""} onChange={(e) => setEditing({ ...editing, availableFrom: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="item-until">Available until</Label>
                  <Input id="item-until" type="time" value={editing.availableUntil ?? ""} onChange={(e) => setEditing({ ...editing, availableUntil: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave the time fields empty for an item that&apos;s available whenever the restaurant is open. Photo upload
                will be enabled once Supabase Storage is connected — see SETUP_TODO.md.
              </p>
              <Button onClick={saveDraft} disabled={!editing.title || editing.price === undefined}>
                Save item
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
