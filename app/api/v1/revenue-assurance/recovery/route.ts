import { withAuth } from "@/lib/backend/auth/handler";
import { calculateRecoveryImpact } from "@/lib/backend/engines/recovery";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => null);
    const estimatedLoss = Number(body?.estimatedLoss ?? 0);
    const recoveredAmount = Number(body?.recoveredAmount ?? 0);
    if (!Number.isFinite(estimatedLoss) || !Number.isFinite(recoveredAmount)) {
      return jsonError("VALIDATION_ERROR", "estimatedLoss and recoveredAmount must be numbers", 400);
    }
    if (estimatedLoss < 0 || recoveredAmount < 0) {
      return jsonError("VALIDATION_ERROR", "estimatedLoss and recoveredAmount must be >= 0", 400);
    }
    const metrics = calculateRecoveryImpact({
      estimatedLoss,
      recoveredAmount,
    });

    return jsonOk({ metrics });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
