import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPlan } from "@/lib/plans";
import { updateWorkspaceBillingByOrganizationId } from "@/lib/organization";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") || "";

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const verified = verifyStripeSignature({
        payload: rawBody,
        signature,
        secret: process.env.STRIPE_WEBHOOK_SECRET
      });
      if (!verified) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data?.object || {});
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await handleSubscriptionChanged(event.data?.object || {});
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session) {
  const organizationId = session.metadata?.organization_id || session.client_reference_id;
  const plan = getPlan(session.metadata?.plan).id;
  if (!organizationId) return;
  if (!["paid", "no_payment_required"].includes(session.payment_status)) return;

  await updateWorkspaceBillingByOrganizationId(organizationId, {
    plan,
    status: "active",
    customerId: normalizeStripeId(session.customer),
    subscriptionId: normalizeStripeId(session.subscription)
  });
}

async function handleSubscriptionChanged(subscription) {
  const organizationId = subscription.metadata?.organization_id;
  if (!organizationId) return;
  const isDeleted = subscription.status === "canceled" || subscription.object === "subscription" && subscription.ended_at;

  await updateWorkspaceBillingByOrganizationId(organizationId, {
    plan: isDeleted ? "free" : getPlan(subscription.metadata?.plan).id,
    status: isDeleted ? "active" : mapSubscriptionStatus(subscription),
    customerId: normalizeStripeId(subscription.customer),
    subscriptionId: isDeleted ? null : normalizeStripeId(subscription.id),
    currentPeriodEnd: isDeleted ? null : subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
  });
}

function mapSubscriptionStatus(subscription) {
  const status = subscription.status;
  if (subscription.cancel_at_period_end && (status === "active" || status === "trialing")) return "canceling";
  if (status === "active" || status === "trialing") return status;
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "canceled") return "active";
  return status || "checkout_pending";
}

function normalizeStripeId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

function verifyStripeSignature({ payload, signature, secret }) {
  const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signatures = signature.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return signatures.some((candidate) => timingSafeEqual(candidate, expected));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
