import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeProductName } from "@/lib/normalization";
import { assertStorageAvailable, getActiveOrganizationId } from "@/lib/organization";
import { getUnsupportedInvoiceFileMessage, inferInvoiceMimeType } from "@/lib/invoiceFiles";
import { parseInvoiceText } from "@/lib/aiParser";
import { runOcr } from "@/lib/ocr";

export async function findInvoiceByFileHash(fileHash, { organizationId: providedOrganizationId = null } = {}) {
  if (!fileHash) return null;
  const supabase = getSupabaseAdmin();
  const organizationId = providedOrganizationId || await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("organization_id", organizationId)
    .eq("original_file_sha256", fileHash)
    .is("duplicate_of_invoice_id", null)
    .neq("parse_status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertParsedInvoice({ file, fileBuffer, fileHash, mimeType, ocrResult, parsed, organizationId }) {
  return upsertParsedInvoiceFromUpload({
    displayFileName: file.name,
    primaryFileBuffer: fileBuffer,
    fileHash,
    mimeType: mimeType || file.type,
    ocrResult,
    parsed,
    storageFiles: [{ fileName: file.name, buffer: fileBuffer, mimeType: mimeType || file.type }],
    organizationId
  });
}

export async function upsertParsedInvoiceFromUpload({ displayFileName, primaryFileBuffer, fileHash, mimeType, ocrResult, parsed, storageFiles, organizationId: providedOrganizationId = null }) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = providedOrganizationId || await getActiveOrganizationId();
  const storeId = await upsertNamed(supabase, "stores", parsed.store_name, organizationId);
  const vendorId = await upsertNamed(supabase, "vendors", parsed.vendor_name, organizationId);

  const duplicate = await findDuplicateInvoice(supabase, {
    organizationId,
    vendorId,
    invoiceNumber: parsed.invoice_number,
    invoiceDate: parsed.invoice_date
  });
  if (duplicate) {
    return {
      invoiceId: duplicate.id,
      duplicate: true,
      invoiceNumber: duplicate.invoice_number
    };
  }

  const uploadGroup = crypto.randomUUID();
  const paths = [];
  for (const [index, storageFile] of storageFiles.entries()) {
    const path = `${new Date().toISOString().slice(0, 10)}/${uploadGroup}-${index + 1}-${safeName(storageFile.fileName)}`;
    const upload = await supabase.storage.from(bucket).upload(path, storageFile.buffer, {
      contentType: storageFile.mimeType || "application/octet-stream",
      upsert: false
    });
    if (upload.error) throw upload.error;
    paths.push(path);
  }

    const invoicePayload = {
    organization_id: organizationId,
    store_id: storeId,
    vendor_id: vendorId,
    invoice_number: parsed.invoice_number,
    invoice_date: parsed.invoice_date,
    invoice_total: parsed.invoice_total,
    original_file_path: paths[0],
    original_file_name: displayFileName,
    original_file_sha256: fileHash,
    original_file_size_bytes: primaryFileBuffer.length,
    mime_type: mimeType,
    ocr_text: serializeProcessedOcr({
      text: ocrResult.text,
      files: paths.map((path, index) => ({
        path,
        fileName: storageFiles[index]?.fileName || displayFileName,
        mimeType: storageFiles[index]?.mimeType || mimeType
      }))
    }),
    ocr_provider: ocrResult.provider,
    parse_status: "needs_review"
  };
  let invoiceInsert = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select("id")
    .single();
  if (isMissingColumnError(invoiceInsert.error, "original_file_size_bytes")) {
    delete invoicePayload.original_file_size_bytes;
    invoiceInsert = await supabase.from("invoices").insert(invoicePayload).select("id").single();
  }
  if (invoiceInsert.error) throw invoiceInsert.error;

  const invoiceId = invoiceInsert.data.id;
  if (parsed.line_items.length) {
    const rows = parsed.line_items.map((item) => ({
      invoice_id: invoiceId,
      ...item,
      product_name_normalized: item.product_name_normalized || normalizeProductName(item.product_name_raw)
    }));
    const inserted = await supabase.from("invoice_line_items").insert(rows);
    if (inserted.error) throw inserted.error;
  }

  return { invoiceId, duplicate: false };
}

