"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Plus, UploadCloud, X } from "lucide-react";
import { optimizeInvoiceFiles } from "@/lib/clientInvoiceImages";
import { invoiceFileAccept } from "@/lib/invoiceFiles";
import { ProcessingOverlay } from "@/components/processing-overlay";

export function MobileUploadClient({ mode, token }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function addFiles(fileList) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    setOptimizing(true);
    setError("");
    const optimized = await optimizeInvoiceFiles(selected);
    setOptimizing(false);
    setFiles((current) => {
      const existing = new Set(current.map(fileKey));
      const additions = optimized.filter((file) => !existing.has(fileKey(file)));
      return mode === "invoice" ? [...current, ...additions].slice(0, 6) : [...current, ...additions];
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.append("token", token);
    body.append("mode", mode);
    files.forEach((file) => body.append("files", file));
    const response = await fetch("/api/mobile-upload", { method: "POST", body });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error || "Upload failed.");
      return;
    }
    setFiles([]);
    const count = mode === "batch" ? payload.batches?.length || 0 : 1;
    setMessage(count > 1 ? `${count} files uploaded. The manager can review them in SIV.` : "Uploaded. The manager can review it in SIV.");
  }

  if (!token) {
    return (
      <main className="mobile-upload-shell">
        <section className="panel grid">
          <span className="badge warn">Missing QR link</span>
          <h1>Open this from a QR code</h1>
          <p className="muted">Ask the manager to show a fresh phone upload QR code from SIV.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mobile-upload-shell">
      <ProcessingOverlay
        active={busy || optimizing}
        title={optimizing ? "Preparing photos" : "Uploading files"}
        detail={optimizing ? "Optimizing phone images before upload" : "Saving into SIV"}
        steps={optimizing ? ["Shrinking photos", "Keeping OCR quality", "Preparing upload"] : ["Uploading originals", "Checking duplicates", "Saving to vault"]}
      />
      <header className="mobile-upload-header">
        <div className="brand-mark">SIV</div>
        <div>
          <span className="eyebrow">{mode === "batch" ? "Batch upload" : "Invoice upload"}</span>
          <h1>{mode === "batch" ? "Upload files" : "Upload one invoice"}</h1>
        </div>
      </header>
      <p className="mobile-upload-note">
        {mode === "batch"
          ? "Attach separate invoice files. Each image becomes its own invoice; PDFs are detected as batches."
          : "Attach one PDF, or multiple photos/pages that all belong to the same invoice."}
      </p>
      <form className="grid mobile-upload-form" onSubmit={submit}>
        <label className={files.length ? "drop file-drop is-ready" : "drop file-drop"}>
          <input
            accept={invoiceFileAccept}
            hidden
            multiple
            type="file"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <span>
            {files.length ? <CheckCircle2 size={42} /> : <UploadCloud size={38} />}
            <h2>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "Choose files"}</h2>
            <p className="muted">{files.length ? "Tap to add more" : "Take photos or choose files from this phone."}</p>
          </span>
        </label>
        {files.length ? (
          <section className="panel grid selected-files-panel">
            <div className="selected-files-header">
              <div>
                <h2>Ready to upload</h2>
                <p className="muted">{files.length} selected</p>
              </div>
              <div className="selected-files-actions">
                <label className="button secondary compact">
                  <input
                    accept={invoiceFileAccept}
                    hidden
                    multiple
                    type="file"
                    onChange={(event) => {
                      addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <Plus size={15} />
                  Add more
                </label>
                <button className="button ghost compact" type="button" onClick={() => setFiles([])}>Clear all</button>
              </div>
            </div>
            <div className="selected-file-list">
              {files.map((file, index) => (
                <span key={fileKey(file)}>
                  <FileText size={14} />
                  <strong>{index + 1}. {file.name}</strong>
                  <small>{formatBytes(file.size)}</small>
                  <button type="button" onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))} aria-label={`Remove ${file.name}`}>
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {error ? <section className="panel" style={{ color: "var(--danger)" }}>{error}</section> : null}
        {message ? <section className="panel" style={{ color: "var(--accent-dark)" }}>{message}</section> : null}
        <button className="button mobile-upload-submit" disabled={!files.length || busy || optimizing}>
          <UploadCloud size={16} />
          {busy ? "Uploading..." : "Upload to SIV"}
        </button>
      </form>
    </main>
  );
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
