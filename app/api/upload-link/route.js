import { NextResponse } from "next/server";
import { createUploadToken } from "@/lib/uploadTokens";
import { getActiveOrganizationId, getActiveWorkspacePlan } from "@/lib/organization";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "batch" ? "batch" : "invoice";
    const organizationId = await getActiveOrganizationId();
    const plan = await getActiveWorkspacePlan();
    if (mode === "batch" && plan.id === "free") {
      return NextResponse.json({ error: "Batch phone upload is available on Pro and Max." }, { status: 402 });
    }
    const token = createUploadToken({ organizationId, mode });
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.json({
      url: `${origin.replace(/\/+$/, "")}/mobile-upload?mode=${mode}&token=${encodeURIComponent(token)}`
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
