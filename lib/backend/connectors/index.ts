import { AmdocsConnector } from "@/lib/backend/connectors/amdocs";
import { OracleBillingConnector } from "@/lib/backend/connectors/oracle";

const connectors = [new AmdocsConnector(), new OracleBillingConnector()];

export function listConnectors() {
  return connectors.map((connector) => ({ name: connector.name }));
}

export async function syncAllConnectors(tenantId: string) {
  return Promise.all(connectors.map((connector) => connector.sync(tenantId)));
}
