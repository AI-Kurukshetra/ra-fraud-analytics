import { withAuth } from "@/lib/backend/auth/handler";
import { jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async () => {
    return jsonOk({
      cards: [
        { id: "leakage-rate", title: "Leakage Rate", widget: "timeseries" },
        { id: "fraud-alerts", title: "Fraud Alerts", widget: "severity-distribution" },
        { id: "recovery", title: "Revenue Recovery", widget: "kpi" },
      ],
    });
  });
}
