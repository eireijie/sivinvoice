import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { createPendingInvoiceUpload, findInvoiceByFileHash, processNextQueuedInvoices } from "@/lib/invoices";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { assertStorageAvailable } from "@/lib/organization";

const maxSingleInvoiceFiles = 30;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const uploadedFiles = formData.getAll("files");
    const legacyFile = formData.get("file");
    const files = uploadedFiles.length ? uploadedFiles : legacyFile ? [legacyFile] : [];
    if (!files.length || files.some((file) => typeof file === "string")) {
      return NextResponse.json({ error: "Upload one or more files for the same invoice." }, { status: 400 });
    }
    if (files.length > maxSingleInvoiceFiles) {
      return NextResponse.json({ error: `Upload Invoice supports up to ${maxSingleInvoiceFiles} files for one invoice. Split anything larger into a separate invoice.` }, { status: 400 });
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

    const displayFileName = preparedFiles.length === 1 ? preparedFiles[0].file.name : `${preparedFiles.length} files - ${preparedFiles[0].file.name}`;
    const result = await createPendingInvoiceUpload({
      displayFileName,
      fileHash,
      totalBytes,
      mimeType: preparedFiles[0].mimeType,
      storageFiles: preparedFiles.map((prepared) => ({
        fileName: prepared.file.name,
        buffer: prepared.buffer,
        mimeType: prepared.mimeType
      }))
    });
    after(() => processNextQueuedInvoices({ limit: 1 }).catch((error) => console.error("Queue worker failed", error)));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}
