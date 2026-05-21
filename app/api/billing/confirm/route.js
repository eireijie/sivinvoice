import { NextResponse } from "next/server";
import { getActiveWorkspace, updateActiveWorkspacePlan, updateWorkspaceBillingByOrganizationId } from "@/lib/organization";
import { getPlan } from "@/lib/plans";

export async function POST(request) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Checkout session is missing." }, { status: 400 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payments are not configured yet." }, { status: 400 });
    }

    const workspace = await getActiveWorkspace();
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    });
    if (!response.ok) {
      throw new Error("Unable to verify checkout. Please refresh billing in a moment.");
    }

    const session = await response.json();
    const organizationId = session.metadata?.organization_id || session.client_reference_id;
    if (organizationId !== workspace.organization.id) {
      return NextResponse.json({ error: "This checkout does not belong to this business." }, { status: 403 });
    }
    if (!["paid", "no_payment_required"].includes(session.payment_status)) {
      return NextResponse.json({ error: "Payment is not complete yet." }, { status: 402 });
    }

    const plan = getPlan(session.metadata?.plan).id;
    await updateActiveWorkspacePlan({ plan, status: "active" });
    await updateWorkspaceBillingByOrganizationId(workspace.organization.id, {
      plan,
      status: "active",
      customerId: normalizeStripeId(session.customer),
      subscriptionId: normalizeStripeId(session.subscription)
    });

    return NextResponse.json({ plan, status: "active" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function normalizeStripeId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}
