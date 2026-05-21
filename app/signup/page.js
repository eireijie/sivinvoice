import Link from "next/link";
import { SignupForm } from "./signup-form";

export default async function SignupPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <Link className="auth-brand" href="/">
          <div className="brand-mark">SIV</div>
          <span>SIV</span>
        </Link>
        <h1>Create account</h1>
        <p className="muted">Start a workspace for storing invoices safely and finding records fast.</p>
        <SignupForm initialPlan={params?.plan} />
        <div className="auth-links">
          <Link className="text-link" href="/">Back to home</Link>
          <span>Already have an account? <Link className="text-link" href="/login">Log in</Link></span>
        </div>
      </section>
    </main>
  );
}
