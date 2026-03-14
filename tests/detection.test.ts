import { describe, expect, it } from "vitest";
import { detectFraudBatch } from "../lib/backend/engines/detection";

describe("detectFraudBatch", () => {
  it("detects pbx hacking pattern", () => {
    const alerts = detectFraudBatch([
      {
        tenantId: "t1",
        subscriberId: "s1",
        msisdn: "123",
        callType: "voice",
        originCountry: "IN",
        destinationCountry: "IN",
        durationSeconds: 9000,
        chargeAmount: 100,
        billedAmount: 20,
        eventTime: new Date().toISOString(),
        sourceSystem: "billing",
      },
    ]);

    expect(alerts.length).toBe(1);
    expect(alerts[0]?.fraudType).toBe("pbx_hacking");
    expect(alerts[0]?.severity).toBe("critical");
  });

  it("deduplicates same pattern keys", () => {
    const now = new Date().toISOString();
    const alerts = detectFraudBatch([
      {
        tenantId: "t1",
        subscriberId: "same",
        msisdn: "123",
        callType: "data",
        originCountry: "IN",
        destinationCountry: "IN",
        durationSeconds: 10,
        chargeAmount: 0,
        billedAmount: 20,
        eventTime: now,
        sourceSystem: "billing",
      },
      {
        tenantId: "t1",
        subscriberId: "same",
        msisdn: "123",
        callType: "data",
        originCountry: "IN",
        destinationCountry: "IN",
        durationSeconds: 12,
        chargeAmount: 0,
        billedAmount: 25,
        eventTime: now,
        sourceSystem: "billing",
      },
    ]);

    expect(alerts.length).toBe(1);
  });
});
