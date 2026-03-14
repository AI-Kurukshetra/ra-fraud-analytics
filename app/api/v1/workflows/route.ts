import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { parseBooleanQuery, parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const workflowType = url.searchParams.get("workflowType")?.trim();
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 150, min: 1, max: 500 });
    const activeOnly = parseBooleanQuery(url.searchParams.get("activeOnly"));

    const admin = createAdminClient();
    let query = admin
      .from("workflows")
      .select("id, workflow_name, workflow_type, is_active, updated_at")
      .eq("tenant_id", auth.tenantId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (workflowType) {
      query = query.eq("workflow_type", workflowType);
    }
    if (activeOnly) {
      query = query.eq("is_active", true);
    }
    const { data, error } = await query;

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "workflows_list",
      resourceType: "workflow",
      payload: { workflowType: workflowType ?? "all", activeOnly, limit, count: data?.length ?? 0 },
    });

    return jsonOk({
      workflows: data ?? [],
      reportDistributionReady: (data ?? []).some((item) => item.workflow_type.includes("report")),
    }, { workflowType: workflowType ?? "all", activeOnly, limit });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
