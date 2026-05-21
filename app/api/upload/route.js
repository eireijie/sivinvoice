import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { parseInvoiceText } from "@/lib/aiParser";
import { findInvoiceByFileHash, upsertParsedInvoiceFromUpload } from "@/lib/invoices";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { runOcr } from "@/lib/ocr";
import { assertStorageAvailable } from "@/lib/organization";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const uploadedFiles = formData.getAll("files");
    const legacyFile = formData.get("file");
    const files = uploadedFiles.length ? uploadedFiles : legacyFile ? [legacyFile] : [];
    if (!files.length || files.some((file) => typeof file === "string")) {
      return NextResponse.json({ error: "Upload one or more files for the same invoice." }, { status: 400 });
    }
    if (files.length > 6) {
      return NextResponse.json({ error: "Upload Invoice supports up to 6 files for one invoice. Use Batch Upload for separate invoices." }, { status: 400 });
    }
    const filesWithTypes = files.map((file) => ({ file, mimeType: inferInvoiceMimeType(file) }));
    const unsupported = filesWithTypes.find((item) => !item.mimeType);
    if (unsupported) return NextResponse.json({ error: getUnsupportedInvoiceFileMessage(unsupported.file) }, { status: 400 });

    const preparedFiles = [];
    const hash = createHash("sha256");
    let totalBytes = 0;
    for (const { file, mimeType } of filesWithTypes) {
      const buffer = Buffer.from(await file.arrayBuffer());
      preparedFiles.push({ file, mimeType, buffer });
      hash.update(buffer);
      totalBytes += buffer.length;
    }
    const fileHash = hash.digest("hex");
    const exactDuplicate = await findInvoiceByFileHash(fileHash);
    if (exactDuplicate) {
      return NextResponse.json({
        invoiceId: exactDuplicate.id,
        duplicate: true,
        exactDuplicate: true,
        invoiceNumber: exactDuplicate.invoice_number
      });
    }
    await assertStorageAvailable(totalBytes);

    const ocrResults = [];
    for (const [index, prepared] of preparedFiles.entries()) {
      const result = await runOcr({ fileBuffer: prepared.buffer, mimeType: prepared.mimeType, maxPages: 3 });
      ocrResults.push({ ...result, fileName: prepared.file.name, fileIndex: index + 1 });
    }
    const ocrResult = combineOcrResults(ocrResults);
    const parsed = await parseInvoiceText(ocrResult.text);
    const displayFileName = preparedFiles.length === 1 ? preparedFiles[0].file.name : `${preparedFiles.length} files - ${preparedFiles[0].file.name}`;
    const result = await upsertParsedInvoiceFromUpload({
      displayFileName,
      primaryFileBuffer: preparedFiles[0].buffer,
      fileHash,
      mimeType: preparedFiles[0].mimeType,
      ocrResult,
      parsed,
      storageFiles: preparedFiles.map((prepared) => ({
        fileName: prepared.file.name,
        buffer: prepared.buffer,
        mimeType: prepared.mimeType
      }))
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}

function combineOcrResults(results) {
  return {
    provider: results.length === 1 ? results[0].provider : "multi-file-ocr",
    confidence: average(results.map((result) => result.confidence).filter((value) => typeof value === "number")),
    pages: results.flatMap((result) => (result.pages || [{ pageNumber: 1, text: result.text }]).map((page) => ({
      ...page,
      fileName: result.fileName,
      fileIndex: result.fileIndex
    }))),
    text: results.map((result) => `--- FILE ${result.fileIndex}: ${result.fileName} ---\n${result.text}`).join("\n\n")
  };
}

function average(values) {
  if (!values.length) return 0.85;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
