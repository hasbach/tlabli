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
import { supabase } from "@/lib/supabase/client";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createMenuCategory,
  createItemAddon,
  deleteItemAddon,
} from "@/lib/actions/menu-actions";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Draft = Partial<MenuItem> & { categoryId: string };

export function MenuBuilder({
  restaurantId,
  categories,
  initialItems,
}: {
  restaurantId: string;
  categories: MenuCategory[];
  initialItems: MenuItem[];
}) {
  const [categoryList, setCategoryList] = useState(categories);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<Draft | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryNameAr, setNewCategoryNameAr] = useState("");
  const [newCategoryNameFr, setNewCategoryNameFr] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const [newAddonName, setNewAddonName] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState("");
  const [newAddonNameAr, setNewAddonNameAr] = useState("");
  const [newAddonNameFr, setNewAddonNameFr] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    setError(null);
    setAddingCategory(true);
    const result = await createMenuCategory({
      restaurantId,
      name: newCategoryName.trim(),
      nameAr: newCategoryNameAr.trim() || undefined,
      nameFr: newCategoryNameFr.trim() || undefined,
    });
    setAddingCategory(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCategoryList((prev) => [...prev, result.data]);
    setNewCategoryName("");
    setNewCategoryNameAr("");
    setNewCategoryNameFr("");
  }

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
    const item = items.find((i) => i.id === id);
    if (!item || !window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
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
        categoryId: editing.categoryId,
        titleAr: editing.titleAr,
        descriptionAr: editing.descriptionAr,
        titleFr: editing.titleFr,
        descriptionFr: editing.descriptionFr,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === result.data.id ? result.data : i)));
      setEditing(null);
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
      // Stay open in edit mode for the item that was just created — add-ons
      // and photo upload both require a real item id (FK/storage-path
      // constraints), so closing here would strand the owner with no way
      // to add either without reopening via the pencil icon.
      setEditing(result.data);
    }
  }

  async function uploadPhoto(file: File) {
    if (!editing?.id) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Image must be smaller than 5MB.");
      return;
    }
    setError(null);
    setUploadingPhoto(true);

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${restaurantId}/${editing.id}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("menu-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploadingPhoto(false);
      setError(uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from("menu-photos").getPublicUrl(path);
    // Cache-bust so replacing a photo doesn't keep showing the old cached image at the same URL.
    const imageUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    const result = await updateMenuItem(editing.id, { imageUrl });
    setUploadingPhoto(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEditing({ ...editing, imageUrl });
    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, imageUrl } : i)));
  }

  async function removePhoto() {
    if (!editing?.id) return;
    setError(null);
    const result = await updateMenuItem(editing.id, { imageUrl: null });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEditing({ ...editing, imageUrl: null });
    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, imageUrl: null } : i)));
  }

  async function addAddon() {
    if (!editing?.id || !newAddonName.trim()) return;
    setError(null);
    const result = await createItemAddon({
      itemId: editing.id,
      name: newAddonName.trim(),
      extraPrice: Number(newAddonPrice) || 0,
      nameAr: newAddonNameAr.trim() || undefined,
      nameFr: newAddonNameFr.trim() || undefined,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const updatedAddons = [...(editing.addons ?? []), result.data];
    setEditing({ ...editing, addons: updatedAddons });
    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, addons: updatedAddons } : i)));
    setNewAddonName("");
    setNewAddonPrice("");
    setNewAddonNameAr("");
    setNewAddonNameFr("");
  }

  async function removeAddon(addonId: string) {
    if (!editing?.id) return;
    setError(null);
    const result = await deleteItemAddon(addonId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const updatedAddons = (editing.addons ?? []).filter((a) => a.id !== addonId);
    setEditing({ ...editing, addons: updatedAddons });
    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, addons: updatedAddons } : i)));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category name (e.g. Desserts)"
          className="max-w-xs"
        />
        <Input
          value={newCategoryNameAr}
          onChange={(e) => setNewCategoryNameAr(e.target.value)}
          placeholder="Arabic name (optional)"
          dir="rtl"
          className="max-w-xs"
        />
        <Input
          value={newCategoryNameFr}
          onChange={(e) => setNewCategoryNameFr(e.target.value)}
          placeholder="French name (optional)"
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={addCategory}
          disabled={!newCategoryName.trim() || addingCategory}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> {addingCategory ? "Adding…" : "Add category"}
        </Button>
      </div>

      {categoryList.map((cat) => {
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
                  <FoodImagePlaceholder label={item.title} imageUrl={item.imageUrl} className="h-16 w-16 shrink-0 rounded-lg" />
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
                      {item.addons.length > 0 && (
                        <Badge variant="muted">{item.addons.length} add-on{item.addons.length > 1 ? "s" : ""}</Badge>
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

      {categoryList.length === 0 && (
        <p className="text-sm text-muted-foreground">Add your first category above to start building your menu.</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="overflow-y-auto scrollbar-thin">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit item" : "Add item"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <Label htmlFor="item-category">Category</Label>
                <select
                  id="item-category"
                  value={editing.categoryId}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
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
                Leave the time fields empty for an item that&apos;s available whenever the restaurant is open.
              </p>

              <div>
                <Label>Translations</Label>
                {editing.id ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="item-title-ar" className="text-xs text-muted-foreground">
                        Title (Arabic)
                      </Label>
                      <Input
                        id="item-title-ar"
                        dir="rtl"
                        value={editing.titleAr ?? ""}
                        onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })}
                        placeholder="سماش برغر"
                      />
                    </div>
                    <div>
                      <Label htmlFor="item-desc-ar" className="text-xs text-muted-foreground">
                        Description (Arabic)
                      </Label>
                      <Textarea
                        id="item-desc-ar"
                        dir="rtl"
                        value={editing.descriptionAr ?? ""}
                        onChange={(e) => setEditing({ ...editing, descriptionAr: e.target.value })}
                        placeholder="قطعة لحم، جبنة شيدر، مخلل..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="item-title-fr" className="text-xs text-muted-foreground">
                        Title (French)
                      </Label>
                      <Input
                        id="item-title-fr"
                        value={editing.titleFr ?? ""}
                        onChange={(e) => setEditing({ ...editing, titleFr: e.target.value })}
                        placeholder="Smash Burger"
                      />
                    </div>
                    <div>
                      <Label htmlFor="item-desc-fr" className="text-xs text-muted-foreground">
                        Description (French)
                      </Label>
                      <Textarea
                        id="item-desc-fr"
                        value={editing.descriptionFr ?? ""}
                        onChange={(e) => setEditing({ ...editing, descriptionFr: e.target.value })}
                        placeholder="Steak, cheddar, cornichons..."
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Save the item first, then you can add Arabic/French translations here.</p>
                )}
              </div>

              <div>
                <Label>Photo</Label>
                {editing.id ? (
                  <div className="flex items-center gap-3">
                    <FoodImagePlaceholder
                      label={editing.title ?? ""}
                      imageUrl={editing.imageUrl}
                      className="h-16 w-16 shrink-0 rounded-lg"
                    />
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingPhoto}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadPhoto(file);
                          e.target.value = "";
                        }}
                        className="text-xs"
                      />
                      {uploadingPhoto && <p className="text-xs text-muted-foreground">Uploading…</p>}
                      {editing.imageUrl && !uploadingPhoto && (
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="cursor-pointer text-left text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Save the item first, then you can upload a photo here.</p>
                )}
              </div>

              <Button onClick={saveDraft} disabled={!editing.title || editing.price === undefined}>
                Save item
              </Button>

              <div className="border-t border-border pt-4">
                <Label>Add-ons</Label>
                {editing.id ? (
                  <>
                    <div className="mt-2 space-y-2">
                      {(editing.addons ?? []).map((addon) => (
                        <div key={addon.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                          <span>
                            {addon.name}
                            {(addon.nameAr || addon.nameFr) && (
                              <span className="text-muted-foreground"> ({[addon.nameAr, addon.nameFr].filter(Boolean).join(" / ")})</span>
                            )}{" "}
                            (+{formatMoney(addon.extraPrice, "USD")})
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAddon(addon.id)}
                            className="cursor-pointer text-muted-foreground hover:text-destructive"
                            aria-label="Remove add-on"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {(editing.addons ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground">No add-ons yet.</p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={newAddonName}
                          onChange={(e) => setNewAddonName(e.target.value)}
                          placeholder="e.g. Extra cheese"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.25"
                          value={newAddonPrice}
                          onChange={(e) => setNewAddonPrice(e.target.value)}
                          placeholder="0.75"
                          className="w-24"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={newAddonNameAr}
                          onChange={(e) => setNewAddonNameAr(e.target.value)}
                          placeholder="Arabic name (optional)"
                          dir="rtl"
                          className="flex-1"
                        />
                        <Input
                          value={newAddonNameFr}
                          onChange={(e) => setNewAddonNameFr(e.target.value)}
                          placeholder="French name (optional)"
                          className="flex-1"
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={addAddon} disabled={!newAddonName.trim()} className="self-start">
                        Add
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Save the item first, then you can add extras/add-ons here.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
