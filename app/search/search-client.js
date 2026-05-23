"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ResultTable } from "@/components/result-table";

const pageSize = 1000;

export function SearchClient({ initialQuery }) {
  const [allRows, setAllRows] = useState([]);
  const [filters, setFilters] = useState({ vendors: [], stores: [], sizes: [] });
  const [browse, setBrowse] = useState({
    text: initialQuery || "",
    vendor: "",
    invoiceDate: "",
    month: "",
    year: "",
    sort: "recent"
  });
  const [loadingBrowse, setLoadingBrowse] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBrowseRows();
  }, []);

  async function loadBrowseRows() {
    setLoadingBrowse(true);
    setError("");
    const response = await fetch(`/api/line-items?limit=${pageSize}&offset=0`);
    const payload = await response.json();
    setLoadingBrowse(false);
    if (!response.ok) {
      setError(payload.error || "Unable to load invoice line items.");
      return;
    }
    setAllRows(payload.rows || []);
    setFilters(payload.filters || { vendors: [], stores: [], sizes: [] });
    setNextOffset(payload.nextOffset);
  }

  async function loadMoreRows() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError("");
    const response = await fetch(`/api/line-items?limit=${pageSize}&offset=${nextOffset}`);
    const payload = await response.json();
    setLoadingMore(false);
    if (!response.ok) {
      setError(payload.error || "Unable to load more invoice line items.");
      return;
    }
    setAllRows((current) => mergeRows(current, payload.rows || []));
    setFilters((current) => mergeFilters(current, payload.filters || {}));
    setNextOffset(payload.nextOffset);
  }

  const browseRows = allRows.filter((row) => {
    const haystack = [
      row.product_name_raw,
      row.product_name_normalized,
      row.brand,
      row.bottle_name,
      row.size,
      row.sku,
      row.upc,
      row.invoice_number
    ].filter(Boolean).join(" ").toLowerCase();
    const textMatch = !browse.text.trim() || haystack.includes(browse.text.trim().toLowerCase());
    const vendorMatch = !browse.vendor || row.vendor_name === browse.vendor;
    const dateParts = invoiceDateParts(row.invoice_date);
    const dateMatch = !browse.invoiceDate || row.invoice_date === browse.invoiceDate;
    const monthMatch = !browse.month || dateParts.month === browse.month;
    const yearMatch = !browse.year || dateParts.year === browse.year;
    return textMatch && vendorMatch && dateMatch && monthMatch && yearMatch;
  }).sort((a, b) => compareRows(a, b, browse.sort));
  const dateOptions = uniqueDates(allRows);
  const monthOptions = uniqueMonths(allRows);
  const yearOptions = uniqueYears(allRows);
  const resetBrowse = { text: "", vendor: "", invoiceDate: "", month: "", year: "", sort: "recent" };

  return (
    <div className="grid">
      {error ? <div className="panel" style={{ color: "var(--danger)" }}>{error}</div> : null}
      <section className="panel grid">
        <div className="topbar" style={{ marginBottom: 0 }}>
          <div>
            <h2>Browse invoice line items</h2>
            <p className="muted" style={{ margin: 0 }}>
              {loadingBrowse ? "Loading extracted products..." : `${browseRows.length} of ${allRows.length} line items shown`}
            </p>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => setBrowse(resetBrowse)}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
        <div className="filter-grid filter-grid-wide">
          <label className="field">
            <span>Filter records</span>
            <input
              className="input"
              placeholder="Product, vendor, SKU, invoice..."
              value={browse.text}
              onChange={(event) => setBrowse({ ...browse, text: event.target.value })}
            />
          </label>
          <FilterSelect label="Vendor" value={browse.vendor} options={filters.vendors} onChange={(vendor) => setBrowse({ ...browse, vendor })} />
          <FilterSelect label="Invoice date" value={browse.invoiceDate} options={dateOptions} onChange={(invoiceDate) => setBrowse({ ...browse, invoiceDate })} />
          <FilterSelect label="Month" value={browse.month} options={monthOptions} onChange={(month) => setBrowse({ ...browse, month })} />
          <FilterSelect label="Year" value={browse.year} options={yearOptions} onChange={(year) => setBrowse({ ...browse, year })} />
          <label className="field">
            <span>Sort</span>
            <select className="select" value={browse.sort} onChange={(event) => setBrowse({ ...browse, sort: event.target.value })}>
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest</option>
              <option value="product">Product A-Z</option>
              <option value="vendor">Vendor A-Z</option>
            </select>
          </label>
        </div>
        <ResultTable rows={browseRows} emptyLabel={loadingBrowse ? "Loading invoice line items..." : "No invoice line items match these filters."} />
        {nextOffset !== null ? (
          <div className="load-more-row">
            <button className="button secondary" disabled={loadingMore} onClick={loadMoreRows} type="button">
              {loadingMore ? "Loading more..." : `Load next ${pageSize.toLocaleString()} line items`}
            </button>
            <span className="muted">{allRows.length.toLocaleString()} loaded so far</span>
          </div>
        ) : allRows.length ? (
          <p className="muted small-text">{allRows.length.toLocaleString()} total line items loaded.</p>
        ) : null}
      </section>
    </div>
  );
}

function mergeRows(current, next) {
  const seen = new Set(current.map((row) => row.line_item_id || row.id));
  return [
    ...current,
    ...next.filter((row) => {
      const key = row.line_item_id || row.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  ];
}

function mergeFilters(current, next) {
  return {
    vendors: uniqueStrings([...(current.vendors || []), ...(next.vendors || [])]),
    stores: uniqueStrings([...(current.stores || []), ...(next.stores || [])]),
    sizes: uniqueStrings([...(current.sizes || []), ...(next.sizes || [])])
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
}

function compareRows(a, b, sort) {
  if (sort === "oldest") return dateValue(a.invoice_date) - dateValue(b.invoice_date) || textCompare(a.product_name_raw, b.product_name_raw);
  if (sort === "product") return textCompare(a.product_name_raw, b.product_name_raw) || dateValue(b.invoice_date) - dateValue(a.invoice_date);
  if (sort === "vendor") return textCompare(a.vendor_name, b.vendor_name) || dateValue(b.invoice_date) - dateValue(a.invoice_date);
  return dateValue(b.invoice_date) - dateValue(a.invoice_date) || textCompare(a.product_name_raw, b.product_name_raw);
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function invoiceDateParts(value) {
  const date = parseInvoiceDate(value);
  if (!date) return { month: "", year: "" };
  return {
    month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    year: String(date.getUTCFullYear())
  };
}

function uniqueDates(rows) {
  return Array.from(new Set(rows.map((row) => row.invoice_date).filter(Boolean))).sort((a, b) => dateValue(b) - dateValue(a));
}

function uniqueMonths(rows) {
  const values = Array.from(new Set(rows.map((row) => invoiceDateParts(row.invoice_date).month).filter(Boolean)));
  return values.sort((a, b) => b.localeCompare(a)).map((value) => ({
    value,
    label: monthLabel(value)
  }));
}

function uniqueYears(rows) {
  return Array.from(new Set(rows.map((row) => invoiceDateParts(row.invoice_date).year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
}

function parseInvoiceDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(value) {
  const [year, month] = String(value || "").split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`;
}

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}
