import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getDashboardStats, getRecentDuplicates, getRecentInvoices } from "@/lib/invoices";
import { AlertTriangle, FileUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats;
  let recent;
  let duplicates;
  try {
    stats = await getDashboardStats();
    recent = await getRecentInvoices();
    duplicates = await getRecentDuplicates();
  } catch (error) {
    return (
      <AppShell eyebrow="Operations" title="Dashboard" action={<Link className="button" href="/upload"><FileUp size={16} />Upload</Link>}>
        <ErrorPanel error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Operations" title="Dashboard" action={<Link className="button" href="/upload"><FileUp size={16} />Upload Invoice</Link>}>
      <div className="grid cols-4">
        <div className="card stat"><span className="muted">Invoices</span><strong>{stats.invoices}</strong></div>
        <div className="card stat"><span className="muted">Bottle line items</span><strong>{stats.lineItems}</strong></div>
        <div className="card stat"><span className="muted">Vendors</span><strong>{stats.vendors}</strong></div>
        <div className="card stat duplicate-stat">
          <span className="muted">Duplicates caught</span>
          <strong>{stats.duplicates}</strong>
        </div>
      </div>
      <div style={{ height: 16 }} />
      {duplicates.length ? (
        <>
          <section className="panel grid">
            <div className="topbar" style={{ marginBottom: 0 }}>
              <div>
                <h2>Duplicate activity</h2>
                <p className="muted" style={{ margin: 0 }}>Recent duplicate PDFs and invoice records SIV prevented from being saved twice.</p>
              </div>
              <span className="badge warn"><AlertTriangle size={14} />Duplicate</span>
            </div>
            <div className="duplicate-activity-list">
              {duplicates.map((item) => (
                <Link className="duplicate-activity" href={item.href} key={item.id}>
                  <span className="badge warn">{item.type}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.detail || "Already exists in the vault."}</p>
                  </div>
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </Link>
              ))}
            </div>
          </section>
          <div style={{ height: 16 }} />
        </>
      ) : null}
      <section className="panel">
        <h2>Recent invoices</h2>
        <div className="dashboard-invoice-list">
          <table className="dashboard-invoice-table">
            <thead>
              <tr><th>Invoice</th><th>Vendor</th><th>Store</th><th>Date</th><th>Status</th><th>Lines</th><th></th></tr>
            </thead>
            <tbody>
              {recent.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice">{invoice.invoice_number}</td>
                  <td data-label="Vendor">{invoice.vendors?.name || "-"}</td>
                  <td data-label="Store">{invoice.stores?.name || "-"}</td>
                  <td data-label="Date">{invoice.invoice_date || "-"}</td>
                  <td data-label="Status"><span className={invoice.parse_status === "reviewed" ? "badge" : "badge warn"}>{invoice.parse_status}</span></td>
                  <td data-label="Lines">{invoice.invoice_line_items?.length || 0}</td>
                  <td data-label=""><Link className="button secondary" href={`/review/${invoice.id}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
