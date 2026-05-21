import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getActiveWorkspace, setActiveWorkspaceBillingCustomer } from "@/lib/organization";

export async function POST(request) {
  try {
    await safeJsonBody(request);
    const workspace = await getActiveWorkspace();
    const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 400 });
    }

    const customerId = workspace.billing?.customerId || await createBillingCustomer(workspace);
    if (!customerId) {
      return NextResponse.json({ error: "Unable to open billing. Please try again." }, { status: 400 });
    }

    const body = new URLSearchParams({
      customer: customerId,
      return_url: `${origin}/settings`
    });
    if (process.env.STRIPE_PORTAL_CONFIGURATION_ID) {
      body.append("configuration", process.env.STRIPE_PORTAL_CONFIGURATION_ID);
    }

    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Billing portal is not ready yet. Check the customer portal settings." }, { status: 400 });
    }

    const session = await response.json();
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function createBillingCustomer(workspace) {
  const body = new URLSearchParams({
    email: workspace.user.email || "",
    name: workspace.user.fullName || workspace.user.email || workspace.organization.name,
    "metadata[organization_id]": workspace.organization.id,
    "metadata[workspace_name]": workspace.organization.name
  });

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) return null;
  const customer = await response.json();
  if (customer.id) {
    await setActiveWorkspaceBillingCustomer(customer.id);
  }
  return customer.id || null;
}

async function safeJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