export async function createPendingInvoiceUpload({ displayFileName, fileHash, mimeType, totalBytes, storageFiles, organizationId: providedOrganizationId = null }) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = providedOrganizationId || await getActiveOrganizationId();
  const uploadGroup = crypto.randomUUID();
  const pendingFiles = [];

  for (const [index, storageFile] of storageFiles.entries()) {
    const path = `${new Date().toISOString().slice(0, 10)}/${uploadGroup}-${index + 1}-${safeName(storageFile.fileName)}`;
    const upload = await supabase.storage.from(bucket).upload(path, storageFile.buffer, {
      contentType: storageFile.mimeType || "application/octet-stream",
      upsert: false
    });
    if (upload.error) throw upload.error;
    pendingFiles.push({
      path,
      fileName: storageFile.fileName,
      mimeType: storageFile.mimeType
    });
  }

  const invoiceInsert = await supabase
    .from("invoices")
    .insert({
      organization_id: organizationId,
      invoice_number: `Processing-${uploadGroup.slice(0, 8)}`,
      original_file_path: pendingFiles[0].path,
      original_file_name: displayFileName,
      original_file_sha256: fileHash,
      original_file_size_bytes: totalBytes,
      mime_type: mimeType,
      ocr_text: JSON.stringify({ kind: "pending_upload", pendingFiles }),
      ocr_provider: "pending",
      parse_status: "processing"
    })
    .select("id")
    .single();
  if (invoiceInsert.error) throw invoiceInsert.error;
  return { invoiceId: invoiceInsert.data.id, duplicate: false, processing: true };
}

export async function processPendingInvoice(invoiceId) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = await getActiveOrganizationId();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  if (!["processing", "processing_failed"].includes(invoice.parse_status)) {
    return { invoiceId, status: invoice.parse_status, alreadyProcessed: true };
  }

  const manifest = parsePendingManifest(invoice.ocr_text);
  if (!manifest.pendingFiles.length) throw new Error("This invoice does not have pending files to process.");

  try {
    const ocrResults = [];
    for (const [index, pendingFile] of manifest.pendingFiles.entries()) {
      const download = await supabase.storage.from(bucket).download(pendingFile.path);
      if (download.error) throw download.error;
      const fileBuffer = Buffer.from(await download.data.arrayBuffer());
      const result = await runOcr({ fileBuffer, mimeType: pendingFile.mimeType, maxPages: 3 });
      ocrResults.push({ ...result, fileName: pendingFile.fileName, fileIndex: index + 1 });
    }

    const ocrResult = combineOcrResults(ocrResults);
    const parsed = await parseInvoiceText(ocrResult.text);
    const storeId = await upsertNamed(supabase, "stores", parsed.store_name, organizationId);
    const vendorId = await upsertNamed(supabase, "vendors", parsed.vendor_name, organizationId);
    const duplicate = await findDuplicateInvoice(supabase, {
      organizationId,
      vendorId,
      invoiceNumber: parsed.invoice_number,
      invoiceDate: parsed.invoice_date,
      excludeInvoiceId: invoiceId
    });

    if (duplicate) {
      const duplicateUpdate = await supabase
        .from("invoices")
        .update({
          store_id: storeId,
          vendor_id: vendorId,
          invoice_number: parsed.invoice_number || invoice.invoice_number,
          invoice_date: parsed.invoice_date,
          invoice_total: parsed.invoice_total,
          ocr_text: serializeProcessedOcr({ text: ocrResult.text, files: manifest.pendingFiles }),
          ocr_provider: ocrResult.provider,
          parse_status: "duplicate",
          duplicate_of_invoice_id: duplicate.id
        })
        .eq("id", invoiceId)
        .eq("organization_id", organizationId);
      if (duplicateUpdate.error) throw duplicateUpdate.error;
      return { invoiceId: duplicate.id, duplicate: true, status: "duplicate" };
    }

    const invoiceUpdate = await supabase
      .from("invoices")
      .update({
        store_id: storeId,
        vendor_id: vendorId,
        invoice_number: parsed.invoice_number || invoice.invoice_number,
        invoice_date: parsed.invoice_date,
        invoice_total: parsed.invoice_total,
        ocr_text: serializeProcessedOcr({ text: ocrResult.text, files: manifest.pendingFiles }),
        ocr_provider: ocrResult.provider,
        parse_status: "needs_review",
        duplicate_of_invoice_id: null
      })
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);
    if (invoiceUpdate.error) throw invoiceUpdate.error;

    const deleteExisting = await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
    if (deleteExisting.error) throw deleteExisting.error;
    const rows = (parsed.line_items || []).filter((item) => item.product_name_raw).map((item) => ({
      invoice_id: invoiceId,
      ...item,
      product_name_normalized: item.product_name_normalized || normalizeProductName(item.product_name_raw)
    }));
    if (rows.length) {
      const insert = await supabase.from("invoice_line_items").insert(rows);
      if (insert.error) throw insert.error;
    }

    return { invoiceId, status: "needs_review" };
  } catch (processingError) {
    const failedUpdate = await supabase
      .from("invoices")
      .update({
        parse_status: "processing_failed",
        ocr_provider: "processing-error",
        ocr_text: JSON.stringify({ ...manifest, error: processingError.message })
      })
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);
    if (failedUpdate.error) throw failedUpdate.error;
    throw processingError;
  }
}

