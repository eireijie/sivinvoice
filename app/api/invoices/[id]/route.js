import { NextResponse } from "next/server";
import { appendInvoiceOriginalFiles, deleteInvoice, getInvoiceForReview, processPendingInvoice, updateInvoiceReview } from "@/lib/invoices";

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

export async function PATCH(request, { params }) {
  try {
    const routeParams = await params;
    const formData = await request.formData();
    const files = formData.getAll("files");
    const result = await appendInvoiceOriginalFiles(routeParams.id, files);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const routeParams = await params;
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json().catch(() => ({}));
    }
    const result = await processPendingInvoice(routeParams.id, { force: Boolean(body.force) });
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
