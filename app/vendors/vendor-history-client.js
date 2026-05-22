"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Folder, GitMerge, Plus, ReceiptText, RotateCcw, Search, Trash2, X } from "lucide-react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function VendorHistoryClient({ vendors }) {
  const [vendorRows, setVendorRows] = useState(vendors || []);
  const preparedVendors = useMemo(() => prepareVendors(vendorRows), [vendorRows]);
  const [selectedVendorId, setSelectedVendorId] = useState(preparedVendors[0]?.id || "");
  const [vendorQuery, setVendorQuery] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [filters, setFilters] = useState({ text: "", day: "", from: "", to: "", sort: "recent" });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const visibleVendors = preparedVendors.filter((vendor) => {
    const query = vendorQuery.trim().toLowerCase();
    if (!query) return true;
    return vendor.name.toLowerCase().includes(query);
  });
  const selectedVendor = preparedVendors.find((vendor) => vendor.id === selectedVendorId) || visibleVendors[0] || preparedVendors[0];
  const invoices = useMemo(() => filterInvoices(selectedVendor?.invoices || [], filters), [selectedVendor, filters]);
  const mergeOptions = preparedVendors.filter((vendor) => vendor.id !== selectedVendor?.id);
  const resetFilters = { text: "", day: "", from: "", to: "", sort: "recent" };

  async function addVendor(event) {
    event.preventDefault();
    const name = newVendorName.trim();
    if (!name) return;
    setBusy("add");
    setMessage("");
    setError("");
    const response = await fetch("/api/vendors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) {
      setError(payload.error || "Unable to add vendor folder.");
      return;
    }
    setVendorRows((current) => upsertVendorRow(current, payload.vendor));
    setSelectedVendorId(payload.vendor.id);
    setNewVendorName("");
    setMessage("Vendor folder added.");
  }

  async function mergeVendor() {
    if (!selectedVendor || !mergeSourceId) return;
    const sourceVendor = preparedVendors.find((vendor) => vendor.id === mergeSourceId);
    const confirmed = window.confirm(`Merge ${sourceVendor?.name || "this vendor"} into ${selectedVendor.name}? Its invoices will move into ${selectedVendor.name}.`);
    if (!confirmed) return;

    setBusy("merge");
    setMessage("");
    setError("");
    const response = await fetch(`/api/vendors/${selectedVendor.id}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceVendorId: mergeSourceId })
    });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) {
      setError(payload.error || "Unable to merge vendor folders.");
      return;
    }
    setVendorRows((current) => mergeVendorRows(current, selectedVendor.id, mergeSourceId));
    setMergeOpen(false);
    setMergeSourceId("");
    setMessage("Vendor folders merged.");
  }

  async function deleteVendor() {
    if (!selectedVendor) return;
    const confirmed = window.confirm(`Delete the ${selectedVendor.name} folder? The invoices stay saved, but they will no longer be assigned to this vendor.`);
    if (!confirmed) return;

    setBusy("delete");
    setMessage("");
    setError("");
    const response = await fetch(`/api/vendors/${selectedVendor.id}`, { method: "DELETE" });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) {
      setError(payload.error || "Unable to delete vendor folder.");
      return;
    }
    const remaining = preparedVendors.filter((vendor) => vendor.id !== selectedVendor.id);
    setVendorRows((current) => current.filter((vendor) => vendor.id !== selectedVendor.id));
    setSelectedVendorId(remaining[0]?.id || "");
    setMergeOpen(false);
    setMergeSourceId("");
    setMessage("Vendor folder deleted. Invoices were kept.");
  }

  return (
    <div className="vendor-history">
      <section className="panel vendor-folder-panel">
        <div className="vendor-panel-header">
          <div>
            <h2>Vendor folders</h2>
            <p className="muted">{preparedVendors.length} vendors saved</p>
          </div>
        </div>

        <form className="vendor-add-form" onSubmit={addVendor}>
          <label className="field">
            <span>Add vendor folder</span>
            <input
              className="input"
              placeholder="Vendor name..."
              value={newVendorName}
              onChange={(event) => setNewVendorName(event.target.value)}
            />
          </label>
          <button className="button" disabled={busy === "add" || !newVendorName.trim()} type="submit">
            <Plus size={16} />
            {busy === "add" ? "Adding..." : "Add"}
          </button>
        </form>

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

        {message ? <div className="inline-message ok">{message}</div> : null}
        {error ? <div className="inline-message error">{error}</div> : null}

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
              <div className="vendor-actions">
                <button className="button secondary" disabled={mergeOptions.length === 0} type="button" onClick={() => setMergeOpen(true)}>
                  <GitMerge size={16} />
                  Merge
                </button>
                <button className="button danger" disabled={busy === "delete"} type="button" onClick={deleteVendor}>
                  <Trash2 size={16} />
                  {busy === "delete" ? "Deleting..." : "Delete"}
                </button>
                <button className="button ghost" type="button" onClick={() => setFilters(resetFilters)}>
                  <RotateCcw size={16} />
                  Reset filters
                </button>
              </div>
            </div>

            {mergeOpen ? (
              <div className="vendor-merge-box">
                <div>
                  <h3>Merge another vendor into {selectedVendor.name}</h3>
                  <p className="muted">Invoices from the selected vendor will move into this folder, then the old folder is removed.</p>
                </div>
                <label className="field">
                  <span>Vendor to merge</span>
                  <select className="select" value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)}>
                    <option value="">Choose vendor</option>
                    {mergeOptions.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.invoiceCount} invoices</option>
                    ))}
                  </select>
                </label>
                <div className="vendor-merge-actions">
                  <button className="button" disabled={busy === "merge" || !mergeSourceId} onClick={mergeVendor} type="button">
                    <GitMerge size={16} />
                    {busy === "merge" ? "Merging..." : "Merge folders"}
                  </button>
                  <button className="button ghost" onClick={() => setMergeOpen(false)} type="button">
                    <X size={16} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

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
              <CalendarFilter
                open={calendarOpen}
                selectedDate={filters.day}
                onClear={() => {
                  setFilters({ ...filters, day: "" });
                  setCalendarOpen(false);
                }}
                onSelect={(day) => {
                  setFilters({ ...filters, day });
                  setCalendarOpen(false);
                }}
                onToggle={() => setCalendarOpen((value) => !value)}
              />
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
                          <span>Clear the calendar date or date range to see more invoices.</span>
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
            <span>Add a vendor folder or upload invoices and SIV will organize them automatically.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function CalendarFilter({ open, selectedDate, onClear, onSelect, onToggle }) {
  const selected = parseDate(selectedDate) || new Date();
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const days = calendarDays(viewYear, viewMonth);

  function shiftMonth(delta) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  return (
    <div className="field calendar-field">
      <span>Calendar date</span>
      <button className="button secondary calendar-trigger" type="button" onClick={onToggle}>
        <CalendarDays size={16} />
        {selectedDate || "Choose day"}
      </button>
      {open ? (
        <div className="calendar-popover">
          <div className="calendar-top">
            <button className="icon-button" type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={17} />
            </button>
            <select className="select" value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))}>
              {monthNames().map((month, index) => <option key={month} value={index}>{month}</option>)}
            </select>
            <input
              className="input calendar-year"
              inputMode="numeric"
              value={viewYear}
              onChange={(event) => setViewYear(Number(event.target.value.replace(/\D/g, "").slice(0, 4)) || new Date().getFullYear())}
            />
            <button className="icon-button" type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {days.map((day) => (
              <button
                className={day.value === selectedDate ? "calendar-day active" : "calendar-day"}
                disabled={!day.inMonth}
                key={day.value}
                onClick={() => onSelect(day.value)}
                type="button"
              >
                {day.label}
              </button>
            ))}
          </div>
          <div className="calendar-actions">
            <button className="button ghost" type="button" onClick={onClear}>Clear date</button>
          </div>
        </div>
      ) : null}
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
    if (filters.from && dateValue(invoice.invoice_date) < dateValue(filters.from)) return false;
    if (filters.to && dateValue(invoice.invoice_date) > dateValue(filters.to)) return false;
    return true;
  }).sort((a, b) => compareInvoices(a, b, filters.sort));
}

function upsertVendorRow(vendors, vendor) {
  if (!vendor) return vendors;
  const exists = vendors.some((item) => item.id === vendor.id);
  if (exists) return vendors.map((item) => item.id === vendor.id ? { ...item, ...vendor, invoices: item.invoices || [] } : item);
  return [...vendors, { ...vendor, invoices: [] }];
}

function mergeVendorRows(vendors, targetVendorId, sourceVendorId) {
  const source = vendors.find((vendor) => vendor.id === sourceVendorId);
  return vendors
    .filter((vendor) => vendor.id !== sourceVendorId)
    .map((vendor) => {
      if (vendor.id !== targetVendorId) return vendor;
      return {
        ...vendor,
        invoices: [
          ...(vendor.invoices || []),
          ...((source?.invoices || []).map((invoice) => ({ ...invoice, vendor_id: targetVendorId })))
        ]
      };
    });
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

function calendarDays(year, month) {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const start = new Date(firstDay);
  start.setUTCDate(1 - firstDay.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      value: date.toISOString().slice(0, 10),
      label: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month
    };
  });
}

function monthNames() {
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2026, index, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value) {
  const time = new Date(`${value || "0000-01-01"}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : 0;
}
