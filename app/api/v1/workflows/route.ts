import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workflows")
      .select("id, workflow_name, workflow_type, is_active, updated_at")
      .eq("tenant_id", auth.tenantId)
      .order("updated_at", { ascending: false });

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ workflows: data ?? [] });
  });
}
