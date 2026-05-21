export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    interval: "/mo",
    storageGb: 5,
    uploadMode: "Single invoice upload",
    tagline: "For stores starting their invoice vault.",
    features: [
      "5 GB secure invoice storage",
      "Single-invoice uploads",
      "Search by invoice, vendor, product, SKU, or UPC",
      "Manual review and correction",
      "Duplicate detection"
    ]
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$10.99",
    interval: "/mo",
    storageGb: 50,
    uploadMode: "Single and batch upload",
    tagline: "For active stores saving invoices every week.",
    features: [
      "50 GB secure invoice storage",
      "Batch upload for scanned invoice packets",
      "Multi-page processing up to 30 pages",
      "Vendor and invoice history",
      "Faster processing queue"
    ]
  },
  max: {
    id: "max",
    name: "Max",
    price: "$25.99",
    interval: "/mo",
    storageGb: 250,
    uploadMode: "High-volume upload",
    tagline: "For businesses with years of invoice records.",
    features: [
      "250 GB secure invoice storage",
      "High-volume batch upload",
      "Multiple business locations",
      "Team access controls",
      "Priority support and recovery help"
    ]
  }
};

export const PLAN_ORDER = ["free", "pro", "max"];

export function getPlan(plan) {
  return PLANS[String(plan || "").toLowerCase()] || PLANS.free;
}

export function isPaidPlan(plan) {
  return getPlan(plan).id !== "free";
}

export function isPlanActive(status) {
  return ["active", "trialing", "canceling"].includes(status || "active");
}

export function getEffectivePlan(plan, status) {
  const selectedPlan = getPlan(plan);
  if (selectedPlan.id === "free") return selectedPlan;
  return isPlanActive(status) ? selectedPlan : PLANS.free;
}

export function formatStorageLimit(plan) {
  return `${getPlan(plan).storageGb} GB`;
}

export function storageLimitBytes(plan) {
  return getPlan(plan).storageGb * 1024 * 1024 * 1024;
}

export function planStatusLabel(status) {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "checkout_pending") return "Payment setup needed";
  if (status === "canceling") return "Cancels at period end";
  if (status === "past_due") return "Payment needs attention";
  if (status === "canceled") return "Canceled";
  return "Active";
}