export async function getInvoiceForReview(invoiceId) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, stores(name), vendors(name), invoice_line_items(*)")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  return withSignedUrl(supabase, data);
}

export async function appendInvoiceOriginalFiles(invoiceId, files) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = await getActiveOrganizationId();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, original_file_path, original_file_name, original_file_size_bytes, mime_type, ocr_text, ocr_provider, parse_status, source_batch_id")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  if (invoice.ocr_provider === "manual") throw Object.assign(new Error("Manual invoices do not have original files to append to."), { status: 400 });

  const prepared = [];
  for (const file of files || []) {
    if (!file || typeof file === "string") continue;
    const mimeType = inferInvoiceMimeType(file);
    if (!mimeType) throw Object.assign(new Error(getUnsupportedInvoiceFileMessage(file)), { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    prepared.push({ file, mimeType, buffer });
  }
  if (!prepared.length) throw Object.assign(new Error("Attach one or more original invoice pages."), { status: 400 });
  if (prepared.length > 6) throw Object.assign(new Error("Add up to 6 original pages at a time."), { status: 400 });

  const totalBytes = prepared.reduce((sum, item) => sum + item.buffer.length, 0);
  await assertStorageAvailable(totalBytes, { organizationId });

  const uploadGroup = crypto.randomUUID();
  const uploadedFiles = [];
  for (const [index, item] of prepared.entries()) {
    const path = `${new Date().toISOString().slice(0, 10)}/${invoiceId}-extra-${uploadGroup}-${index + 1}-${safeName(item.file.name)}`;
    const upload = await supabase.storage.from(bucket).upload(path, item.buffer, {
      contentType: item.mimeType,
      upsert: false
    });
    if (upload.error) throw upload.error;
    uploadedFiles.push({
      path,
      fileName: item.file.name,
      mimeType: item.mimeType
    });
  }

  const payload = parseOcrPayload(invoice.ocr_text);
  const currentFiles = originalFileEntries(invoice);
  const nextFiles = [...currentFiles, ...uploadedFiles];
  const nextOcrText = payload.kind === "pending_upload" || invoice.parse_status === "processing"
    ? JSON.stringify({ ...payload, kind: "pending_upload", pendingFiles: [...payload.pendingFiles, ...uploadedFiles] })
    : serializeProcessedOcr({ text: ocrTextForInvoice(invoice), files: nextFiles });
  const nextName = nextFiles.length === 1 ? nextFiles[0].fileName : `${nextFiles.length} files - ${nextFiles[0].fileName}`;

  const update = await supabase
    .from("invoices")
    .update({
      original_file_name: nextName,
      original_file_size_bytes: Number(invoice.original_file_size_bytes || 0) + totalBytes,
      ocr_text: nextOcrText
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId);
  if (update.error) throw update.error;

  return { added: uploadedFiles.length };
}

export async function updateInvoiceReview(invoiceId, body) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const storeId = await upsertNamed(supabase, "stores", body.store_name, organizationId);
  const vendorId = await upsertNamed(supabase, "vendors", body.vendor_name, organizationId);
  const existing = await supabase.from("invoices").select("id").eq("id", invoiceId).eq("organization_id", organizationId).single();
  if (existing.error) throw existing.error;

  const duplicate = await findDuplicateInvoice(supabase, {
    organizationId,
    vendorId,
    invoiceNumber: body.invoice_number,
    invoiceDate: body.invoice_date,
    excludeInvoiceId: invoiceId
  });
  if (duplicate) {
    const duplicateUpdate = await supabase
      .from("invoices")
      .update({
        store_id: storeId,
        vendor_id: vendorId,
        invoice_number: body.invoice_number,
        invoice_date: body.invoice_date,
        invoice_total: num(body.invoice_total),
        parse_status: "duplicate",
        duplicate_of_invoice_id: duplicate.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", invoiceId)
      .eq("organization_id", organizationId);
    if (duplicateUpdate.error) throw duplicateUpdate.error;
    return { duplicate: true, invoiceId: duplicate.id, invoiceNumber: duplicate.invoice_number };
  }

  const invoiceUpdate = await supabase
    .from("invoices")
    .update({
      store_id: storeId,
      vendor_id: vendorId,
      invoice_number: body.invoice_number,
      invoice_date: body.invoice_date,
      invoice_total: num(body.invoice_total),
      parse_status: "reviewed",
      duplicate_of_invoice_id: null,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId);
  if (invoiceUpdate.error) throw invoiceUpdate.error;

  const deleteExisting = await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
  if (deleteExisting.error) throw deleteExisting.error;

  const rows = (body.line_items || []).map((item) => ({
    invoice_id: invoiceId,
    product_name_raw: item.product_name_raw,
    product_name_normalized: normalizeProductName(item.product_name_raw),
    brand: item.brand || null,
    bottle_name: item.bottle_name || item.product_name_raw,
    size: item.size || null,
    pack_size: num(item.pack_size),
    quantity: num(item.quantity) || 0,
    unit_cost: num(item.unit_cost),
    total_cost: num(item.total_cost),
    sku: item.sku || null,
    upc: item.upc || null,
    confidence_score: num(item.confidence_score) ?? 0.9
  }));
  if (rows.length) {
    const insert = await supabase.from("invoice_line_items").insert(rows);
    if (insert.error) throw insert.error;
  }
  return { duplicate: false };
}

export async function createManualInvoice(body) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const storeId = await upsertNamed(supabase, "stores", body.store_name, organizationId);
  const vendorId = await upsertNamed(supabase, "vendors", body.vendor_name, organizationId);
  const duplicate = await findDuplicateInvoice(supabase, {
    organizationId,
    vendorId,
    invoiceNumber: body.invoice_number,
    invoiceDate: body.invoice_date
  });
  if (duplicate) {
    return { invoiceId: duplicate.id, duplicate: true, invoiceNumber: duplicate.invoice_number };
  }

  const invoiceInsert = await supabase
    .from("invoices")
    .insert({
      organization_id: organizationId,
      store_id: storeId,
      vendor_id: vendorId,
      invoice_number: body.invoice_number,
      invoice_date: body.invoice_date,
      invoice_total: num(body.invoice_total),
      original_file_path: `manual/${crypto.randomUUID()}`,
      original_file_name: "Manual entry",
      original_file_sha256: null,
      mime_type: "manual/entry",
      ocr_text: "",
      ocr_provider: "manual",
      parse_status: "reviewed",
      reviewed_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (invoiceInsert.error) throw invoiceInsert.error;

  const invoiceId = invoiceInsert.data.id;
  const rows = (body.line_items || []).filter((item) => item.product_name_raw).map((item) => ({
    invoice_id: invoiceId,
    product_name_raw: item.product_name_raw,
    product_name_normalized: normalizeProductName(item.product_name_raw),
    brand: item.brand || null,
    bottle_name: item.bottle_name || item.product_name_raw,
    size: item.size || null,
    pack_size: num(item.pack_size),
    quantity: num(item.quantity) || 0,
    unit_cost: num(item.unit_cost),
    total_cost: num(item.total_cost),
    sku: item.sku || null,
    upc: item.upc || null,
    confidence_score: 1
  }));
  if (rows.length) {
    const insert = await supabase.from("invoice_line_items").insert(rows);
    if (insert.error) throw insert.error;
  }

  return { invoiceId, duplicate: false };
}

export async function deleteInvoice(invoiceId) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoices")
    .select("original_file_path, ocr_provider, ocr_text, source_batch_id")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;

  const duplicateLinks = await supabase
    .from("invoices")
    .update({ duplicate_of_invoice_id: null, parse_status: "needs_review" })
    .eq("organization_id", organizationId)
    .eq("duplicate_of_invoice_id", invoiceId);
  if (duplicateLinks.error) throw duplicateLinks.error;

  const detectedLinks = await supabase
    .from("batch_detected_invoices")
    .update({ created_invoice_id: null, status: "detected" })
    .eq("created_invoice_id", invoiceId);
  if (detectedLinks.error) throw detectedLinks.error;

  const deleted = await supabase.from("invoices").delete().eq("id", invoiceId).eq("organization_id", organizationId);
  if (deleted.error) throw deleted.error;

  if (data?.original_file_path && data.ocr_provider !== "manual" && !data.source_batch_id) {
    const paths = storagePathsForInvoice(data);
    if (paths.length) await supabase.storage.from(getStorageBucket()).remove(paths);
  }
}

export async function listInvoices(limit = 200) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  await markDuplicateInvoicesForOrganization(supabase, organizationId);
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, invoice_total, original_file_name, ocr_provider, parse_status, duplicate_of_invoice_id, created_at, stores(name), vendors(name), invoice_line_items(id,total_cost)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function searchLineItems(query) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const normalized = normalizeProductName(query);
  const { data, error } = await supabase.rpc("search_invoice_line_items", {
    search_term: query,
    normalized_term: normalized,
    active_organization_id: organizationId
  });
  if (error) throw error;
  return data || [];
}

export async function listLineItems(limit = 500) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoice_line_items")
    .select("id, invoice_id, product_name_raw, product_name_normalized, brand, bottle_name, size, pack_size, quantity, unit_cost, total_cost, sku, upc, confidence_score, invoices!inner(invoice_number, invoice_date, parse_status, duplicate_of_invoice_id, organization_id, stores(name), vendors(name))")
    .eq("invoices.organization_id", organizationId)
    .order("product_name_normalized", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data || []).filter((row) => !row.invoices?.duplicate_of_invoice_id && row.invoices?.parse_status !== "duplicate").map((row) => ({
    line_item_id: row.id,
    invoice_id: row.invoice_id,
    product_name_raw: row.product_name_raw,
    product_name_normalized: row.product_name_normalized,
    brand: row.brand,
    bottle_name: row.bottle_name,
    size: row.size,
    pack_size: row.pack_size,
    quantity: row.quantity,
    unit_cost: row.unit_cost,
    total_cost: row.total_cost,
    sku: row.sku,
    upc: row.upc,
    confidence_score: row.confidence_score,
    invoice_number: row.invoices?.invoice_number,
    invoice_date: row.invoices?.invoice_date,
    vendor_name: row.invoices?.vendors?.name,
    store_name: row.invoices?.stores?.name
  }));
}

export async function getDashboardStats() {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  await markDuplicateInvoicesForOrganization(supabase, organizationId);
  const [invoices, lines, vendors, stores, duplicateBatches, duplicateDetected, duplicateInvoices] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("duplicate_of_invoice_id", null).neq("parse_status", "duplicate"),
    supabase.from("invoice_line_items").select("id, invoices!inner(id, organization_id)", { count: "exact", head: true }).eq("invoices.organization_id", organizationId).is("invoices.duplicate_of_invoice_id", null).neq("invoices.parse_status", "duplicate"),
    supabase.from("vendors").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("invoice_batches").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "duplicate"),
    supabase.from("batch_detected_invoices").select("id, invoice_batches!inner(organization_id)", { count: "exact", head: true }).eq("invoice_batches.organization_id", organizationId).eq("status", "duplicate"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("parse_status", "duplicate")
  ]);
  return {
    invoices: invoices.count || 0,
    lineItems: lines.count || 0,
    vendors: vendors.count || 0,
    stores: stores.count || 0,
    duplicates: (duplicateBatches.count || 0) + (duplicateDetected.count || 0) + (duplicateInvoices.count || 0)
  };
}

