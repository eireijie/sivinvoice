import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectivePlan, getPlan, isPaidPlan, storageLimitBytes } from "@/lib/plans";

export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public credentials are missing.");

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {}
    }
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required.");
  return data.user;
}

export async function getActiveOrganizationId() {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();

  const membership = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (membership.data?.organization_id) return membership.data.organization_id;

  const selectedPlan = getPlan(user.user_metadata?.selected_plan).id;
  const orgName = user.user_metadata?.full_name || user.email?.split("@")[0] || "My Business";
  const org = await admin
    .from("organizations")
    .insert({ name: orgName, owner_user_id: user.id })
    .select("id")
    .single();
  if (org.error) throw org.error;

  await updateOrganizationBillingBestEffort(admin, org.data.id, {
    plan: selectedPlan,
    status: isPaidPlan(selectedPlan) ? "checkout_pending" : "active"
  });

  const member = await admin
    .from("organization_members")
    .insert({ organization_id: org.data.id, user_id: user.id, role: "owner" });
  if (member.error) throw member.error;
  return org.data.id;
}

export async function getActiveWorkspace() {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();

  const [{ data: organization, error: organizationError }, { data: membership, error: membershipError }] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, owner_user_id, logo_path, brand_primary, brand_secondary, brand_theme, created_at")
      .eq("id", organizationId)
      .single(),
    admin
      .from("organization_members")
      .select("role, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()
  ]);
  if (organizationError) throw organizationError;
  if (membershipError) throw membershipError;
  const billing = await getOrganizationBillingBestEffort(admin, organizationId, user);
  const storage = await getOrganizationStorageUsageBestEffort(admin, organizationId, billing);
  const branding = await getOrganizationBrandingBestEffort(admin, organization);

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.user_metadata?.first_name || "",
      lastName: user.user_metadata?.last_name || "",
      fullName: user.user_metadata?.full_name || ""
    },
    organization: {
      ...organization,
      branding
    },
    membership,
    billing,
    storage
  };
}

export async function assertStorageAvailable(additionalBytes, { reservedBytes = 0, organizationId: providedOrganizationId = null } = {}) {
  const user = providedOrganizationId ? null : await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = providedOrganizationId || await getActiveOrganizationId();
  const billing = await getOrganizationBillingBestEffort(admin, organizationId, user);
  const storage = await getOrganizationStorageUsageBestEffort(admin, organizationId, billing);
  const nextUsed = storage.usedBytes + Number(additionalBytes || 0) + Number(reservedBytes || 0);
  if (nextUsed > storage.limitBytes) {
    const error = new Error(`This upload would exceed your ${storage.plan.name} storage limit of ${formatBytes(storage.limitBytes)}. Upgrade your plan or delete older invoices before uploading more files.`);
    error.status = 402;
    error.code = "storage_limit_exceeded";
    error.storage = { ...storage, nextUsedBytes: nextUsed };
    throw error;
  }
  return storage;
}

export async function getActiveWorkspacePlan() {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const billing = await getOrganizationBillingBestEffort(admin, organizationId, user);
  return getEffectivePlan(billing.plan, billing.status);
}

export async function updateActiveWorkspace({ name }) {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();

  const membership = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();
  if (membership.error) throw membership.error;
  if (!["owner", "admin"].includes(membership.data.role)) {
    throw new Error("Only business owners and admins can update business settings.");
  }

  const cleanName = String(name || "").trim();
  if (cleanName.length === 1) throw new Error("Business name must be blank or at least 2 characters.");

  const update = await admin
    .from("organizations")
    .update({ name: cleanName })
    .eq("id", organizationId);
  if (update.error) throw update.error;
  return { ok: true };
}

