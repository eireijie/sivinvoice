import { NextResponse } from "next/server";
import { createVendorFolder } from "@/lib/invoices";

export async function POST(request) {
  try {
    const result = await createVendorFolder(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
