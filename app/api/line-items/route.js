import { NextResponse } from "next/server";
import { listLineItems } from "@/lib/invoices";

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.min(1000, Math.max(1, Number(params.get("limit")) || 500));
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const rows = await listLineItems({ limit, offset });
    return NextResponse.json({
      rows,
      nextOffset: rows.length === limit ? offset + rows.length : null,
      filters: {
        vendors: unique(rows.map((row) => row.vendor_name)),
        stores: unique(rows.map((row) => row.store_name)),
        sizes: unique(rows.map((row) => row.size))
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
}
