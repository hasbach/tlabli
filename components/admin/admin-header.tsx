"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { ChangePasswordControl } from "@/components/shared/change-password-control";

export function AdminHeader() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
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
        <ChangePasswordControl
          trigger={(onClick) => (
            <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Change password
            </Button>
          )}
        />
        <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
          <LogOut className="h-3.5 w-3.5" /> Log out
        </Button>
      </div>
    </header>
  );
}
