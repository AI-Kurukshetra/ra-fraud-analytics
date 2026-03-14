import { withAuth } from "@/lib/backend/auth/handler";
import { createAdminClient } from "@/lib/backend/db";
import { buildLineageEvent } from "@/lib/backend/engines/lineage";
import { detectFraudBatch } from "@/lib/backend/engines/detection";
import { runDataQualityChecks } from "@/lib/backend/engines/data-quality";
import { writeAuditLog } from "@/lib/backend/audit";
import { parseCdrBatch } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);
    const parsed = parseCdrBatch(body?.records);

    if (!parsed.ok || !parsed.data) {
      return jsonError("VALIDATION_ERROR", parsed.error ?? "Invalid payload", 400);
    }

    const records = parsed.data.map((record) => ({ ...record, tenantId: auth.tenantId }));
    const admin = createAdminClient();

    const { data: insertedCdrs, error: cdrError } = await admin
      .from("cdrs")
      .insert(
        records.map((r) => ({
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
      .select("id, tenant_id, subscriber_id, msisdn, call_type, origin_country, destination_country, duration_seconds, charge_amount, billed_amount, event_time, source_system");

    if (cdrError) {
      return jsonError("DB_ERROR", cdrError.message, 500);
    }

    const normalized =
      insertedCdrs?.map((item) => ({
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
      })) ?? [];

    const alerts = detectFraudBatch(normalized);
    if (alerts.length > 0) {
      const { error: alertError } = await admin.from("alerts").upsert(
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
        return jsonError("DB_ERROR", alertError.message, 500);
      }
    }

    const quality = runDataQualityChecks(records);
    await admin.from("data_quality_runs").insert({
      tenant_id: auth.tenantId,
      quality_score: quality.qualityScore,
      checked_count: quality.total,
      failed_count: quality.missingMsisdn + quality.invalidDuration + quality.negativeAmounts,
      payload: quality,
    });

    const lineage = buildLineageEvent({
      tenantId: auth.tenantId,
      sourceSystem: "cdr-ingestion",
      dataset: "cdrs",
      operation: "ingest",
      recordCount: records.length,
    });

    await admin.from("data_lineage_events").insert(lineage);
    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "cdr_ingest",
      resourceType: "cdr",
      payload: {
        inserted: records.length,
        alertsGenerated: alerts.length,
      },
    });

    return jsonOk({
      inserted: records.length,
      alertsGenerated: alerts.length,
      quality,
    });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
