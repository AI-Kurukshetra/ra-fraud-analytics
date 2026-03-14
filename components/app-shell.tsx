"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/frontend/api-client";
import { AuthProvider, useAuthContext } from "@/components/auth-context";

type NavItem = {
  href: string;
  label: string;
  roles: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboards", roles: ["owner", "admin", "analyst", "viewer"] },
  { href: "/alerts", label: "Alarm Management", roles: ["owner", "admin", "analyst"] },
  { href: "/cases", label: "Case Management", roles: ["owner", "admin", "analyst"] },
  { href: "/revenue-assurance", label: "RA Analysis", roles: ["owner", "admin", "analyst"] },
  { href: "/reports", label: "Reports & Compliance", roles: ["owner", "admin", "analyst", "viewer"] },
  { href: "/integrations", label: "Integrations", roles: ["owner", "admin"] },
  { href: "/access", label: "Access Control", roles: ["owner", "admin"] },
];

function ShellContent({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const pathname = usePathname();
  const {
    tenantId,
    setTenantId,
    session,
    memberships,
    onboardingRequired,
    loading,
    bootstrapLoading,
    error,
    refreshSession,
    bootstrapTenant,
    signOut,
  } = useAuthContext();

  const [draftTenant, setDraftTenant] = useState(tenantId);
  const [tenantName, setTenantName] = useState("Demo Telecom");
  const [tenantSlug, setTenantSlug] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  useEffect(() => {
    setDraftTenant(tenantId);
  }, [tenantId]);

  const role = session?.role ?? "unknown";

  const visibleNav = useMemo(() => {
    return NAV_ITEMS.filter((item) => role === "unknown" || item.roles.includes(role));
  }, [role]);

  const onBootstrap = async (event: FormEvent) => {
    event.preventDefault();
    setOnboardingError(null);
    try {
      await bootstrapTenant({ tenantName, tenantSlug: tenantSlug || undefined });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setOnboardingError(err.message);
        return;
      }
      setOnboardingError("Unable to create tenant");
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">TeleGuard Pro</p>
          <h1 className="brand-title">Fraud & Revenue Assurance</h1>
          <p className="brand-subtitle">Operational monitoring for telecom risk controls.</p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? "active" : ""}`.trim()}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button onClick={() => void signOut()} className="button button-secondary" type="button">
          Sign out
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="muted">Signed in as {userEmail ?? "Unknown user"}</p>
            <p className="muted">
              Active role: <strong>{role}</strong>
            </p>
          </div>

          <form
            className="tenant-form"
            onSubmit={(event) => {
              event.preventDefault();
              setTenantId(draftTenant);
            }}
          >
            <label className="muted" htmlFor="tenant-id">
              Tenant
            </label>
            <input
              id="tenant-id"
              value={draftTenant}
              onChange={(event) => setDraftTenant(event.target.value)}
              className="input"
              autoComplete="off"
              list="tenant-options"
            />
            <datalist id="tenant-options">
              {memberships.map((membership) => (
                <option key={membership.tenantId} value={membership.tenantId}>
                  {membership.tenantName}
                </option>
              ))}
            </datalist>
            <button className="button" type="submit">
              Switch
            </button>
          </form>
        </header>

        {loading ? <p className="banner">Refreshing tenant context...</p> : null}
        {error ? (
          <div className="banner error">
            <p>Tenant session error: {error}</p>
            <div className="actions-row">
              <button className="button button-secondary" type="button" onClick={() => void refreshSession()}>
                Retry session
              </button>
            </div>
          </div>
        ) : null}

        {onboardingRequired ? (
          <section className="panel onboarding-panel">
            <h2>No tenant membership found</h2>
            <p className="muted">Create your first tenant workspace to continue into the dashboard.</p>
            <form onSubmit={onBootstrap} className="auth-form">
              <label htmlFor="tenant-name">Tenant name</label>
              <input
                id="tenant-name"
                className="input"
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
                required
              />

              <label htmlFor="tenant-slug">Tenant slug (optional)</label>
              <input
                id="tenant-slug"
                className="input"
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                placeholder="demo-telecom"
              />

              {onboardingError ? <p className="banner error">{onboardingError}</p> : null}

              <button className="button" type="submit" disabled={bootstrapLoading}>
                {bootstrapLoading ? "Creating tenant..." : "Create tenant workspace"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="page-content">{children}</section>
      </main>
    </div>
  );
}

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  return (
    <AuthProvider>
      <ShellContent userEmail={userEmail}>{children}</ShellContent>
    </AuthProvider>
  );
}
