import { AppShell } from "@/components/app-shell";
import { PhoneUploadQr } from "@/components/phone-upload-qr";
import { UploadForm } from "./upload-form";

export default function UploadPage() {
  return (
    <AppShell eyebrow="Intake" title="Upload Invoice">
      <PhoneUploadQr mode="invoice" />
      <UploadForm />
    </AppShell>
  );
}
