import { NextResponse } from "next/server";
import { deleteInvoice, getInvoiceForReview, updateInvoiceReview } from "@/lib/invoices";

export async function GET(_request, { params }) {
  try {
    const routeParams = await params;
    const invoice = await getInvoiceForReview(routeParams.id);
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const routeParams = await params;
    const result = await updateInvoiceReview(routeParams.id, await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const routeParams = await params;
    await deleteInvoice(routeParams.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
