"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("Demo Telecom");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const signup = await apiClient.signup({
        email,
        password,
        tenantName,
        tenantSlug: tenantSlug || undefined,
      });

      const supabase = createClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.session) {
        setError(signInError?.message ?? "Account created but automatic sign-in failed");
        setLoading(false);
        return;
      }

      window.localStorage.setItem("ra.activeTenant", signup.tenant.id);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Unable to create account");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="brand-kicker">TeleGuard Pro</p>
        <h1 className="brand-title">Create your workspace</h1>
        <p className="brand-subtitle">Register a user account and bootstrap your first tenant workspace.</p>
        <p className="auth-footnote">
          Already registered? <Link href="/login">Sign in</Link>
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />

          <label htmlFor="tenant-name">Tenant name</label>
          <input
            id="tenant-name"
            type="text"
            className="input"
            value={tenantName}
            onChange={(event) => setTenantName(event.target.value)}
            required
          />

          <label htmlFor="tenant-slug">Tenant slug (optional)</label>
          <input
            id="tenant-slug"
            type="text"
            className="input"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            placeholder="demo-telecom"
          />

          {error ? <p className="banner error">{error}</p> : null}
          <button disabled={loading} className="button" type="submit">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
