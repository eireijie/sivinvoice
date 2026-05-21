import OpenAI from "openai";
import { normalizeProductName, normalizeSize, splitBrandAndBottle } from "@/lib/normalization";

export async function parseInvoiceText(ocrText) {
  if (process.env.OPENAI_API_KEY) {
    return parseWithOpenAi(ocrText);
  }
  return parseHeuristically(ocrText);
}

export async function detectBatchInvoices(ocrPages) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      invoices: [
        {
          page_start: ocrPages[0]?.pageNumber || 1,
          page_end: ocrPages.at(-1)?.pageNumber || 1,
          confidence_score: 0.45,
          ...parseHeuristically(ocrPages.map((page) => page.text).join("\n\n"))
        }
      ]
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pageText = ocrPages.map((page) => `--- PAGE ${page.pageNumber} ---\n${page.text}`).join("\n\n").slice(0, 24000);
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are splitting a scanned PDF batch into separate beverage invoices.",
          "Return strict JSON with key invoices.",
          "Each invoice must include page_start, page_end, vendor_name, store_name, invoice_number, invoice_date, invoice_total, confidence_score, line_items.",
          "Use page numbers exactly from the PAGE markers.",
          "If one invoice spans multiple pages, group those pages together.",
          "If separate invoice headers or invoice numbers appear, split them into separate invoices.",
          "Do not invent invoices. If uncertain, keep pages together and lower confidence_score.",
          "Line item fields are product_name_raw, brand, bottle_name, size, pack_size, quantity, unit_cost, total_cost, sku, upc, confidence_score."
        ].join(" ")
      },
      { role: "user", content: pageText }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content || "{}");
  const invoices = Array.isArray(parsed.invoices) ? parsed.invoices : [];
  return {
    invoices: invoices.map((invoice) => ({
      page_start: numberOrNull(invoice.page_start) || ocrPages[0]?.pageNumber || 1,
      page_end: numberOrNull(invoice.page_end) || numberOrNull(invoice.page_start) || ocrPages.at(-1)?.pageNumber || 1,
      confidence_score: Math.max(0, Math.min(1, Number(invoice.confidence_score ?? 0.6))),
      ...sanitizeParsedInvoice(invoice)
    }))
  };
}

async function parseWithOpenAi(ocrText) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Extract beverage invoice metadata and every product-level invoice line item from OCR.",
          "The OCR may contain multiple sections marked like --- FILE 1 --- or --- PAGE 2 ---. Treat those as pages of the same invoice unless the text clearly says otherwise.",
          "Extract line items from every file/page section, including continuation pages that do not repeat the invoice header.",
          "Return strict JSON with keys vendor_name, store_name, invoice_number, invoice_date, invoice_total, line_items.",
          "Use invoice_date as YYYY-MM-DD when possible.",
          "Each line item must include product_name_raw, brand, bottle_name, size, pack_size, quantity, unit_cost, total_cost, sku, upc, confidence_score.",
          "If the OCR lists item/qty/description first and prices in a separate aligned block, pair rows by order.",
          "When headers are ITEM# QTY DESCRIPTION, the number after ITEM# is quantity. Do not put that QTY value into pack_size.",
          "For beer/canned products, put the package expression like 24/16, 15/25, 30/12, 12/24 in size or pack_size as appropriate.",
          "Do not invent vendors, stores, invoice numbers, dates, or products. If unsure, leave fields null and lower confidence_score."
        ].join(" ")
      },
      { role: "user", content: ocrText.slice(0, 18000) }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content || "{}");
  return sanitizeParsedInvoice(parsed);
}

function parseHeuristically(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const invoiceNumber = text.match(/invoice\s+#?\s*([a-z0-9-]+)/i)?.[1] || `DRAFT-${Date.now()}`;
  const invoiceDate = text.match(/invoice date\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] || new Date().toISOString().slice(0, 10);
  const vendorName = lines[0] || "Unknown Vendor";
  const storeName = text.match(/store\s+(.+)/i)?.[1] || "Unassigned Store";

  const lineItems = lines
    .map((line) => {
      const match = line.match(/^([A-Z0-9-]+)\s+(\d{8,14})\s+(.+?)\s+(\d+(?:\.\d+)?\s?(?:ML|L|OZ))\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
      if (!match) return null;
      const [, sku, upc, name, size, pack, qty, unit, total] = match;
      const brandBottle = splitBrandAndBottle(name);
      return {
        product_name_raw: name,
        brand: brandBottle.brand,
        bottle_name: brandBottle.bottle_name,
        size,
        pack_size: Number(pack),
        quantity: Number(qty),
        unit_cost: Number(unit),
        total_cost: Number(total),
        sku,
        upc,
        confidence_score: 0.72
      };
    })
    .filter(Boolean);

  return sanitizeParsedInvoice({
    vendor_name: vendorName,
    store_name: storeName,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    line_items: lineItems
  });
}

function sanitizeParsedInvoice(invoice) {
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  return {
    vendor_name: invoice.vendor_name || "Unknown Vendor",
    store_name: invoice.store_name || "Unassigned Store",
    invoice_number: invoice.invoice_number || `DRAFT-${Date.now()}`,
    invoice_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
    invoice_total: numberOrNull(invoice.invoice_total),
    line_items: lineItems.map((item) => {
      const raw = item.product_name_raw || item.bottle_name || "";
      const brandBottle = splitBrandAndBottle(item.bottle_name || raw);
      return {
        product_name_raw: raw,
        product_name_normalized: normalizeProductName(raw),
        brand: item.brand || brandBottle.brand,
        bottle_name: item.bottle_name || brandBottle.bottle_name,
        size: normalizeSize(item.size),
        pack_size: numberOrNull(item.pack_size),
        quantity: numberOrNull(item.quantity) || 0,
        unit_cost: numberOrNull(item.unit_cost),
        total_cost: numberOrNull(item.total_cost),
        sku: item.sku || null,
        upc: item.upc || null,
        confidence_score: Math.max(0, Math.min(1, Number(item.confidence_score ?? 0.5)))
      };
    })
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
