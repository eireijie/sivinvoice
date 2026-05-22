import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getInvoicesNeedingReview } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  let invoices;
  try {
    invoices = await getInvoicesNeedingReview();
  } catch (error) {
    return (
      <AppShell eyebrow="Review" title="Invoice Review" action={<Link className="button" href="/upload"><Upload size={16} />Upload Invoice</Link>}>
        <ErrorPanel error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Review" title="Invoice Review" action={<Link className="button" href="/upload"><Upload size={16} />Upload Invoice</Link>}>
      {invoices.length ? (
        <section className="panel grid">
          <div className="topbar" style={{ marginBottom: 0 }}>
            <div>
              <h2>Review queue</h2>
              <p className="muted" style={{ margin: 0 }}>{invoices.length} invoice{invoices.length === 1 ? "" : "s"} queued, processing, failed, or waiting for approval.</p>
            </div>
          </div>
          <div className="table-wrap responsive-cards">
            <table>
              <thead>
                <tr><th>Invoice</th><th>Vendor</th><th>Store</th><th>Date</th><th>Status</th><th>Lines</th><th>Uploaded</th><th></th></tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Invoice">
                      <strong>{invoice.invoice_number}</strong>
                      <div className="muted">{invoice.original_file_name || ""}</div>
                    </td>
                    <td data-label="Vendor">{invoice.vendors?.name || "-"}</td>
                    <td data-label="Store">{invoice.stores?.name || "-"}</td>
                    <td data-label="Date">{invoice.invoice_date || "-"}</td>
                    <td data-label="Status"><span className={invoice.parse_status === "needs_review" ? "badge" : "badge warn"}>{statusLabel(invoice.parse_status)}</span></td>
                    <td data-label="Lines">{invoice.invoice_line_items?.length || 0}</td>
                    <td data-label="Uploaded">{new Date(invoice.created_at).toLocaleString()}</td>
                    <td data-label=""><Link className="button secondary" href={`/review/${invoice.id}`}><FileText size={16} />{invoice.parse_status === "needs_review" ? "Review" : "Open"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel empty-state">
          <div>
            <h2>No invoices in the review queue</h2>
            <p className="muted">Queued, processing, failed, and ready-for-review uploads will appear here.</p>
            <Link className="button" href="/upload"><Upload size={16} />Upload Invoice</Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function statusLabel(status) {
  if (status === "queued") return "queued";
  if (status === "processing") return "processing";
  if (status === "processing_failed") return "failed";
  if (status === "needs_review") return "needs review";
  return status || "unknown";
}
