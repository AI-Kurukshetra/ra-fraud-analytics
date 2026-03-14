import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 500 });
    const minAnomaly = Number(url.searchParams.get("minAnomaly") ?? 0);

    const admin = createAdminClient();
    let query = admin
      .from("network_elements")
      .select("id, element_code, element_type, region, status, anomaly_score, revenue_impact")
      .eq("tenant_id", auth.tenantId)
      .order("anomaly_score", { ascending: false })
      .limit(limit);
    if (!Number.isNaN(minAnomaly) && minAnomaly > 0) {
      query = query.gte("anomaly_score", minAnomaly);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "network_elements_list",
      resourceType: "network_element",
      payload: { limit, minAnomaly, count: data?.length ?? 0 },
    });

    return jsonOk({ networkElements: data ?? [] }, { limit, minAnomaly });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
