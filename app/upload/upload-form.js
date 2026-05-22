"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Plus, UploadCloud, X } from "lucide-react";
import { ProcessingOverlay } from "@/components/processing-overlay";
import { optimizeInvoiceFiles } from "@/lib/clientInvoiceImages";
import { invoiceFileAccept } from "@/lib/invoiceFiles";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const maxSingleInvoiceFiles = 30;

export function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
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
    setUploadStage("Uploading invoice");
    setError("");
    setDuplicate(null);
    let payload = {};
    try {
      const serverUpload = await uploadThroughServer(files);
      if (serverUpload.ok) {
        payload = serverUpload.payload;
      } else if (shouldTryStorageFallback(serverUpload)) {
        payload = await uploadThroughStorage(files, setUploadStage);
      } else {
        setBusy(false);
        setUploadStage("");
        setError(serverUpload.message);
        return;
      }
    } catch (uploadError) {
      setBusy(false);
      setUploadStage("");
      setError(uploadError?.message || "Upload did not finish. Check your connection, then try again with the same files.");
      return;
    }
    setBusy(false);
    setUploadStage("");
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
        detail={optimizing ? "Optimizing images before upload" : uploadStage || (files.length ? `Saving ${files.length} file${files.length === 1 ? "" : "s"} and adding it to the queue` : "Uploading invoice")}
        steps={optimizing ? ["Shrinking phone photo", "Preparing upload", "Keeping OCR quality"] : ["Checking duplicates", "Uploading originals", "Adding to processing queue", "Opening review status"]}
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

async function uploadThroughServer(files) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, payload };
    return {
      ok: false,
      status: response.status,
      payload,
      message: uploadErrorMessage(response, payload)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: {},
      networkError: true,
      message: error?.message || "Upload did not finish."
    };
  }
}

async function uploadThroughStorage(files, setUploadStage) {
  setUploadStage("Preparing large upload");
  const fileHash = await fingerprintFiles(files);
  const signResponse = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileHash,
      files: files.map((file) => ({ name: file.name, type: file.type, size: file.size, lastModified: file.lastModified }))
    })
  });
  const signPayload = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) throw new Error(uploadErrorMessage(signResponse, signPayload));
  if (signPayload.duplicate) return signPayload;

  const supabase = getSupabaseBrowser();
  for (const [index, file] of files.entries()) {
    const upload = signPayload.uploads[index];
    setUploadStage(`Uploading page ${index + 1} of ${files.length}`);
    const result = await supabase.storage
      .from(signPayload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.mimeType || file.type });
    if (result.error) throw result.error;
  }

  setUploadStage("Creating invoice record");
  const completeResponse = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionToken: signPayload.sessionToken })
  });
  const payload = await completeResponse.json().catch(() => ({}));
  if (!completeResponse.ok) throw new Error(uploadErrorMessage(completeResponse, payload));
  return payload;
}

function shouldTryStorageFallback(result) {
  if (result.ok) return false;
  const message = String(result.message || result.payload?.error || "").toLowerCase();
  return result.networkError
    || result.status === 0
    || result.status === 413
    || message.includes("payload")
    || message.includes("body")
    || message.includes("large")
    || message.includes("failed to fetch");
}

async function fingerprintFiles(files) {
  const parts = [];
  for (const [index, file] of files.entries()) {
    const sample = await sampleFile(file);
    parts.push(`${index}:${file.name}:${file.type}:${file.size}:${file.lastModified}:${sample}`);
  }
  const encoded = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sampleFile(file) {
  const sampleSize = Math.min(64 * 1024, file.size || 0);
  if (!sampleSize) return "";
  const first = await file.slice(0, sampleSize).arrayBuffer();
  const lastStart = Math.max(0, file.size - sampleSize);
  const last = await file.slice(lastStart, file.size).arrayBuffer();
  const combined = new Uint8Array(first.byteLength + last.byteLength);
  combined.set(new Uint8Array(first), 0);
  combined.set(new Uint8Array(last), first.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uploadErrorMessage(response, payload) {
  if (payload?.error) return payload.error;
  if (response.status === 413) return "The selected files are too large for the upload gateway. Try smaller photos or upload fewer pages at once.";
  return `Upload failed (${response.status}). Try again, or upload fewer pages at once.`;
}
