import type { CdrRecord, FraudType } from "@/lib/backend/types";
import { fraudFeatureVector } from "@/lib/backend/ml/features";
import { loadFraudModel } from "@/lib/backend/ml/model-loader";
import type { FraudModelClass, FraudModelPrediction } from "@/lib/backend/ml/types";

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function inferFraudFromModel(cdr: CdrRecord): FraudModelPrediction {
  const enabled = process.env.FRAUD_MODEL_ENABLED !== "false";
  if (!enabled) {
    return {
      enabled: false,
      predictedType: "unknown",
      score: 0,
      classScores: {},
      reason: "FRAUD_MODEL_ENABLED=false",
    };
  }

  const model = loadFraudModel();
  if (!model) {
    return {
      enabled: false,
      predictedType: "unknown",
      score: 0,
      classScores: {},
      reason: "model_missing_or_invalid",
    };
  }

  const features = fraudFeatureVector(cdr);
  const classScores: Partial<Record<FraudModelClass, number>> = {};

  let bestClass: FraudModelClass | null = null;
  let bestScore = 0;

  for (const klass of model.classes) {
    const weights = model.weights[klass] ?? [];
    const bias = model.bias[klass] ?? 0;

    let logit = bias;
    for (let i = 0; i < model.featureNames.length; i += 1) {
      const fname = model.featureNames[i];
      const w = weights[i] ?? 0;
      const x = features[fname] ?? 0;
      logit += w * x;
    }

    const score = clamp01(sigmoid(logit));
    classScores[klass] = Number(score.toFixed(4));

    if (score > bestScore) {
      bestScore = score;
      bestClass = klass;
    }
  }

  if (!bestClass) {
    return {
      enabled: true,
      predictedType: "unknown",
      score: 0,
      classScores,
      reason: "no_classes",
    };
  }

  const threshold = model.thresholds[bestClass] ?? 0.65;
  const predictedType: FraudType = bestScore >= threshold ? bestClass : "unknown";

  return {
    enabled: true,
    predictedType,
    score: Number(bestScore.toFixed(4)),
    classScores,
  };
}
