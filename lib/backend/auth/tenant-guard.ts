import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/backend/db";

export type AuthContext = {
  user: User;
  tenantId: string;
  role: string;
};

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
  const tenantId = requestHeaders.get("x-tenant-id");
  if (!tenantId) {
    throw new Error("Missing x-tenant-id header");
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

  return {
    user,
    tenantId,
    role: membership.role,
  };
}

export function requireRole(auth: AuthContext, allowedRoles: string[]) {
  if (!allowedRoles.includes(auth.role)) {
    throw new Error("Insufficient role");
  }
}
