import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { parseInvoiceText } from "@/lib/aiParser";
import { findInvoiceByFileHash, upsertParsedInvoice } from "@/lib/invoices";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { runOcr } from "@/lib/ocr";
import { assertStorageAvailable } from "@/lib/organization";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Upload a PDF or image invoice file." }, { status: 400 });
    }
    const mimeType = inferInvoiceMimeType(file);
    if (!mimeType) {
      return NextResponse.json({ error: getUnsupportedInvoiceFileMessage(file) }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
    const exactDuplicate = await findInvoiceByFileHash(fileHash);
    if (exactDuplicate) {
      return NextResponse.json({
        invoiceId: exactDuplicate.id,
        duplicate: true,
        exactDuplicate: true,
        invoiceNumber: exactDuplicate.invoice_number
      });
    }
    await assertStorageAvailable(fileBuffer.length);

    const ocrResult = await runOcr({ fileBuffer, mimeType, maxPages: 3 });
    const parsed = await parseInvoiceText(ocrResult.text);
    const result = await upsertParsedInvoice({ file, fileBuffer, fileHash, mimeType, ocrResult, parsed });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}
