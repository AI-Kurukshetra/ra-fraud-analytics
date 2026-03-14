import { withAuth } from "@/lib/backend/auth/handler";
import { getCdrIngestJob } from "@/lib/backend/jobs/cdr-jobs";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (auth) => {
    const { id } = await context.params;
    if (!id || typeof id !== "string") {
      return jsonError("VALIDATION_ERROR", "job id is required", 400);
    }

    try {
      const job = await getCdrIngestJob(id, auth.tenantId);
      if (!job) {
        return jsonError("NOT_FOUND", "CDR ingest job not found", 404);
      }
      return jsonOk({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch job";
      return jsonError("DB_ERROR", message, 500);
    }
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
