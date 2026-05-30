"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, FileText, Loader2, Plus, Printer, RotateCcw, RotateCw, Save, Trash2, UploadCloud, ZoomIn, ZoomOut } from "lucide-react";
import { invoiceFileAccept } from "@/lib/invoiceFiles";

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
  const [appendingOriginals, setAppendingOriginals] = useState(false);
  const [rereadingOriginals, setRereadingOriginals] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [batchContext, setBatchContext] = useState(null);
  const [error, setError] = useState("");
  const [showViewer, setShowViewer] = useState(true);
  const [activeOriginalIndex, setActiveOriginalIndex] = useState(0);
  const [imageView, setImageView] = useState({ zoom: 1, rotation: 0 });
  const processingStarted = useRef(false);
  const originalFiles = invoice.original_files?.length
    ? invoice.original_files
    : invoice.signed_url
      ? [{ fileName: invoice.original_file_name || "Original invoice", mimeType: invoice.mime_type, signedUrl: invoice.signed_url, index: 1 }]
      : [];
  const activeOriginal = originalFiles[Math.min(activeOriginalIndex, Math.max(originalFiles.length - 1, 0))];
  const activeOriginalIsImage = activeOriginal?.mimeType?.startsWith("image/");
  const isQueued = invoice.parse_status === "queued";
  const isProcessing = invoice.parse_status === "processing";
  const processingFailed = invoice.parse_status === "processing_failed";
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

  useEffect(() => {
    if (!isProcessing || processingStarted.current) return;
    processingStarted.current = true;
    let stopped = false;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/invoices/${invoice.id}`);
        const payload = await response.json();
        const status = payload.invoice?.parse_status;
        if (!stopped && status && status !== "processing") {
          window.clearInterval(interval);
          window.location.reload();
        }
      } catch {
        // Keep polling. Temporary network misses should not strand the screen.
      }
    }, 2500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      if (!stopped) window.location.reload();
    }, 180000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [invoice.id, isProcessing, router]);

  useEffect(() => {
    if (!isQueued) return;
    let stopped = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/invoices/${invoice.id}`);
        const payload = await response.json();
        const status = payload.invoice?.parse_status;
        if (!stopped && status && status !== "queued") {
          window.clearInterval(interval);
          window.location.reload();
        }
      } catch {
        // Keep polling while the queue worker catches up.
      }
    }, 5000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [invoice.id, isQueued]);

  useEffect(() => {
    if (!invoice.source_batch_id) return;
    let stopped = false;
    async function loadBatchContext() {
      try {
        const response = await fetch(`/api/batches/${invoice.source_batch_id}`);
        const payload = await response.json();
        if (!stopped && response.ok) setBatchContext(payload.batch);
      } catch {
        // Batch context is helpful, but invoice review still works without it.
      }
    }
    loadBatchContext();
    return () => {
      stopped = true;
    };
  }, [invoice.source_batch_id]);

  async function retryProcessing() {
    setError("");
    await fetch(`/api/invoices/${invoice.id}`, { method: "POST" });
    window.location.reload();
  }

  async function appendOriginalFiles(fileList) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    setAppendingOriginals(true);
    setError("");
    const body = new FormData();
    selected.forEach((file) => body.append("files", file));
    const response = await fetch(`/api/invoices/${invoice.id}`, { method: "PATCH", body });
    const payload = await response.json();
    setAppendingOriginals(false);
    if (!response.ok) {
      setError(payload.error || "Unable to add original pages.");
      return;
    }
    router.refresh();
  }

  async function rereadOriginalFiles() {
    const confirmed = window.confirm("Re-read every saved original file and replace the extracted line-item table?");
    if (!confirmed) return;
    setRereadingOriginals(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoice.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true })
    });
    const payload = await response.json();
    setRereadingOriginals(false);
    if (!response.ok) {
      setError(payload.error || "Unable to re-read originals.");
      return;
    }
    window.location.reload();
  }

  async function deleteCurrentInvoice() {
    const confirmed = window.confirm(`Delete invoice ${meta.invoice_number || invoice.invoice_number || "record"}? This removes the invoice record and line items.`);
    if (!confirmed) return;
    setDeleting(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
    const payload = await response.json();
    setDeleting(false);
    if (!response.ok) {
      setError(payload.error || "Unable to delete invoice.");
      return;
    }
    if (invoice.source_batch_id) {
      router.push(`/batches/${invoice.source_batch_id}`);
      return;
    }
    router.push("/invoices");
  }

  function updateImageView(update) {
    setImageView((current) => {
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      return {
        zoom: Math.min(3, Math.max(0.5, Math.round(Number(next.zoom || 1) * 100) / 100)),
        rotation: ((Number(next.rotation || 0) % 360) + 360) % 360
      };
    });
  }

  function printActiveImage() {
    if (!activeOriginal?.signedUrl) return;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const documentContent = `
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(activeOriginal.fileName || "Invoice image")}</title>
          <style>
            @page { margin: 0.25in; }
            html, body { margin: 0; min-height: 100%; background: #fff; }
            body { display: grid; place-items: center; }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
              transform: rotate(${imageView.rotation}deg);
              transform-origin: center center;
            }
          </style>
        </head>
        <body>
          <img src="${escapeHtml(activeOriginal.signedUrl)}" alt="Invoice image" />
        </body>
      </html>
    `;

    const frameDocument = frame.contentWindow?.document;
    if (!frameDocument) {
      frame.remove();
      return;
    }
    frameDocument.open();
    frameDocument.write(documentContent);
    frameDocument.close();
    const image = frameDocument.querySelector("img");
    image.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    image.onerror = () => frame.remove();
  }

  if (isQueued || isProcessing || processingFailed) {
    return (
      <div className="grid">
        <section className="panel processing-state-card">
          <div className={processingFailed ? "processing-state-icon failed" : "processing-state-icon"}>
            {processingFailed ? <AlertIcon /> : isQueued ? <ClockIcon /> : <Loader2 size={28} />}
          </div>
          <div>
            <span className={processingFailed ? "badge warn" : "badge"}>{processingFailed ? "Needs retry" : isQueued ? "Queued" : "Processing"}</span>
            <h2>{processingFailed ? "Invoice extraction stopped" : isQueued ? "Waiting in processing queue" : "Reading this invoice now"}</h2>
            <p className="muted">
              {processingFailed
                ? "The original file was saved, but OCR or AI extraction failed. Retry processing, or open the original and enter the invoice manually."
                : isQueued
                  ? "The original file is saved. SIV will process queued invoices automatically in the background, oldest and higher-priority jobs first."
                  : "The original file is already saved. You can leave this page; SIV will keep working and this screen will refresh when line items are ready."}
            </p>
            <div className="processing-inline-steps">
              <span>{isQueued ? "Queued" : <><Loader2 size={15} /> OCR</>}</span>
              <span>Line items</span>
              <span>Review screen</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              {processingFailed || isQueued ? (
                <button className="button" type="button" onClick={retryProcessing}>
                  <RotateCcw size={16} />
                  {processingFailed ? "Retry processing" : "Process now"}
                </button>
              ) : null}
              {invoice.signed_url ? (
                <a className="button secondary" href={invoice.signed_url} target="_blank" rel="noreferrer">
                  Open original
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid">
      {invoice.source_batch_id ? (
        <BatchReviewBanner invoice={invoice} batch={batchContext} />
      ) : null}
      {showViewer ? (
        <section className="viewer viewer-top">
          {activeOriginal?.signedUrl ? (
            <>
              <div className="viewer-toolbar">
                <div className="viewer-file-summary">
                  <FileText size={16} />
                  <strong>{activeOriginal.fileName || "Original invoice"}</strong>
                  <span>{originalFiles.length} file{originalFiles.length === 1 ? "" : "s"} saved</span>
                </div>
                <div className="viewer-toolbar-actions">
                  <label className="button secondary compact">
                    <input
                      accept={invoiceFileAccept}
                      hidden
                      multiple
                      type="file"
                      onChange={(event) => {
                        appendOriginalFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <UploadCloud size={15} />
                    {appendingOriginals ? "Adding..." : "Add original page"}
                  </label>
                  <button className="button ghost" onClick={() => setShowViewer(false)} type="button">
                    <EyeOff size={16} /> Hide
                  </button>
                  <a className="button secondary" href={activeOriginal.signedUrl} target="_blank" rel="noreferrer">Open original</a>
                </div>
              </div>
              {activeOriginalIsImage ? (
                <div className="image-viewer-controls">
                  <button type="button" onClick={() => updateImageView((view) => ({ ...view, zoom: view.zoom - 0.15 }))} aria-label="Zoom out">
                    <ZoomOut size={16} />
                  </button>
                  <strong>{Math.round(imageView.zoom * 100)}%</strong>
                  <button type="button" onClick={() => updateImageView((view) => ({ ...view, zoom: view.zoom + 0.15 }))} aria-label="Zoom in">
                    <ZoomIn size={16} />
                  </button>
                  <button type="button" onClick={() => updateImageView((view) => ({ ...view, rotation: view.rotation + 90 }))} aria-label="Rotate image">
                    <RotateCw size={16} />
                  </button>
                  <button type="button" onClick={() => updateImageView({ zoom: 1, rotation: 0 })} aria-label="Reset image view">
                    <RotateCcw size={16} />
                  </button>
                  <button type="button" onClick={printActiveImage} aria-label="Print image">
                    <Printer size={16} />
                  </button>
                  <a href={activeOriginal.signedUrl} download={activeOriginal.fileName || "invoice-image"} aria-label="Download image">
                    <Download size={16} />
                  </a>
                </div>
              ) : null}
              {originalFiles.length > 1 ? (
                <div className="original-file-tabs">
                  {originalFiles.map((file, index) => (
                    <button
                      className={index === activeOriginalIndex ? "active" : ""}
                      key={`${file.path || file.fileName}-${index}`}
                      onClick={() => setActiveOriginalIndex(index)}
                      type="button"
                    >
                      {index + 1}. {file.fileName || "Original page"}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeOriginalIsImage
                ? (
                  <div className="image-viewer-stage">
                    <img
                      src={activeOriginal.signedUrl}
                      alt="Original invoice"
                      style={{
                        width: `${Math.round(imageView.zoom * 92)}%`,
                        transform: `rotate(${imageView.rotation}deg)`
                      }}
                    />
                  </div>
                )
                : <iframe src={activeOriginal.signedUrl} title="Original invoice" />}
            </>
          ) : (
            <div className="panel grid">
              <p>Original invoice file is unavailable.</p>
              <label className="button secondary compact" style={{ width: "fit-content" }}>
                <input
                  accept={invoiceFileAccept}
                  hidden
                  multiple
                  type="file"
                  onChange={(event) => {
                    appendOriginalFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <UploadCloud size={15} />
                {appendingOriginals ? "Adding..." : "Add original page"}
              </label>
            </div>
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
          <Metric label="Original files" value={String(originalFiles.length)} tone="neutral" />
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
              <button className="button secondary" disabled={rereadingOriginals || !originalFiles.length} onClick={rereadOriginalFiles} type="button">
                <RotateCcw size={16} />
                {rereadingOriginals ? "Reading..." : "Re-read originals"}
              </button>
              <button className="button ghost" disabled={deleting} onClick={deleteCurrentInvoice} type="button">
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Delete invoice"}
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

function BatchReviewBanner({ invoice, batch }) {
  const detected = [...(batch?.batch_detected_invoices || [])].sort((a, b) => (a.page_start || 0) - (b.page_start || 0));
  const currentIndex = detected.findIndex((item) => item.created_invoice_id === invoice.id);
  const createdCount = detected.filter((item) => item.created_invoice_id).length;
  const duplicateCount = detected.filter((item) => item.status === "duplicate").length;
  const readyCount = detected.filter((item) => !item.created_invoice_id && item.status !== "duplicate").length;

  return (
    <section className="panel batch-return-card">
      <div>
        <span className="badge">Batch invoice {currentIndex >= 0 ? currentIndex + 1 : "?"}{detected.length ? ` of ${detected.length}` : ""}</span>
        <h2>{batch?.original_file_name || "Batch upload"}</h2>
        <p className="muted">Review this invoice, then return to the batch checklist to continue with the remaining detected invoices.</p>
      </div>
      <div className="batch-return-stats">
        <MiniStat label="Created" value={createdCount} />
        <MiniStat label="Ready" value={readyCount} />
        <MiniStat label="Duplicates" value={duplicateCount} />
      </div>
      <Link className="button secondary" href={`/batches/${invoice.source_batch_id}`}>Back to batch</Link>
    </section>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AlertIcon() {
  return <span style={{ fontWeight: 900, fontSize: 24 }}>!</span>;
}

function ClockIcon() {
  return <span style={{ fontWeight: 900, fontSize: 20 }}>...</span>;
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[character]);
}
