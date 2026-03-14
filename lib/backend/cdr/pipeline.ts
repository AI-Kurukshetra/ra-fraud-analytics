import type { SupabaseClient } from "@supabase/supabase-js";
import type { CdrRecord } from "@/lib/backend/types";
import { buildLineageEvent } from "@/lib/backend/engines/lineage";
import { runDataQualityChecks } from "@/lib/backend/engines/data-quality";
import { detectFraudBatch } from "@/lib/backend/engines/detection";
import { writeAuditLog } from "@/lib/backend/audit";

const INSERT_CHUNK_SIZE = 1000;

export const MAX_CDR_BATCH = 20000;

export type CdrIngestResult = {
  inserted: number;
  alertsGenerated: number;
  quality: ReturnType<typeof runDataQualityChecks>;
};

type InsertedCdr = {
  id: string;
  tenant_id: string;
  subscriber_id: string;
  msisdn: string;
  call_type: "voice" | "sms" | "data";
  origin_country: string;
  destination_country: string;
  duration_seconds: number;
  charge_amount: number;
  billed_amount: number;
  event_time: string;
  source_system: "billing" | "mediation" | "network";
};

export async function processCdrIngest(params: {
  admin: SupabaseClient;
  tenantId: string;
  records: CdrRecord[];
  actorUserId?: string;
  sourceSystem?: string;
}): Promise<CdrIngestResult> {
  const records = params.records.map((record) => ({ ...record, tenantId: params.tenantId }));
  const insertedCdrs: InsertedCdr[] = [];

  for (let start = 0; start < records.length; start += INSERT_CHUNK_SIZE) {
    const chunk = records.slice(start, start + INSERT_CHUNK_SIZE);
    const { data, error } = await params.admin
      .from("cdrs")
      .insert(
        chunk.map((r) => ({
          tenant_id: r.tenantId,
          subscriber_id: r.subscriberId,
          imsi: r.imsi ?? null,
          msisdn: r.msisdn,
          call_type: r.callType,
          origin_country: r.originCountry,
          destination_country: r.destinationCountry,
          duration_seconds: r.durationSeconds,
          charge_amount: r.chargeAmount,
          billed_amount: r.billedAmount,
          event_time: r.eventTime,
          source_system: r.sourceSystem,
          cell_id: r.cellId ?? null,
          network_element_id: r.networkElementId ?? null,
        })),
      )
      .select(
        "id, tenant_id, subscriber_id, msisdn, call_type, origin_country, destination_country, duration_seconds, charge_amount, billed_amount, event_time, source_system",
      );

    if (error) {
      throw new Error(error.message);
    }
    insertedCdrs.push(...(data ?? []));
  }

  const normalized = insertedCdrs.map((item) => ({
    id: item.id,
    tenantId: item.tenant_id,
    subscriberId: item.subscriber_id,
    msisdn: item.msisdn,
    callType: item.call_type,
    originCountry: item.origin_country,
    destinationCountry: item.destination_country,
    durationSeconds: item.duration_seconds,
    chargeAmount: item.charge_amount,
    billedAmount: item.billed_amount,
    eventTime: item.event_time,
    sourceSystem: item.source_system,
  }));

  const alerts = detectFraudBatch(normalized);
  if (alerts.length > 0) {
    const { error: alertError } = await params.admin.from("alerts").upsert(
      alerts.map((alert) => ({
        id: alert.id,
        tenant_id: alert.tenantId,
        cdr_id: alert.cdrId ?? null,
        title: alert.title,
        description: alert.description,
        fraud_type: alert.fraudType,
        severity: alert.severity,
        confidence: alert.confidence,
        dedupe_key: alert.dedupeKey,
        status: alert.status,
      })),
      { onConflict: "tenant_id,dedupe_key" },
    );

    if (alertError) {
      throw new Error(alertError.message);
    }
  }

  const quality = runDataQualityChecks(records);
  const failedCount = quality.missingMsisdn + quality.invalidDuration + quality.negativeAmounts;
  const [{ error: qualityError }, { error: lineageError }] = await Promise.all([
    params.admin.from("data_quality_runs").insert({
      tenant_id: params.tenantId,
      quality_score: quality.qualityScore,
      checked_count: quality.total,
      failed_count: failedCount,
      payload: quality,
    }),
    params.admin.from("data_lineage_events").insert(
      buildLineageEvent({
        tenantId: params.tenantId,
        sourceSystem: params.sourceSystem ?? "cdr-ingestion",
        dataset: "cdrs",
        operation: "ingest",
        recordCount: records.length,
      }),
    ),
  ]);

  if (qualityError) {
    throw new Error(qualityError.message);
  }
  if (lineageError) {
    throw new Error(lineageError.message);
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "cdr_ingest",
    resourceType: "cdr",
    payload: {
      inserted: records.length,
      alertsGenerated: alerts.length,
      qualityScore: quality.qualityScore,
    },
  });

  return {
    inserted: records.length,
    alertsGenerated: alerts.length,
    quality,
  };
}
