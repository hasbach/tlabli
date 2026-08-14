"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Restaurant, StaffRole, StaffUser } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStaffMember, removeStaffMember, updateStaffRole } from "@/lib/actions/staff-actions";

const ROLE_CAPTION: Record<StaffRole, string> = {
  owner: "Full access, including billing and menu.",
  staff: "Can manage orders and the kitchen queue. Cannot edit the menu, settings, or billing.",
};

export function TeamSection({ restaurant, initialStaff }: { restaurant: Restaurant; initialStaff: StaffUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function addMember() {
    if (!name || !phone || !email || !password) return;
    setSubmitting(true);
    setError(null);
    const result = await addStaffMember({ restaurantId: restaurant.id, name, phone, role, email, password });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStaff((prev) => [...prev, result.data]);
    setName("");
    setPhone("");
    setRole("staff");
    setEmail("");
    setPassword("");
  }

  async function removeMember(id: string) {
    const previous = staff;
    setStaff((prev) => prev.filter((s) => s.id !== id));
    const result = await removeStaffMember(id);
    if ("error" in result) {
      setStaff(previous);
      setError(result.error);
    }
  }

  async function changeRole(id: string, newRole: StaffRole) {
    const previous = staff;
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: newRole } : s)));
    const result = await updateStaffRole(id, newRole);
    if ("error" in result) {
      setStaff(previous);
      setError(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <p className="text-sm text-muted-foreground">
          Owner — {ROLE_CAPTION.owner} Staff — {ROLE_CAPTION.staff}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {staff.map((member) => {
            const isOwner = member.role === "owner";
            return (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.phone}</p>
                </div>
                {isOwner ? (
                  <Badge>Owner</Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
                      {(["staff", "owner"] as StaffRole[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => changeRole(member.id, r)}
                          className={`px-2.5 py-1.5 capitalize transition-colors ${
                            member.role === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${member.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label htmlFor="team-phone">Phone</Label>
            <Input id="team-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div>
            <Label htmlFor="team-email">Login email</Label>
            <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@restaurant.com" />
          </div>
          <div>
            <Label htmlFor="team-password">Temporary password</Label>
            <Input
              id="team-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <Label>Role</Label>
            <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
              {(["staff", "owner"] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 px-2.5 py-2.5 capitalize transition-colors ${
                    role === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <Button onClick={addMember} disabled={!name || !phone || !email || !password || submitting} className="w-full">
              {submitting ? "Adding…" : "Add team member"}
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
