import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { parseInvoiceText } from "@/lib/aiParser";
import { findInvoiceByFileHash, upsertParsedInvoice } from "@/lib/invoices";
import { runOcr } from "@/lib/ocr";
import { assertStorageAvailable } from "@/lib/organization";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Upload a PDF or image invoice file." }, { status: 400 });
    }
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"].includes(file.type)) {
      return NextResponse.json({ error: "Only PDF and image invoices are supported." }, { status: 400 });
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

    const ocrResult = await runOcr({ fileBuffer, mimeType: file.type, maxPages: 3 });
    const parsed = await parseInvoiceText(ocrResult.text);
    const result = await upsertParsedInvoice({ file, fileBuffer, fileHash, ocrResult, parsed });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}
