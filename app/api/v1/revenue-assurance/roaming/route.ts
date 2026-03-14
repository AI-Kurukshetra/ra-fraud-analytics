import { withAuth } from "@/lib/backend/auth/handler";
import { validateRoamingRecord } from "@/lib/backend/engines/roaming";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.subscriberId !== "string") {
      return jsonError("VALIDATION_ERROR", "subscriberId is required", 400);
    }
    const billedAmount = Number(body.billedAmount ?? 0);
    const expectedAmount = Number(body.expectedAmount ?? 0);
    const usageMb = Number(body.usageMb ?? 0);
    if (!Number.isFinite(billedAmount) || !Number.isFinite(expectedAmount) || !Number.isFinite(usageMb)) {
      return jsonError("VALIDATION_ERROR", "billedAmount, expectedAmount and usageMb must be numbers", 400);
    }
    if (billedAmount < 0 || expectedAmount < 0 || usageMb < 0) {
      return jsonError("VALIDATION_ERROR", "billedAmount, expectedAmount and usageMb must be >= 0", 400);
    }

    const result = validateRoamingRecord({
      tenantId: auth.tenantId,
      subscriberId: body.subscriberId,
      homeCountry: String(body.homeCountry ?? ""),
      visitedCountry: String(body.visitedCountry ?? ""),
      billedAmount,
      expectedAmount,
      usageMb,
    });

    return jsonOk({ result });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
