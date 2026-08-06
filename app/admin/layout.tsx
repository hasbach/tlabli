import { ShieldCheck } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center gap-2.5 border-b border-border bg-card px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="font-extrabold tracking-tight">tlabli</p>
          <p className="text-xs text-muted-foreground">Platform Admin</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6 sm:p-8">{children}</main>
    </div>
  );
}
