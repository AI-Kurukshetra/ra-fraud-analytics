"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import { createClient } from "@/lib/supabase/client";
import type { TenantMembership, UserSession } from "@/lib/frontend/types";

const TENANT_STORAGE_KEY = "ra.activeTenant";
const DEFAULT_TENANT = "11111111-1111-1111-1111-111111111111";

type AuthContextValue = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
  session: UserSession | null;
  memberships: TenantMembership[];
  onboardingRequired: boolean;
  loading: boolean;
  bootstrapLoading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  bootstrapTenant: (params: { tenantName: string; tenantSlug?: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) {
    return err.message;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantState] = useState(DEFAULT_TENANT);
  const [session, setSession] = useState<UserSession | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessionForTenant = async (nextTenantId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSession(nextTenantId);
      setSession(data);
    } catch (err) {
      setSession(null);
      setError(getErrorMessage(err, "Unable to fetch session"));
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    await refreshSessionForTenant(tenantId);
  };

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setLoading(true);
      setError(null);
      try {
        const membershipData = await apiClient.getMemberships();
        if (!active) return;

        const list = membershipData.memberships ?? [];
        setMemberships(list);

        if (list.length === 0) {
          setOnboardingRequired(true);
          setSession(null);
          return;
        }

        setOnboardingRequired(false);
        const persisted = window.localStorage.getItem(TENANT_STORAGE_KEY);
        const fromStorage = persisted?.trim() ?? "";
        const selectedTenant =
          list.find((item) => item.tenantId === fromStorage)?.tenantId ?? list[0]?.tenantId ?? DEFAULT_TENANT;

        window.localStorage.setItem(TENANT_STORAGE_KEY, selectedTenant);
        setTenantState(selectedTenant);
        const data = await apiClient.getSession(selectedTenant);
        if (!active) return;
        setSession(data);
      } catch (err) {
        if (!active) return;
        setSession(null);
        setError(getErrorMessage(err, "Unable to load auth context"));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  const setTenantId = (nextTenantId: string) => {
    const normalized = nextTenantId.trim();
    if (!normalized) return;
    window.localStorage.setItem(TENANT_STORAGE_KEY, normalized);
    setTenantState(normalized);
    void refreshSessionForTenant(normalized);
  };

  const bootstrapTenant = async (params: { tenantName: string; tenantSlug?: string }) => {
    setBootstrapLoading(true);
    setError(null);
    try {
      const result = await apiClient.bootstrapTenant(params);
      const newMembership: TenantMembership = {
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
        tenantSlug: result.tenant.slug,
        role: result.membership.role,
        isActive: result.membership.isActive,
      };

      setMemberships((prev) => {
        if (prev.some((item) => item.tenantId === newMembership.tenantId)) {
          return prev;
        }
        return [newMembership, ...prev];
      });
      setOnboardingRequired(false);
      window.localStorage.setItem(TENANT_STORAGE_KEY, newMembership.tenantId);
      setTenantState(newMembership.tenantId);
      await refreshSessionForTenant(newMembership.tenantId);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to bootstrap tenant"));
      throw err;
    } finally {
      setBootstrapLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const value = useMemo<AuthContextValue>(
    () => ({
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
    }),
    [tenantId, session, memberships, onboardingRequired, loading, bootstrapLoading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }
  return value;
}
