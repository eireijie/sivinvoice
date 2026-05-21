import { AppShell } from "@/components/app-shell";
import { InvoicesClient } from "./invoices-client";

export default function InvoicesPage() {
  return (
    <AppShell eyebrow="Records" title="Invoices">
      <InvoicesClient />
    </AppShell>
  );
}
