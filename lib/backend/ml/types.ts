import type { FraudType } from "@/lib/backend/types";

export type FraudModelClass = Exclude<FraudType, "unknown">;

export type FraudModelV1 = {
  version: "v1";
  trainedAt: string;
  classes: FraudModelClass[];
  featureNames: string[];
  thresholds: Partial<Record<FraudModelClass, number>>;
  weights: Record<FraudModelClass, number[]>;
  bias: Record<FraudModelClass, number>;
};

export type FraudModelPrediction = {
  enabled: boolean;
  predictedType: FraudType;
  score: number;
  classScores: Partial<Record<FraudModelClass, number>>;
  reason?: string;
};
