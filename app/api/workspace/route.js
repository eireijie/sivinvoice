import { NextResponse } from "next/server";
import { getActiveWorkspace, updateActiveWorkspace } from "@/lib/organization";

export async function GET() {
  try {
    const workspace = await getActiveWorkspace();
    return NextResponse.json({ workspace });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const result = await updateActiveWorkspace(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
