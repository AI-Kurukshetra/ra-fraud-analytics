import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const windowDaysParam = Number(url.searchParams.get("windowDays") ?? "14");
    const windowDays = Number.isFinite(windowDaysParam) ? Math.min(Math.max(windowDaysParam, 3), 90) : 14;
    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - windowDays + 1);
    const sinceIso = sinceDate.toISOString();

    const admin = createAdminClient();

    const [
      { count: cdrCount, error: cdrError },
      { count: alertCount, error: alertError },
      { count: caseCount, error: caseError },
      { data: alerts, error: alertsError },
      { data: cases, error: casesError },
      { data: reconciliations, error: reconciliationsError },
    ] =
      await Promise.all([
        admin.from("cdrs").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("alerts").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("cases").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin
          .from("alerts")
          .select("severity, created_at")
          .eq("tenant_id", auth.tenantId)
          .gte("created_at", sinceIso),
        admin
          .from("cases")
          .select("status, revenue_impact, created_at")
          .eq("tenant_id", auth.tenantId)
          .gte("created_at", sinceIso),
        admin
          .from("reconciliation_results")
          .select("leakage_amount, created_at")
          .eq("tenant_id", auth.tenantId)
          .gte("created_at", sinceIso),
      ]);

    const error =
      cdrError ??
      alertError ??
      caseError ??
      alertsError ??
      casesError ??
      reconciliationsError;
    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const alertsBySeverity = (alerts ?? []).reduce<Record<string, number>>((acc, item) => {
      acc[item.severity] = (acc[item.severity] ?? 0) + 1;
      return acc;
    }, {});

    const caseStatusBreakdown = (cases ?? []).reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    const recoveredAmount = (cases ?? [])
      .filter((item) => item.status === "resolved" || item.status === "closed")
      .reduce((sum, item) => sum + Number(item.revenue_impact ?? 0), 0);

    const dailyMap = new Map<string, { alerts: number; cases: number; reconciliations: number; leakage: number }>();
    for (let i = 0; i < windowDays; i += 1) {
      const day = new Date(sinceDate);
      day.setUTCDate(sinceDate.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      dailyMap.set(key, { alerts: 0, cases: 0, reconciliations: 0, leakage: 0 });
    }

    for (const item of alerts ?? []) {
      const key = new Date(item.created_at).toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.alerts += 1;
    }
    for (const item of cases ?? []) {
      const key = new Date(item.created_at).toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.cases += 1;
    }
    for (const item of reconciliations ?? []) {
      const key = new Date(item.created_at).toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) {
        row.reconciliations += 1;
        row.leakage += Number(item.leakage_amount ?? 0);
      }
    }

    return jsonOk({
      kpis: {
        cdrCount: cdrCount ?? 0,
        alertCount: alertCount ?? 0,
        caseCount: caseCount ?? 0,
      },
      recovery: {
        recoveredAmount: Number(recoveredAmount.toFixed(2)),
      },
      distributions: {
        alertsBySeverity,
        caseStatusBreakdown,
      },
      timeline: Array.from(dailyMap.entries()).map(([date, values]) => ({
        date,
        ...values,
        leakage: Number(values.leakage.toFixed(2)),
      })),
    });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