export async function getRecentInvoices(limit = 8) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  await markDuplicateInvoicesForOrganization(supabase, organizationId);
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, parse_status, stores(name), vendors(name), invoice_line_items(id)")
    .eq("organization_id", organizationId)
    .is("duplicate_of_invoice_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getInvoicesNeedingReview(limit = 200) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, created_at, original_file_name, invoice_line_items(id), stores(name), vendors(name)")
    .eq("organization_id", organizationId)
    .eq("parse_status", "needs_review")
    .is("duplicate_of_invoice_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getRecentDuplicates(limit = 6) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const [batchDuplicates, invoiceDuplicates, savedInvoiceDuplicates] = await Promise.all([
    supabase
      .from("invoice_batches")
      .select("id, original_file_name, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "duplicate")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("batch_detected_invoices")
      .select("id, invoice_number, invoice_date, vendor_name, store_name, created_invoice_id, created_at, invoice_batches!inner(organization_id, original_file_name)")
      .eq("invoice_batches.organization_id", organizationId)
      .eq("status", "duplicate")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, created_at, duplicate_of_invoice_id, stores(name), vendors(name)")
      .eq("organization_id", organizationId)
      .eq("parse_status", "duplicate")
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);
  if (batchDuplicates.error) throw batchDuplicates.error;
  if (invoiceDuplicates.error) throw invoiceDuplicates.error;
  if (savedInvoiceDuplicates.error) throw savedInvoiceDuplicates.error;

  return [
    ...(batchDuplicates.data || []).map((item) => ({
      id: `batch-${item.id}`,
      type: "Duplicate PDF",
      title: item.original_file_name || "Uploaded PDF",
      detail: "This file was already in SIV.",
      createdAt: item.created_at,
      href: "/batches"
    })),
    ...(invoiceDuplicates.data || []).map((item) => ({
      id: `invoice-${item.id}`,
      type: "Duplicate invoice",
      title: item.invoice_number || "Unknown invoice",
      detail: [item.vendor_name, item.invoice_date, item.invoice_batches?.original_file_name].filter(Boolean).join(" • "),
      createdAt: item.created_at,
      href: item.created_invoice_id ? `/review/${item.created_invoice_id}` : "/batches"
    })),
    ...(savedInvoiceDuplicates.data || []).map((item) => ({
      id: `saved-invoice-${item.id}`,
      type: "Duplicate invoice",
      title: item.invoice_number || "Unknown invoice",
      detail: [item.vendors?.name, item.stores?.name, item.invoice_date].filter(Boolean).join(" • "),
      createdAt: item.created_at,
      href: `/review/${item.id}`
    }))
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export async function getProductHistory(query) {
  return searchLineItems(query);
}

export async function getVendorHistory() {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, invoices(id, invoice_number, invoice_date, invoice_line_items(quantity,total_cost))")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw error;
  return data || [];
}

async function upsertNamed(supabase, table, name, organizationId) {
  const clean = String(name || table.slice(0, -1)).trim();
  const { data, error } = await supabase
    .from(table)
    .upsert({ name: clean, organization_id: organizationId }, { onConflict: "organization_id,name" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function findDuplicateInvoice(supabase, { organizationId, vendorId, invoiceNumber, invoiceDate, excludeInvoiceId }) {
  const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
  if (!organizationId || !normalizedInvoiceNumber) return null;
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, vendor_id")
    .eq("organization_id", organizationId)
    .is("duplicate_of_invoice_id", null)
    .neq("parse_status", "duplicate");
  if (invoiceDate) {
    query = query.eq("invoice_date", invoiceDate);
  }
  if (excludeInvoiceId) {
    query = query.neq("id", excludeInvoiceId);
  }

  const { data, error } = await query.order("created_at", { ascending: true }).limit(100);
  if (error) throw error;

  return (data || []).find((invoice) => {
    if (normalizeInvoiceNumber(invoice.invoice_number) !== normalizedInvoiceNumber) return false;
    if (invoiceDate && invoice.invoice_date === invoiceDate) return true;
    return vendorId && invoice.vendor_id === vendorId;
  }) || null;
}

async function markDuplicateInvoicesForOrganization(supabase, organizationId) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, created_at, parse_status, duplicate_of_invoice_id, stores(name), vendors(name)")
    .eq("organization_id", organizationId)
    .is("duplicate_of_invoice_id", null)
    .neq("parse_status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;

  const seen = new Map();
  const updates = [];
  for (const invoice of data || []) {
    const key = duplicateKey(invoice);
    if (!key) continue;
    const original = seen.get(key);
    if (!original) {
      seen.set(key, invoice);
      continue;
    }
    updates.push(
      supabase
        .from("invoices")
        .update({ parse_status: "duplicate", duplicate_of_invoice_id: original.id })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId)
    );
  }

  if (updates.length) {
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
}

function duplicateKey(invoice) {
  const number = normalizeInvoiceNumber(invoice.invoice_number);
  if (!number || !invoice.invoice_date) return "";
  const vendor = normalizeEntityName(invoice.vendors?.name);
  const store = normalizeEntityName(invoice.stores?.name);
  return [number, invoice.invoice_date, vendor, store].join("|");
}

function parsePendingManifest(value) {
  const parsed = parseOcrPayload(value);
  return {
    ...parsed,
    pendingFiles: Array.isArray(parsed.pendingFiles) ? parsed.pendingFiles : []
  };
}

function storagePathsForInvoice(invoice) {
  return originalFileEntries(invoice).map((file) => file.path).filter(Boolean);
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

function normalizeInvoiceNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeEntityName(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function withSignedUrl(supabase, invoice) {
  const files = originalFileEntries(invoice);
  const signedFiles = await Promise.all(files.map(async (file, index) => {
    const { data } = await supabase.storage.from(getStorageBucket()).createSignedUrl(file.path, 60 * 60);
    return {
      ...file,
      index: index + 1,
      signedUrl: data?.signedUrl || null
    };
  }));
  return {
    ...invoice,
    ocr_text: ocrTextForInvoice(invoice),
    signed_url: signedFiles[0]?.signedUrl || null,
    original_files: signedFiles
  };
}

function parseOcrPayload(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (parsed && typeof parsed === "object") {
      return {
        ...parsed,
        pendingFiles: Array.isArray(parsed.pendingFiles) ? parsed.pendingFiles : [],
        files: Array.isArray(parsed.files) ? parsed.files : []
      };
    }
  } catch {
    // Plain OCR text from older invoices.
  }
  return { kind: "plain_text", text: value || "", pendingFiles: [], files: [] };
}

function originalFileEntries(invoice) {
  const payload = parseOcrPayload(invoice.ocr_text);
  const files = payload.kind === "pending_upload" ? payload.pendingFiles : payload.files;
  if (files?.length) {
    return files
      .filter((file) => file?.path)
      .map((file, index) => ({
        path: file.path,
        fileName: file.fileName || `${invoice.original_file_name || "Original invoice"} ${index + 1}`,
        mimeType: file.mimeType || invoice.mime_type || "application/octet-stream"
      }));
  }
  if (!invoice.original_file_path) return [];
  return [{
    path: invoice.original_file_path,
    fileName: invoice.original_file_name || "Original invoice",
    mimeType: invoice.mime_type || "application/octet-stream"
  }];
}

function ocrTextForInvoice(invoice) {
  const payload = parseOcrPayload(invoice.ocr_text);
  return payload.text || "";
}

function serializeProcessedOcr({ text, files }) {
  return JSON.stringify({
    kind: "processed_upload",
    text: text || "",
    files: (files || []).filter((file) => file?.path).map((file) => ({
      path: file.path,
      fileName: file.fileName || "Original invoice",
      mimeType: file.mimeType || "application/octet-stream"
    }))
  });
}

function safeName(name) {
  return String(name || "invoice").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function num(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMissingColumnError(error, column) {
  return error && String(error.message || error.details || "").includes(column);
}
