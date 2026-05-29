"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export function AuthStatus({ label = "" }) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    try {
      const supabase = getSupabaseBrowser();
      supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
    } catch {
      setEmail("");
    }
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!email) return null;
  return (
    <div className="auth-actions">
      <button className="button ghost icon-only" onClick={signOut} type="button" title="Sign out">
        <LogOut size={16} />
        {label ? <span>{label}</span> : null}
      </button>
    </div>
  );
}
