import { MobileUploadClient } from "./mobile-upload-client";

export default async function MobileUploadPage({ searchParams }) {
  const params = await searchParams;
  return <MobileUploadClient mode={params?.mode === "batch" ? "batch" : "invoice"} token={params?.token || ""} />;
}
