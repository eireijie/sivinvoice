import Link from "next/link";
import { FileText } from "lucide-react";

export function ResultTable({ rows, emptyLabel = "No matching invoice line items found." }) {
  if (!rows?.length) {
    return <div className="panel muted">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap responsive-cards">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Size</th>
            <th>SKU / UPC</th>
            <th>Vendor</th>
            <th>Store</th>
            <th>Invoice</th>
            <th>Qty</th>
            <th>Cost</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line_item_id || row.id}>
              <td data-label="Product">
                <strong>{row.product_name_raw}</strong>
                <div className="muted">{row.brand}</div>
              </td>
              <td data-label="Size">{row.size || "-"}</td>
              <td data-label="SKU / UPC">
                <div>{row.sku || "-"}</div>
                <div className="muted">{row.upc || ""}</div>
              </td>
              <td data-label="Vendor">{row.vendor_name || "-"}</td>
              <td data-label="Store">{row.store_name || "-"}</td>
              <td data-label="Invoice">
                <div>{row.invoice_number}</div>
                <div className="muted">{row.invoice_date || ""}</div>
              </td>
              <td data-label="Qty">{row.quantity}</td>
              <td data-label="Cost">{money(row.total_cost ?? row.unit_cost)}</td>
              <td data-label="">
                <Link className="button secondary" href={`/review/${row.invoice_id}`}>
                  <FileText size={16} />
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}
