import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const limitParam = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 200;

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

    return jsonOk({
      reconciliation: rows,
      summary: {
        total: rows.length,
        totalLeakageAmount: Number(totalLeakageAmount.toFixed(2)),
        totalMismatchAmount: Number(totalMismatchAmount.toFixed(2)),
        bySeverity,
      },
    });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
