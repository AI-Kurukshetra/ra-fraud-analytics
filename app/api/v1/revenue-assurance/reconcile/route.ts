import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { reconcile } from "@/lib/backend/engines/reconciliation";
import { isReconciliationItem } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

const MAX_RECONCILE_ITEMS = 20000;
const INSERT_CHUNK_SIZE = 1000;

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const items = body?.items;

    if (!Array.isArray(items) || items.some((item) => !isReconciliationItem(item))) {
      return jsonError("VALIDATION_ERROR", "Invalid reconciliation payload", 400);
    }
    if (
      items.some(
        (item) =>
          !Number.isFinite(item.billedAmount) ||
          !Number.isFinite(item.mediatedAmount) ||
          !Number.isFinite(item.collectedAmount) ||
          item.billedAmount < 0 ||
          item.mediatedAmount < 0 ||
          item.collectedAmount < 0,
      )
    ) {
      return jsonError(
        "VALIDATION_ERROR",
        "billedAmount, mediatedAmount and collectedAmount must be finite numbers >= 0",
        400,
      );
    }
    if (items.length > MAX_RECONCILE_ITEMS) {
      return jsonError("VALIDATION_ERROR", `items exceeds max batch size of ${MAX_RECONCILE_ITEMS}`, 400);
    }

    const normalized = items.map((item) => ({ ...item, tenantId: auth.tenantId }));
    const results = reconcile(normalized);

    const admin = createAdminClient();
    for (let start = 0; start < results.length; start += INSERT_CHUNK_SIZE) {
      const chunk = results.slice(start, start + INSERT_CHUNK_SIZE);
      const { error } = await admin.from("reconciliation_results").insert(
        chunk.map((result) => ({
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
