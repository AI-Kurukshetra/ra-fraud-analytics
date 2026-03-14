import { withAuth } from "@/lib/backend/auth/handler";
import { processCdrIngestJobs } from "@/lib/backend/jobs/cdr-jobs";
import { writeAuditLog } from "@/lib/backend/audit";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

function randomWorkerId() {
  return `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const maxJobs = typeof body?.maxJobs === "number" ? body.maxJobs : undefined;
    const workerId =
      typeof body?.workerId === "string" && body.workerId.trim().length > 0
        ? body.workerId.trim()
        : randomWorkerId();

    try {
      const result = await processCdrIngestJobs({
        tenantId: auth.tenantId,
        workerId,
        maxJobs,
      });

      await writeAuditLog({
        tenantId: auth.tenantId,
        actorUserId: auth.user.id,
        action: "cdr_job_process",
        resourceType: "cdr_ingest_job",
        payload: result,
      });

      return jsonOk(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process CDR jobs";
      return jsonError("DB_ERROR", message, 500);
    }
  }, { allowedRoles: ["owner", "admin"] });
}
