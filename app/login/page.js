import { LoginForm } from "./login-form";
import Link from "next/link";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <Link className="auth-brand" href="/">
          <div className="brand-mark">SIV</div>
          <span>SIV</span>
        </Link>
        <h1>Sign in</h1>
        <p className="muted">Access your searchable invoice vault.</p>
        <LoginForm nextPath={params?.next || "/dashboard"} />
        <div className="auth-links">
          <Link className="text-link" href="/">Back to home</Link>
          <span>Need an account? <Link className="text-link" href="/signup">Create one</Link></span>
        </div>
      </section>
    </main>
  );
}
