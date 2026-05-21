import { NextResponse } from "next/server";
import { createManualInvoice, listInvoices } from "@/lib/invoices";

export async function GET(request) {
  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = Math.min(500, Math.max(1, Number(limitParam) || 200));
    const invoices = await listInvoices(limit);
    return NextResponse.json({ invoices });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const result = await createManualInvoice(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
