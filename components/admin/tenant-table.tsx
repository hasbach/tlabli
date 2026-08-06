"use client";

import { useState } from "react";
import { Building2, CheckCircle2, XCircle, Layers } from "lucide-react";
import type { Restaurant, Subscription } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatCard } from "@/components/dashboard/stat-card";

const STATUS_LABEL: Record<Restaurant["status"], string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  inactive: "Inactive",
};

const STATUS_VARIANT: Record<Restaurant["status"], "success" | "secondary" | "destructive" | "muted"> = {
  trial: "secondary",
  active: "success",
  past_due: "destructive",
  inactive: "muted",
};

const PLAN_LABEL: Record<Restaurant["planId"], string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  custom: "Custom",
};

const selectClass =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ManagedFields = {
  status: Restaurant["status"];
  planId: Restaurant["planId"];
  periodStart: string;
  periodEnd: string;
  paymentProofRef: string;
};

export function TenantTable({
  initialRestaurants,
  initialSubscriptions,
}: {
  initialRestaurants: Restaurant[];
  initialSubscriptions: Subscription[];
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [managingId, setManagingId] = useState<string | null>(null);

  const managing = restaurants.find((r) => r.id === managingId) ?? null;
  const managingSub = subscriptions.find((s) => s.restaurantId === managingId) ?? null;

  const total = restaurants.length;
  const active = restaurants.filter((r) => r.status === "active").length;
  const pastDueOrInactive = restaurants.filter((r) => r.status === "past_due" || r.status === "inactive").length;
  const planMix = (["free", "basic", "pro", "custom"] as Restaurant["planId"][])
    .map((p) => `${restaurants.filter((r) => r.planId === p).length} ${PLAN_LABEL[p]}`)
    .join(" · ");

  function saveManaging(updated: ManagedFields) {
    if (!managingId) return;
    setRestaurants((prev) =>
      prev.map((r) => (r.id === managingId ? { ...r, status: updated.status, planId: updated.planId } : r))
    );
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.restaurantId === managingId
          ? {
              ...s,
              periodStart: updated.periodStart,
              periodEnd: updated.periodEnd,
              paymentProofRef: updated.paymentProofRef || undefined,
            }
          : s
      )
    );
    setManagingId(null);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total restaurants" value={String(total)} />
        <StatCard icon={CheckCircle2} label="Active" value={String(active)} accent="success" />
        <StatCard icon={XCircle} label="Past due / inactive" value={String(pastDueOrInactive)} accent="secondary" />
        <StatCard icon={Layers} label="Plan mix" value={planMix} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period ends</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {restaurants.map((r) => {
              const sub = subscriptions.find((s) => s.restaurantId === r.id);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{r.type.replace("-", " ")}</p>
                  </td>
                  <td className="px-4 py-3">{PLAN_LABEL[r.planId]}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{sub?.periodEnd ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setManagingId(r.id)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Sheet open={managing !== null} onOpenChange={(open) => !open && setManagingId(null)}>
        <SheetContent>
          {managing && (
            <ManageTenantForm
              restaurant={managing}
              subscription={managingSub}
              onSave={saveManaging}
              onCancel={() => setManagingId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ManageTenantForm({
  restaurant,
  subscription,
  onSave,
  onCancel,
}: {
  restaurant: Restaurant;
  subscription: Subscription | null;
  onSave: (updated: ManagedFields) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState(restaurant.status);
  const [planId, setPlanId] = useState(restaurant.planId);
  const [periodStart, setPeriodStart] = useState(subscription?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(subscription?.periodEnd ?? "");
  const [paymentProofRef, setPaymentProofRef] = useState(subscription?.paymentProofRef ?? "");

  return (
    <>
      <SheetHeader>
        <SheetTitle>{restaurant.name}</SheetTitle>
      </SheetHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="mt-status">Status</Label>
          <select
            id="mt-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Restaurant["status"])}
            className={selectClass}
          >
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <Label htmlFor="mt-plan">Plan</Label>
          <select
            id="mt-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value as Restaurant["planId"])}
            className={selectClass}
          >
            <option value="free">Free</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mt-start">Period start</Label>
            <Input id="mt-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mt-end">Period end</Label>
            <Input id="mt-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="mt-proof">Payment proof reference</Label>
          <Input
            id="mt-proof"
            value={paymentProofRef}
            onChange={(e) => setPaymentProofRef(e.target.value)}
            placeholder="e.g. OMT ref #12345"
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ status, planId, periodStart, periodEnd, paymentProofRef })}>
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}
