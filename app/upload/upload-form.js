"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Plus, UploadCloud, X } from "lucide-react";
import { ProcessingOverlay } from "@/components/processing-overlay";
import { optimizeInvoiceFiles } from "@/lib/clientInvoiceImages";
import { invoiceFileAccept } from "@/lib/invoiceFiles";

const maxSingleInvoiceFiles = 30;

export function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(null);

  async function addFiles(fileList) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    setOptimizing(true);
    setError("");
    const optimized = await optimizeInvoiceFiles(selected);
    setFiles((current) => {
      const existingKeys = new Set(current.map(fileKey));
      const additions = optimized.filter((file) => !existingKeys.has(fileKey(file)));
      const nextFiles = [...current, ...additions];
      if (nextFiles.length > maxSingleInvoiceFiles) {
        setError(`Upload up to ${maxSingleInvoiceFiles} pages for one invoice. Split anything larger into a separate invoice.`);
      }
      return nextFiles.slice(0, maxSingleInvoiceFiles);
    });
    setOptimizing(false);
  }

  function removeFile(targetFile) {
    setFiles((current) => current.filter((file) => fileKey(file) !== fileKey(targetFile)));
  }

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setBusy(true);
    setError("");
    setDuplicate(null);
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    let payload = {};
    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      payload = await readUploadResponse(response, "/api/upload");
      setBusy(false);
      if (!response.ok) {
        setError(payload.error);
        return;
      }
    } catch (uploadError) {
      setBusy(false);
      setError(uploadError?.message || "Upload did not finish. Check your connection, then try again with the same files.");
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
        active={busy || optimizing}
        title="Saving invoice upload"
        detail={optimizing ? "Optimizing images before upload" : files.length ? `Saving ${files.length} file${files.length === 1 ? "" : "s"} and adding it to the queue` : "Uploading invoice"}
        steps={optimizing ? ["Shrinking phone photo", "Preparing upload", "Keeping OCR quality"] : ["Checking duplicates", "Saving originals", "Adding to processing queue", "Opening review status"]}
      />
      <form className="grid" onSubmit={submit}>
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
            <h2>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "Select files for one invoice"}</h2>
            <p className="muted">
              {files.length
                ? `${formatBytes(totalFileSize(files))} ready · tap to add another page`
                : `Attach one PDF, or up to ${maxSingleInvoiceFiles} photos/pages that all belong to the same invoice.`}
            </p>
          </span>
        </label>
        {files.length ? (
          <div className="panel grid selected-files-panel">
            <div className="selected-files-header">
              <div>
                <h2>Ready to upload</h2>
                <p className="muted">{files.length} of {maxSingleInvoiceFiles} page files will be saved as one invoice · {formatBytes(totalFileSize(files))}</p>
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
                  Add page
                </label>
                <button className="button ghost compact" type="button" onClick={() => setFiles([])}>
                  Clear all
                </button>
              </div>
            </div>
            <div className="selected-file-list">
              {files.map((file, index) => (
                <span key={fileKey(file)}>
                  <FileText size={14} />
                  <strong>{index + 1}. {file.name}</strong>
                  <small>{formatBytes(file.size)}</small>
                  <button type="button" onClick={() => removeFile(file)} aria-label={`Remove ${file.name}`}>
                    <X size={13} />
                  </button>
                </span>
              ))}
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
          <button className="button" disabled={!files.length || busy || optimizing}>
            <UploadCloud size={16} />
            {busy ? "Queueing invoice..." : optimizing ? "Optimizing..." : "Upload as One Invoice"}
          </button>
        </div>
      </form>
    </>
  );
}

function totalFileSize(files) {
  return files.reduce((sum, file) => sum + file.size, 0);
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

async function readUploadResponse(response, label) {
  const text = await response.text().catch(() => "");
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    const raw = String(payload.raw || "").replace(/\s+/g, " ").trim();
    return {
      ...payload,
      error: payload.error || (raw ? `${label} failed (${response.status}): ${raw.slice(0, 180)}` : `${label} failed (${response.status}).`)
    };
  }
  return payload;
}
