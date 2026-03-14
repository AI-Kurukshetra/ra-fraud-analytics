import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { isCaseStatus, parseListLimit, parseStringQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

const CASE_TRANSITIONS: Record<string, string[]> = {
  open: ["investigating", "closed"],
  investigating: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const status = parseStringQuery(url.searchParams.get("status"), 24);
    const assigneeUserId = parseStringQuery(url.searchParams.get("assigneeUserId"), 64);
    const alertId = parseStringQuery(url.searchParams.get("alertId"), 64);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 200, min: 1, max: 500 });

    const admin = createAdminClient();
    let query = admin
      .from("cases")
      .select("id, title, status, assignee_user_id, alert_id, revenue_impact, notes, created_at, updated_at")
      .eq("tenant_id", auth.tenantId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (status && isCaseStatus(status)) {
      query = query.eq("status", status);
    }
    if (assigneeUserId) {
      query = query.eq("assignee_user_id", assigneeUserId);
    }
    if (alertId) {
      query = query.eq("alert_id", alertId);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const rows = data ?? [];
    const statusBreakdown = rows.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    const recoveryImpact = rows
      .filter((item) => item.status === "resolved" || item.status === "closed")
      .reduce((sum, item) => sum + Number(item.revenue_impact ?? 0), 0);

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "cases_list",
      resourceType: "case",
      payload: {
        status: status ?? "all",
        assigneeUserId: assigneeUserId ?? "all",
        alertId: alertId ?? "all",
        limit,
        count: rows.length,
      },
    });

    return jsonOk({
      cases: rows,
      summary: {
        total: rows.length,
        statusBreakdown,
        recoveryImpact,
      },
    });
  });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    if (!body?.title || typeof body.title !== "string") {
      return jsonError("VALIDATION_ERROR", "title is required", 400);
    }
    const title = body.title.trim();
    if (title.length < 3 || title.length > 160) {
      return jsonError("VALIDATION_ERROR", "title must be between 3 and 160 characters", 400);
    }

    const admin = createAdminClient();
    const assigneeUserId = typeof body.assigneeUserId === "string" ? body.assigneeUserId : null;
    if (assigneeUserId) {
      const { data: membership, error: membershipError } = await admin
        .from("memberships")
        .select("id")
        .eq("tenant_id", auth.tenantId)
        .eq("user_id", assigneeUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (membershipError) {
        return jsonError("DB_ERROR", membershipError.message, 500);
      }
      if (!membership) {
        return jsonError("VALIDATION_ERROR", "assigneeUserId must belong to tenant", 400);
      }
    }

    const { data, error } = await admin
      .from("cases")
      .insert({
        tenant_id: auth.tenantId,
        title,
        status: "open",
        assignee_user_id: assigneeUserId,
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
      const admin = createAdminClient();
      const { data: membership, error: membershipError } = await admin
        .from("memberships")
        .select("id")
        .eq("tenant_id", auth.tenantId)
        .eq("user_id", body.assigneeUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (membershipError) {
        return jsonError("DB_ERROR", membershipError.message, 500);
      }
      if (!membership) {
        return jsonError("VALIDATION_ERROR", "assigneeUserId must belong to tenant", 400);
      }
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
    const { data: currentCase, error: currentError } = await admin
      .from("cases")
      .select("id, status")
      .eq("tenant_id", auth.tenantId)
      .eq("id", body.id)
      .maybeSingle();

    if (currentError) {
      return jsonError("DB_ERROR", currentError.message, 500);
    }
    if (!currentCase) {
      return jsonError("NOT_FOUND", "case not found", 404);
    }

    if (typeof update.status === "string" && update.status !== currentCase.status) {
      const allowedNext = CASE_TRANSITIONS[currentCase.status] ?? [];
      if (!allowedNext.includes(update.status)) {
        return jsonError(
          "VALIDATION_ERROR",
          `invalid status transition from ${currentCase.status} to ${update.status}`,
          400,
        );
      }
    }

    update.updated_at = new Date().toISOString();

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
