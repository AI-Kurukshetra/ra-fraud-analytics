import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 500 });
    const status = url.searchParams.get("status")?.trim();
    const severity = url.searchParams.get("severity")?.trim();
    const fraudType = url.searchParams.get("fraudType")?.trim();
    const minConfidenceRaw = url.searchParams.get("minConfidence");
    const minConfidence = minConfidenceRaw ? Number(minConfidenceRaw) : null;

    const admin = createAdminClient();
    let query = admin
      .from("alerts")
      .select("id, title, description, fraud_type, severity, confidence, status, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (fraudType) {
      query = query.eq("fraud_type", fraudType);
    }
    if (minConfidence !== null) {
      if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
        return jsonError("VALIDATION_ERROR", "minConfidence must be a number between 0 and 1", 400);
      }
      query = query.gte("confidence", minConfidence);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ alerts: data ?? [] }, { limit, status: status ?? "all", severity: severity ?? "all" });
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
      .maybeSingle();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }
    if (!data) {
      return jsonError("NOT_FOUND", "Alert not found for tenant", 404);
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
