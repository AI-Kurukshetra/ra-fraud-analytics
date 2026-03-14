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
    const billedVsMediated = Math.abs(item.billedAmount - item.mediatedAmount);
    const billedVsCollected = Math.max(0, item.billedAmount - item.collectedAmount);
    const mediatedVsCollected = Math.max(0, item.mediatedAmount - item.collectedAmount);
    const mismatchAmount = Number(billedVsMediated.toFixed(2));
    const leakageAmount = Number((Math.max(billedVsCollected, mediatedVsCollected) + billedVsMediated).toFixed(2));

    let severity: Severity = "low";
    if (leakageAmount >= 1000) {
      severity = "critical";
    } else if (leakageAmount >= 300) {
      severity = "high";
    } else if (leakageAmount >= 50) {
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
