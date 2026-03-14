import { withAuth } from "@/lib/backend/auth/handler";
import { validateRoamingRecord } from "@/lib/backend/engines/roaming";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.subscriberId !== "string") {
      return jsonError("VALIDATION_ERROR", "subscriberId is required", 400);
    }

    const result = validateRoamingRecord({
      tenantId: auth.tenantId,
      subscriberId: body.subscriberId,
      homeCountry: String(body.homeCountry ?? ""),
      visitedCountry: String(body.visitedCountry ?? ""),
      billedAmount: Number(body.billedAmount ?? 0),
      expectedAmount: Number(body.expectedAmount ?? 0),
      usageMb: Number(body.usageMb ?? 0),
    });

    return jsonOk({ result });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
