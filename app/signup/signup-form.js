"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { getPlan, PLAN_ORDER, PLANS } from "@/lib/plans";

export function SignupForm({ initialPlan }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const suggestedPlan = getPlan(initialPlan).id;

  function signUp(event) {
    event.preventDefault();
    setShowPlans(true);
  }

  async function createAccount(plan) {
    setBusy(true);
    setMessage("");
    setShowPlans(false);
    try {
      const supabase = getSupabaseBrowser();
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            first_name: cleanFirstName,
            last_name: cleanLastName,
            full_name: `${cleanFirstName} ${cleanLastName}`.trim(),
            selected_plan: "free",
            intended_plan: plan,
            subscription_status: "active"
          }
        }
      });
      if (result.error) throw result.error;
      if (result.data.session) {
        await startPlan(plan);
      } else {
        setMessage(`Check your email to confirm the account, then log in. Your ${PLANS[plan].name} plan is selected.`);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startPlan(plan) {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to start plan.");
    window.location.href = payload.url || "/dashboard";
  }

  return (
    <>
      <form className="grid" onSubmit={signUp}>
        <div className="grid cols-2 auth-name-grid">
          <label className="field">
            <span>First name</span>
            <input className="input" required type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
          </label>
          <label className="field">
            <span>Last name</span>
            <input className="input" required type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {message ? <p className="muted">{message}</p> : null}
        <button className="button" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
          <ArrowRight size={16} />
        </button>
      </form>

      {showPlans ? (
        <div className="plan-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="signup-plan-title">
          <div className="plan-modal panel">
            <div className="plan-modal-header">
              <div>
                <span className="badge">Choose plan</span>
                <h2 id="signup-plan-title">Select how your workspace should start.</h2>
                <p className="muted">You can change plans later from Settings.</p>
              </div>
              <button className="button ghost icon-only" type="button" onClick={() => setShowPlans(false)} aria-label="Close plan selection">x</button>
            </div>
            <div className="signup-plan-grid">
              {PLAN_ORDER.map((planId) => {
                const plan = PLANS[planId];
                return (
                  <button className={planId === suggestedPlan || (!initialPlan && planId === "pro") ? "signup-plan-card featured" : "signup-plan-card"} disabled={busy} key={plan.id} onClick={() => createAccount(plan.id)} type="button">
                    <span>{plan.name}</span>
                    <strong>{plan.price}<small>{plan.interval}</small></strong>
                    <p>{plan.tagline}</p>
                    <ul>
                      {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <em>{plan.id === "free" ? "Start free" : "Continue"}</em>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
