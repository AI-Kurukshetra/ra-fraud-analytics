import type { CdrRecord } from "@/lib/backend/types";

export function runDataQualityChecks(records: CdrRecord[]) {
  const checks = {
    total: records.length,
    missingMsisdn: 0,
    invalidDuration: 0,
    negativeAmounts: 0,
  };

  for (const record of records) {
    if (!record.msisdn) {
      checks.missingMsisdn += 1;
    }
    if (record.durationSeconds < 0) {
      checks.invalidDuration += 1;
    }
    if (record.chargeAmount < 0 || record.billedAmount < 0) {
      checks.negativeAmounts += 1;
    }
  }

  return {
    ...checks,
    qualityScore: Number(
      (
        ((checks.total - checks.missingMsisdn - checks.invalidDuration - checks.negativeAmounts) /
          Math.max(1, checks.total)) *
        100
      ).toFixed(2),
    ),
  };
}
