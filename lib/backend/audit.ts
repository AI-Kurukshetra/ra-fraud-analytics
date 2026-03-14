import { createAdminClient } from "@/lib/backend/db";

export async function writeAuditLog(params: {
  tenantId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  strict?: boolean;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      tenant_id: params.tenantId,
      actor_user_id: params.actorUserId ?? null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      payload: params.payload ?? {},
    });

    if (error) {
      if (params.strict) {
        throw new Error(error.message);
      }
      console.warn(`[audit] failed to write audit log: ${error.message}`);
    }
  } catch (error) {
    if (params.strict) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown audit error";
    console.warn(`[audit] non-fatal audit error: ${message}`);
  }
}
