import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 100, min: 1, max: 500 });
    const status = url.searchParams.get("status")?.trim();

    const admin = createAdminClient();
    let query = admin
      .from("settlements")
      .select("id, partner_id, period_start, period_end, amount_due, amount_paid, status")
      .eq("tenant_id", auth.tenantId)
      .order("period_end", { ascending: false })
      .limit(limit);
    if (status) {
      query = query.eq("status", status);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "settlements_list",
      resourceType: "settlement",
      payload: { status: status ?? "all", limit, count: data?.length ?? 0 },
    });

    return jsonOk({ settlements: data ?? [] }, { status: status ?? "all", limit });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
