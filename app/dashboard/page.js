import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getDashboardStats, getDashboardInsights, getRecentDuplicates, getRecentInvoices } from "@/lib/invoices";
import { AlertTriangle, ArrowUpRight, ArrowDownRight, FileUp, FileText, Package, Users, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats;
  let insights;
  let recent;
  let duplicates;
  try {
    [stats, insights, recent, duplicates] = await Promise.all([
      getDashboardStats(),
      getDashboardInsights(),
      getRecentInvoices(),
      getRecentDuplicates()
    ]);
  } catch (error) {
    return (
      <AppShell eyebrow="Operations" title="Dashboard" action={<Link className="button" href="/upload"><FileUp size={16} />Upload</Link>}>
        <ErrorPanel error={error} />
      </AppShell>
    );
  }

  const maxVendorAmount = Math.max(...(insights.topVendors || []).map(v => v.amount), 1);

  return (
    <AppShell eyebrow="Operations" title="Dashboard" action={<Link className="button" href="/upload"><FileUp size={16} />Upload Invoice</Link>}>
      <div className="grid cols-4">
        <div className="dashboard-stat">
          <div className="dashboard-stat-icon"><FileText size={20} /></div>
          <div>
            <span className="muted">Total Invoices</span>
            <strong>{stats.invoices}</strong>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-icon"><Package size={20} /></div>
          <div>
            <span className="muted">Line Items</span>
            <strong>{stats.lineItems}</strong>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-icon"><Users size={20} /></div>
          <div>
            <span className="muted">Vendors</span>
            <strong>{stats.vendors}</strong>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-icon"><ShieldCheck size={20} /></div>
          <div>
            <span className="muted">Duplicates Caught</span>
            <strong>{stats.duplicates}</strong>
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <div className="dashboard-two-col">
        <section className="panel dashboard-spending">
          <h2>Spending Summary</h2>
          <div className="spending-amounts">
            <div>
              <span className="muted">This month</span>
              <strong>{money(insights.spendThisMonth)}</strong>
            </div>
            <div>
              <span className="muted">Last month</span>
              <strong>{money(insights.spendLastMonth)}</strong>
            </div>
            <div className={`spending-trend ${insights.spendTrend > 0 ? "up" : "down"}`}>
              {insights.spendTrend > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
              <strong>{Math.abs(insights.spendTrend).toFixed(1)}%</strong>
            </div>
          </div>
        </section>
        <section className="panel dashboard-top-vendors">
          <h2>Top Vendors This Month</h2>
          {insights.topVendors.length > 0 ? (
            <div className="vendor-bars">
              {insights.topVendors.map(v => (
                <div key={v.name} className="vendor-bar-row">
                  <span>{v.name}</span>
                  <div className="vendor-bar">
                    <span style={{ width: `${(v.amount / maxVendorAmount) * 100}%` }} />
                  </div>
                  <strong>{money(v.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No vendor data this month yet.</p>
          )}
        </section>
      </div>
      <div style={{ height: 16 }} />
      {insights.needsReviewCount > 0 ? (
        <>
          <section className="panel dashboard-attention">
            <div>
              <h2><AlertTriangle size={18} /> Needs Attention</h2>
              <p className="muted">{insights.needsReviewCount} invoice{insights.needsReviewCount === 1 ? "" : "s"} waiting for review.</p>
            </div>
            <Link className="button secondary" href="/review">Review Now</Link>
          </section>
          <div style={{ height: 16 }} />
        </>
      ) : null}
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

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}
