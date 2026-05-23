import { NextResponse } from "next/server";
import { updateActiveWorkspaceBranding } from "@/lib/organization";

export async function PATCH(request) {
  try {
    const formData = await request.formData();
    const logoFile = formData.get("logo");
    const result = await updateActiveWorkspaceBranding({
      logoFile: logoFile instanceof File ? logoFile : null,
      primary: formData.get("primary"),
      secondary: formData.get("secondary"),
      theme: formData.get("theme")
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
