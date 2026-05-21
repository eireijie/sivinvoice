"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { ProcessingOverlay } from "@/components/processing-overlay";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setDuplicate(null);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error || "Upload failed.");
      return;
    }
    if (payload.duplicate) {
      setDuplicate(payload);
      return;
    }
    router.push(`/review/${payload.invoiceId}`);
  }

  return (
    <>
      <ProcessingOverlay
        active={busy}
        title="Extracting invoice line items"
        detail={file ? `Processing ${file.name}` : "Uploading and processing invoice"}
        steps={["Checking duplicates", "Running OCR", "Parsing product rows", "Preparing review screen"]}
      />
      <form className="grid" onSubmit={submit}>
        <label className={file ? "drop file-drop is-ready" : "drop file-drop"}>
          <input
            accept="application/pdf,image/*"
            hidden
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <span>
            {file ? <CheckCircle2 size={42} /> : <UploadCloud size={38} />}
            <h2>{file ? file.name : "Select a PDF or invoice image"}</h2>
            <p className="muted">
              {file
                ? `${formatBytes(file.size)} ready · click to change`
                : "Single-invoice uploads scan up to 3 pages. Use Batch Upload for scanned stacks or multi-invoice PDFs."}
            </p>
          </span>
        </label>
        {file ? (
          <div className="panel selected-files-panel">
            <div className="selected-files-header">
              <div>
                <h2>Ready to upload</h2>
                <p className="muted">{file.name} · {formatBytes(file.size)}</p>
              </div>
              <span className="badge"><FileText size={14} /> Attached</span>
            </div>
          </div>
        ) : null}
        {error ? <div className="panel" style={{ color: "var(--danger)" }}>{error}</div> : null}
        {duplicate ? (
          <div className="panel duplicate-warning">
            <AlertTriangle size={20} />
            <div>
              <strong>Possible duplicate invoice</strong>
              <p className="muted">Invoice {duplicate.invoiceNumber} already exists. No new duplicate copy was saved.</p>
              <button className="button secondary" type="button" onClick={() => router.push(`/review/${duplicate.invoiceId}`)}>
                Open existing invoice
              </button>
            </div>
          </div>
        ) : null}
        <div>
          <button className="button" disabled={!file || busy}>
            <UploadCloud size={16} />
            {busy ? "Processing invoice..." : "Upload and Extract"}
          </button>
        </div>
      </form>
    </>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