export async function updateActiveWorkspaceBranding({ logoFile, primary, secondary, theme }) {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();

  const membership = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();
  if (membership.error) throw membership.error;
  if (!["owner", "admin"].includes(membership.data.role)) {
    throw new Error("Only business owners and admins can update business branding.");
  }

  const update = {};
  const cleanPrimary = cleanHexColor(primary);
  const cleanSecondary = cleanHexColor(secondary);
  if (cleanPrimary) update.brand_primary = cleanPrimary;
  if (cleanSecondary) update.brand_secondary = cleanSecondary;
  if (theme !== undefined) update.brand_theme = cleanBrandTheme(theme);

  if (logoFile && logoFile.size > 0) {
    if (!String(logoFile.type || "").startsWith("image/")) {
      const error = new Error("Upload a PNG, JPG, WEBP, or SVG logo.");
      error.status = 400;
      throw error;
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      const error = new Error("Logo must be 2 MB or smaller.");
      error.status = 400;
      throw error;
    }

    const extension = logoExtension(logoFile);
    const logoPath = `branding/${organizationId}/logo-${Date.now()}${extension}`;
    const upload = await admin.storage
      .from(getStorageBucketForBranding())
      .upload(logoPath, Buffer.from(await logoFile.arrayBuffer()), {
        contentType: logoFile.type || "image/png",
        upsert: true
      });
    if (upload.error) throw upload.error;
    update.logo_path = logoPath;
  }

  const saved = await admin
    .from("organizations")
    .update(update)
    .eq("id", organizationId)
    .select("id, name, logo_path, brand_primary, brand_secondary, brand_theme")
    .single();
  if (saved.error) throw saved.error;

  return {
    ok: true,
    branding: await getOrganizationBrandingBestEffort(admin, saved.data)
  };
}

export async function updateActiveWorkspacePlan({ plan, status }) {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const cleanPlan = getPlan(plan).id;
  const cleanStatus = status || (isPaidPlan(cleanPlan) ? "checkout_pending" : "active");

  const authUpdate = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      selected_plan: cleanPlan,
      subscription_status: cleanStatus
    }
  });
  if (authUpdate.error) throw authUpdate.error;

  await updateOrganizationBillingBestEffort(admin, organizationId, {
    plan: cleanPlan,
    status: cleanStatus
  });

  return { plan: cleanPlan, status: cleanStatus };
}

export async function cancelActiveWorkspacePlan() {
  const workspace = await getActiveWorkspace();
  const admin = getSupabaseAdmin();
  const subscriptionId = workspace.billing?.subscriptionId;
  if (!subscriptionId) {
    await updateActiveWorkspacePlan({ plan: "free", status: "active" });
    await updateWorkspaceBillingByOrganizationId(workspace.organization.id, {
      plan: "free",
      status: "active",
      subscriptionId: null,
      currentPeriodEnd: null
    });
    return { plan: "free", status: "active" };
  }

  if (process.env.STRIPE_SECRET_KEY) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ cancel_at_period_end: "true" })
    });
    if (!response.ok) {
      throw new Error("Unable to cancel the active subscription.");
    }
    const subscription = await response.json();
    const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : workspace.billing?.currentPeriodEnd || null;

    await updateOrganizationBillingBestEffort(admin, workspace.organization.id, {
      plan: workspace.billing?.plan || "free",
      status: "canceling",
      subscriptionId,
      currentPeriodEnd
    });

    return { plan: workspace.billing?.plan || "free", status: "canceling", currentPeriodEnd };
  }

  await updateOrganizationBillingBestEffort(admin, workspace.organization.id, {
    plan: workspace.billing?.plan || "free",
    status: "canceling",
    subscriptionId,
    currentPeriodEnd: workspace.billing?.currentPeriodEnd || null
  });

  return { plan: workspace.billing?.plan || "free", status: "canceling", currentPeriodEnd: workspace.billing?.currentPeriodEnd || null };
}

export async function updateWorkspaceBillingByOrganizationId(organizationId, { plan, status, customerId, subscriptionId, currentPeriodEnd }) {
  const admin = getSupabaseAdmin();
  await updateOrganizationBillingBestEffort(admin, organizationId, {
    plan,
    status,
    customerId,
    subscriptionId,
    currentPeriodEnd
  });
  return { ok: true };
}

export async function setActiveWorkspaceBillingCustomer(customerId) {
  const admin = getSupabaseAdmin();
  const organizationId = await getActiveOrganizationId();
  const update = await admin
    .from("organizations")
    .update({ billing_customer_id: customerId })
    .eq("id", organizationId);
  if (update.error) throw update.error;
  return { ok: true };
}

