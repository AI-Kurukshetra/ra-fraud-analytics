import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const partnerType = url.searchParams.get("partnerType")?.trim();
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 500 });

    const admin = createAdminClient();
    let query = admin
      .from("partners")
      .select("id, name, partner_type, status, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (partnerType) {
      query = query.eq("partner_type", partnerType);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "partners_list",
      resourceType: "partner",
      payload: { partnerType: partnerType ?? "all", limit, count: data?.length ?? 0 },
    });

    return jsonOk({ partners: data ?? [] }, { limit, partnerType: partnerType ?? "all" });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
