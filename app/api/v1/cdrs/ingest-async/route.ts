import { withAuth } from "@/lib/backend/auth/handler";
import { MAX_CDR_BATCH } from "@/lib/backend/cdr/pipeline";
import { enqueueCdrIngestJob, listCdrIngestJobs } from "@/lib/backend/jobs/cdr-jobs";
import { parseCdrBatch, parseListLimit } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function GET(request: Request) {
  return withAuth(async (auth) => {
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"), { fallback: 50, min: 1, max: 200 });
    const statusParam = url.searchParams.get("status")?.trim();
    const status =
      statusParam === "pending" ||
      statusParam === "processing" ||
      statusParam === "completed" ||
      statusParam === "failed"
        ? statusParam
        : undefined;

    try {
      const jobs = await listCdrIngestJobs({
        tenantId: auth.tenantId,
        status,
        limit,
      });
      return jsonOk({ jobs }, { limit, status: status ?? "all" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list jobs";
      return jsonError("DB_ERROR", message, 500);
    }
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const parsed = parseCdrBatch(body?.records);

    if (!parsed.ok || !parsed.data) {
      return jsonError("VALIDATION_ERROR", parsed.error ?? "Invalid payload", 400);
    }
    if (parsed.data.length > MAX_CDR_BATCH) {
      return jsonError("VALIDATION_ERROR", `records exceeds max batch size of ${MAX_CDR_BATCH}`, 400);
    }

    const priority = typeof body?.priority === "number" ? body.priority : undefined;
    const maxAttempts = typeof body?.maxAttempts === "number" ? body.maxAttempts : undefined;

    try {
      const job = await enqueueCdrIngestJob({
        tenantId: auth.tenantId,
        createdBy: auth.user.id,
        records: parsed.data,
        priority,
        maxAttempts,
      });
      return jsonOk({ job }, undefined, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enqueue job";
      return jsonError("DB_ERROR", message, 500);
    }
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
