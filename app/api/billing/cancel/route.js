import { NextResponse } from "next/server";
import { cancelActiveWorkspacePlan } from "@/lib/organization";

export async function POST() {
  try {
    const result = await cancelActiveWorkspacePlan();
    return NextResponse.json({
      ...result,
      message: result.status === "canceling"
        ? "Plan will cancel at the end of the billing period."
        : "Plan canceled. This workspace is now on Free."
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
