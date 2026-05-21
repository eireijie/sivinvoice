"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from "lucide-react";

export function BatchDetailClient({ batchId }) {
  const [batch, setBatch] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, [batchId]);

  async function load() {
    setError("");
    const response = await fetch(`/api/batches/${batchId}`);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Unable to load batch.");
      return;
    }
    setBatch(payload.batch);
  }

  async function createInvoice(detectedId) {
    setBusyId(detectedId);
    setError("");
    const response = await fetch(`/api/batches/detected/${detectedId}/create-invoice`, { method: "POST" });
    const payload = await response.json();
    setBusyId("");
    if (!response.ok) {
      setError(payload.error || "Unable to create invoice.");
      return;
    }
    window.location.href = `/review/${payload.invoiceId}`;
  }

  if (error) return <div className="panel" style={{ color: "var(--danger)" }}>{error}</div>;
  if (!batch) return <div className="panel muted">Loading batch...</div>;

  const detected = [...(batch.batch_detected_invoices || [])].sort((a, b) => (a.page_start || 0) - (b.page_start || 0));

  return (
    <div className="grid">
      <section className="panel grid">
        <div className="topbar" style={{ marginBottom: 0 }}>
          <div>
            <h2>{batch.original_file_name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              Detected {detected.length} invoice group{detected.length === 1 ? "" : "s"} from {batch.page_count || 0} OCR page{batch.page_count === 1 ? "" : "s"}.
            </p>
          </div>
          {batch.signed_url ? <a className="button secondary" href={batch.signed_url} target="_blank" rel="noreferrer">Open batch PDF</a> : null}
        </div>
        <div className="duplicate-warning">
          <FileText size={20} />
          <div>
            <strong>Batch page setting</strong>
            <p className="muted">This batch was optimized for {batch.page_count || 0} OCR page{batch.page_count === 1 ? "" : "s"}. For new batches, choose 2-30 pages before upload based on the scan size.</p>
          </div>
        </div>
      </section>

      <div className="grid cols-2">
        {detected.map((item) => {
          const parsed = item.parsed_payload || {};
          const lines = Array.isArray(parsed.line_items) ? parsed.line_items : [];
          return (
            <section className="panel grid" key={item.id}>
              <div className="topbar" style={{ marginBottom: 0 }}>
                <div>
                  <h2>{item.invoice_number || "Unknown invoice"}</h2>
                  <p className="muted" style={{ margin: 0 }}>Pages {item.page_start || "?"}-{item.page_end || "?"}</p>
                </div>
                <span className={item.status === "created" ? "badge" : "badge warn"}>{statusLabel(item.status)}</span>
              </div>
              <div className="grid cols-2">
                <Mini label="Vendor" value={item.vendor_name} />
                <Mini label="Store" value={item.store_name} />
                <Mini label="Date" value={item.invoice_date} />
                <Mini label="Total" value={money(item.invoice_total)} />
                <Mini label="Lines" value={String(lines.length)} />
                <Mini label="Confidence" value={`${Math.round(Number(item.confidence_score || 0) * 100)}%`} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
                  <tbody>
                    {lines.slice(0, 8).map((line, index) => (
                      <tr key={index}><td>{line.product_name_raw}</td><td>{line.quantity}</td><td>{money(line.total_cost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {item.status === "duplicate" && item.created_invoice_id ? (
                <div className="duplicate-warning">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>Duplicate invoice found</strong>
                    <p className="muted">This invoice number and date already exist, so SIV did not create another copy.</p>
                    <Link className="button secondary" href={`/review/${item.created_invoice_id}`}>
                      Open existing invoice
                    </Link>
                  </div>
                </div>
              ) : item.created_invoice_id ? (
                <Link className="button secondary" href={`/review/${item.created_invoice_id}`}>
                  <CheckCircle2 size={16} /> Open created invoice
                </Link>
              ) : (
                <button className="button" disabled={Boolean(busyId)} onClick={() => createInvoice(item.id)} type="button">
                  {busyId === item.id ? <Loader2 size={16} /> : <FileText size={16} />}
                  {busyId === item.id ? "Creating..." : "Create invoice record"}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function statusLabel(status) {
  if (status === "duplicate") return "duplicate";
  if (status === "created") return "created";
  return "ready";
}

function Mini({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}
