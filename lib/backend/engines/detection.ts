import type { CdrRecord, FraudAlert, FraudType, Severity } from "@/lib/backend/types";
import { createId } from "@/lib/backend/utils/id";

function classifyFraudType(cdr: CdrRecord): FraudType {
  if (cdr.callType === "voice" && cdr.durationSeconds > 7200) {
    return "pbx_hacking";
  }
  if (cdr.callType === "voice" && cdr.originCountry !== cdr.destinationCountry && cdr.durationSeconds < 5) {
    return "sim_box";
  }
  if (cdr.callType === "data" && cdr.chargeAmount === 0 && cdr.billedAmount > 0) {
    return "subscription_fraud";
  }
  if (cdr.originCountry !== cdr.destinationCountry && cdr.billedAmount > cdr.chargeAmount * 2) {
    return "roaming_fraud";
  }
  if (cdr.billedAmount < cdr.chargeAmount) {
    return "interconnect_leakage";
  }
  return "unknown";
}

function severityFor(cdr: CdrRecord, fraudType: FraudType): Severity {
  const delta = Math.abs(cdr.chargeAmount - cdr.billedAmount);
  if (fraudType === "pbx_hacking" || delta > 1000) {
    return "critical";
  }
  if (fraudType === "sim_box" || delta > 300) {
    return "high";
  }
  if (fraudType === "subscription_fraud" || delta > 100) {
    return "medium";
  }
  return "low";
}

function confidenceFor(cdr: CdrRecord, fraudType: FraudType): number {
  const deltaRatio = cdr.chargeAmount === 0 ? 1 : Math.min(1, Math.abs(cdr.chargeAmount - cdr.billedAmount) / cdr.chargeAmount);
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
  return Number(Math.min(0.99, base + deltaRatio * 0.15).toFixed(2));
}

export function evaluateCdrForFraud(cdr: CdrRecord): FraudAlert | null {
  const fraudType = classifyFraudType(cdr);
  if (fraudType === "unknown") {
    return null;
  }

  const severity = severityFor(cdr, fraudType);
  const confidence = confidenceFor(cdr, fraudType);
  const dedupeKey = `${cdr.tenantId}:${cdr.subscriberId}:${fraudType}:${new Date(cdr.eventTime).toISOString().slice(0, 13)}`;

  return {
    id: createId("alert"),
    tenantId: cdr.tenantId,
    cdrId: cdr.id,
    title: `Potential ${fraudType.replaceAll("_", " ")}`,
    description: `Detected ${fraudType} pattern on subscriber ${cdr.subscriberId}`,
    fraudType,
    severity,
    confidence,
    dedupeKey,
    status: "new",
    createdAt: new Date().toISOString(),
  };
}

export function detectFraudBatch(cdrs: CdrRecord[]): FraudAlert[] {
  const alerts = cdrs
    .map((cdr) => evaluateCdrForFraud(cdr))
    .filter((alert): alert is FraudAlert => Boolean(alert));

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
