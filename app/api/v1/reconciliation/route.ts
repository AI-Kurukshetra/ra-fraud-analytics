import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseDateQuery, parseListLimit, parseStringQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const status = parseStringQuery(url.searchParams.get("status"), 24);
    const severity = parseStringQuery(url.searchParams.get("severity"), 24);
    const dateFromRaw = url.searchParams.get("dateFrom");
    const dateToRaw = url.searchParams.get("dateTo");
    const dateFrom = parseDateQuery(dateFromRaw);
    const dateTo = parseDateQuery(dateToRaw);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 1000 });
    if (dateFromRaw && !dateFrom) {
      return jsonError("VALIDATION_ERROR", "dateFrom must be a valid date", 400);
    }
    if (dateToRaw && !dateTo) {
      return jsonError("VALIDATION_ERROR", "dateTo must be a valid date", 400);
    }

    const admin = createAdminClient();
    let query = admin
      .from("reconciliation_results")
      .select("id, record_key, mismatch_amount, leakage_amount, severity, status, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const rows = data ?? [];
    const totalLeakageAmount = rows.reduce((sum, item) => sum + Number(item.leakage_amount ?? 0), 0);
    const totalMismatchAmount = rows.reduce((sum, item) => sum + Number(item.mismatch_amount ?? 0), 0);
    const bySeverity = rows.reduce<Record<string, number>>((acc, item) => {
      acc[item.severity] = (acc[item.severity] ?? 0) + 1;
      return acc;
    }, {});

    const response = {
      reconciliation: rows,
      summary: {
        total: rows.length,
        totalLeakageAmount: Number(totalLeakageAmount.toFixed(2)),
        totalMismatchAmount: Number(totalMismatchAmount.toFixed(2)),
        bySeverity,
      },
    };

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "reconciliation_view",
      resourceType: "reconciliation_results",
      payload: {
        limit,
        status: status ?? "all",
        severity: severity ?? "all",
        count: response.summary.total,
      },
    });

    return jsonOk(response);
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
