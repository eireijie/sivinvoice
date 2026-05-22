import { NextResponse } from "next/server";
import { mergeVendorFolders } from "@/lib/invoices";

export async function POST(request, { params }) {
  try {
    const routeParams = await params;
    const body = await request.json();
    const result = await mergeVendorFolders({
      targetVendorId: routeParams.id,
      sourceVendorId: body.sourceVendorId
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
