import { withAuth } from "@/lib/backend/auth/handler";
import { validateInterconnectTariff } from "@/lib/backend/engines/interconnect";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.partnerId !== "string" || typeof body.routeCode !== "string") {
      return jsonError("VALIDATION_ERROR", "partnerId and routeCode are required", 400);
    }
    const expectedTariff = Number(body.expectedTariff ?? 0);
    const actualTariff = Number(body.actualTariff ?? 0);
    const minutes = Number(body.minutes ?? 0);
    if (!Number.isFinite(expectedTariff) || !Number.isFinite(actualTariff) || !Number.isFinite(minutes)) {
      return jsonError("VALIDATION_ERROR", "expectedTariff, actualTariff and minutes must be numbers", 400);
    }
    if (expectedTariff < 0 || actualTariff < 0 || minutes <= 0) {
      return jsonError("VALIDATION_ERROR", "expectedTariff/actualTariff must be >= 0 and minutes must be > 0", 400);
    }

    const result = validateInterconnectTariff({
      tenantId: auth.tenantId,
      partnerId: body.partnerId,
      routeCode: body.routeCode,
      expectedTariff,
      actualTariff,
      minutes,
    });

    return jsonOk({ result });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
