import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();

    const [{ data: auditEvents, error: auditError }, { data: qualityEvents, error: qualityError }, { data: lineageEvents, error: lineageError }] =
      await Promise.all([
        admin
          .from("audit_logs")
          .select("id, actor_user_id, action, resource_type, resource_id, created_at")
          .eq("tenant_id", auth.tenantId)
          .order("created_at", { ascending: false })
          .limit(50),
        admin
          .from("data_quality_runs")
          .select("id, quality_score, checked_count, failed_count, created_at")
          .eq("tenant_id", auth.tenantId)
          .order("created_at", { ascending: false })
          .limit(50),
        admin
          .from("data_lineage_events")
          .select("id, source_system, dataset, operation, record_count, processed_at")
          .eq("tenant_id", auth.tenantId)
          .order("processed_at", { ascending: false })
          .limit(50),
      ]);

    const error = auditError ?? qualityError ?? lineageError;
    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({
      auditEvents: auditEvents ?? [],
      qualityEvents: qualityEvents ?? [],
      lineageEvents: lineageEvents ?? [],
    });
  });
}
