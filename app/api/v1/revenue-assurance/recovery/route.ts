import { withAuth } from "@/lib/backend/auth/handler";
import { calculateRecoveryImpact } from "@/lib/backend/engines/recovery";
import { jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => null);
    const metrics = calculateRecoveryImpact({
      estimatedLoss: Number(body?.estimatedLoss ?? 0),
      recoveredAmount: Number(body?.recoveredAmount ?? 0),
    });

    return jsonOk({ metrics });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
