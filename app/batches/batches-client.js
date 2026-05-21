"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileStack, RotateCcw, UploadCloud } from "lucide-react";
import { ProcessingOverlay } from "@/components/processing-overlay";
import { invoiceFileAccept } from "@/lib/invoiceFiles";

export function BatchesClient() {
  const [files, setFiles] = useState([]);
  const [maxPages, setMaxPages] = useState(10);
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadResults, setUploadResults] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load({ preserveMessage = false } = {}) {
    setLoading(true);
    setError("");
    if (!preserveMessage) setMessage("");
    const response = await fetch("/api/batches");
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(payload.error || "Unable to load batches.");
      return;
    }
    setBatches(payload.batches || []);
  }

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    setUploadResults([]);
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("maxPages", String(maxPages));
    const response = await fetch("/api/batches", { method: "POST", body });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error || "Batch upload failed.");
      return;
    }
    const results = payload.batches || [];
    setUploadResults(results);
    if (results.length === 1 && !results[0].duplicate && results[0].type === "batch") {
      window.location.href = `/batches/${results[0].batchId}`;
      return;
    }
    if (results.length === 1 && !results[0].duplicate && results[0].type === "invoice") {
      window.location.href = `/review/${results[0].invoiceId}`;
      return;
    }
    setFiles([]);
    const duplicateCount = results.filter((result) => result.duplicate).length;
    const createdCount = results.length - duplicateCount;
    setMessage(resultMessage(createdCount, duplicateCount, results));
    await load({ preserveMessage: true });
  }

  const fileCountLabel = files.length === 1 ? files[0].name : `${files.length} files selected`;
  const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="grid">
      <ProcessingOverlay
        active={busy}
        title="Detecting invoices in batch"
        detail={files.length ? `Processing ${files.length} file${files.length === 1 ? "" : "s"}` : "Uploading and detecting invoice groups"}
        steps={["Checking duplicates", `OCR on PDFs and images`, "Detecting invoice records", "Saving review items"]}
      />
      <form className="grid" onSubmit={submit}>
        <label className={files.length ? "drop file-drop is-ready" : "drop file-drop"}>
          <input
            accept={invoiceFileAccept}
            hidden
            multiple
            type="file"
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          <span>
            {files.length ? <CheckCircle2 size={42} /> : <FileStack size={38} />}
            <h2>{files.length ? fileCountLabel : "Select PDFs or invoice images"}</h2>
            <p className="muted">
              {files.length
                ? `${files.length} file${files.length === 1 ? "" : "s"} ready · ${formatBytes(totalFileSize)} · click to change`
                : "Upload scanned PDFs, JPGs, or PNGs at once. PDFs are split for batch review; images become invoice review records."}
            </p>
          </span>
        </label>
        {files.length ? (
          <div className="panel grid selected-files-panel">
            <div className="selected-files-header">
              <div>
                <h2>Ready to upload</h2>
                <p className="muted">{files.length} selected · {formatBytes(totalFileSize)}</p>
              </div>
              <span className="badge"><CheckCircle2 size={14} /> Attached</span>
            </div>
            <div className="selected-file-list">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}>
                  <FileStack size={14} />
                  {file.name}
                  <small>{formatBytes(file.size)}</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="panel grid">
          <div className="field">
            <label htmlFor="batch-max-pages">Pages to scan</label>
            <select
              className="select"
              id="batch-max-pages"
              value={maxPages}
              onChange={(event) => setMaxPages(Number(event.target.value))}
            >
              {Array.from({ length: 29 }, (_, index) => index + 2).map((pageCount) => (
                <option key={pageCount} value={pageCount}>
                  First {pageCount} pages
                </option>
              ))}
            </select>
            <span>Use 2-5 pages for small packets. Increase toward 30 for larger scanned invoice stacks.</span>
          </div>
        </div>
        {error ? <div className="panel" style={{ color: "var(--danger)" }}>{error}</div> : null}
        {message ? <div className="panel" style={{ color: "var(--accent-dark)" }}>{message}</div> : null}
        {uploadResults.length ? (
          <div className="panel grid">
            <h2>Upload results</h2>
            <div className="batch-result-list">
              {uploadResults.map((result, index) => (
                <div className={result.duplicate ? "batch-result duplicate" : "batch-result"} key={`${result.batchId}-${result.fileName}-${index}`}>
                  <span className={result.duplicate ? "badge warn" : "badge"}>
                    {result.duplicate ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    {result.duplicate ? "Duplicate" : result.type === "invoice" ? "New invoice" : "New batch"}
                  </span>
                  <div>
                    <strong>{result.fileName}</strong>
                    <p className="muted">
                      {result.duplicate
                        ? duplicateMessage(result)
                        : result.type === "invoice"
                          ? "Ready to review extracted invoice line items."
                          : "Ready to review detected invoices."}
                    </p>
                  </div>
                  <Link className="button secondary" href={result.type === "invoice" ? `/review/${result.invoiceId}` : `/batches/${result.batchId}`}>
                    {result.duplicate ? "Open existing" : result.type === "invoice" ? "Review invoice" : "Review batch"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <button className="button" disabled={!files.length || busy}>
            <UploadCloud size={16} />
            {busy ? "Detecting invoices..." : `Upload and Detect${files.length > 1 ? ` ${files.length} files` : ""}`}
          </button>
        </div>
      </form>

      <section className="panel grid">
        <div className="topbar" style={{ marginBottom: 0 }}>
          <div>
            <h2>Recent batches</h2>
            <p className="muted" style={{ margin: 0 }}>{loading ? "Loading..." : `${batches.length} batch files`}</p>
          </div>
          <button className="button ghost" type="button" onClick={load}><RotateCcw size={16} />Refresh</button>
        </div>
        <div className="table-wrap responsive-cards">
          <table>
            <thead>
              <tr><th>File</th><th>Status</th><th>Pages OCR’d</th><th>Detected</th><th>Created</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const detected = batch.batch_detected_invoices || [];
                return (
                  <tr key={batch.id}>
                    <td data-label="File"><strong>{batch.original_file_name}</strong></td>
                    <td data-label="Status"><span className="badge">{batch.status}</span></td>
                    <td data-label="Pages OCR'd">{batch.page_count || "-"}</td>
                    <td data-label="Detected">{detected.length}</td>
                    <td data-label="Created">{detected.filter((item) => item.created_invoice_id).length}</td>
                    <td data-label="Date">{new Date(batch.created_at).toLocaleString()}</td>
                    <td data-label=""><Link className="button secondary" href={`/batches/${batch.id}`}>Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function resultMessage(createdCount, duplicateCount, results) {
  const invoiceCount = results.filter((result) => result.type === "invoice" && !result.duplicate).length;
  const batchCount = results.filter((result) => result.type === "batch" && !result.duplicate).length;
  if (createdCount && duplicateCount) {
    return `Created ${createdCount} new upload${createdCount === 1 ? "" : "s"} and skipped ${duplicateCount} duplicate file${duplicateCount === 1 ? "" : "s"}.`;
  }
  if (duplicateCount) {
    return `${duplicateCount} duplicate file${duplicateCount === 1 ? " was" : "s were"} skipped. Open the existing record below.`;
  }
  if (invoiceCount && batchCount) return `Processed ${batchCount} PDF batch${batchCount === 1 ? "" : "es"} and ${invoiceCount} image invoice${invoiceCount === 1 ? "" : "s"}.`;
  if (invoiceCount) return `Processed ${invoiceCount} image invoice${invoiceCount === 1 ? "" : "s"}. Open any result below to review line items.`;
  return `Processed ${batchCount} batch file${batchCount === 1 ? "" : "s"}. Open any batch below to review detected invoices.`;
}

function duplicateMessage(result) {
  if (result.type === "invoice") {
    return `Invoice ${result.invoiceNumber || ""} already exists. No second copy was saved.`.trim();
  }
  return `Already uploaded as ${result.existingFileName || result.fileName}. No second copy was saved.`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
