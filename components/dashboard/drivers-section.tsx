"use client";

import { useState } from "react";
import { Copy, Link2, MessageCircle, Pencil } from "lucide-react";
import type { Driver, Restaurant } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { addDriver, resetDriverLink, setDriverActive, updateDriver } from "@/lib/actions/driver-actions";

interface IssuedLink {
  driver: Driver;
  url: string;
}

export function DriversSection({
  restaurant,
  initialDrivers,
  activeOrderCounts,
}: {
  restaurant: Restaurant;
  initialDrivers: Driver[];
  activeOrderCounts: Record<string, number>;
}) {
  const [drivers, setDrivers] = useState(initialDrivers);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function linkFor(token: string) {
    return `${window.location.origin}/driver/${token}`;
  }

  function showLink(driver: Driver, token: string) {
    setCopied(false);
    setIssued({ driver, url: linkFor(token) });
  }

  function replaceDriver(updated: Driver) {
    setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function add() {
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDriver(name, phone);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDrivers((prev) => [...prev, result.data.driver]);
    setName("");
    setPhone("");
    if (result.data.token) {
      showLink(result.data.driver, result.data.token);
    } else {
      setError(`${result.data.driver.name} was added, but their link couldn't be created — tap "Reset link" to try again.`);
    }
  }

  function startEdit(driver: Driver) {
    setEditingId(driver.id);
    setEditName(driver.name);
    setEditPhone(driver.phone);
  }

  async function saveEdit(driver: Driver) {
    if (!editName.trim() || !editPhone.trim()) return;
    setError(null);
    const result = await updateDriver(driver.id, editName, editPhone);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    replaceDriver({ ...result.data, linkCreatedAt: driver.linkCreatedAt });
    setEditingId(null);
  }

  async function reset(driver: Driver) {
    if (driver.linkCreatedAt && !window.confirm(`${driver.name}'s current link will stop working. Create a new one?`)) return;
    setError(null);
    setNotice(null);
    const result = await resetDriverLink(driver.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const updated = { ...driver, linkCreatedAt: result.data.linkCreatedAt };
    replaceDriver(updated);
    showLink(updated, result.data.token);
  }

  async function toggleActive(driver: Driver) {
    const activeCount = activeOrderCounts[driver.id] ?? 0;
    if (driver.active) {
      const extra = activeCount > 0 ? ` ${activeCount} active order${activeCount === 1 ? "" : "s"} will be unassigned.` : "";
      if (!window.confirm(`Deactivate ${driver.name}? Their link will stop working.${extra}`)) return;
    }
    setError(null);
    setNotice(null);
    const result = await setDriverActive(driver.id, !driver.active);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    replaceDriver({ ...driver, active: !driver.active, linkCreatedAt: driver.active ? undefined : driver.linkCreatedAt });
    if (issued?.driver.id === driver.id) setIssued(null);
    if (driver.active && result.data.unassigned > 0) {
      setNotice(`${result.data.unassigned} order${result.data.unassigned === 1 ? "" : "s"} unassigned — reassign them from the order queue.`);
    }
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically — select the link and copy it manually.");
    }
  }

  const whatsappHref = issued
    ? buildWhatsAppLink(
        issued.driver.phone,
        `Hi ${issued.driver.name}, this is your delivery link for ${restaurant.name}. Open it to see the orders assigned to you: ${issued.url}`
      )
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drivers</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each driver gets a private link — no password. Assign delivery orders from the order queue; drivers mark
          them picked up and delivered from their link.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {issued && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">Link for {issued.driver.name}</p>
            <Input readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()} className="mt-2 font-mono text-xs" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" asChild className="gap-1.5">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" /> Send on WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This link won&apos;t be shown again. If it&apos;s lost, reset it to get a new one.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {drivers.length === 0 && <p className="text-sm text-muted-foreground">No drivers yet — add your first one below.</p>}
          {drivers.map((driver) => (
            <div key={driver.id} className="rounded-lg border border-border p-3">
              {editingId === driver.id ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Driver name" />
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} aria-label="Driver phone" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(driver)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold">
                      {driver.name}
                      <Badge variant={driver.active ? "success" : "muted"}>{driver.active ? "Active" : "Inactive"}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {driver.phone} ·{" "}
                      {driver.linkCreatedAt
                        ? `Link active since ${new Date(driver.linkCreatedAt).toLocaleDateString()}`
                        : "No link yet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(driver)} aria-label={`Edit ${driver.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {driver.active && (
                      <Button size="sm" variant="outline" onClick={() => reset(driver)} className="gap-1.5">
                        <Link2 className="h-3.5 w-3.5" /> {driver.linkCreatedAt ? "Reset link" : "Create link"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(driver)}>
                      {driver.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="driver-name">Name</Label>
            <Input id="driver-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name" />
          </div>
          <div>
            <Label htmlFor="driver-phone">WhatsApp phone</Label>
            <Input id="driver-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={!name.trim() || !phone.trim() || busy} className="w-full">
              {busy ? "Adding…" : "Add driver"}
            </Button>
          </div>
        </div>
        {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
