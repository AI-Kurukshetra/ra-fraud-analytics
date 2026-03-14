export type ConnectorSyncResult = {
  connector: string;
  status: "success" | "failed";
  recordsPulled: number;
  syncedAt: string;
  details?: string;
};

export interface BillingConnector {
  name: string;
  sync(tenantId: string): Promise<ConnectorSyncResult>;
}
