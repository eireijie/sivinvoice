import { AppShell } from "@/components/app-shell";
import { PhoneUploadQr } from "@/components/phone-upload-qr";
import Link from "next/link";
import { getActiveWorkspacePlan } from "@/lib/organization";
import { BatchesClient } from "./batches-client";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const plan = await getActiveWorkspacePlan();
  return (
    <AppShell eyebrow="Batch Intake" title="Batch Upload">
      {plan.id === "free" ? <BatchUpgrade /> : (
        <>
          <PhoneUploadQr mode="batch" />
          <BatchesClient />
        </>
      )}
    </AppShell>
  );
}

function BatchUpgrade() {
  return (
    <section className="panel grid empty-state">
      <span className="badge warn">Pro feature</span>
      <h2>Batch upload is included with Pro and Max.</h2>
      <p className="muted">
        Free includes regular single-invoice uploads. Upgrade when you want to upload scanned invoice packets, multi-invoice PDFs, or many invoice images at once.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="button" href="/settings?tab=billing">
          Upgrade plan
        </Link>
        <Link className="button secondary" href="/upload">
          Upload one invoice
        </Link>
      </div>
    </section>
  );
}
