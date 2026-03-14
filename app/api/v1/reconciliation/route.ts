import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reconciliation_results")
      .select("id, record_key, mismatch_amount, leakage_amount, severity, status, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ reconciliation: data ?? [] });
  });
}
