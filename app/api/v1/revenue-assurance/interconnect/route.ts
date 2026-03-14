import { withAuth } from "@/lib/backend/auth/handler";
import { validateInterconnectTariff } from "@/lib/backend/engines/interconnect";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.partnerId !== "string" || typeof body.routeCode !== "string") {
      return jsonError("VALIDATION_ERROR", "partnerId and routeCode are required", 400);
    }

    const result = validateInterconnectTariff({
      tenantId: auth.tenantId,
      partnerId: body.partnerId,
      routeCode: body.routeCode,
      expectedTariff: Number(body.expectedTariff ?? 0),
      actualTariff: Number(body.actualTariff ?? 0),
      minutes: Number(body.minutes ?? 0),
    });

    return jsonOk({ result });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
