import type { CdrRecord, ReconciliationItem } from "@/lib/backend/types";

export const CASE_STATUSES = ["open", "investigating", "resolved", "closed"] as const;

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isCdrRecord(value: unknown): value is CdrRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;
  return (
    hasString(v.tenantId) &&
    hasString(v.subscriberId) &&
    hasString(v.msisdn) &&
    (v.callType === "voice" || v.callType === "sms" || v.callType === "data") &&
    hasString(v.originCountry) &&
    hasString(v.destinationCountry) &&
    typeof v.durationSeconds === "number" &&
    typeof v.chargeAmount === "number" &&
    typeof v.billedAmount === "number" &&
    hasString(v.eventTime) &&
    (v.sourceSystem === "billing" ||
      v.sourceSystem === "mediation" ||
      v.sourceSystem === "network")
  );
}

export function parseCdrBatch(value: unknown): {
  ok: boolean;
  data?: CdrRecord[];
  error?: string;
} {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Expected an array of CDR records" };
  }

  if (value.length === 0) {
    return { ok: false, error: "At least one CDR record is required" };
  }

  const invalidIndex = value.findIndex((record) => !isCdrRecord(record));
  if (invalidIndex !== -1) {
    return { ok: false, error: `Invalid CDR record at index ${invalidIndex}` };
  }

  return { ok: true, data: value };
}

export function isReconciliationItem(value: unknown): value is ReconciliationItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;
  return (
    hasString(v.tenantId) &&
    hasString(v.recordKey) &&
    typeof v.billedAmount === "number" &&
    typeof v.mediatedAmount === "number" &&
    typeof v.collectedAmount === "number"
  );
}

export function isCaseStatus(value: unknown): value is (typeof CASE_STATUSES)[number] {
  return typeof value === "string" && CASE_STATUSES.includes(value as (typeof CASE_STATUSES)[number]);
}

export function parseListLimit(value: string | null, defaults = { fallback: 100, min: 1, max: 500 }) {
  if (!value) return defaults.fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaults.fallback;
  return Math.min(defaults.max, Math.max(defaults.min, parsed));
}

export function parseBooleanQuery(value: string | null) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}
