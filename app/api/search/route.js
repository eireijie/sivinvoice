import { NextResponse } from "next/server";
import { searchLineItems } from "@/lib/invoices";

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams.get("q") || "";
    if (!query.trim()) return NextResponse.json({ rows: [] });
    const rows = await searchLineItems(query.trim());
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
