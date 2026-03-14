import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const reportType = url.searchParams.get("reportType");
    const status = url.searchParams.get("status");
    const limitParam = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

    const admin = createAdminClient();
    let query = admin
      .from("reports")
      .select("id, report_type, status, generated_at, payload")
      .eq("tenant_id", auth.tenantId)
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (reportType) {
      query = query.eq("report_type", reportType);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const reports = data ?? [];
    const byType = reports.reduce<Record<string, number>>((acc, item) => {
      acc[item.report_type] = (acc[item.report_type] ?? 0) + 1;
      return acc;
    }, {});

    return jsonOk({
      reports,
      summary: {
        total: reports.length,
        byType,
      },
    });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const reportType = typeof body?.reportType === "string" ? body.reportType : "operational";
    const distribution = Array.isArray(body?.distribution)
      ? body.distribution.filter((item: unknown) => typeof item === "string")
      : [];
    const period = {
      from: typeof body?.periodFrom === "string" ? body.periodFrom : null,
      to: typeof body?.periodTo === "string" ? body.periodTo : null,
    };

    const admin = createAdminClient();
    const [{ count: alertCount }, { count: caseCount }, { count: reconciliationCount }, { data: latestQuality }] =
      await Promise.all([
        admin.from("alerts").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("cases").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("reconciliation_results").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin
          .from("data_quality_runs")
          .select("quality_score, checked_count, failed_count, created_at")
          .eq("tenant_id", auth.tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const payload = {
      generatedBy: auth.user.id,
      generatedForTenant: auth.tenantId,
      generatedAt: new Date().toISOString(),
      period,
      distribution,
      summary: {
        alerts: alertCount ?? 0,
        cases: caseCount ?? 0,
        reconciliations: reconciliationCount ?? 0,
        latestQuality: latestQuality ?? null,
      },
    };

    const { data, error } = await admin
      .from("reports")
      .insert({
        tenant_id: auth.tenantId,
        report_type: reportType,
        status: "generated",
        payload,
      })
      .select("id, report_type, status, generated_at, payload")
      .single();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "report_generate",
      resourceType: "report",
      resourceId: data.id,
      payload: { reportType },
    });

    return jsonOk({ report: data }, undefined, 201);
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
