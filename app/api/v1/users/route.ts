import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("memberships")
      .select("user_id, role, is_active")
      .eq("tenant_id", auth.tenantId);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ users: data ?? [] });
  });
}
