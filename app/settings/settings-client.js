"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Image as ImageIcon, Lock, Moon, Palette, PanelLeft, PanelTop, ReceiptText, Save, ShieldCheck, Sun, User, WalletCards } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { getPlan, PLAN_ORDER, PLANS, planStatusLabel } from "@/lib/plans";

const sections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "billing", label: "Billing", icon: CreditCard }
];

const brandPresets = [
  { id: "siv", name: "SIV Emerald", primary: "#009B72", secondary: "#22C58F" },
  { id: "emerald", name: "Deep Emerald", primary: "#047857", secondary: "#34D399" },
  { id: "blue", name: "Midnight Blue", primary: "#2563EB", secondary: "#60A5FA" },
  { id: "burgundy", name: "Burgundy", primary: "#9F1239", secondary: "#FB7185" },
  { id: "charcoal", name: "Charcoal Gold", primary: "#334155", secondary: "#D97706" }
];

export function SettingsClient({ workspace }) {
  const [active, setActive] = useState("profile");
  const [businessName, setBusinessName] = useState(workspace.organization.name || "");
  const [firstName, setFirstName] = useState(workspace.user.firstName || "");
  const [lastName, setLastName] = useState(workspace.user.lastName || "");
  const [theme, setTheme] = useState("light");
  const [sidebarLayout, setSidebarLayout] = useState("vertical");
  const [brandTheme, setBrandTheme] = useState(workspace.organization.branding?.theme || "siv");
  const [brandPrimary, setBrandPrimary] = useState(workspace.organization.branding?.primary || "#009B72");
  const [brandSecondary, setBrandSecondary] = useState(workspace.organization.branding?.secondary || "#22C58F");
  const [brandLogoUrl, setBrandLogoUrl] = useState(workspace.organization.branding?.logoUrl || "");
  const [brandLogoFile, setBrandLogoFile] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [billingPlan, setBillingPlan] = useState(getPlan(workspace.billing?.plan).id);
  const [billingStatus, setBillingStatus] = useState(workspace.billing?.status || "active");
  const [portalBusy, setPortalBusy] = useState(false);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("siv-theme") || "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
    const savedLayout = window.localStorage.getItem("siv-sidebar-layout");
    if (savedLayout === "horizontal" || savedLayout === "vertical") setSidebarLayout(savedLayout);
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (sections.some((section) => section.id === tab)) setActive(tab);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const subscription = params.get("subscription");
    if (subscription === "canceled") {
      setMessage("Checkout was canceled. Your plan was not changed.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (subscription !== "success" || !sessionId) return;

    async function confirmCheckout() {
      setConfirmingCheckout(true);
      setMessage("Verifying payment...");
      setError("");
      const response = await fetch("/api/billing/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      const payload = await response.json();
      setConfirmingCheckout(false);
      if (!response.ok) {
        setMessage("");
        setError(payload.error || "Unable to verify payment.");
        return;
      }
      setBillingPlan(payload.plan || "free");
      setBillingStatus(payload.status || "active");
      setMessage(`${PLANS[payload.plan]?.name || "Plan"} is active.`);
      window.history.replaceState({}, "", window.location.pathname);
    }

    confirmCheckout();
  }, []);

  const displayName = useMemo(() => {
    return [firstName, lastName].filter(Boolean).join(" ") || workspace.user.fullName || "Account owner";
  }, [firstName, lastName, workspace.user.fullName]);
  const activePlan = PLANS[billingPlan] || PLANS.free;
  const storage = workspace.storage || {
    usedBytes: 0,
    limitBytes: activePlan.storageGb * 1024 * 1024 * 1024,
    percent: 0
  };
  const isPaidPlan = billingPlan !== "free";
  const isCanceling = billingStatus === "canceling";
  const billingRenewalLabel = workspace.billing?.currentPeriodEnd
    ? new Date(workspace.billing.currentPeriodEnd).toLocaleDateString()
    : isPaidPlan
      ? "Available after payment"
      : "No renewal";

  async function saveWorkspace(event) {
    event.preventDefault();
    setSaving("workspace");
    setMessage("");
    setError("");
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: businessName })
    });
    const payload = await response.json();
    setSaving("");
    if (!response.ok) {
      setError(payload.error || "Unable to update business details.");
      return;
    }
    window.dispatchEvent(new CustomEvent("siv:business-name", { detail: { name: businessName } }));
    setMessage("Business details saved.");
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving("profile");
    setMessage("");
    setError("");
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName
      }
    });
    setSaving("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Profile updated.");
  }

  async function savePassword(event) {
    event.preventDefault();
    setSaving("password");
    setMessage("");
    setError("");
    if (password.length < 8) {
      setSaving("");
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSaving("");
      setError("Passwords do not match.");
      return;
    }
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Password updated.");
  }

  function chooseTheme(nextTheme) {
    setTheme(nextTheme);
    window.localStorage.setItem("siv-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setMessage(`${nextTheme === "dark" ? "Dark" : "Light"} mode applied.`);
    setError("");
  }

  function chooseSidebarLayout(nextLayout) {
    setSidebarLayout(nextLayout);
    window.localStorage.setItem("siv-sidebar-layout", nextLayout);
    window.dispatchEvent(new CustomEvent("siv:sidebar-layout", { detail: { layout: nextLayout } }));
    setMessage(`${nextLayout === "horizontal" ? "Horizontal navigation" : "Vertical sidebar"} applied.`);
    setError("");
  }

  function chooseBrandPreset(preset) {
    setBrandTheme(preset.id);
    setBrandPrimary(preset.primary);
    setBrandSecondary(preset.secondary);
    setMessage(`${preset.name} selected. Save branding to apply it for this business.`);
    setError("");
  }

  function chooseLogo(file) {
    if (!file) return;
    setBrandLogoFile(file);
    setBrandLogoUrl(URL.createObjectURL(file));
    setMessage("Logo selected. Save branding to apply it.");
    setError("");
  }

  async function saveBranding(event) {
    event.preventDefault();
    setSaving("branding");
    setMessage("");
    setError("");
    const formData = new FormData();
    formData.append("theme", brandTheme);
    formData.append("primary", brandPrimary);
    formData.append("secondary", brandSecondary);
    if (brandLogoFile) formData.append("logo", brandLogoFile);

    const response = await fetch("/api/workspace/branding", {
      method: "PATCH",
      body: formData
    });
    const payload = await response.json();
    setSaving("");
    if (!response.ok) {
      setError(payload.error || "Unable to save branding.");
      return;
    }
    const nextBranding = payload.branding || {
      logoUrl: brandLogoUrl,
      primary: brandPrimary,
      secondary: brandSecondary,
      theme: brandTheme
    };
    setBrandLogoFile(null);
    setBrandLogoUrl(nextBranding.logoUrl || brandLogoUrl);
    setBrandPrimary(nextBranding.primary || brandPrimary);
    setBrandSecondary(nextBranding.secondary || brandSecondary);
    setBrandTheme(nextBranding.theme || brandTheme);
    window.dispatchEvent(new CustomEvent("siv:branding", { detail: { branding: nextBranding } }));
    setMessage("Business branding saved.");
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    setPortalBusy(false);
    if (!response.ok) {
      setError(payload.error || "Unable to open billing.");
      return;
    }
    if (payload.url && payload.url.startsWith("http")) {
      window.location.href = payload.url;
      return;
    }
    setMessage("Billing opened.");
  }

  async function startCheckout(planId) {
    setCheckoutBusy(planId);
    setMessage("");
    setError("");
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: planId })
    });
    const payload = await response.json();
    setCheckoutBusy("");
    if (!response.ok) {
      setError(payload.error || "Unable to update plan.");
      return;
    }
    if (payload.url?.startsWith("http")) {
      window.location.href = payload.url;
      return;
    }
    setBillingPlan(payload.plan || planId);
    setBillingStatus(payload.status || "active");
    if (payload.url?.startsWith("/")) {
      window.location.href = payload.url;
      return;
    }
    setPlanPickerOpen(false);
    setMessage(payload.message || "Plan updated.");
  }

  async function cancelPaidPlan() {
    const confirmed = window.confirm("Cancel renewal for this paid plan? You will keep paid access until the billing period ends.");
    if (!confirmed) return;
    setCancelBusy(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    setCancelBusy(false);
    if (!response.ok) {
      setError(payload.error || "Unable to cancel plan.");
      return;
    }
    setBillingPlan(payload.plan || "free");
    setBillingStatus(payload.status || "active");
    setMessage(payload.message || "Plan will cancel at the end of the billing period.");
  }

  return (
    <div className="settings-console">
      <aside className="settings-sidebar panel">
        <div className="settings-account">
          <div className="settings-avatar">{initials(displayName)}</div>
          <div>
            <strong>{displayName}</strong>
            <span>{workspace.user.email}</span>
          </div>
        </div>
        <nav>
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button className={active === section.id ? "active" : ""} key={section.id} onClick={() => setActive(section.id)} type="button">
                <Icon size={17} />
                {section.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="settings-main">
        <div className="settings-header">
          <div>
            <span className="badge"><CheckCircle2 size={14} /> Business active</span>
            <h2>{businessName.trim() || "SIV"}</h2>
            <p className="muted">Account, business, appearance, and billing preferences.</p>
          </div>
          <div className="settings-plan-pill">
            <WalletCards size={18} />
            <div>
              <strong>{activePlan.name}</strong>
              <span>{planStatusLabel(billingStatus)}</span>
            </div>
          </div>
        </div>

        {message ? <div className="panel settings-message">{message}</div> : null}
        {error ? <div className="panel settings-error">{error}</div> : null}

        {active === "profile" ? (
          <section className="settings-section panel">
            <div className="settings-section-title">
              <h2>Profile</h2>
              <p className="muted">Update the account owner and business details people see inside SIV.</p>
            </div>
            <div className="settings-two-col">
              <form className="settings-form-card grid" onSubmit={saveProfile}>
                <div>
                  <h3>Personal profile</h3>
                  <p className="muted">Used for account identity and notifications.</p>
                </div>
                <div className="grid cols-2">
                  <Field label="First name" value={firstName} onChange={setFirstName} />
                  <Field label="Last name" value={lastName} onChange={setLastName} />
                </div>
                <Field disabled label="Email address" value={workspace.user.email || ""} onChange={() => {}} />
                <div>
                  <button className="button" disabled={saving === "profile"} type="submit">
                    <Save size={16} />
                    {saving === "profile" ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </form>
              <form className="settings-form-card grid" onSubmit={saveWorkspace}>
                <div>
                  <h3>Business</h3>
                  <p className="muted">The optional business name shown in the app sidebar.</p>
                </div>
                <Field label="Business name (optional)" value={businessName} onChange={setBusinessName} />
                <div className="settings-detail-card">
                  <span className="muted">Role</span>
                  <strong>{workspace.membership.role}</strong>
                </div>
                <div>
                  <button className="button secondary" disabled={saving === "workspace"} type="submit">
                    <Save size={16} />
                    {saving === "workspace" ? "Saving..." : "Save business"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : null}

        {active === "security" ? (
          <section className="settings-section panel">
            <div className="settings-section-title">
              <h2>Security</h2>
              <p className="muted">Change the password for this signed-in account.</p>
            </div>
            <form className="settings-password-form" onSubmit={savePassword}>
              <Field label="New password" type="password" value={password} onChange={setPassword} />
              <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
              <div className="settings-detail-card">
                <ShieldCheck size={18} />
                <div>
                  <strong>Password rules</strong>
                  <span className="muted">Use at least 8 characters. Choose a password that is hard to guess and not used anywhere else.</span>
                </div>
              </div>
              <div>
                <button className="button" disabled={saving === "password"} type="submit">
                  <Lock size={16} />
                  {saving === "password" ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "appearance" ? (
          <section className="settings-section panel">
            <div className="settings-section-title">
              <h2>Appearance</h2>
              <p className="muted">Choose how SIV looks for this business and on this device.</p>
            </div>
            <form className="settings-control-group" onSubmit={saveBranding}>
              <div>
                <h3>Business branding</h3>
                <p className="muted">Upload your logo and choose the sidebar and top navigation gradient.</p>
              </div>
              <div className="branding-editor">
                <div className="branding-preview">
                  <div className="brand-preview-mark" style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})` }}>
                    {brandLogoUrl ? <img alt="" src={brandLogoUrl} /> : "SIV"}
                  </div>
                  <div>
                    <strong>{businessName.trim() || "Business name"}</strong>
                    <span>Sidebar preview</span>
                  </div>
                </div>

                <label className="logo-upload-card">
                  <ImageIcon size={20} />
                  <strong>{brandLogoFile ? brandLogoFile.name : brandLogoUrl ? "Change logo" : "Upload logo"}</strong>
                  <span>PNG, JPG, WEBP, or SVG. Max 2 MB.</span>
                  <input accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" type="file" onChange={(event) => chooseLogo(event.target.files?.[0])} />
                </label>

                <div className="brand-preset-grid">
                  {brandPresets.map((preset) => (
                    <button
                      className={brandTheme === preset.id ? "brand-preset active" : "brand-preset"}
                      key={preset.id}
                      onClick={() => chooseBrandPreset(preset)}
                      type="button"
                    >
                      <span style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }} />
                      <strong>{preset.name}</strong>
                    </button>
                  ))}
                </div>

                <div className="brand-color-grid">
                  <label className="field color-field">
                    <span>Navigation base</span>
                    <input type="color" value={safeColorValue(brandPrimary)} onChange={(event) => setBrandPrimary(event.target.value.toUpperCase())} />
                    <input className="input" value={brandPrimary} onChange={(event) => setBrandPrimary(event.target.value)} />
                  </label>
                  <label className="field color-field">
                    <span>Navigation glow</span>
                    <input type="color" value={safeColorValue(brandSecondary)} onChange={(event) => setBrandSecondary(event.target.value.toUpperCase())} />
                    <input className="input" value={brandSecondary} onChange={(event) => setBrandSecondary(event.target.value)} />
                  </label>
                </div>

                <div>
                  <button className="button" disabled={saving === "branding"} type="submit">
                    <Palette size={16} />
                    {saving === "branding" ? "Saving..." : "Save branding"}
                  </button>
                </div>
              </div>
            </form>
            <div className="settings-control-group">
              <div>
                <h3>Navigation layout</h3>
                <p className="muted">Use the classic sidebar or switch to a top navigation bar for wider workstations.</p>
              </div>
              <div className="theme-options layout-options">
                <button className={sidebarLayout === "vertical" ? "theme-card active" : "theme-card"} onClick={() => chooseSidebarLayout("vertical")} type="button">
                  <PanelLeft size={20} />
                  <strong>Vertical sidebar</strong>
                  <span>Best for office desktops and daily invoice review.</span>
                </button>
                <button className={sidebarLayout === "horizontal" ? "theme-card active" : "theme-card"} onClick={() => chooseSidebarLayout("horizontal")} type="button">
                  <PanelTop size={20} />
                  <strong>Horizontal navigation</strong>
                  <span>Moves the menu to the top so tables have more side room.</span>
                </button>
              </div>
            </div>
            <div className="settings-control-group">
              <div>
                <h3>Color mode</h3>
                <p className="muted">Set the viewing style for this browser.</p>
              </div>
              <div className="theme-options">
                <button className={theme === "light" ? "theme-card active" : "theme-card"} onClick={() => chooseTheme("light")} type="button">
                  <Sun size={20} />
                  <strong>Light mode</strong>
                  <span>Bright view for daytime review.</span>
                </button>
                <button className={theme === "dark" ? "theme-card active" : "theme-card"} onClick={() => chooseTheme("dark")} type="button">
                  <Moon size={20} />
                  <strong>Dark mode</strong>
                  <span>Lower glare for back-office use.</span>
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {active === "billing" ? (
          <section className="settings-section panel">
            <div className="settings-section-title">
              <h2>Billing</h2>
              <p className="muted">Review your plan, payment details, invoices, and cancellation options.</p>
            </div>

            <div className="billing-console">
              <section className="billing-row billing-plan-row">
                <div>
                  <span className="billing-label">Current plan</span>
                  <h3>{activePlan.name}</h3>
                  <p>{isCanceling ? `Access ends ${billingRenewalLabel}` : isPaidPlan ? `Renews ${billingRenewalLabel}` : "Start with Free, upgrade when you need more invoice volume."}</p>
                </div>
                <div className="billing-row-actions">
                  <span className="billing-price">{activePlan.price}<small>{activePlan.interval}</small></span>
                  <button className="button" disabled={Boolean(checkoutBusy) || confirmingCheckout} onClick={() => setPlanPickerOpen(true)} type="button">
                    <WalletCards size={16} />
                    {confirmingCheckout ? "Verifying..." : isPaidPlan ? "Change plan" : "Upgrade"}
                  </button>
                </div>
              </section>

              <section className="billing-block">
                <div className="billing-block-header">
                  <div>
                    <h3>Storage</h3>
                    <p>{formatBytes(storage.usedBytes)} used of {formatBytes(storage.limitBytes)} included on {activePlan.name}.</p>
                  </div>
                  <button className="button secondary" disabled={Boolean(checkoutBusy)} onClick={() => setPlanPickerOpen(true)} type="button">
                    <WalletCards size={16} />
                    Manage storage
                  </button>
                </div>
                <div className="storage-meter" aria-label={`${storage.percent || 0}% of storage used`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, storage.percent || 0))}%` }} />
                </div>
                <div className="billing-info-grid">
                  <div>
                    <span>Used</span>
                    <strong>{formatBytes(storage.usedBytes)}</strong>
                  </div>
                  <div>
                    <span>Available</span>
                    <strong>{formatBytes(Math.max(0, storage.limitBytes - storage.usedBytes))}</strong>
                  </div>
                </div>
                {!storage.trackingReady ? (
                  <div className="settings-error storage-warning">
                    Storage tracking needs one database update before usage can be verified.
                  </div>
                ) : null}
              </section>

              <section className="billing-block">
                <div className="billing-block-header">
                  <div>
                    <h3>Billing history</h3>
                    <p>View and download receipts from the secure billing portal.</p>
                  </div>
                  <button className="button secondary" disabled={portalBusy} onClick={() => openBillingPortal()} type="button">
                    <ReceiptText size={16} />
                    View all
                  </button>
                </div>
                <div className="billing-history-list">
                  <div>
                    <span>{isPaidPlan ? "Latest invoices" : "No paid invoices yet"}</span>
                    <strong>{isPaidPlan ? "Open billing portal to view receipts" : "Invoices will appear after your first paid plan."}</strong>
                  </div>
                </div>
              </section>

              <section className="billing-block">
                <div className="billing-block-header">
                  <div>
                    <h3>Billing information</h3>
                    <p>{workspace.user.email}</p>
                  </div>
                  <button className="button secondary" disabled={portalBusy} onClick={() => openBillingPortal()} type="button">
                    <CreditCard size={16} />
                    Edit
                  </button>
                </div>
                <div className="billing-info-grid">
                  <div>
                    <span>Status</span>
                    <strong>{planStatusLabel(billingStatus)}</strong>
                  </div>
                  <div>
                    <span>Next billing date</span>
                    <strong>{billingRenewalLabel}</strong>
                  </div>
                </div>
              </section>

              <section className="billing-block">
                <div className="billing-block-header">
                  <div>
                    <h3>Payment methods</h3>
                    <p>{isPaidPlan ? "Manage cards and payment details." : "Add a payment method when you upgrade."}</p>
                  </div>
                  <button className="button secondary" disabled={portalBusy} onClick={() => openBillingPortal()} type="button">
                    <CreditCard size={16} />
                    {isPaidPlan ? "Manage" : "Add new"}
                  </button>
                </div>
                <div className="billing-payment-list">
                  <div>
                    <span className="card-chip">Visa</span>
                    <strong>{isPaidPlan ? "Saved payment method" : "No payment method"}</strong>
                    <small>{isPaidPlan ? "Manage details in billing" : "Required only for paid plans"}</small>
                  </div>
                </div>
              </section>

              <section className="billing-block billing-cancel-block">
                <div>
                  <h3>{isPaidPlan ? "Cancel plan" : "Free plan"}</h3>
                  <p>{isCanceling ? `Your paid plan is scheduled to end on ${billingRenewalLabel}.` : isPaidPlan ? "Cancel renewal. You keep paid access until the current billing period ends." : "This business is already on Free. No subscription is active."}</p>
                </div>
                {isPaidPlan && !isCanceling ? (
                  <button className="button danger" disabled={cancelBusy} onClick={() => cancelPaidPlan()} type="button">
                    <AlertTriangle size={16} />
                    {cancelBusy ? "Canceling..." : "Cancel plan"}
                  </button>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}
      </main>

      {planPickerOpen ? (
        <div className="plan-modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose a billing plan">
          <div className="plan-modal panel">
            <div className="plan-modal-header">
              <div>
                <span className="badge"><WalletCards size={14} /> Billing plans</span>
                <h2>Choose the plan for this business</h2>
                <p className="muted">Free is useful for testing. Pro and Max open secure checkout and activate once payment is complete.</p>
              </div>
              <button className="button ghost" onClick={() => setPlanPickerOpen(false)} type="button">Close</button>
            </div>
            <div className="settings-plan-grid">
              {PLAN_ORDER.map((planId) => {
                const plan = PLANS[planId];
                const isCurrent = billingPlan === plan.id;
                const isFree = plan.id === "free";
                return (
                  <button
                    className={isCurrent ? "settings-plan-card active" : "settings-plan-card"}
                    disabled={isCurrent || isFree || Boolean(checkoutBusy)}
                    key={plan.id}
                    onClick={() => startCheckout(plan.id)}
                    type="button"
                  >
                    <span>{isCurrent ? "Current plan" : plan.name}</span>
                    <strong>{plan.price}<small>{plan.interval}</small></strong>
                    <p>{plan.tagline}</p>
                    <ul>
                      {plan.features.slice(0, 3).map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <em>{isFree ? "Included" : checkoutBusy === plan.id ? "Opening checkout..." : "Select plan"}</em>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ disabled = false, label, onChange, type = "text", value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function initials(name) {
  const parts = String(name || "SIV").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(value >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function safeColorValue(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#009B72";
}
