"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Restaurant, StaffRole, StaffUser } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_CAPTION: Record<StaffRole, string> = {
  owner: "Full access, including billing and menu.",
  staff: "Can manage orders and the kitchen queue. Cannot edit the menu, settings, or billing.",
};

export function TeamSection({ restaurant, initialStaff }: { restaurant: Restaurant; initialStaff: StaffUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");

  const owner = staff[0];

  function addMember() {
    if (!name || !phone) return;
    setStaff((prev) => [
      ...prev,
      { id: `st-${restaurant.id}-${prev.length + 1}`, restaurantId: restaurant.id, name, phone, role },
    ]);
    setName("");
    setPhone("");
    setRole("staff");
  }

  function removeMember(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  function changeRole(id: string, newRole: StaffRole) {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: newRole } : s)));
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
            const isOwner = member.id === owner?.id;
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

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label htmlFor="team-phone">Phone</Label>
            <Input id="team-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961 7X XXX XXX" />
          </div>
          <div className="flex items-end">
            <Button onClick={addMember} disabled={!name || !phone} className="w-full">
              Add team member
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
