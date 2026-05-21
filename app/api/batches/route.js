import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createInvoiceBatch, findBatchByFileHash, listBatches, logDuplicateBatchUpload } from "@/lib/batches";
import { parseInvoiceText } from "@/lib/aiParser";
import { findInvoiceByFileHash, upsertParsedInvoice } from "@/lib/invoices";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { runOcr } from "@/lib/ocr";
import { assertStorageAvailable, getActiveWorkspacePlan } from "@/lib/organization";

export async function GET() {
  try {
    const batches = await listBatches();
    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const uploadedFiles = formData.getAll("files");
    const legacyFile = formData.get("file");
    const files = uploadedFiles.length ? uploadedFiles : legacyFile ? [legacyFile] : [];
    if (!files.length || files.some((file) => typeof file === "string")) {
      return NextResponse.json({ error: "Upload one or more PDF or image invoice files." }, { status: 400 });
    }
    const filesWithTypes = files.map((file) => ({ file, mimeType: inferInvoiceMimeType(file) }));
    const unsupported = filesWithTypes.find((item) => !item.mimeType);
    if (unsupported) {
      return NextResponse.json({ error: getUnsupportedInvoiceFileMessage(unsupported.file) }, { status: 400 });
    }
    const activePlan = await getActiveWorkspacePlan();
    if (activePlan.id === "free") {
      return NextResponse.json({ error: "Batch upload is available on Pro and Max. Free still includes regular single-invoice uploads." }, { status: 402 });
    }
    const maxPages = clampPageCount(formData.get("maxPages"));

    const results = [];
    let reservedBytes = 0;
    for (const { file, mimeType } of filesWithTypes) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
      await assertStorageAvailable(fileBuffer.length, { reservedBytes });

      if (mimeType === "application/pdf") {
        const exactDuplicate = await findBatchByFileHash(fileHash);
        if (exactDuplicate) {
          await logDuplicateBatchUpload({ existingBatch: exactDuplicate, fileName: file.name });
          results.push({
            type: "batch",
            batchId: exactDuplicate.id,
            duplicate: true,
            fileName: file.name,
            existingFileName: exactDuplicate.original_file_name
          });
          continue;
        }

        reservedBytes += fileBuffer.length;
        const batchId = await createInvoiceBatch({
          file,
          fileBuffer,
          fileHash,
          mimeType,
          maxPages,
          plan: activePlan.id
        });
        results.push({ type: "batch", batchId, duplicate: false, fileName: file.name });
        continue;
      }

      const exactDuplicate = await findInvoiceByFileHash(fileHash);
      if (exactDuplicate) {
        results.push({
          type: "invoice",
          invoiceId: exactDuplicate.id,
          duplicate: true,
          fileName: file.name,
          invoiceNumber: exactDuplicate.invoice_number
        });
        continue;
      }

      reservedBytes += fileBuffer.length;
      const ocrResult = await runOcr({ fileBuffer, mimeType, maxPages: 1 });
      const parsed = await parseInvoiceText(ocrResult.text);
      const invoiceResult = await upsertParsedInvoice({ file, fileBuffer, fileHash, mimeType, ocrResult, parsed });
      results.push({ type: "invoice", fileName: file.name, ...invoiceResult });
    }

    return NextResponse.json({ batchId: results[0]?.batchId, batches: results });
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}

function clampPageCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 10;
  return Math.min(Math.max(Math.trunc(number), 2), 30);
}
