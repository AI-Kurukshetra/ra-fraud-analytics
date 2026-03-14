import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("settlements")
      .select("id, partner_id, period_start, period_end, amount_due, amount_paid, status")
      .eq("tenant_id", auth.tenantId)
      .order("period_end", { ascending: false })
      .limit(100);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ settlements: data ?? [] });
  });
}
