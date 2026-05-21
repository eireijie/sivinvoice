import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/error-panel";
import { getInvoiceForReview } from "@/lib/invoices";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({ params }) {
  const routeParams = await params;
  let invoice;
  try {
    invoice = await getInvoiceForReview(routeParams.id);
  } catch (error) {
    return (
      <AppShell eyebrow="Invoice Review" title="Manual Review">
        <ErrorPanel error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Invoice Review" title={`${invoice.invoice_number || "Invoice"} line items`}>
      <ReviewForm invoice={invoice} />
    </AppShell>
  );
}
