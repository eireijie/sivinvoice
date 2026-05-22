import { NextResponse } from "next/server";
import { deleteVendorFolder } from "@/lib/invoices";

export async function DELETE(_request, { params }) {
  try {
    const routeParams = await params;
    const result = await deleteVendorFolder(routeParams.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
