import { withAuth } from "@/lib/backend/auth/handler";
import { loadFraudModel } from "@/lib/backend/ml/model-loader";
import { jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async () => {
    const model = loadFraudModel();
    if (!model) {
      return jsonOk({
        enabled: process.env.FRAUD_MODEL_ENABLED !== "false",
        available: false,
      });
    }

    return jsonOk({
      enabled: process.env.FRAUD_MODEL_ENABLED !== "false",
      available: true,
      version: model.version,
      trainedAt: model.trainedAt,
      classes: model.classes,
      featureCount: model.featureNames.length,
    });
  }, { allowedRoles: ["owner", "admin", "analyst", "viewer"] });
}
