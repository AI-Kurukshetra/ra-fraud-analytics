import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseDateQuery, parseListLimit, parseStringQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 100, min: 1, max: 500 });
    const status = parseStringQuery(url.searchParams.get("status"), 24);
    const periodFromRaw = url.searchParams.get("periodFrom");
    const periodToRaw = url.searchParams.get("periodTo");
    const periodFrom = parseDateQuery(periodFromRaw);
    const periodTo = parseDateQuery(periodToRaw);
    if (periodFromRaw && !periodFrom) {
      return jsonError("VALIDATION_ERROR", "periodFrom must be a valid date", 400);
    }
    if (periodToRaw && !periodTo) {
      return jsonError("VALIDATION_ERROR", "periodTo must be a valid date", 400);
    }

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
    if (periodFrom) {
      query = query.gte("period_start", periodFrom.slice(0, 10));
    }
    if (periodTo) {
      query = query.lte("period_end", periodTo.slice(0, 10));
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
      payload: {
        status: status ?? "all",
        periodFrom: periodFrom ?? null,
        periodTo: periodTo ?? null,
        limit,
        count: data?.length ?? 0,
      },
    });

    return jsonOk(
      { settlements: data ?? [] },
      { status: status ?? "all", periodFrom: periodFrom ?? null, periodTo: periodTo ?? null, limit },
    );
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
