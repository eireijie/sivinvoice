import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createInvoiceBatch, findBatchByFileHash, listBatches, logDuplicateBatchUpload } from "@/lib/batches";
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
      return NextResponse.json({ error: "Upload one or more PDF batch files." }, { status: 400 });
    }
    if (files.some((file) => file.type !== "application/pdf")) {
      return NextResponse.json({ error: "Batch upload currently supports PDF files only." }, { status: 400 });
    }
    const activePlan = await getActiveWorkspacePlan();
    if (activePlan.id === "free") {
      return NextResponse.json({ error: "Batch upload is available on Pro and Max. Free still includes regular single-invoice uploads." }, { status: 402 });
    }
    const maxPages = clampPageCount(formData.get("maxPages"));

    const results = [];
    let reservedBytes = 0;
    for (const file of files) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
      const exactDuplicate = await findBatchByFileHash(fileHash);
      if (exactDuplicate) {
        await logDuplicateBatchUpload({ existingBatch: exactDuplicate, fileName: file.name });
        results.push({
          batchId: exactDuplicate.id,
          duplicate: true,
          fileName: file.name,
          existingFileName: exactDuplicate.original_file_name
        });
        continue;
      }
      await assertStorageAvailable(fileBuffer.length, { reservedBytes });
      reservedBytes += fileBuffer.length;

      const batchId = await createInvoiceBatch({
        file,
        fileBuffer,
        fileHash,
        maxPages,
        plan: activePlan.id
      });
      results.push({ batchId, duplicate: false, fileName: file.name });
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
