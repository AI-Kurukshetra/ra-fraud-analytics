import { AmdocsConnector } from "@/lib/backend/connectors/amdocs";
import { EricssonConnector } from "@/lib/backend/connectors/ericsson";
import { HuaweiConnector } from "@/lib/backend/connectors/huawei";
import { OracleBillingConnector } from "@/lib/backend/connectors/oracle";
import type { BillingConnector } from "@/lib/backend/connectors/types";

const connectors: BillingConnector[] = [
  new AmdocsConnector(),
  new OracleBillingConnector(),
  new EricssonConnector(),
  new HuaweiConnector(),
];

export function listConnectors() {
  return connectors.map((connector) => connector.descriptor);
}

export async function syncAllConnectors(
  tenantId: string,
  options?: { dryRun?: boolean; connectorNames?: string[] },
) {
  const names = new Set((options?.connectorNames ?? []).map((name) => name.toLowerCase()));
  const selected =
    names.size === 0
      ? connectors
      : connectors.filter((connector) => names.has(connector.name.toLowerCase()));

  return Promise.all(selected.map((connector) => connector.sync(tenantId, { dryRun: options?.dryRun })));
}

export function listConnectorNames() {
  return connectors.map((connector) => connector.name);
}
