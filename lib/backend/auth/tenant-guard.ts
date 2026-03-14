import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/backend/db";

export type AuthContext = {
  user: User;
  tenantId: string;
  role: "owner" | "admin" | "analyst" | "viewer";
};

const MEMBERSHIP_ROLES: AuthContext["role"][] = ["owner", "admin", "analyst", "viewer"];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function requireAuthContext(): Promise<AuthContext> {
  const serverClient = await createServerClient();
  const {
    data: { user },
    error,
  } = await serverClient.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  const requestHeaders = await headers();
  const tenantId = requestHeaders.get("x-tenant-id")?.trim();
  if (!tenantId) {
    throw new Error("Missing x-tenant-id header");
  }
  if (!isUuid(tenantId)) {
    throw new Error("Invalid x-tenant-id header");
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Forbidden for tenant");
  }
  if (!MEMBERSHIP_ROLES.includes(membership.role as AuthContext["role"])) {
    throw new Error("Invalid tenant role");
  }

  return {
    user,
    tenantId,
    role: membership.role as AuthContext["role"],
  };
}

export function requireRole(auth: AuthContext, allowedRoles: AuthContext["role"][]) {
  if (!allowedRoles.includes(auth.role)) {
    throw new Error("Insufficient role");
  }
}
