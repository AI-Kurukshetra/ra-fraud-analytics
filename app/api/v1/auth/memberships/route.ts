import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";
import { requireUser } from "@/lib/backend/auth/user-guard";

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("memberships")
      .select("tenant_id, role, is_active, tenants(name, slug)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const memberships =
      data?.map((item) => ({
        // Supabase relation typing is not generated in this repo, so use a safe runtime shape here.
        ...(() => {
          const tenantRaw = (item as { tenants?: unknown }).tenants;
          const tenant = Array.isArray(tenantRaw)
            ? (tenantRaw[0] as { name?: string; slug?: string } | undefined)
            : (tenantRaw as { name?: string; slug?: string } | null | undefined);
          return {
            tenantName: tenant?.name ?? "Unknown Tenant",
            tenantSlug: tenant?.slug ?? "",
          };
        })(),
        tenantId: item.tenant_id,
        role: item.role,
        isActive: item.is_active,
      })) ?? [];

    return jsonOk({
      user: {
        id: user.id,
        email: user.email,
      },
      memberships,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auth error";
    if (message === "Unauthorized") {
      return jsonError("UNAUTHORIZED", message, 401);
    }
    return jsonError("AUTH_ERROR", message, 500);
  }
}
