import { AppShell } from "@/components/app-shell";
import { SearchClient } from "./search-client";

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  return (
    <AppShell eyebrow="Lookup" title="Search">
      <SearchClient initialQuery={params?.q || ""} />
    </AppShell>
  );
}
