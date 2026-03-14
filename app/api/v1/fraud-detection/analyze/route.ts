import { withAuth } from "@/lib/backend/auth/handler";
import { detectFraudBatch } from "@/lib/backend/engines/detection";
import { parseCdrBatch } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const parsed = parseCdrBatch(body?.records);

    if (!parsed.ok || !parsed.data) {
      return jsonError("VALIDATION_ERROR", parsed.error ?? "Invalid payload", 400);
    }

    const alerts = detectFraudBatch(parsed.data.map((r) => ({ ...r, tenantId: auth.tenantId })));
    return jsonOk({ alerts, count: alerts.length });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
