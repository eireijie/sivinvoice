import Link from "next/link";
import { getActiveWorkspacePlan } from "@/lib/organization";
import { BatchesClient } from "@/app/batches/batches-client";
import { UploadForm } from "@/app/upload/upload-form";

export const dynamic = "force-dynamic";

export default async function MobileUploadPage({ searchParams }) {
  const params = await searchParams;
  const mode = params?.mode === "batch" ? "batch" : "invoice";
  const plan = await getActiveWorkspacePlan();
  const canBatch = mode !== "batch" || plan.id !== "free";

  return (
    <main className="mobile-upload-shell">
      <header className="mobile-upload-header">
        <div className="brand-mark">SIV</div>
        <div>
          <span className="eyebrow">{mode === "batch" ? "Batch upload" : "Invoice upload"}</span>
          <h1>{mode === "batch" ? "Upload files" : "Upload one invoice"}</h1>
        </div>
      </header>

      {canBatch ? (
        <>
          <p className="mobile-upload-note">
            {mode === "batch"
              ? "Attach separate invoice files. Each image becomes its own invoice; PDFs are detected as batches."
              : "Attach one PDF, or multiple photos/pages that all belong to the same invoice."}
          </p>
          {mode === "batch" ? <BatchesClient uploadOnly /> : <UploadForm />}
        </>
      ) : (
        <section className="panel grid">
          <span className="badge warn">Pro feature</span>
          <h2>Batch upload is not included on Free.</h2>
          <p className="muted">Use regular invoice upload, or upgrade on the computer from Settings.</p>
          <Link className="button" href="/mobile-upload?mode=invoice">Upload one invoice</Link>
        </section>
      )}
    </main>
  );
}
