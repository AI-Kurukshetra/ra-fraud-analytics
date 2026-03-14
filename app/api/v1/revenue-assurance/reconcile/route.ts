import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { reconcile } from "@/lib/backend/engines/reconciliation";
import { isReconciliationItem } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const items = body?.items;

    if (!Array.isArray(items) || items.some((item) => !isReconciliationItem(item))) {
      return jsonError("VALIDATION_ERROR", "Invalid reconciliation payload", 400);
    }

    const normalized = items.map((item) => ({ ...item, tenantId: auth.tenantId }));
    const results = reconcile(normalized);

    const admin = createAdminClient();
    const { error } = await admin.from("reconciliation_results").insert(
      results.map((result) => ({
        tenant_id: auth.tenantId,
        record_key: result.recordKey,
        mismatch_amount: result.mismatchAmount,
        leakage_amount: result.leakageAmount,
        severity: result.severity,
        status: result.status,
      })),
    );

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "reconcile_run",
      resourceType: "reconciliation_results",
      payload: { count: results.length },
    });

    return jsonOk({ results, count: results.length });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
