import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();

    const [{ count: cdrCount, error: cdrError }, { count: alertCount, error: alertError }, { count: caseCount, error: caseError }] =
      await Promise.all([
        admin.from("cdrs").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("alerts").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
        admin.from("cases").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
      ]);

    const error = cdrError ?? alertError ?? caseError;
    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({
      kpis: {
        cdrCount: cdrCount ?? 0,
        alertCount: alertCount ?? 0,
        caseCount: caseCount ?? 0,
      },
    });
  });
}
