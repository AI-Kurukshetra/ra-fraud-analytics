import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseDateQuery, parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 50, min: 1, max: 500 });
    const sinceRaw = url.searchParams.get("since");
    const since = parseDateQuery(sinceRaw);
    if (sinceRaw && !since) {
      return jsonError("VALIDATION_ERROR", "since must be a valid date", 400);
    }

    const admin = createAdminClient();

    let auditQuery = admin
      .from("audit_logs")
      .select("id, actor_user_id, action, resource_type, resource_id, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    let qualityQuery = admin
      .from("data_quality_runs")
      .select("id, quality_score, checked_count, failed_count, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    let lineageQuery = admin
      .from("data_lineage_events")
      .select("id, source_system, dataset, operation, record_count, processed_at")
      .eq("tenant_id", auth.tenantId)
      .order("processed_at", { ascending: false })
      .limit(limit);

    if (since) {
      auditQuery = auditQuery.gte("created_at", since);
      qualityQuery = qualityQuery.gte("created_at", since);
      lineageQuery = lineageQuery.gte("processed_at", since);
    }

    const [{ data: auditEvents, error: auditError }, { data: qualityEvents, error: qualityError }, { data: lineageEvents, error: lineageError }, { data: reportEvents, error: reportError }] =
      await Promise.all([
        auditQuery,
        qualityQuery,
        lineageQuery,
        admin
          .from("reports")
          .select("id, report_type, status, generated_at")
          .eq("tenant_id", auth.tenantId)
          .order("generated_at", { ascending: false })
          .limit(limit),
      ]);

    const error = auditError ?? qualityError ?? lineageError ?? reportError;
    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const quality = qualityEvents ?? [];
    const averageQualityScore =
      quality.length === 0
        ? null
        : Number((quality.reduce((sum, item) => sum + Number(item.quality_score), 0) / quality.length).toFixed(2));

    const response = {
      auditEvents: auditEvents ?? [],
      qualityEvents: qualityEvents ?? [],
      lineageEvents: lineageEvents ?? [],
      reportEvents: reportEvents ?? [],
      summary: {
        auditCount: (auditEvents ?? []).length,
        lineageCount: (lineageEvents ?? []).length,
        qualityRunCount: quality.length,
        averageQualityScore,
        latestReportAt: reportEvents?.[0]?.generated_at ?? null,
      },
    };

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "compliance_view",
      resourceType: "compliance",
      payload: { limit, since: since ?? null, auditCount: response.summary.auditCount },
    });

    return jsonOk(response);
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
