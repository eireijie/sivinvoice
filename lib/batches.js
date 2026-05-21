import { detectBatchInvoices } from "@/lib/aiParser";
import { normalizeProductName } from "@/lib/normalization";
import { runGoogleVisionPdfPages } from "@/lib/ocr";
import { getActiveOrganizationId } from "@/lib/organization";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function findBatchByFileHash(fileHash) {
  if (!fileHash) return null;
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoice_batches")
    .select("id, original_file_path, original_file_name, original_file_sha256, mime_type, ocr_provider, page_count")
    .eq("organization_id", organizationId)
    .eq("original_file_sha256", fileHash)
    .neq("status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function logDuplicateBatchUpload({ existingBatch, fileName }) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const payload = {
    organization_id: organizationId,
    original_file_path: existingBatch.original_file_path,
    original_file_name: fileName || existingBatch.original_file_name,
    original_file_sha256: existingBatch.original_file_sha256,
    original_file_size_bytes: 0,
    mime_type: existingBatch.mime_type || "application/pdf",
    status: "duplicate",
    ocr_provider: existingBatch.ocr_provider || "duplicate-check",
    page_count: existingBatch.page_count,
    ocr_text: `Duplicate upload of batch ${existingBatch.id}`
  };
  let result = await supabase
    .from("invoice_batches")
    .insert(payload)
    .select("id")
    .single();
  if (isMissingColumnError(result.error, "original_file_size_bytes")) {
    delete payload.original_file_size_bytes;
    result = await supabase.from("invoice_batches").insert(payload).select("id").single();
  }
  const { data, error } = result;
  if (error) throw error;
  return data.id;
}

