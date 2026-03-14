import type { CdrRecord, FraudAlert, FraudType, Severity } from "@/lib/backend/types";
import { inferFraudFromModel } from "@/lib/backend/ml/inference";
import { createId } from "@/lib/backend/utils/id";

function isInternational(cdr: CdrRecord): boolean {
  return cdr.originCountry !== cdr.destinationCountry;
}

function amountDelta(cdr: CdrRecord): number {
  return Math.abs(cdr.chargeAmount - cdr.billedAmount);
}

function classifyFraudType(cdr: CdrRecord): FraudType {
  const delta = amountDelta(cdr);
  if (cdr.callType === "voice" && (cdr.durationSeconds > 7200 || (isInternational(cdr) && cdr.durationSeconds > 3600 && delta > 500))) {
    return "pbx_hacking";
  }
  if (
    cdr.callType === "voice" &&
    isInternational(cdr) &&
    cdr.durationSeconds <= 6 &&
    (cdr.billedAmount === 0 || cdr.chargeAmount <= 0.05)
  ) {
    return "sim_box";
  }
  if (cdr.callType === "data" && ((cdr.chargeAmount === 0 && cdr.billedAmount > 0) || (cdr.billedAmount > 0 && cdr.chargeAmount / cdr.billedAmount < 0.2))) {
    return "subscription_fraud";
  }
  if (isInternational(cdr) && (cdr.billedAmount > cdr.chargeAmount * 2 || (cdr.callType === "data" && cdr.billedAmount > 200 && cdr.durationSeconds < 60))) {
    return "roaming_fraud";
  }
  if (cdr.billedAmount < cdr.chargeAmount * 0.85) {
    return "interconnect_leakage";
  }
  return "unknown";
}

function severityFor(cdr: CdrRecord, fraudType: FraudType): Severity {
  const delta = amountDelta(cdr);
  if (fraudType === "pbx_hacking" || delta > 1000 || (fraudType === "roaming_fraud" && delta > 500)) {
    return "critical";
  }
  if (fraudType === "sim_box" || delta > 300 || (fraudType === "interconnect_leakage" && delta > 250)) {
    return "high";
  }
  if (fraudType === "subscription_fraud" || delta > 100) {
    return "medium";
  }
  return "low";
}

function confidenceFor(cdr: CdrRecord, fraudType: FraudType): number {
  const deltaRatio =
    cdr.chargeAmount === 0 ? 1 : Math.min(1, amountDelta(cdr) / Math.max(0.01, cdr.chargeAmount));
  const intlBoost = isInternational(cdr) ? 0.04 : 0;
  const durationBoost = cdr.durationSeconds > 3600 ? 0.03 : 0;
  const base =
    fraudType === "pbx_hacking"
      ? 0.92
      : fraudType === "sim_box"
        ? 0.88
        : fraudType === "subscription_fraud"
          ? 0.8
          : fraudType === "roaming_fraud"
            ? 0.77
            : fraudType === "interconnect_leakage"
              ? 0.74
              : 0.4;
  return Number(Math.min(0.99, base + deltaRatio * 0.15 + intlBoost + durationBoost).toFixed(2));
}

export function evaluateCdrForFraud(cdr: CdrRecord): FraudAlert | null {
  const ruleFraudType = classifyFraudType(cdr);
  const model = inferFraudFromModel(cdr);

  let fraudType = ruleFraudType;
  if (fraudType === "unknown" && model.predictedType !== "unknown" && model.score >= 0.7) {
    fraudType = model.predictedType;
  }

  if (fraudType === "unknown") {
    return null;
  }

  const severity = severityFor(cdr, fraudType);
  const baseConfidence = confidenceFor(cdr, fraudType);
  const confidence =
    model.enabled && model.predictedType === fraudType
      ? Number(Math.min(0.99, baseConfidence + model.score * 0.12).toFixed(2))
      : baseConfidence;
  const dedupeKey = `${cdr.tenantId}:${cdr.subscriberId}:${fraudType}:${new Date(cdr.eventTime).toISOString().slice(0, 13)}`;
  const modelHint =
    model.enabled && model.score > 0
      ? ` (ml score ${Math.round(model.score * 100)}%)`
      : "";

  return {
    id: createId("alert"),
    tenantId: cdr.tenantId,
    cdrId: cdr.id,
    title: `Potential ${fraudType.replaceAll("_", " ")}`,
    description: `Detected ${fraudType} pattern on subscriber ${cdr.subscriberId}${modelHint}`,
    fraudType,
    severity,
    confidence,
    dedupeKey,
    status: "new",
    createdAt: new Date().toISOString(),
  };
}

export function detectFraudBatch(cdrs: CdrRecord[]): FraudAlert[] {
  const alerts: FraudAlert[] = [];
  const chunkSize = 5000;
  for (let start = 0; start < cdrs.length; start += chunkSize) {
    const chunk = cdrs.slice(start, start + chunkSize);
    for (const cdr of chunk) {
      const evaluated = evaluateCdrForFraud(cdr);
      if (evaluated) {
        alerts.push(evaluated);
      }
    }
  }

  // Deduplicate in-memory by dedupe key for real-time suppression.
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.dedupeKey)) {
      return false;
    }
    seen.add(alert.dedupeKey);
    return true;
  });
}
