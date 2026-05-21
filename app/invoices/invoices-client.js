"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

const emptyLine = {
  product_name_raw: "",
  brand: "",
  size: "",
  pack_size: "",
  quantity: "1",
  unit_cost: "",
  total_cost: "",
  sku: "",
  upc: ""
};

export function InvoicesClient() {
  const [invoices, setInvoices] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vendor_name: "",
    store_name: "",
    invoice_number: "",
    invoice_date: "",
    invoice_total: "",
    line_items: [{ ...emptyLine }]
  });

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter((invoice) => [
      invoice.invoice_number,
      invoice.invoice_date,
      invoice.original_file_name,
      invoice.parse_status,
      invoice.vendors?.name,
      invoice.stores?.name
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [invoices, query]);

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/invoices?limit=500");
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(payload.error || "Unable to load invoices.");
      return;
    }
    setInvoices(payload.invoices || []);
  }

  async function createInvoice(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || "Unable to create invoice.");
      return;
    }
    if (payload.duplicate) {
      setError(`Invoice ${payload.invoiceNumber} already exists. Open the existing invoice instead.`);
      return;
    }
    window.location.href = `/review/${payload.invoiceId}`;
  }

  async function deleteOne(invoice) {
    const ok = window.confirm(`Delete invoice ${invoice.invoice_number}? This also deletes its line items.`);
    if (!ok) return;
    setError("");
    const response = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Unable to delete invoice.");
      return;
    }
    setInvoices(invoices.filter((item) => item.id !== invoice.id));
  }

  return (
    <div className="grid">
      <section className="panel grid">
        <div className="topbar" style={{ marginBottom: 0 }}>
          <div>
            <h2>Invoice records</h2>
            <p className="muted" style={{ margin: 0 }}>{loading ? "Loading..." : `${filtered.length} of ${invoices.length} invoices shown`}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button ghost" type="button" onClick={load}>
              <RotateCcw size={16} /> Refresh
            </button>
            <button className="button" type="button" onClick={() => setShowNew(!showNew)}>
              <Plus size={16} /> Add invoice
            </button>
          </div>
        </div>
        <input className="input" placeholder="Filter by invoice, vendor, store, status..." value={query} onChange={(event) => setQuery(event.target.value)} />
        {error ? <div className="panel" style={{ color: "var(--danger)" }}>{error}</div> : null}
      </section>

      {showNew ? (
        <form className="panel grid" onSubmit={createInvoice}>
          <h2>Manual invoice entry</h2>
          <div className="grid cols-3">
            <Field label="Vendor" value={form.vendor_name} onChange={(value) => setForm({ ...form, vendor_name: value })} required />
            <Field label="Store" value={form.store_name} onChange={(value) => setForm({ ...form, store_name: value })} required />
            <Field label="Invoice Number" value={form.invoice_number} onChange={(value) => setForm({ ...form, invoice_number: value })} required />
            <Field label="Invoice Date" type="date" value={form.invoice_date} onChange={(value) => setForm({ ...form, invoice_date: value })} required />
            <Field label="Invoice Total" type="number" value={form.invoice_total} onChange={(value) => setForm({ ...form, invoice_total: value })} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>Brand</th><th>Size</th><th>Pack</th><th>Qty</th><th>Unit</th><th>Total</th><th>SKU</th><th>UPC</th><th></th></tr>
              </thead>
              <tbody>
                {form.line_items.map((line, index) => (
                  <tr key={index}>
                    {["product_name_raw", "brand", "size", "pack_size", "quantity", "unit_cost", "total_cost", "sku", "upc"].map((key) => (
                      <td key={key}>
                        <input className="input" value={line[key] || ""} onChange={(event) => updateLine(index, key, event.target.value)} />
                      </td>
                    ))}
                    <td>
                      <button className="button ghost" type="button" onClick={() => setForm({ ...form, line_items: form.line_items.filter((_, i) => i !== index) })}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button secondary" type="button" onClick={() => setForm({ ...form, line_items: [...form.line_items, { ...emptyLine }] })}>
              <Plus size={16} /> Add line
            </button>
            <button className="button" disabled={saving}>
              <Save size={16} /> {saving ? "Saving..." : "Save invoice"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="table-wrap responsive-cards">
        <table>
          <thead>
            <tr><th>Invoice</th><th>Vendor</th><th>Store</th><th>Date</th><th>Total</th><th>Status</th><th>Lines</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((invoice) => (
              <tr className={invoice.parse_status === "duplicate" ? "attention-row" : ""} key={invoice.id}>
                <td data-label="Invoice"><strong>{invoice.invoice_number}</strong></td>
                <td data-label="Vendor">{invoice.vendors?.name || "-"}</td>
                <td data-label="Store">{invoice.stores?.name || "-"}</td>
                <td data-label="Date">{invoice.invoice_date || "-"}</td>
                <td data-label="Total">{money(invoice.invoice_total || sumLines(invoice))}</td>
                <td data-label="Status"><span className={invoice.parse_status === "reviewed" ? "badge" : "badge warn"}>{invoice.parse_status}</span></td>
                <td data-label="Lines">{invoice.invoice_line_items?.length || 0}</td>
                <td data-label="Source">{sourceLabel(invoice)}</td>
                <td data-label="">
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link className="button secondary" href={`/review/${invoice.id}`}><FileText size={16} />Open</Link>
                    <button className="button ghost" type="button" onClick={() => deleteOne(invoice)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function updateLine(index, key, value) {
    const next = [...form.line_items];
    next[index] = { ...next[index], [key]: value };
    if ((key === "quantity" || key === "unit_cost") && next[index].quantity && next[index].unit_cost) {
      next[index].total_cost = String(roundMoney(Number(next[index].quantity) * Number(next[index].unit_cost)));
    }
    setForm({ ...form, line_items: next });
  }
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" required={required} step={type === "number" ? "any" : undefined} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function sumLines(invoice) {
  return (invoice.invoice_line_items || []).reduce((sum, line) => sum + Number(line.total_cost || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function sourceLabel(invoice) {
  if (invoice.ocr_provider === "manual") return "Manual entry";
  if (invoice.source_batch_id || invoice.ocr_provider === "batch-detected") return "Batch upload";
  if (invoice.original_file_name) return "Uploaded file";
  return "Invoice record";
}
