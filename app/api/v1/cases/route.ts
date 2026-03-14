import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { isCaseStatus } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cases")
      .select("id, title, status, assignee_user_id, alert_id, revenue_impact, notes, created_at, updated_at")
      .eq("tenant_id", auth.tenantId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ cases: data ?? [] });
  });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body?.title || typeof body.title !== "string") {
      return jsonError("VALIDATION_ERROR", "title is required", 400);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cases")
      .insert({
        tenant_id: auth.tenantId,
        title: body.title,
        status: "open",
        assignee_user_id: typeof body.assigneeUserId === "string" ? body.assigneeUserId : null,
        alert_id: typeof body.alertId === "string" ? body.alertId : null,
        revenue_impact: typeof body.revenueImpact === "number" ? body.revenueImpact : 0,
        notes: typeof body.notes === "string" ? body.notes : null,
      })
      .select("id, title, status, assignee_user_id, alert_id, revenue_impact, notes, created_at, updated_at")
      .single();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "case_create",
      resourceType: "case",
      resourceId: data.id,
    });

    return jsonOk({ case: data }, undefined, 201);
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}

export async function PATCH(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body?.id || typeof body.id !== "string") {
      return jsonError("VALIDATION_ERROR", "id is required", 400);
    }

    const update: Record<string, unknown> = {};
    if (body.status !== undefined && !isCaseStatus(body.status)) {
      return jsonError("VALIDATION_ERROR", "status is invalid", 400);
    }
    if (isCaseStatus(body.status)) {
      update.status = body.status;
    }
    if (typeof body.assigneeUserId === "string") {
      update.assignee_user_id = body.assigneeUserId;
    }
    if (typeof body.notes === "string") {
      update.notes = body.notes;
    }
    if (typeof body.revenueImpact === "number") {
      update.revenue_impact = body.revenueImpact;
    }
    if (Object.keys(update).length === 0) {
      return jsonError("VALIDATION_ERROR", "No valid fields to update", 400);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cases")
      .update(update)
      .eq("tenant_id", auth.tenantId)
      .eq("id", body.id)
      .select("id, title, status, assignee_user_id, alert_id, revenue_impact, notes, created_at, updated_at")
      .single();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "case_update",
      resourceType: "case",
      resourceId: data.id,
      payload: update,
    });

    return jsonOk({ case: data });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
