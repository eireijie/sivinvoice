import { NextResponse } from "next/server";
import { after } from "next/server";
import { createPendingInvoiceUpload, processNextQueuedInvoices } from "@/lib/invoices";
import { verifyUploadSessionToken } from "@/lib/uploadSessionTokens";

export async function POST(request) {
  try {
    const body = await request.json();
    const session = verifyUploadSessionToken(body.sessionToken);
    const result = await createPendingInvoiceUpload({
      organizationId: session.organizationId,
      displayFileName: session.displayFileName,
      fileHash: session.fileHash,
      totalBytes: session.totalBytes,
      mimeType: session.mimeType,
      storageFiles: session.files
    });
    after(() => processNextQueuedInvoices({ limit: 1 }).catch((error) => console.error("Queue worker failed", error)));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Completing invoice upload failed", {
      message: error.message,
      status: error.status || null
    });
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
