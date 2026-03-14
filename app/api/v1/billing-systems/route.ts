import { withAuth } from "@/lib/backend/auth/handler";
import { syncAllConnectors, listConnectors } from "@/lib/backend/connectors";
import { jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async () => {
    return jsonOk({ connectors: listConnectors() });
  });
}

export async function POST() {
  return withAuth(async (auth) => {
    const results = await syncAllConnectors(auth.tenantId);
    return jsonOk({ syncResults: results });
  }, { allowedRoles: ["owner", "admin"] });
}
