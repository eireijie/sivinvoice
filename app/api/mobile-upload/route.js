import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { parseInvoiceText } from "@/lib/aiParser";
import { createInvoiceBatch, findBatchByFileHash, logDuplicateBatchUpload } from "@/lib/batches";
import { createPendingInvoiceUpload, findInvoiceByFileHash, processNextQueuedInvoices, upsertParsedInvoice } from "@/lib/invoices";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { runOcr } from "@/lib/ocr";
import { assertStorageAvailable } from "@/lib/organization";
import { verifyUploadToken } from "@/lib/uploadTokens";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const token = formData.get("token");
    const requestedMode = formData.get("mode") === "batch" ? "batch" : "invoice";
    const verified = verifyUploadToken(token);
    const mode = verified.mode;
    if (requestedMode !== mode) throw Object.assign(new Error("This QR code is for a different upload type."), { status: 403 });

    if (mode === "batch") return handleBatchUpload({ formData, organizationId: verified.organizationId });
    return handleInvoiceUpload({ formData, organizationId: verified.organizationId });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

async function handleInvoiceUpload({ formData, organizationId }) {
  const files = getUploadedFiles(formData);
  if (!files.length) return NextResponse.json({ error: "Attach one or more files for the same invoice." }, { status: 400 });
  if (files.length > 6) return NextResponse.json({ error: "Upload up to 6 files for one invoice." }, { status: 400 });

  const prepared = await prepareFiles(files);
  const fileHash = hashBuffers(prepared.map((item) => item.buffer));
  const exactDuplicate = await findInvoiceByFileHash(fileHash, { organizationId });
  if (exactDuplicate) {
    return NextResponse.json({ invoiceId: exactDuplicate.id, duplicate: true, invoiceNumber: exactDuplicate.invoice_number });
  }
  const totalBytes = prepared.reduce((sum, item) => sum + item.buffer.length, 0);
  await assertStorageAvailable(totalBytes, { organizationId });

  const displayFileName = prepared.length === 1 ? prepared[0].file.name : `${prepared.length} files - ${prepared[0].file.name}`;
  const result = await createPendingInvoiceUpload({
    organizationId,
    displayFileName,
    fileHash,
    totalBytes,
    mimeType: prepared[0].mimeType,
    storageFiles: prepared.map((item) => ({ fileName: item.file.name, buffer: item.buffer, mimeType: item.mimeType }))
  });
  after(() => processNextQueuedInvoices({ limit: 1 }).catch((error) => console.error("Queue worker failed", error)));
  return NextResponse.json(result);
}

async function handleBatchUpload({ formData, organizationId }) {
  const files = getUploadedFiles(formData);
  if (!files.length) return NextResponse.json({ error: "Attach one or more invoice files." }, { status: 400 });
  const prepared = await prepareFiles(files);
  const results = [];
  let reservedBytes = 0;
  const maxPages = clampPageCount(formData.get("maxPages"));

  for (const item of prepared) {
    const fileHash = hashBuffers([item.buffer]);
    await assertStorageAvailable(item.buffer.length, { organizationId, reservedBytes });
    if (item.mimeType === "application/pdf") {
      const exactDuplicate = await findBatchByFileHash(fileHash, { organizationId });
      if (exactDuplicate) {
        await logDuplicateBatchUpload({ existingBatch: exactDuplicate, fileName: item.file.name, organizationId });
        results.push({ type: "batch", batchId: exactDuplicate.id, duplicate: true, fileName: item.file.name });
        continue;
      }
      reservedBytes += item.buffer.length;
      const batchId = await createInvoiceBatch({ ...item, fileBuffer: item.buffer, fileHash, maxPages, plan: "pro", organizationId });
      results.push({ type: "batch", batchId, duplicate: false, fileName: item.file.name });
      continue;
    }

    const exactDuplicate = await findInvoiceByFileHash(fileHash, { organizationId });
    if (exactDuplicate) {
      results.push({ type: "invoice", invoiceId: exactDuplicate.id, duplicate: true, fileName: item.file.name, invoiceNumber: exactDuplicate.invoice_number });
      continue;
    }
    reservedBytes += item.buffer.length;
    const ocrResult = await runOcr({ fileBuffer: item.buffer, mimeType: item.mimeType, maxPages: 1 });
    const parsed = await parseInvoiceText(ocrResult.text);
    const invoiceResult = await upsertParsedInvoice({ file: item.file, fileBuffer: item.buffer, fileHash, mimeType: item.mimeType, ocrResult, parsed, organizationId });
    results.push({ type: "invoice", fileName: item.file.name, ...invoiceResult });
  }

  return NextResponse.json({ batches: results });
}

function getUploadedFiles(formData) {
  return formData.getAll("files").filter((file) => file && typeof file !== "string");
}

async function prepareFiles(files) {
  const prepared = [];
  for (const file of files) {
    const mimeType = inferInvoiceMimeType(file);
    if (!mimeType) throw Object.assign(new Error(getUnsupportedInvoiceFileMessage(file)), { status: 400 });
    prepared.push({ file, mimeType, buffer: Buffer.from(await file.arrayBuffer()) });
  }
  return prepared;
}

function hashBuffers(buffers) {
  const hash = createHash("sha256");
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest("hex");
}

function clampPageCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 10;
  return Math.min(Math.max(Math.trunc(number), 2), 30);
}
