import { AppShell } from "@/components/app-shell";
import { PricesClient } from "./prices-client";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  return (
    <AppShell eyebrow="Analytics" title="Price Tracker" action={null}>
      <PricesClient />
    </AppShell>
  );
}