async function getOrganizationBillingBestEffort(admin, organizationId, user) {
  const fallbackPlan = getPlan(user?.user_metadata?.selected_plan).id;
  const fallbackStatus = user?.user_metadata?.subscription_status || (isPaidPlan(fallbackPlan) ? "checkout_pending" : "active");

  const { data, error } = await admin
    .from("organizations")
    .select("subscription_plan, subscription_status, billing_customer_id, billing_subscription_id, billing_current_period_end")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    return {
      plan: fallbackPlan,
      status: fallbackStatus,
      customerId: null,
      subscriptionId: null,
      currentPeriodEnd: null
    };
  }

  return {
    plan: getPlan(data?.subscription_plan || fallbackPlan).id,
    status: data?.subscription_status || fallbackStatus,
    customerId: data?.billing_customer_id || null,
    subscriptionId: data?.billing_subscription_id || null,
    currentPeriodEnd: data?.billing_current_period_end || null
  };
}

async function getOrganizationBrandingBestEffort(admin, organization) {
  const primary = cleanHexColor(organization?.brand_primary) || "#009b72";
  const secondary = cleanHexColor(organization?.brand_secondary) || "#22c58f";
  let logoUrl = null;
  if (organization?.logo_path) {
    const signed = await admin.storage
      .from(getStorageBucketForBranding())
      .createSignedUrl(organization.logo_path, 60 * 60);
    logoUrl = signed.data?.signedUrl || null;
  }
  return {
    logoPath: organization?.logo_path || null,
    logoUrl,
    primary,
    secondary,
    theme: cleanBrandTheme(organization?.brand_theme)
  };
}

function cleanHexColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "";
}

function cleanBrandTheme(value) {
  return ["siv", "emerald", "blue", "burgundy", "charcoal"].includes(value) ? value : "siv";
}

function logoExtension(file) {
  const name = String(file?.name || "").toLowerCase();
  const match = name.match(/\.(png|jpe?g|webp|gif|svg)$/);
  if (match) return `.${match[1] === "jpeg" ? "jpg" : match[1]}`;
  if (file?.type === "image/svg+xml") return ".svg";
  if (file?.type === "image/webp") return ".webp";
  if (file?.type === "image/jpeg") return ".jpg";
  return ".png";
}

function getStorageBucketForBranding() {
  return process.env.SUPABASE_STORAGE_BUCKET || "invoices";
}

async function updateOrganizationBillingBestEffort(admin, organizationId, { plan, status, customerId, subscriptionId, currentPeriodEnd }) {
  const update = {
    subscription_plan: getPlan(plan).id,
    subscription_status: status || (isPaidPlan(plan) ? "checkout_pending" : "active")
  };
  if (customerId !== undefined) update.billing_customer_id = customerId;
  if (subscriptionId !== undefined) update.billing_subscription_id = subscriptionId;
  if (currentPeriodEnd !== undefined) update.billing_current_period_end = currentPeriodEnd;

  await admin
    .from("organizations")
    .update(update)
    .eq("id", organizationId);
}

async function getOrganizationStorageUsageBestEffort(admin, organizationId, billing) {
  const plan = getEffectivePlan(billing?.plan, billing?.status);
  const limitBytes = storageLimitBytes(plan.id);
  try {
    const [invoices, batches] = await Promise.all([
      admin
        .from("invoices")
        .select("original_file_size_bytes")
        .eq("organization_id", organizationId)
        .is("source_batch_id", null)
        .is("duplicate_of_invoice_id", null)
        .neq("parse_status", "duplicate"),
      admin
        .from("invoice_batches")
        .select("original_file_size_bytes")
        .eq("organization_id", organizationId)
        .neq("status", "duplicate")
    ]);
    if (invoices.error) throw invoices.error;
    if (batches.error) throw batches.error;
    const usedBytes = sumSizes(invoices.data) + sumSizes(batches.data);
    return {
      plan,
      usedBytes,
      limitBytes,
      usedGb: usedBytes / 1024 / 1024 / 1024,
      limitGb: plan.storageGb,
      percent: limitBytes ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0,
      trackingReady: true
    };
  } catch (error) {
    return {
      plan,
      usedBytes: 0,
      limitBytes,
      usedGb: 0,
      limitGb: plan.storageGb,
      percent: 0,
      trackingReady: false,
      detail: error.message
    };
  }
}

function sumSizes(rows = []) {
  return rows.reduce((total, row) => total + Number(row.original_file_size_bytes || 0), 0);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(value >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(value / 1024))} KB`;
}
