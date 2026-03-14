import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseBooleanQuery, parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const activeOnly = parseBooleanQuery(url.searchParams.get("activeOnly"));
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 500 });

    const admin = createAdminClient();
    let query = admin
      .from("rules")
      .select("id, rule_name, rule_type, is_active, threshold, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (activeOnly) {
      query = query.eq("is_active", true);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "rules_list",
      resourceType: "rule",
      payload: { activeOnly, limit, count: data?.length ?? 0 },
    });

    return jsonOk({ rules: data ?? [] }, { activeOnly, limit });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
