"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ResultTable } from "@/components/result-table";

export function SearchClient({ initialQuery }) {
  const [allRows, setAllRows] = useState([]);
  const [filters, setFilters] = useState({ vendors: [], stores: [], sizes: [] });
  const [browse, setBrowse] = useState({ text: initialQuery || "", vendor: "", store: "", size: "" });
  const [loadingBrowse, setLoadingBrowse] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBrowseRows();
  }, []);

  async function loadBrowseRows() {
    setLoadingBrowse(true);
    setError("");
    const response = await fetch("/api/line-items?limit=1000");
    const payload = await response.json();
    setLoadingBrowse(false);
    if (!response.ok) {
      setError(payload.error || "Unable to load invoice line items.");
      return;
    }
    setAllRows(payload.rows || []);
    setFilters(payload.filters || { vendors: [], stores: [], sizes: [] });
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
    const storeMatch = !browse.store || row.store_name === browse.store;
    const sizeMatch = !browse.size || row.size === browse.size;
    return textMatch && vendorMatch && storeMatch && sizeMatch;
  });

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
            onClick={() => setBrowse({ text: "", vendor: "", store: "", size: "" })}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
        <div className="filter-grid">
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
          <FilterSelect label="Store" value={browse.store} options={filters.stores} onChange={(store) => setBrowse({ ...browse, store })} />
          <FilterSelect label="Size" value={browse.size} options={filters.sizes} onChange={(size) => setBrowse({ ...browse, size })} />
        </div>
        <ResultTable rows={browseRows} emptyLabel={loadingBrowse ? "Loading invoice line items..." : "No invoice line items match these filters."} />
      </section>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