export async function createInvoiceBatch({ file, fileBuffer, fileHash, maxPages = 10, plan = "free" }) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = await getActiveOrganizationId();
  const path = `batches/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const upload = await supabase.storage.from(bucket).upload(path, fileBuffer, {
    contentType: file.type || "application/pdf",
    upsert: false
  });
  if (upload.error) throw upload.error;

  const pages = await runGoogleVisionPdfPages({ fileBuffer, maxPages });
  const ocrText = pages.map((page) => `--- PAGE ${page.pageNumber} ---\n${page.text}`).join("\n\n");
  const detected = await detectBatchInvoices(pages);

  const batchPayload = {
    organization_id: organizationId,
    original_file_path: path,
    original_file_name: file.name,
    original_file_sha256: fileHash,
    original_file_size_bytes: fileBuffer.length,
    mime_type: file.type || "application/pdf",
    status: "detected",
    processing_priority: priorityForPlan(plan),
    ocr_provider: "google-vision-pdf-sync",
    page_count: pages.length,
    ocr_text: ocrText
  };
  let batchInsert = await supabase
    .from("invoice_batches")
    .insert(batchPayload)
    .select("id")
    .single();
  if (isMissingColumnError(batchInsert.error, "original_file_size_bytes") || isMissingColumnError(batchInsert.error, "processing_priority")) {
    delete batchPayload.original_file_size_bytes;
    delete batchPayload.processing_priority;
    batchInsert = await supabase.from("invoice_batches").insert(batchPayload).select("id").single();
  }
  if (batchInsert.error) throw batchInsert.error;

  const batchId = batchInsert.data.id;
  const rows = [];
  for (const invoice of detected.invoices) {
    const duplicate = await findExistingInvoiceByParsed(supabase, {
      organizationId,
      vendorName: invoice.vendor_name,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date
    });
    rows.push({
      batch_id: batchId,
      page_start: invoice.page_start,
      page_end: invoice.page_end,
      vendor_name: invoice.vendor_name,
      store_name: invoice.store_name,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      invoice_total: invoice.invoice_total,
      confidence_score: invoice.confidence_score,
      status: duplicate ? "duplicate" : "detected",
      created_invoice_id: duplicate?.id || null,
      parsed_payload: invoice
    });
  }
  if (rows.length) {
    const insert = await supabase.from("batch_detected_invoices").insert(rows);
    if (insert.error) throw insert.error;
  }

  return batchId;
}

export async function listBatches(limit = 100) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoice_batches")
    .select("id, original_file_name, status, ocr_provider, page_count, created_at, batch_detected_invoices(id,status,created_invoice_id)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getBatch(batchId) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("invoice_batches")
    .select("*, batch_detected_invoices(*)")
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  const { data: signed } = await supabase.storage.from(getStorageBucket()).createSignedUrl(data.original_file_path, 60 * 60);
  return { ...data, signed_url: signed?.signedUrl || null };
}

export async function createInvoiceFromDetected(detectedId) {
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const { data: detected, error } = await supabase
    .from("batch_detected_invoices")
    .select("*, invoice_batches!inner(original_file_path, original_file_name, mime_type, organization_id)")
    .eq("id", detectedId)
    .eq("invoice_batches.organization_id", organizationId)
    .single();
  if (error) throw error;
  if (detected.created_invoice_id) {
    return { invoiceId: detected.created_invoice_id, alreadyCreated: true };
  }

  const parsed = detected.parsed_payload || {};
  const storeId = await upsertNamed(supabase, "stores", parsed.store_name || detected.store_name || "Unassigned Store", organizationId);
  const vendorId = await upsertNamed(supabase, "vendors", parsed.vendor_name || detected.vendor_name || "Unknown Vendor", organizationId);
  const duplicate = await findDuplicateInvoice(supabase, {
    organizationId,
    vendorId,
    invoiceNumber: parsed.invoice_number || detected.invoice_number,
    invoiceDate: parsed.invoice_date || detected.invoice_date
  });
  if (duplicate) {
    await supabase
      .from("batch_detected_invoices")
      .update({ status: "duplicate", created_invoice_id: duplicate.id })
      .eq("id", detectedId);
    return { invoiceId: duplicate.id, duplicate: true };
  }

  const invoicePayload = {
    organization_id: organizationId,
    store_id: storeId,
    vendor_id: vendorId,
    invoice_number: parsed.invoice_number || detected.invoice_number,
    invoice_date: parsed.invoice_date || detected.invoice_date,
    invoice_total: num(parsed.invoice_total ?? detected.invoice_total),
    original_file_path: detected.invoice_batches.original_file_path,
    original_file_name: detected.invoice_batches.original_file_name,
    original_file_size_bytes: 0,
    mime_type: detected.invoice_batches.mime_type,
    ocr_text: "",
    ocr_provider: "batch-detected",
    parse_status: "needs_review",
    source_batch_id: detected.batch_id,
    source_page_start: detected.page_start,
    source_page_end: detected.page_end
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
  const lineItems = Array.isArray(parsed.line_items) ? parsed.line_items : [];
  const rows = lineItems.filter((item) => item.product_name_raw).map((item) => ({
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
    confidence_score: num(item.confidence_score) ?? num(parsed.confidence_score) ?? 0.75
  }));
  if (rows.length) {
    const insert = await supabase.from("invoice_line_items").insert(rows);
    if (insert.error) throw insert.error;
  }

  const update = await supabase
    .from("batch_detected_invoices")
    .update({ status: "created", created_invoice_id: invoiceId })
    .eq("id", detectedId);
  if (update.error) throw update.error;
  return { invoiceId, duplicate: false };
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

async function findDuplicateInvoice(supabase, { organizationId, vendorId, invoiceNumber, invoiceDate }) {
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
  const { data, error } = await query.order("created_at", { ascending: true }).limit(100);
  if (error) throw error;

  return (data || []).find((invoice) => {
    if (normalizeInvoiceNumber(invoice.invoice_number) !== normalizedInvoiceNumber) return false;
    if (invoiceDate && invoice.invoice_date === invoiceDate) return true;
    return vendorId && invoice.vendor_id === vendorId;
  }) || null;
}

async function findExistingInvoiceByParsed(supabase, { organizationId, vendorName, invoiceNumber, invoiceDate }) {
  const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
  if (!organizationId || !normalizedInvoiceNumber || !invoiceDate) return null;
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, vendors(name)")
    .eq("organization_id", organizationId)
    .eq("invoice_date", invoiceDate)
    .is("duplicate_of_invoice_id", null)
    .neq("parse_status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw error;

  const candidates = data || [];
  const matchingNumber = candidates.filter((invoice) => normalizeInvoiceNumber(invoice.invoice_number) === normalizedInvoiceNumber);
  const cleanVendor = normalizeLookup(vendorName);
  if (!cleanVendor) return matchingNumber[0] || null;
  return matchingNumber.find((invoice) => normalizeLookup(invoice.vendors?.name) === cleanVendor) || matchingNumber[0] || null;
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeInvoiceNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function safeName(name) {
  return String(name || "batch.pdf").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function priorityForPlan(plan) {
  if (plan === "max") return 20;
  if (plan === "pro") return 10;
  return 0;
}

function num(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMissingColumnError(error, column) {
  return error && String(error.message || error.details || "").includes(column);
}
