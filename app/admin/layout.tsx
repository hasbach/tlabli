import { AdminHeader } from "@/components/admin/admin-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <AdminHeader />
      <main className="mx-auto max-w-6xl p-6 sm:p-8">{children}</main>
    </div>
  );
}
