import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FraudModelV1 } from "@/lib/backend/ml/types";

let cachedPath: string | null = null;
let cachedModel: FraudModelV1 | null = null;

function defaultModelPath() {
  return join(process.cwd(), "models", "fraud-model-v1.json");
}

function isFraudModelV1(value: unknown): value is FraudModelV1 {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return (
    model.version === "v1" &&
    Array.isArray(model.classes) &&
    Array.isArray(model.featureNames) &&
    typeof model.weights === "object" &&
    typeof model.bias === "object"
  );
}

export function loadFraudModel(): FraudModelV1 | null {
  const modelPath = process.env.FRAUD_MODEL_PATH?.trim() || defaultModelPath();

  if (cachedPath === modelPath) {
    return cachedModel;
  }

  cachedPath = modelPath;
  cachedModel = null;

  if (!existsSync(modelPath)) {
    return null;
  }

  try {
    const text = readFileSync(modelPath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isFraudModelV1(parsed)) {
      return null;
    }
    cachedModel = parsed;
    return cachedModel;
  } catch {
    return null;
  }
}
