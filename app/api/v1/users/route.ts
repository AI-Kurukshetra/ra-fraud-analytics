import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseListLimit, parseStringQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 100, min: 1, max: 500 });
    const activeOnly = url.searchParams.get("activeOnly") !== "false";
    const role = parseStringQuery(url.searchParams.get("role"), 24);

    const admin = createAdminClient();
    let query = admin
      .from("memberships")
      .select("user_id, role, is_active")
      .eq("tenant_id", auth.tenantId)
      .limit(limit);
    if (activeOnly) {
      query = query.eq("is_active", true);
    }
    if (role) {
      query = query.eq("role", role);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "users_list",
      resourceType: "membership",
      payload: { limit, activeOnly, role: role ?? "all", count: data?.length ?? 0 },
    });

    return jsonOk({ users: data ?? [] }, { limit, activeOnly, role: role ?? "all" });
  }, { allowedRoles: ["owner", "admin"] });
}
