import { NextResponse } from "next/server";
import { getPriceTracker } from "@/lib/invoices";

export async function GET() {
  try {
    const products = await getPriceTracker();
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
