import { NextResponse } from "next/server";
import { getBatch } from "@/lib/batches";

export async function GET(_request, { params }) {
  try {
    const routeParams = await params;
    const batch = await getBatch(routeParams.id);
    return NextResponse.json({ batch });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
