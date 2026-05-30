import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { findInvoiceByFileHash } from "@/lib/invoices";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { assertStorageAvailable, getActiveOrganizationId } from "@/lib/organization";
import { invoiceUploadStoragePath, todayStorageDay } from "@/lib/storagePaths";
import { createUploadSessionToken } from "@/lib/uploadSessionTokens";

const maxSingleInvoiceFiles = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) return NextResponse.json({ error: "Choose one or more files for the same invoice." }, { status: 400 });
    if (files.length > maxSingleInvoiceFiles) return NextResponse.json({ error: `Upload up to ${maxSingleInvoiceFiles} files for one invoice.` }, { status: 400 });

    const fileHash = String(body.fileHash || "");
    if (!/^[a-f0-9]{64}$/i.test(fileHash)) return NextResponse.json({ error: "Could not verify the selected files. Try choosing them again." }, { status: 400 });

    const preparedFiles = files.map((file) => {
      const name = String(file.name || "invoice");
      const size = Math.max(0, Number(file.size || 0));
      const mimeType = inferInvoiceMimeType({ name, type: file.type });
      if (!mimeType) throw Object.assign(new Error("Upload a PDF, JPG, PNG, WEBP, TIFF, GIF, BMP, or ICO invoice file."), { status: 400 });
      if (!size) throw Object.assign(new Error("One selected file is empty. Remove it and try again."), { status: 400 });
      return { name, size, mimeType };
    });
    const totalBytes = preparedFiles.reduce((sum, file) => sum + file.size, 0);

    const exactDuplicate = await findInvoiceByFileHash(fileHash);
    if (exactDuplicate) {
      return NextResponse.json({
        invoiceId: exactDuplicate.id,
        duplicate: true,
        exactDuplicate: true,
        invoiceNumber: exactDuplicate.invoice_number
      });
    }

    const organizationId = await getActiveOrganizationId();
    await assertStorageAvailable(totalBytes, { organizationId });

    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucket();
    const uploadGroup = randomUUID();
    const day = todayStorageDay();
    const uploads = [];
    for (const [index, file] of preparedFiles.entries()) {
      const path = invoiceUploadStoragePath({
        organizationId,
        day,
        uploadGroup,
        index: index + 1,
        fileName: file.name
      });
      const signed = await supabase.storage.from(bucket).createSignedUploadUrl(path);
      if (signed.error) throw signed.error;
      uploads.push({
        path,
        token: signed.data.token,
        signedUrl: signed.data.signedUrl,
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size
      });
    }

    const displayFileName = uploads.length === 1 ? uploads[0].fileName : `${uploads.length} files - ${uploads[0].fileName}`;
    const sessionToken = createUploadSessionToken({
      organizationId,
      displayFileName,
      fileHash,
      totalBytes,
      mimeType: uploads[0].mimeType,
      files: uploads.map(({ path, fileName, mimeType, size }) => ({ path, fileName, mimeType, size }))
    });

    return NextResponse.json({ bucket, uploads, sessionToken });
  } catch (error) {
    console.error("Signed invoice upload failed", {
      message: error.message,
      code: error.code || null,
      status: error.status || null
    });
    return NextResponse.json({ error: error.message, code: error.code || null, storage: error.storage || null }, { status: error.status || 500 });
  }
}
