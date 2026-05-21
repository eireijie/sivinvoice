import { AppShell } from "@/components/app-shell";
import { UploadForm } from "./upload-form";

export default function UploadPage() {
  return (
    <AppShell eyebrow="Intake" title="Upload Invoice">
      <UploadForm />
    </AppShell>
  );
}
