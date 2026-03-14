import type { BillingConnector } from "@/lib/backend/connectors/types";

export class HuaweiConnector implements BillingConnector {
  name = "huawei";
  descriptor = {
    name: this.name,
    vendor: "Huawei" as const,
    supportsRealtime: true,
    supportsMobileMonitoring: true,
    supportsReportDistribution: false,
    health: "degraded" as const,
  };

  async sync(tenantId: string, options?: { dryRun?: boolean }) {
    const dryRun = Boolean(options?.dryRun);
    return {
      connector: this.name,
      vendor: this.descriptor.vendor,
      status: "success" as const,
      recordsPulled: dryRun ? 705 : 681,
      syncedAt: new Date().toISOString(),
      latencyMs: 610,
      dryRun,
      details: dryRun
        ? `Huawei mediation dry-run completed for tenant ${tenantId}`
        : `Huawei mediation sync completed for tenant ${tenantId}`,
    };
  }
}
