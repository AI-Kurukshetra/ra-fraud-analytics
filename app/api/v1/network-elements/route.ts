import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("network_elements")
      .select("id, element_code, element_type, region, status, anomaly_score, revenue_impact")
      .eq("tenant_id", auth.tenantId)
      .order("anomaly_score", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ networkElements: data ?? [] });
  });
}
