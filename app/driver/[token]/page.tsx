import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { DriverDashboard } from "@/components/driver/driver-dashboard";
import { getDriverView } from "@/lib/driver-view";

// Always re-check the token and assignments — never serve a cached copy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deliveries — Tlabli",
  robots: { index: false, follow: false },
};

export default async function DriverPage({ params }: { params: { token: string } }) {
  const result = await getDriverView(params.token);
  return (
    <LocaleProvider availableLocales={["en", "ar", "fr"]}>
      <DriverDashboard token={params.token} result={result} />
    </LocaleProvider>
  );
}
