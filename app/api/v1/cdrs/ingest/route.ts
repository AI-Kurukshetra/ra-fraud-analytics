import { withAuth } from "@/lib/backend/auth/handler";
import { MAX_CDR_BATCH, processCdrIngest } from "@/lib/backend/cdr/pipeline";
import { createAdminClient } from "@/lib/backend/db";
import { parseCdrBatch } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const parsed = parseCdrBatch(body?.records);

    if (!parsed.ok || !parsed.data) {
      return jsonError("VALIDATION_ERROR", parsed.error ?? "Invalid payload", 400);
    }
    if (parsed.data.length > MAX_CDR_BATCH) {
      return jsonError("VALIDATION_ERROR", `records exceeds max batch size of ${MAX_CDR_BATCH}`, 400);
    }

    const records = parsed.data.map((record) => ({ ...record, tenantId: auth.tenantId }));
    const admin = createAdminClient();
    try {
      const result = await processCdrIngest({
        admin,
        tenantId: auth.tenantId,
        records,
        actorUserId: auth.user.id,
      });
      return jsonOk(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to ingest CDR records";
      return jsonError("DB_ERROR", message, 500);
    }
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
