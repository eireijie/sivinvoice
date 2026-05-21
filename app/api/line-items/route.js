import { NextResponse } from "next/server";
import { listLineItems } from "@/lib/invoices";

export async function GET(request) {
  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = Math.min(1000, Math.max(1, Number(limitParam) || 500));
    const rows = await listLineItems(limit);
    return NextResponse.json({
      rows,
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
