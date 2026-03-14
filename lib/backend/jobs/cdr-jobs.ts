import { createAdminClient } from "@/lib/backend/db";
import type { CdrRecord } from "@/lib/backend/types";
import { processCdrIngest } from "@/lib/backend/cdr/pipeline";

export type CdrIngestJobStatus = "pending" | "processing" | "completed" | "failed";

export type CdrIngestJobRow = {
  id: string;
  tenant_id: string;
  status: CdrIngestJobStatus;
  priority: number;
  record_count: number;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
  created_by: string | null;
  error_message: string | null;
  result: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function toJobResponse(job: CdrIngestJobRow) {
  return {
    id: job.id,
    tenantId: job.tenant_id,
    status: job.status,
    priority: job.priority,
    recordCount: job.record_count,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    workerId: job.worker_id,
    createdBy: job.created_by,
    errorMessage: job.error_message,
    result: job.result,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export async function enqueueCdrIngestJob(params: {
  tenantId: string;
  createdBy?: string;
  records: CdrRecord[];
  priority?: number;
  maxAttempts?: number;
}) {
  if (!Array.isArray(params.records) || params.records.length === 0) {
    throw new Error("records must be a non-empty array");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cdr_ingest_jobs")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.createdBy ?? null,
      status: "pending",
      priority: Math.max(1, Math.min(10, params.priority ?? 5)),
      payload: { records: params.records },
      record_count: params.records.length,
      max_attempts: Math.max(1, Math.min(10, params.maxAttempts ?? 3)),
    })
    .select(
      "id, tenant_id, status, priority, record_count, attempts, max_attempts, worker_id, created_by, error_message, result, started_at, completed_at, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to enqueue job");
  }

  return toJobResponse(data as CdrIngestJobRow);
}

export async function getCdrIngestJob(jobId: string, tenantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cdr_ingest_jobs")
    .select(
      "id, tenant_id, status, priority, record_count, attempts, max_attempts, worker_id, created_by, error_message, result, started_at, completed_at, created_at, updated_at",
    )
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toJobResponse(data as CdrIngestJobRow) : null;
}

export async function listCdrIngestJobs(params: {
  tenantId: string;
  status?: CdrIngestJobStatus;
  limit?: number;
}) {
  const admin = createAdminClient();
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  let query = admin
    .from("cdr_ingest_jobs")
    .select(
      "id, tenant_id, status, priority, record_count, attempts, max_attempts, worker_id, created_by, error_message, result, started_at, completed_at, created_at, updated_at",
    )
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((job) => toJobResponse(job as CdrIngestJobRow));
}

async function claimPendingJob(params: { tenantId: string; workerId: string }) {
  const admin = createAdminClient();

  const { data: candidates, error: candidateError } = await admin
    .from("cdr_ingest_jobs")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);

  if (candidateError) {
    throw new Error(candidateError.message);
  }

  for (const candidate of candidates ?? []) {
    const { data, error } = await admin
      .from("cdr_ingest_jobs")
      .update({
        status: "processing",
        worker_id: params.workerId,
        started_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("tenant_id", params.tenantId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data as CdrIngestJobRow & { payload: { records: CdrRecord[] } };
    }
  }

  return null;
}

export async function processCdrIngestJobs(params: {
  tenantId: string;
  workerId: string;
  maxJobs?: number;
}) {
  const admin = createAdminClient();
  const maxJobs = Math.max(1, Math.min(100, params.maxJobs ?? 10));

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimPendingJob({ tenantId: params.tenantId, workerId: params.workerId });
    if (!job) {
      break;
    }

    processed += 1;
    const payload = (job as unknown as { payload?: { records?: CdrRecord[] } }).payload;
    const records = Array.isArray(payload?.records) ? payload.records : [];
    if (records.length === 0) {
      const { error: failEmptyError } = await admin
        .from("cdr_ingest_jobs")
        .update({
          attempts: job.attempts + 1,
          status: "failed",
          worker_id: params.workerId,
          completed_at: new Date().toISOString(),
          error_message: "Job payload has no records",
        })
        .eq("id", job.id)
        .eq("tenant_id", job.tenant_id);
      if (failEmptyError) {
        throw new Error(failEmptyError.message);
      }
      failed += 1;
      continue;
    }

    try {
      const result = await processCdrIngest({
        admin,
        tenantId: job.tenant_id,
        records,
        actorUserId: job.created_by ?? undefined,
        sourceSystem: "cdr-ingest-worker",
      });

      const { error: completeError } = await admin
        .from("cdr_ingest_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result,
          error_message: null,
        })
        .eq("id", job.id)
        .eq("tenant_id", job.tenant_id);

      if (completeError) {
        throw new Error(completeError.message);
      }

      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown job processing error";
      const nextAttempts = job.attempts + 1;
      const shouldFail = nextAttempts >= job.max_attempts;

      const { error: failError } = await admin
        .from("cdr_ingest_jobs")
        .update({
          attempts: nextAttempts,
          status: shouldFail ? "failed" : "pending",
          worker_id: shouldFail ? params.workerId : null,
          completed_at: shouldFail ? new Date().toISOString() : null,
          error_message: message,
        })
        .eq("id", job.id)
        .eq("tenant_id", job.tenant_id);

      if (failError) {
        throw new Error(failError.message);
      }

      failed += 1;
    }
  }

  return {
    processed,
    completed,
    failed,
    workerId: params.workerId,
  };
}
