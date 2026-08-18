"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase/client";

export function ChangePasswordControl({
  trigger,
}: {
  trigger: (onClick: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
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
    <>
      {trigger(() => setOpen(true))}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Change password</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <Label htmlFor="change-password-new">New password</Label>
              <Input
                id="change-password-new"
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
              <Label htmlFor="change-password-confirm">Confirm new password</Label>
              <Input
                id="change-password-confirm"
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
    </>
  );
}
