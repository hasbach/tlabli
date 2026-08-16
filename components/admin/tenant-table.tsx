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
import { updateTenantPlanStatus, recordSubscriptionPayment } from "@/lib/actions/admin-actions";

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
  // subscriptions is ordered by created_at desc (app/admin/page.tsx), and
  // stays that way here (new rows are prepended, never appended) — so the
  // first match is always the tenant's latest billing period.
  const managingSub = subscriptions.find((s) => s.restaurantId === managingId) ?? null;

  const total = restaurants.length;
  const active = restaurants.filter((r) => r.status === "active").length;
  const pastDueOrInactive = restaurants.filter((r) => r.status === "past_due" || r.status === "inactive").length;
  const planMix = (["free", "basic", "pro", "custom"] as Restaurant["planId"][])
    .map((p) => `${restaurants.filter((r) => r.planId === p).length} ${PLAN_LABEL[p]}`)
    .join(" · ");

  function handlePlanStatusSaved(updated: Restaurant) {
    setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handlePaymentRecorded(inserted: Subscription) {
    setSubscriptions((prev) => [inserted, ...prev]);
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
              onPlanStatusSaved={handlePlanStatusSaved}
              onPaymentRecorded={handlePaymentRecorded}
              onClose={() => setManagingId(null)}
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
  onPlanStatusSaved,
  onPaymentRecorded,
  onClose,
}: {
  restaurant: Restaurant;
  subscription: Subscription | null;
  onPlanStatusSaved: (updated: Restaurant) => void;
  onPaymentRecorded: (inserted: Subscription) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(restaurant.status);
  const [planId, setPlanId] = useState(restaurant.planId);
  const [planSaving, setPlanSaving] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState(subscription?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(subscription?.periodEnd ?? "");
  const [paymentProofRef, setPaymentProofRef] = useState(subscription?.paymentProofRef ?? "");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function savePlanStatus() {
    setPlanSaving(true);
    setPlanError(null);
    setPlanSaved(false);
    const result = await updateTenantPlanStatus(restaurant.id, { planId, status });
    setPlanSaving(false);
    if ("error" in result) {
      setPlanError(result.error);
      return;
    }
    onPlanStatusSaved(result.data);
    setPlanSaved(true);
  }

  async function savePayment() {
    setPaymentSaving(true);
    setPaymentError(null);
    setPaymentSaved(false);
    const result = await recordSubscriptionPayment({
      restaurantId: restaurant.id,
      periodStart,
      periodEnd,
      paymentProofRef: paymentProofRef || undefined,
    });
    setPaymentSaving(false);
    if ("error" in result) {
      setPaymentError(result.error);
      return;
    }
    onPaymentRecorded(result.data);
    setPaymentSaved(true);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{restaurant.name}</SheetTitle>
      </SheetHeader>

      <div className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border pb-6">
          <p className="text-sm font-semibold">Plan &amp; status</p>
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

          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePlanStatus} disabled={planSaving}>
              {planSaving ? "Saving…" : "Update plan & status"}
            </Button>
            {planSaved && <p className="text-sm text-success">Saved.</p>}
          </div>
          {planError && <p className="text-sm text-destructive">{planError}</p>}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Record a payment</p>
          <p className="text-xs text-muted-foreground">
            Adds a new billing period to this tenant&apos;s payment history — it doesn&apos;t edit a past
            confirmation.
          </p>
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

          <div className="flex items-center justify-between">
            <Button size="sm" onClick={savePayment} disabled={paymentSaving || !periodStart || !periodEnd}>
              {paymentSaving ? "Recording…" : "Record payment"}
            </Button>
            {paymentSaved && <p className="text-sm text-success">Recorded.</p>}
          </div>
          {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
