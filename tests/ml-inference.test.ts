import { describe, expect, it } from "vitest";
import { inferFraudFromModel } from "../lib/backend/ml/inference";

describe("inferFraudFromModel", () => {
  it("returns disabled=false with unknown when model missing", () => {
    const prevPath = process.env.FRAUD_MODEL_PATH;
    const prevEnabled = process.env.FRAUD_MODEL_ENABLED;
    process.env.FRAUD_MODEL_ENABLED = "true";
    process.env.FRAUD_MODEL_PATH = "/tmp/non-existent-fraud-model.json";

    const result = inferFraudFromModel({
      tenantId: "t1",
      subscriberId: "s1",
      msisdn: "123",
      callType: "voice",
      originCountry: "IN",
      destinationCountry: "US",
      durationSeconds: 10,
      chargeAmount: 2,
      billedAmount: 2,
      eventTime: new Date().toISOString(),
      sourceSystem: "billing",
    });

    expect(result.enabled).toBe(false);
    expect(result.predictedType).toBe("unknown");

    process.env.FRAUD_MODEL_PATH = prevPath;
    process.env.FRAUD_MODEL_ENABLED = prevEnabled;
  });
});
