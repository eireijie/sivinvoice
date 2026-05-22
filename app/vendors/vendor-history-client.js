"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Folder, ReceiptText, RotateCcw, Search } from "lucide-react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function VendorHistoryClient({ vendors }) {
  const preparedVendors = useMemo(() => prepareVendors(vendors || []), [vendors]);
  const [selectedVendorId, setSelectedVendorId] = useState(preparedVendors[0]?.id || "");
  const [vendorQuery, setVendorQuery] = useState("");
  const [filters, setFilters] = useState({
    text: "",
    day: "",
    month: "",
    year: "",
    from: "",
    to: "",
    sort: "recent"
  });

  const visibleVendors = preparedVendors.filter((vendor) => {
    const query = vendorQuery.trim().toLowerCase();
    if (!query) return true;
    return vendor.name.toLowerCase().includes(query);
  });
  const selectedVendor = preparedVendors.find((vendor) => vendor.id === selectedVendorId) || visibleVendors[0] || preparedVendors[0];
  const invoices = useMemo(() => filterInvoices(selectedVendor?.invoices || [], filters), [selectedVendor, filters]);
  const resetFilters = { text: "", day: "", month: "", year: "", from: "", to: "", sort: "recent" };

  return (
    <div className="vendor-history">
      <section className="panel vendor-folder-panel">
        <div className="vendor-panel-header">
          <div>
            <h2>Vendor folders</h2>
            <p className="muted">{preparedVendors.length} vendors saved</p>
          </div>
        </div>
        <label className="field">
          <span>Find vendor</span>
          <div className="input-with-icon">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search vendors..."
              value={vendorQuery}
              onChange={(event) => setVendorQuery(event.target.value)}
            />
          </div>
        </label>
        <div className="vendor-folder-list">
          {visibleVendors.length ? visibleVendors.map((vendor) => (
            <button
              className={vendor.id === selectedVendor?.id ? "vendor-folder active" : "vendor-folder"}
              key={vendor.id}
              onClick={() => setSelectedVendorId(vendor.id)}
              type="button"
            >
              <span className="vendor-folder-icon"><Folder size={19} /></span>
              <span className="vendor-folder-copy">
                <strong>{vendor.name}</strong>
                <small>{vendor.invoiceCount} invoices · {currency.format(vendor.totalCost)}</small>
              </span>
            </button>
          )) : (
            <div className="muted">No vendors match that search.</div>
          )}
        </div>
      </section>

      <section className="panel vendor-invoice-panel">
        {selectedVendor ? (
          <>
            <div className="vendor-detail-header">
              <div>
                <span className="badge"><Folder size={14} /> Vendor folder</span>
                <h2>{selectedVendor.name}</h2>
                <p className="muted">
                  {invoices.length} of {selectedVendor.invoiceCount} invoices shown · {currency.format(sumInvoices(invoices))}
                </p>
              </div>
              <button className="button ghost" type="button" onClick={() => setFilters(resetFilters)}>
                <RotateCcw size={16} />
                Reset filters
              </button>
            </div>

            <div className="vendor-date-tools">
              <label className="field vendor-search-field">
                <span>Search this vendor</span>
                <input
                  className="input"
                  placeholder="Invoice number, store, file name..."
                  value={filters.text}
                  onChange={(event) => setFilters({ ...filters, text: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Day</span>
                <input className="input" type="date" value={filters.day} onChange={(event) => setFilters({ ...filters, day: event.target.value })} />
              </label>
              <label className="field">
                <span>Month</span>
                <input className="input" type="month" value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} />
              </label>
              <label className="field">
                <span>Year</span>
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2026"
                  value={filters.year}
                  onChange={(event) => setFilters({ ...filters, year: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                />
              </label>
              <label className="field">
                <span>From</span>
                <input className="input" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
              </label>
              <label className="field">
                <span>To</span>
                <input className="input" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
              </label>
              <label className="field">
                <span>Sort</span>
                <select className="select" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
                  <option value="recent">Most recent</option>
                  <option value="oldest">Oldest</option>
                  <option value="highest">Highest total</option>
                  <option value="invoice">Invoice number</option>
                </select>
              </label>
            </div>

            <div className="table-wrap responsive-cards vendor-invoice-table">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Store</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Lines</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length ? invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td data-label="Invoice">
                        <strong>{invoice.invoice_number || "Unnumbered"}</strong>
                        <div className="muted small-text">{invoice.original_file_name || "Uploaded invoice"}</div>
                      </td>
                      <td data-label="Store">{invoice.stores?.name || "-"}</td>
                      <td data-label="Date">{invoice.invoice_date || "-"}</td>
                      <td data-label="Total">{currency.format(invoice.invoiceTotal)}</td>
                      <td data-label="Lines">{invoice.lineCount}</td>
                      <td data-label="Status"><span className="badge">{invoice.parse_status || "saved"}</span></td>
                      <td data-label="Open">
                        <Link className="button secondary" href={`/review/${invoice.id}`}>
                          <ReceiptText size={16} />
                          Open
                        </Link>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <CalendarDays size={22} />
                          <strong>No invoices match these date filters.</strong>
                          <span>Clear the day, month, year, or date range to see more invoices.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Folder size={26} />
            <strong>No vendor folders yet.</strong>
            <span>Upload invoices and SIV will organize them by vendor automatically.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function prepareVendors(vendors) {
  return vendors.map((vendor) => {
    const invoices = (vendor.invoices || []).map((invoice) => {
      const lines = invoice.invoice_line_items || [];
      const lineTotal = lines.reduce((sum, line) => sum + Number(line.total_cost || 0), 0);
      return {
        ...invoice,
        invoiceTotal: Number(invoice.invoice_total || lineTotal || 0),
        lineCount: lines.length,
        lineQuantity: lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
      };
    });
    return {
      ...vendor,
      invoices,
      invoiceCount: invoices.length,
      totalCost: sumInvoices(invoices)
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function filterInvoices(invoices, filters) {
  return invoices.filter((invoice) => {
    const query = filters.text.trim().toLowerCase();
    const haystack = [
      invoice.invoice_number,
      invoice.original_file_name,
      invoice.stores?.name,
      invoice.parse_status
    ].filter(Boolean).join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filters.day && invoice.invoice_date !== filters.day) return false;
    if (filters.month && invoiceMonth(invoice.invoice_date) !== filters.month) return false;
    if (filters.year && invoiceYear(invoice.invoice_date) !== filters.year) return false;
    if (filters.from && dateValue(invoice.invoice_date) < dateValue(filters.from)) return false;
    if (filters.to && dateValue(invoice.invoice_date) > dateValue(filters.to)) return false;
    return true;
  }).sort((a, b) => compareInvoices(a, b, filters.sort));
}

function compareInvoices(a, b, sort) {
  if (sort === "oldest") return dateValue(a.invoice_date) - dateValue(b.invoice_date);
  if (sort === "highest") return Number(b.invoiceTotal || 0) - Number(a.invoiceTotal || 0);
  if (sort === "invoice") return String(a.invoice_number || "").localeCompare(String(b.invoice_number || ""), undefined, { numeric: true, sensitivity: "base" });
  return dateValue(b.invoice_date) - dateValue(a.invoice_date);
}

function sumInvoices(invoices) {
  return invoices.reduce((sum, invoice) => sum + Number(invoice.invoiceTotal || 0), 0);
}

function invoiceMonth(value) {
  return value ? String(value).slice(0, 7) : "";
}

function invoiceYear(value) {
  return value ? String(value).slice(0, 4) : "";
}

function dateValue(value) {
  const time = new Date(`${value || "0000-01-01"}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : 0;
}
