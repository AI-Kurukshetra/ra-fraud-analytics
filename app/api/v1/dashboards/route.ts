import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") === "mobile" ? "mobile" : "web";
    const admin = createAdminClient();

    const [{ count: alertCount, error: alertError }, { count: caseCount, error: caseError }] = await Promise.all([
      admin.from("alerts").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
      admin.from("cases").select("*", { count: "exact", head: true }).eq("tenant_id", auth.tenantId),
    ]);
    const dbError = alertError ?? caseError;
    if (dbError) {
      return jsonError("DB_ERROR", dbError.message, 500);
    }

    const cards =
      channel === "mobile"
        ? [
            { id: "mobile-critical-alerts", title: "Critical Alerts", widget: "counter", priority: "high" },
            { id: "mobile-open-cases", title: "Open Cases", widget: "counter", priority: "high" },
            { id: "mobile-recovery", title: "Recovery", widget: "kpi", priority: "medium" },
          ]
        : [
            { id: "leakage-rate", title: "Leakage Rate", widget: "timeseries", priority: "high" },
            { id: "fraud-alerts", title: "Fraud Alerts", widget: "severity-distribution", priority: "high" },
            { id: "recovery", title: "Revenue Recovery", widget: "kpi", priority: "medium" },
            { id: "network-anomaly", title: "Network Anomaly", widget: "heatmap", priority: "medium" },
          ];

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "dashboards_list",
      resourceType: "dashboard",
      payload: { channel, cards: cards.length },
    });

    return jsonOk({
      channel,
      cards,
      summary: {
        alertCount: alertCount ?? 0,
        caseCount: caseCount ?? 0,
      },
      mobile: {
        supported: true,
        minAppVersion: "1.0.0",
        pollingIntervalSeconds: 30,
      },
    });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
