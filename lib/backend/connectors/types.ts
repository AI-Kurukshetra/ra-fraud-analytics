export type ConnectorSyncResult = {
  connector: string;
  vendor: "Amdocs" | "Oracle" | "Ericsson" | "Huawei";
  status: "success" | "failed";
  recordsPulled: number;
  syncedAt: string;
  details?: string;
  latencyMs?: number;
  dryRun?: boolean;
};

export type ConnectorDescriptor = {
  name: string;
  vendor: "Amdocs" | "Oracle" | "Ericsson" | "Huawei";
  supportsRealtime: boolean;
  supportsMobileMonitoring: boolean;
  supportsReportDistribution: boolean;
  health: "healthy" | "degraded" | "down";
};

export interface BillingConnector {
  name: string;
  descriptor: ConnectorDescriptor;
  sync(tenantId: string, options?: { dryRun?: boolean }): Promise<ConnectorSyncResult>;
}
