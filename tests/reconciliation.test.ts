import { describe, expect, it } from "vitest";
import { reconcile } from "../lib/backend/engines/reconciliation";

describe("reconcile", () => {
  it("marks mismatch when billed and mediated differ", () => {
    const results = reconcile([
      {
        tenantId: "t1",
        recordKey: "r1",
        billedAmount: 1000,
        mediatedAmount: 800,
        collectedAmount: 700,
      },
    ]);

    expect(results[0]?.status).toBe("mismatch");
    expect(results[0]?.leakageAmount).toBe(500);
    expect(results[0]?.severity).toBe("high");
  });

  it("marks matched when no leakage", () => {
    const results = reconcile([
      {
        tenantId: "t1",
        recordKey: "r2",
        billedAmount: 100,
        mediatedAmount: 100,
        collectedAmount: 100,
      },
    ]);

    expect(results[0]?.status).toBe("matched");
    expect(results[0]?.leakageAmount).toBe(0);
  });
});
