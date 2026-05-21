"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";

const emptyLine = {
  product_name_raw: "",
  brand: "",
  bottle_name: "",
  size: "",
  pack_size: "",
  quantity: "",
  unit_cost: "",
  total_cost: "",
  sku: "",
  upc: "",
  confidence_score: 0.9
};

export function ReviewForm({ invoice }) {
  const router = useRouter();
  const [meta, setMeta] = useState({
    vendor_name: invoice.vendors?.name || "",
    store_name: invoice.stores?.name || "",
    invoice_number: invoice.invoice_number || "",
    invoice_date: invoice.invoice_date || "",
    invoice_total: invoice.invoice_total || ""
  });
  const [lines, setLines] = useState((invoice.invoice_line_items || []).map(({ id, invoice_id, created_at, ...line }) => line));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showViewer, setShowViewer] = useState(true);
  const extractedTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.total_cost || 0), 0));
  const invoiceTotal = meta.invoice_total === "" ? null : Number(meta.invoice_total);
  const variance = invoiceTotal === null || Number.isNaN(invoiceTotal) ? null : roundMoney(extractedTotal - invoiceTotal);
  const lowConfidenceCount = lines.filter((line) => Number(line.confidence_score || 0) < 0.85).length;
  const recognizedItemCount = lines.filter((line) => String(line.product_name_raw || "").trim()).length;

  async function save() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...meta, line_items: lines })
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || "Unable to save review.");
      return;
    }
    if (payload.duplicate) {
      setError(`Duplicate invoice found. This copy was marked duplicate and linked to invoice ${payload.invoiceNumber}.`);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid">
      {showViewer ? (
        <section className="viewer viewer-top">
          {invoice.signed_url ? (
            <>
              <div className="viewer-toolbar">
                <button className="button ghost" onClick={() => setShowViewer(false)} type="button">
                  <EyeOff size={16} /> Hide
                </button>
                <a className="button secondary" href={invoice.signed_url} target="_blank" rel="noreferrer">Open original</a>
              </div>
              {invoice.mime_type?.startsWith("image/") ? <img src={invoice.signed_url} alt="Original invoice" /> : <iframe src={invoice.signed_url} title="Original invoice" />}
            </>
          ) : (
            <div className="panel">Original invoice file is unavailable.</div>
          )}
        </section>
      ) : null}
      <section className="grid">
        <div className="panel grid cols-2">
          <Field label="Vendor" value={meta.vendor_name} onChange={(value) => setMeta({ ...meta, vendor_name: value })} />
          <Field label="Store" value={meta.store_name} onChange={(value) => setMeta({ ...meta, store_name: value })} />
          <Field label="Invoice Number" value={meta.invoice_number} onChange={(value) => setMeta({ ...meta, invoice_number: value })} />
          <Field label="Invoice Date" type="date" value={meta.invoice_date || ""} onChange={(value) => setMeta({ ...meta, invoice_date: value })} />
          <Field label="Invoice Total" type="number" value={meta.invoice_total || ""} onChange={(value) => setMeta({ ...meta, invoice_total: value })} />
        </div>
        <div className="review-metrics">
          <Metric label="Recognized items" value={String(recognizedItemCount)} tone="neutral" />
          <Metric label="Extracted line total" value={money(extractedTotal)} tone="neutral" />
          <Metric label="Invoice total" value={invoiceTotal === null || Number.isNaN(invoiceTotal) ? "Not set" : money(invoiceTotal)} tone="neutral" />
          <Metric label="Difference" value={variance === null ? "Not checked" : money(variance)} tone={variance === null || Math.abs(variance) < 0.01 ? "ok" : "warn"} />
          <Metric label="Needs attention" value={String(lowConfidenceCount)} tone={lowConfidenceCount ? "warn" : "ok"} />
        </div>
        <div className="panel">
          <div className="topbar" style={{ marginBottom: 10 }}>
            <h2>Extracted invoice line items</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button secondary" onClick={() => setShowViewer(!showViewer)} type="button">
                {showViewer ? <EyeOff size={16} /> : <Eye size={16} />}
                {showViewer ? "Hide original" : "Show original"}
              </button>
              <button className="button secondary" onClick={() => setLines([...lines, { ...emptyLine }])} type="button">
                <Plus size={16} /> Add line
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th><th>Brand</th><th>Size</th><th>Pack</th><th>Qty</th><th>Unit</th><th>Total</th><th>SKU</th><th>UPC</th><th>Conf</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr className={Number(line.confidence_score || 0) < 0.85 ? "attention-row" : ""} key={index}>
                    {["product_name_raw", "brand", "size", "pack_size", "quantity", "unit_cost", "total_cost", "sku", "upc", "confidence_score"].map((key) => (
                      <td className={`review-cell review-cell-${key}`} key={key}>
                        <input
                          className={`input review-input review-input-${key}`}
                          title={line[key] || ""}
                          value={line[key] || ""}
                          onChange={(event) => updateLine(index, key, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="button ghost" type="button" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} aria-label="Delete line">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          <div style={{ marginTop: 14 }}>
            <button className="button" disabled={saving} onClick={save} type="button">
              <Save size={16} />
              {saving ? "Saving..." : "Save Reviewed Invoice"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  function updateLine(index, key, value) {
    const copy = [...lines];
    copy[index] = { ...copy[index], [key]: value, bottle_name: key === "product_name_raw" ? value : copy[index].bottle_name };
    setLines(copy);
  }
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" step={type === "number" ? "any" : undefined} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className={`metric ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}
