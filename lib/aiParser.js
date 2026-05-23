import OpenAI from "openai";
import { normalizeProductName, normalizeSize, splitBrandAndBottle } from "@/lib/normalization";

export async function parseInvoiceText(ocrText) {
  let parsed;
  if (process.env.OPENAI_API_KEY) {
    parsed = await parseWithOpenAi(ocrText);
  } else {
    parsed = parseHeuristically(ocrText);
  }
  return recoverMissingOcrLineItems(parsed, ocrText);
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
          "The OCR may contain multiple sections marked like --- FILE 1 --- or --- PAGE 2 ---. Treat every section as one uploaded invoice record, even when the pages contain different invoice numbers.",
          "Extract line items from every file/page section, including continuation pages that do not repeat the invoice header.",
          "If several invoice numbers appear, do not split the response. Use the first invoice number as invoice_number and still extract all product rows from all sections.",
          "Return strict JSON with keys vendor_name, store_name, invoice_number, invoice_date, invoice_total, line_items.",
          "Use invoice_date as YYYY-MM-DD when possible.",
          "Each line item must include product_name_raw, brand, bottle_name, size, pack_size, quantity, unit_cost, total_cost, sku, upc, confidence_score.",
          "For RNDC/Republic National invoices, product rows often appear as an O/D quantity like 3/3, product description, ITEM#:sku PACK:n S:size, UPC, then price columns. Extract each ITEM# block as a separate line item.",
          "If the OCR lists item/qty/description first and prices in a separate aligned block, pair rows by order.",
          "When headers are ITEM# QTY DESCRIPTION, the number after ITEM# is quantity. Do not put that QTY value into pack_size.",
          "For beer/canned products, put the package expression like 24/16, 15/25, 30/12, 12/24 in size or pack_size as appropriate.",
          "Do not invent vendors, stores, invoice numbers, dates, or products. If unsure, leave fields null and lower confidence_score."
        ].join(" ")
      },
      { role: "user", content: ocrText.slice(0, 60000) }
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

function recoverMissingOcrLineItems(parsed, ocrText) {
  const recovered = extractOcrLineItemRows(ocrText);
  if (recovered.length <= parsed.line_items.length) return parsed;

  const seen = new Set(parsed.line_items.map((item) => lineItemKey(item)));
  const missing = recovered.filter((item) => {
    const key = lineItemKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!missing.length) return parsed;
  return {
    ...parsed,
    line_items: [...parsed.line_items, ...missing]
  };
}

function extractOcrLineItemRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = extractRndcLineItemRows(lines);
  let inItemTable = false;
  let pending = null;

  for (const line of lines) {
    const normalized = line.toUpperCase();
    if (/^ITEM#?\s+QTY\s+DESCRIPTION/.test(normalized)) {
      inItemTable = true;
      pending = null;
      continue;
    }
    if (!inItemTable) continue;
    if (isInvoiceNonItemLine(normalized)) {
      pending = null;
      continue;
    }

    const coded = line.match(/^(\d{5})\s*(.*)$/);
    if (coded) {
      if (pending) rows.push(finalizeRecoveredRow(pending));
      const [, sku, rest] = coded;
      pending = rowDraftFromSkuAndText(sku, rest);
      if (pending.complete) {
        rows.push(finalizeRecoveredRow(pending));
        pending = null;
      }
      continue;
    }

    if (!pending) continue;
    if (isPriceOnlyLine(line)) {
      const prices = numbersFromLine(line);
      if (prices.length) {
        pending.unit_cost = pending.unit_cost ?? prices.at(-2) ?? prices.at(-1);
        pending.total_cost = pending.total_cost ?? prices.at(-1);
      }
      continue;
    }

    if (looksLikeProductDescription(line)) {
      const merged = [pending.raw, line].filter(Boolean).join(" ");
      Object.assign(pending, rowDraftFromSkuAndText(pending.sku, merged));
      if (pending.complete) {
        rows.push(finalizeRecoveredRow(pending));
        pending = null;
      }
    }
  }

  if (pending) rows.push(finalizeRecoveredRow(pending));
  return rows.filter((row) => row.product_name_raw && row.sku);
}

function extractRndcLineItemRows(lines) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const itemMatch = line.match(/^ITEM#:\s*([0-9 ]{2,})\s+PACK:\s*(\d+)\s+[S8B:]+\s*([0-9.]+[A-Z]*)/i);
    if (!itemMatch) continue;

    const [, rawSku, packSize, rawSize] = itemMatch;
    const description = descriptionBeforeRndcItem(lines, index);
    if (!description.name) continue;

    const prices = pricesAfterRndcItem(lines, index);
    const brandBottle = splitBrandAndBottle(description.name);
    rows.push({
      product_name_raw: description.name,
      product_name_normalized: normalizeProductName(description.name),
      brand: brandBottle.brand,
      bottle_name: brandBottle.bottle_name,
      size: normalizeSize(normalizeRndcSize(rawSize)),
      pack_size: numberOrNull(packSize),
      quantity: description.quantity ?? 1,
      unit_cost: prices.unit_cost,
      total_cost: prices.total_cost,
      sku: rawSku.replace(/\D/g, "") || rawSku.trim(),
      upc: upcNearRndcItem(lines, index),
      confidence_score: prices.total_cost ? 0.72 : 0.64
    });
  }
  return rows;
}

