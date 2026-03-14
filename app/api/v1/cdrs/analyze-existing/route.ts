import { withAuth } from "@/lib/backend/auth/handler";
import { writeAuditLog } from "@/lib/backend/audit";
import { createAdminClient } from "@/lib/backend/db";
import { detectFraudBatch } from "@/lib/backend/engines/detection";
import { parseDateQuery } from "@/lib/backend/validation";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

const MAX_ANALYZE_EXISTING = 20000;
const INSERT_CHUNK_SIZE = 1000;

type CdrRow = {
  id: string;
  subscriber_id: string;
  imsi: string | null;
  msisdn: string;
  call_type: "voice" | "sms" | "data";
  origin_country: string;
  destination_country: string;
  duration_seconds: number;
  charge_amount: number;
  billed_amount: number;
  event_time: string;
  source_system: "billing" | "mediation" | "network";
  cell_id: string | null;
  network_element_id: string | null;
};

export async function POST(request: Request) {
  return withAuth(async (auth) => {
    const body = await request.json().catch(() => null);

    const requestedLimit = Number(body?.limit ?? 5000);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_ANALYZE_EXISTING, Math.floor(requestedLimit)))
      : 5000;
    const sourceSystem =
      body?.sourceSystem === "billing" || body?.sourceSystem === "mediation" || body?.sourceSystem === "network"
        ? body.sourceSystem
        : null;
    const dateFromRaw = typeof body?.dateFrom === "string" ? body.dateFrom : null;
    const dateToRaw = typeof body?.dateTo === "string" ? body.dateTo : null;
    const dateFrom = parseDateQuery(dateFromRaw);
    const dateTo = parseDateQuery(dateToRaw);

    if (dateFromRaw && !dateFrom) {
      return jsonError("VALIDATION_ERROR", "dateFrom must be a valid date", 400);
    }
    if (dateToRaw && !dateTo) {
      return jsonError("VALIDATION_ERROR", "dateTo must be a valid date", 400);
    }

    const admin = createAdminClient();
    let query = admin
      .from("cdrs")
      .select(
        "id, subscriber_id, imsi, msisdn, call_type, origin_country, destination_country, duration_seconds, charge_amount, billed_amount, event_time, source_system, cell_id, network_element_id",
      )
      .eq("tenant_id", auth.tenantId)
      .order("event_time", { ascending: false })
      .limit(limit);

    if (sourceSystem) {
      query = query.eq("source_system", sourceSystem);
    }
    if (dateFrom) {
      query = query.gte("event_time", dateFrom);
    }
    if (dateTo) {
      query = query.lte("event_time", dateTo);
    }

    const { data, error } = await query;
    if (error) {
      return jsonError("DB_ERROR", error.message, 500);
    }

    const rows = (data ?? []) as CdrRow[];
    if (rows.length === 0) {
      return jsonOk({ scanned: 0, alertsGenerated: 0, byFraudType: {} });
    }

    const normalized = rows.map((item) => ({
      id: item.id,
      tenantId: auth.tenantId,
      subscriberId: item.subscriber_id,
      imsi: item.imsi ?? undefined,
      msisdn: item.msisdn,
      callType: item.call_type,
      originCountry: item.origin_country,
      destinationCountry: item.destination_country,
      durationSeconds: item.duration_seconds,
      chargeAmount: item.charge_amount,
      billedAmount: item.billed_amount,
      eventTime: item.event_time,
      sourceSystem: item.source_system,
      cellId: item.cell_id ?? undefined,
      networkElementId: item.network_element_id ?? undefined,
    }));

    const alerts = detectFraudBatch(normalized);

    if (alerts.length > 0) {
      for (let start = 0; start < alerts.length; start += INSERT_CHUNK_SIZE) {
        const chunk = alerts.slice(start, start + INSERT_CHUNK_SIZE);
        const { error: alertError } = await admin.from("alerts").upsert(
          chunk.map((alert) => ({
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
    }

    const byFraudType = alerts.reduce<Record<string, number>>((acc, item) => {
      acc[item.fraudType] = (acc[item.fraudType] ?? 0) + 1;
      return acc;
    }, {});

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      action: "cdr_analyze_existing",
      resourceType: "cdr",
      payload: {
        scanned: rows.length,
        alertsGenerated: alerts.length,
        sourceSystem: sourceSystem ?? "all",
        dateFrom,
        dateTo,
      },
    });

    return jsonOk({
      scanned: rows.length,
      alertsGenerated: alerts.length,
      byFraudType,
    });
  }, { allowedRoles: ["owner", "admin", "analyst"] });
}
