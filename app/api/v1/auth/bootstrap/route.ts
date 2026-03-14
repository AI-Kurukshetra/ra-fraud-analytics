import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";
import { requireUser, sanitizeTenantSlug } from "@/lib/backend/auth/user-guard";

type BootstrapBody = {
  tenantName?: unknown;
  tenantSlug?: unknown;
};

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as BootstrapBody | null;
    const rawTenantName = typeof body?.tenantName === "string" ? body.tenantName.trim() : "";
    const rawTenantSlug = typeof body?.tenantSlug === "string" ? body.tenantSlug.trim() : "";

    if (!rawTenantName) {
      return jsonError("VALIDATION_ERROR", "tenantName is required", 400);
    }

    if (rawTenantName.length < 3 || rawTenantName.length > 80) {
      return jsonError("VALIDATION_ERROR", "tenantName must be between 3 and 80 characters", 400);
    }

    const admin = createAdminClient();
    const { data: existingMembership, error: existingError } = await admin
      .from("memberships")
      .select("tenant_id, role, tenants(name, slug)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return jsonError("DB_ERROR", existingError.message, 500);
    }

    if (existingMembership) {
      const tenant = Array.isArray(existingMembership.tenants)
        ? existingMembership.tenants[0]
        : existingMembership.tenants;

      return jsonOk({
        created: false,
        tenant: {
          id: existingMembership.tenant_id,
          name: tenant?.name ?? rawTenantName,
          slug: tenant?.slug ?? sanitizeTenantSlug(rawTenantName),
        },
        membership: {
          role: existingMembership.role,
          isActive: true,
        },
      });
    }

    const baseSlug = sanitizeTenantSlug(rawTenantSlug || rawTenantName);
    if (!baseSlug) {
      return jsonError("VALIDATION_ERROR", "tenantSlug is invalid", 400);
    }

    let tenant:
      | {
          id: string;
          name: string;
          slug: string;
        }
      | null = null;

    let insertErrorMessage: string | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: rawTenantName,
          slug,
          status: "active",
        })
        .select("id, name, slug")
        .single();

      if (!error && data) {
        tenant = data;
        break;
      }

      insertErrorMessage = error?.message ?? "Unable to create tenant";
      if (error?.code !== "23505") {
        break;
      }
    }

    if (!tenant) {
      return jsonError("DB_ERROR", insertErrorMessage ?? "Unable to create tenant", 500);
    }

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: "owner",
        is_active: true,
      })
      .select("tenant_id, role")
      .single();

    if (membershipError || !membership) {
      return jsonError("DB_ERROR", membershipError?.message ?? "Unable to create membership", 500);
    }

    return jsonOk({
      created: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      membership: {
        role: membership.role,
        isActive: true,
      },
    }, undefined, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auth error";
    if (message === "Unauthorized") {
      return jsonError("UNAUTHORIZED", message, 401);
    }
    return jsonError("AUTH_ERROR", message, 500);
  }
}
