import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getActiveWorkspace } from "@/lib/organization";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    const workspace = await getActiveWorkspace();
    return (
      <AppShell eyebrow="Account" title="Settings">
        <SettingsClient workspace={workspace} />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell eyebrow="Account" title="Settings">
        <ErrorPanel error={error} />
      </AppShell>
    );
  }
}
