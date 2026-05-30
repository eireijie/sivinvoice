import { NextResponse } from "next/server";
import { createInvoiceFromDetected } from "@/lib/batches";

export async function POST(_request, { params }) {
  try {
    const routeParams = await params;
    const result = await createInvoiceFromDetected(routeParams.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
