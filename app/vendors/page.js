import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getVendorHistory } from "@/lib/invoices";

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Vendor</th><th>Invoices</th><th>Line Quantity</th><th>Total Cost</th><th>Recent invoice</th></tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => {
              const invoices = vendor.invoices || [];
              const lines = invoices.flatMap((invoice) => invoice.invoice_line_items || []);
              const total = lines.reduce((sum, line) => sum + Number(line.total_cost || 0), 0);
              const recent = invoices.sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)))[0];
              return (
                <tr key={vendor.id}>
                  <td><strong>{vendor.name}</strong></td>
                  <td>{invoices.length}</td>
                  <td>{lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)}</td>
                  <td>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total)}</td>
                  <td>{recent ? <Link className="button secondary" href={`/review/${recent.id}`}>{recent.invoice_number}</Link> : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
