"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { getAppUrl } from "@/lib/siteUrl";

export function LoginForm({ nextPath }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowser();
      const result = password
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getAppUrl(nextPath) } });
      if (result.error) throw result.error;
      if (password) {
        const safe = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
        window.location.href = safe;
      }
      else setMessage("Check your email for a sign-in link.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid" onSubmit={signIn}>
      <label className="field">
        <span>Email</span>
        <input className="input" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave blank for magic link" autoComplete="current-password" />
      </label>
      {message ? <p className="muted">{message}</p> : null}
      <button className="button" disabled={busy}>
        <LogIn size={16} />
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
