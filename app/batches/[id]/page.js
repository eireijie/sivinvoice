import { AppShell } from "@/components/app-shell";
import { BatchDetailClient } from "./batch-detail-client";

export default async function BatchDetailPage({ params }) {
  const routeParams = await params;
  return (
    <AppShell eyebrow="Batch Review" title="Detected invoices">
      <BatchDetailClient batchId={routeParams.id} />
    </AppShell>
  );
}
