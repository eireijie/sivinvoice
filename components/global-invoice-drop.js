"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, UploadCloud, X } from "lucide-react";
import { optimizeInvoiceFiles } from "@/lib/clientInvoiceImages";
import { getUnsupportedInvoiceFileMessage, isSupportedInvoiceFile } from "@/lib/invoiceFiles";

export function GlobalInvoiceDrop() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let depth = 0;

    function onDragEnter(event) {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    }

    function onDragOver(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    }

    async function onDrop(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      setError("");
      const droppedFiles = Array.from(event.dataTransfer.files || []);
      const files = droppedFiles.filter(isSupportedInvoiceFile);
      if (!files.length) {
        setError(getUnsupportedInvoiceFileMessage(droppedFiles[0]));
        return;
      }
      uploadFiles(files, { groupAsOneInvoice: pathname?.startsWith("/upload") });
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [pathname]);

  async function uploadFiles(files, { groupAsOneInvoice = false } = {}) {
    const optimizedFiles = await optimizeInvoiceFiles(files);
    if (groupAsOneInvoice && optimizedFiles.length > 1) {
      const job = {
        id: crypto.randomUUID(),
        file: { name: `${optimizedFiles.length} files`, size: optimizedFiles.reduce((sum, file) => sum + file.size, 0) },
        status: "uploading",
        message: "Uploading as one invoice"
      };
      setJobs([job]);
      const body = new FormData();
      optimizedFiles.forEach((file) => body.append("files", file));
      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await readUploadResponse(response, "/api/upload");
        if (!response.ok) throw new Error(payload.error);
        setJobs([{
          ...job,
          status: payload.duplicate ? "duplicate" : "done",
          message: payload.duplicate ? `Duplicate invoice ${payload.invoiceNumber || ""}`.trim() : "Queued for review",
          invoiceId: payload.invoiceId
        }]);
      } catch (uploadError) {
        setJobs([{ ...job, status: "error", message: uploadError.message }]);
      }
      return;
    }

    const nextJobs = optimizedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading",
      message: "Uploading"
    }));
    setJobs(nextJobs);

    for (const job of nextJobs) {
      const body = new FormData();
      body.append("file", job.file);
      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await readUploadResponse(response, "/api/upload");
        if (!response.ok) throw new Error(payload.error);
        setJobs((current) => current.map((item) => item.id === job.id ? {
          ...item,
          status: payload.duplicate ? "duplicate" : "done",
          message: payload.duplicate ? `Duplicate invoice ${payload.invoiceNumber || ""}`.trim() : "Ready for review",
          invoiceId: payload.invoiceId
        } : item));
      } catch (uploadError) {
        setJobs((current) => current.map((item) => item.id === job.id ? {
          ...item,
          status: "error",
          message: uploadError.message
        } : item));
      }
    }
  }

  const activeCount = useMemo(() => jobs.filter((job) => job.status === "uploading").length, [jobs]);

  if (!mounted) return null;
  return createPortal(
    <>
      {dragging ? (
        <div className="global-drop-layer">
          <div className="global-drop-card">
            <UploadCloud size={42} />
            <h2>Drop invoices to upload</h2>
            <p>PDFs and invoice images will be stored, read, and sent to review.</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="upload-dock">
          <button className="upload-dock-close" type="button" onClick={() => setError("")} aria-label="Close upload message"><X size={16} /></button>
          <div className="upload-job error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        </div>
      ) : null}
      {jobs.length ? (
        <div className="upload-dock">
          <button className="upload-dock-close" type="button" onClick={() => setJobs([])} aria-label="Close upload status"><X size={16} /></button>
          <strong>{activeCount ? `Uploading ${activeCount} invoice${activeCount === 1 ? "" : "s"}` : "Upload complete"}</strong>
          <div className="upload-job-list">
            {jobs.map((job) => (
              <UploadJob key={job.id} job={job} />
            ))}
          </div>
        </div>
      ) : null}
    </>,
    document.body
  );
}

function UploadJob({ job }) {
  const Icon = job.status === "error" ? AlertTriangle : job.status === "uploading" ? UploadCloud : CheckCircle2;
  return (
    <div className={`upload-job ${job.status}`}>
      <Icon size={18} />
      <div>
        <span>{job.file.name}</span>
        <small>{job.message}</small>
      </div>
      {job.invoiceId ? (
        <a className="button secondary" href={`/review/${job.invoiceId}`}>
          <FileText size={15} />
          Open
        </a>
      ) : null}
    </div>
  );
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
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
