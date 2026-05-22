import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getVendorHistory } from "@/lib/invoices";
import { VendorHistoryClient } from "./vendor-history-client";

export const dynamic = "force-dynamic";

export default async function VendorHistoryPage() {
  let vendors;
  try {
    vendors = await getVendorHistory();
  } catch (error) {
    return (
      <AppShell eyebrow="Vendor Activity" title="Vendor History">
        <ErrorPanel error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Vendor Activity" title="Vendor History">
      <VendorHistoryClient vendors={vendors} />
    </AppShell>
  );
}
