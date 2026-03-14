import { createAdminClient } from "@/lib/backend/db";

export async function writeAuditLog(params: {
  tenantId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId ?? null,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    payload: params.payload ?? {},
  });
}
