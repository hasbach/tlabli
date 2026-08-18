"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase/client";

export function AdminHeader() {
  const router = useRouter();
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleSheetOpenChange(open: boolean) {
    setChangingPassword(open);
    if (!open) {
      setSaved(false);
      setError(null);
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function handleChangePassword() {
    setError(null);
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <header className="flex items-center justify-between gap-2.5 border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="font-extrabold tracking-tight">tlabli</p>
          <p className="text-xs text-muted-foreground">Platform Admin</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setChangingPassword(true)} className="gap-1.5">
          <KeyRound className="h-3.5 w-3.5" /> Change password
        </Button>
        <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
          <LogOut className="h-3.5 w-3.5" /> Log out
        </Button>
      </div>

      <Sheet open={changingPassword} onOpenChange={handleSheetOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Change password</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <Label htmlFor="admin-new-password">New password</Label>
              <Input
                id="admin-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setSaved(false);
                }}
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <Label htmlFor="admin-confirm-password">Confirm new password</Label>
              <Input
                id="admin-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <Button onClick={handleChangePassword} disabled={saving || !newPassword || !confirmPassword}>
              {saving ? "Saving…" : "Update password"}
            </Button>
            {saved && <p className="text-sm text-success">Password updated.</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
