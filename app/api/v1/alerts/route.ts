import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("alerts")
      .select("id, title, description, fraud_type, severity, confidence, status, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ alerts: data ?? [] });
  });
}

const ALERT_STATUSES = ["new", "acknowledged", "closed"] as const;

function isAlertStatus(value: unknown): value is (typeof ALERT_STATUSES)[number] {
  return typeof value === "string" && ALERT_STATUSES.includes(value as (typeof ALERT_STATUSES)[number]);
}

export async function PATCH(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string") {
      return jsonError("VALIDATION_ERROR", "id is required", 400);
    }
    if (!isAlertStatus(body.status)) {
      return jsonError("VALIDATION_ERROR", "status must be one of: new, acknowledged, closed", 400);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("alerts")
      .update({
        status: body.status,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", body.id)
      .select("id, title, description, fraud_type, severity, confidence, status, created_at")
      .single();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "alert_status_update",
      resourceType: "alert",
      resourceId: data.id,
      payload: {
        status: data.status,
      },
    });

    return jsonOk({ alert: data });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
