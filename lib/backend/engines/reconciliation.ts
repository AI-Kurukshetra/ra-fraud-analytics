import type { ReconciliationItem, Severity } from "@/lib/backend/types";

export type ReconciliationResult = {
  recordKey: string;
  mismatchAmount: number;
  leakageAmount: number;
  severity: Severity;
  status: "matched" | "mismatch";
};

export function reconcile(items: ReconciliationItem[]): ReconciliationResult[] {
  return items.map((item) => {
    const expected = item.mediatedAmount;
    const actual = item.billedAmount;
    const collectedGap = Math.max(0, item.billedAmount - item.collectedAmount);
    const mismatchAmount = Number(Math.abs(expected - actual).toFixed(2));
    const leakageAmount = Number((mismatchAmount + collectedGap).toFixed(2));

    let severity: Severity = "low";
    if (leakageAmount > 1000) {
      severity = "critical";
    } else if (leakageAmount > 500) {
      severity = "high";
    } else if (leakageAmount > 100) {
      severity = "medium";
    }

    return {
      recordKey: item.recordKey,
      mismatchAmount,
      leakageAmount,
      severity,
      status: leakageAmount > 0 ? "mismatch" : "matched",
    };
  });
}
