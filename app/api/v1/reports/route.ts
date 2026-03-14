import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reports")
      .select("id, report_type, status, generated_at, payload")
      .eq("tenant_id", auth.tenantId)
      .order("generated_at", { ascending: false })
      .limit(100);

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    return jsonOk({ reports: data ?? [] });
  });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const reportType = typeof body?.reportType === "string" ? body.reportType : "operational";

    const payload = {
      generatedBy: auth.user.id,
      generatedForTenant: auth.tenantId,
      generatedAt: new Date().toISOString(),
      summary: "Automated report generated",
    };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reports")
      .insert({
        tenant_id: auth.tenantId,
        report_type: reportType,
        status: "generated",
        payload,
      })
      .select("id, report_type, status, generated_at, payload")
      .single();

    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "report_generate",
      resourceType: "report",
      resourceId: data.id,
      payload: { reportType },
    });

    return jsonOk({ report: data }, undefined, 201);
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