function descriptionBeforeRndcItem(lines, itemIndex) {
  const parts = [];
  let quantity = null;

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const upper = line.toUpperCase();
    if (!line) continue;
    if (upper.startsWith("ITEM#:")) break;
    if (upper.startsWith("UPC:")) continue;
    if (isRndcNoiseLine(upper)) continue;

    const quantityMatch = line.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
    if (quantityMatch) {
      quantity = numberOrNull(quantityMatch[1]);
      if (looksLikeProductDescription(quantityMatch[3])) parts.unshift(quantityMatch[3].trim());
      break;
    }

    if (looksLikeProductDescription(line)) parts.unshift(line);
    if (parts.length >= 4) break;
  }

  return { name: cleanProductDescription(parts.join(" ")), quantity };
}

function pricesAfterRndcItem(lines, itemIndex) {
  const amounts = [];
  for (let index = itemIndex + 1; index < Math.min(lines.length, itemIndex + 10); index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const upper = line.toUpperCase();
    if (/^\d+\s*\/\s*\d+\b/.test(line) || upper.startsWith("ITEM#:") || isInvoiceNonItemLine(upper)) break;
    if (upper.startsWith("UPC:")) continue;
    amounts.push(...moneyAmountsFromLine(line));
  }

  return {
    unit_cost: amounts.length >= 2 ? amounts.at(-2) : null,
    total_cost: amounts.length ? amounts.at(-1) : null
  };
}

function upcNearRndcItem(lines, itemIndex) {
  for (let index = itemIndex + 1; index <= itemIndex + 3; index += 1) {
    const match = lines[index]?.match(/UPC[:\s-]*([0-9 ]{8,18})/i);
    if (match) return match[1].replace(/\D/g, "") || null;
  }
  for (let index = itemIndex - 2; index < itemIndex; index += 1) {
    const match = lines[index]?.match(/UPC[:\s-]*([0-9 ]{8,18})/i);
    if (match) return match[1].replace(/\D/g, "") || null;
  }
  return null;
}

function normalizeRndcSize(value) {
  return String(value || "")
    .replace(/M$/i, "ml")
    .replace(/Z$/i, "oz");
}

function cleanProductDescription(value) {
  return String(value || "")
    .replace(/\b(?:LIST PRICE|DISC|DEAL|UNIT|COST|NET BTL|NET PRICE)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRndcNoiseLine(line) {
  if (isPriceOnlyLine(line)) return true;
  if (/^\d{6,8}$/.test(line)) return true;
  if (/^LST CASH ONLY\b/.test(line)) return true;
  if (/^(LIST PRICE|DISC|DEAL|UNIT|COST|NET BTL|NET PRICE|PRICE|O\/D|CS BTLS|ITEM)$/.test(line)) return true;
  if (/^(C|PR|LES|CONFIG|OLD|LOAD|TERMS|INVOICE|CUSTOMER PO|ORDER #?)$/.test(line)) return true;
  return false;
}

function moneyAmountsFromLine(line) {
  return String(line || "")
    .match(/(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}/g)
    ?.map((value) => Number(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value < 100000) || [];
}

function rowDraftFromSkuAndText(sku, text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^(-?\d+)\s+(.{3,})$/);
  const quantity = match ? numberOrNull(match[1]) : null;
  const name = (match ? match[2] : clean).trim();
  return {
    sku,
    raw: clean,
    quantity: quantity ?? 1,
    product_name_raw: name,
    complete: looksLikeProductDescription(name)
  };
}

function finalizeRecoveredRow(draft) {
  const brandBottle = splitBrandAndBottle(draft.product_name_raw || "");
  return {
    product_name_raw: draft.product_name_raw || "",
    product_name_normalized: normalizeProductName(draft.product_name_raw || ""),
    brand: brandBottle.brand,
    bottle_name: brandBottle.bottle_name,
    size: normalizeSize(extractSizeFromName(draft.product_name_raw || "")),
    pack_size: null,
    quantity: draft.quantity ?? 1,
    unit_cost: numberOrNull(draft.unit_cost),
    total_cost: numberOrNull(draft.total_cost),
    sku: draft.sku,
    upc: null,
    confidence_score: 0.58
  };
}

function looksLikeProductDescription(line) {
  const value = String(line || "").trim();
  if (value.length < 3) return false;
  if (/^\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)+$/.test(value)) return false;
  if (/^(UPRICE|DISC|DEP|PRICE|EXT|OUT OF STOCK)$/i.test(value)) return false;
  return /[A-Z]/i.test(value);
}

function isInvoiceNonItemLine(line) {
  return /^(ACCOUNT:|INVOICE#?:|LOAD$|TERMS$|PO#:|DRIVER|SALESREP|CASES:|BOTTLES:|KEGS:|GALLONS:|MISC:|CREDITS:|TOTAL |PICKSHEET TOTAL|NOT A FINAL INVOICE|THANK YOU|ONE AND ONE|SPLUS COLLECTION|TUNITY EMPLOYER|UPRICE|DISC$|DEP$|PRICE$|EXT$)/.test(line);
}

function isPriceOnlyLine(line) {
  return /^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)*$/.test(String(line || "").trim());
}

function numbersFromLine(line) {
  return String(line || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
}

function extractSizeFromName(name) {
  return String(name || "").match(/\b(?:\d+\/\d+(?:\/\d+(?:\.\d+)?)?|\d+(?:\.\d+)?\s?(?:ML|L|OZ|NR|CAN|CN|C))\b/i)?.[0] || "";
}

function lineItemKey(item) {
  return [item.sku || "", normalizeProductName(item.product_name_raw || item.bottle_name || "")].join("|");
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
