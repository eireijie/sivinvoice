import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeProductName } from "@/lib/normalization";
import { getActiveOrganizationId } from "@/lib/organization";

export async function findInvoiceByFileHash(fileHash) {
  if (!fileHash) return null;
  const supabase = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
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

export async function upsertParsedInvoice({ file, fileBuffer, fileHash, ocrResult, parsed }) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const organizationId = await getActiveOrganizationId();
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

  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const upload = await supabase.storage.from(bucket).upload(path, fileBuffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (upload.error) throw upload.error;

  const invoicePayload = {
    organization_id: organizationId,
    store_id: storeId,
    vendor_id: vendorId,
    invoice_number: parsed.invoice_number,
    invoice_date: parsed.invoice_date,
    invoice_total: parsed.invoice_total,
    original_file_path: path,
    original_file_name: file.name,
    original_file_sha256: fileHash,
    original_file_size_bytes: fileBuffer.length,
    mime_type: file.type,
    ocr_text: ocrResult.text,
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
    .select("original_file_path, ocr_provider, source_batch_id")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;

  const deleted = await supabase.from("invoices").delete().eq("id", invoiceId).eq("organization_id", organizationId);
  if (deleted.error) throw deleted.error;

  if (data?.original_file_path && data.ocr_provider !== "manual" && !data.source_batch_id) {
    await supabase.storage.from(getStorageBucket()).remove([data.original_file_path]);
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

function normalizeInvoiceNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeEntityName(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function withSignedUrl(supabase, invoice) {
  const { data } = await supabase.storage
    .from(getStorageBucket())
    .createSignedUrl(invoice.original_file_path, 60 * 60);
  return { ...invoice, signed_url: data?.signedUrl || null };
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
