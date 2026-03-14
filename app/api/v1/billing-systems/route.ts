import { withAuth } from "@/lib/backend/auth/handler";
import { listConnectorNames, listConnectors, syncAllConnectors } from "@/lib/backend/connectors";
import { writeAuditLog } from "@/lib/backend/audit";
import { parseBooleanQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const mobileOnly = parseBooleanQuery(url.searchParams.get("mobileOnly"));

    const connectors = listConnectors().filter((connector) =>
      mobileOnly ? connector.supportsMobileMonitoring : true,
    );

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "connectors_list",
      resourceType: "billing_connector",
      payload: { mobileOnly, count: connectors.length },
    });

    return jsonOk({ connectors });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const requestedNames = Array.isArray(body?.connectorNames)
      ? body.connectorNames
          .filter((item: unknown): item is string => typeof item === "string")
          .map((item: string) => item.trim().toLowerCase())
      : [];
    const invalidNames = requestedNames.filter(
      (name: string) => !listConnectorNames().includes(name.toLowerCase()),
    );
    if (invalidNames.length > 0) {
      return jsonError("VALIDATION_ERROR", `Unknown connector(s): ${invalidNames.join(", ")}`, 400);
    }

    const dryRun =
      body?.dryRun === true ||
      body?.dryRun === "true" ||
      body?.dryRun === 1 ||
      body?.dryRun === "1";
    if (requestedNames.length > 20) {
      return jsonError("VALIDATION_ERROR", "connectorNames supports at most 20 entries", 400);
    }
    const results = await syncAllConnectors(auth.tenantId, {
      dryRun,
      connectorNames: requestedNames,
    });

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "connectors_sync",
      resourceType: "billing_connector",
      payload: {
        dryRun,
        connectorNames: requestedNames.length > 0 ? requestedNames : listConnectorNames(),
        count: results.length,
      },
      strict: true,
    });

    return jsonOk({ syncResults: results });
  }, { allowedRoles: ["owner", "admin"] });
}
