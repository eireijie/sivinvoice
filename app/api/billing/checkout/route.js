import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getActiveWorkspace, updateActiveWorkspacePlan } from "@/lib/organization";
import { getPlan, isPaidPlan } from "@/lib/plans";

export async function POST(request) {
  try {
    const { plan } = await request.json();
    const selectedPlan = getPlan(plan);
    const workspace = await getActiveWorkspace();

    if (!isPaidPlan(selectedPlan.id)) {
      await updateActiveWorkspacePlan({ plan: selectedPlan.id, status: "active" });
      return NextResponse.json({ url: "/dashboard", plan: selectedPlan.id, status: "active" });
    }

    const priceId = getPriceId(selectedPlan.id);
    if (!process.env.STRIPE_SECRET_KEY || !priceId) {
      return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 400 });
    }

    const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: workspace.organization.id,
      success_url: `${origin}/settings?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?subscription=canceled`,
      "metadata[organization_id]": workspace.organization.id,
      "metadata[plan]": selectedPlan.id,
      "subscription_data[metadata][organization_id]": workspace.organization.id,
      "subscription_data[metadata][plan]": selectedPlan.id
    });
    if (workspace.billing?.customerId) {
      body.append("customer", workspace.billing.customerId);
    } else {
      body.append("customer_email", workspace.user.email || "");
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error("Unable to open checkout. Please try again.");
    }

    const session = await response.json();
    return NextResponse.json({
      url: session.url,
      plan: workspace.billing?.plan || "free",
      pendingPlan: selectedPlan.id,
      status: workspace.billing?.status || "active"
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getPriceId(plan) {
  const key = String(plan || "").toUpperCase();
  return process.env[`STRIPE_${key}_PRICE_ID`] || process.env[`BILLING_${key}_PRICE_ID`] || "";
}
