import type { BillingConnector } from "@/lib/backend/connectors/types";

export class EricssonConnector implements BillingConnector {
  name = "ericsson";
  descriptor = {
    name: this.name,
    vendor: "Ericsson" as const,
    supportsRealtime: true,
    supportsMobileMonitoring: true,
    supportsReportDistribution: false,
    health: "healthy" as const,
  };

  async sync(tenantId: string, options?: { dryRun?: boolean }) {
    const dryRun = Boolean(options?.dryRun);
    return {
      connector: this.name,
      vendor: this.descriptor.vendor,
      status: "success" as const,
      recordsPulled: dryRun ? 760 : 742,
      syncedAt: new Date().toISOString(),
      latencyMs: 410,
      dryRun,
      details: dryRun
        ? `Ericsson mediation dry-run completed for tenant ${tenantId}`
        : `Ericsson mediation sync completed for tenant ${tenantId}`,
    };
  }
}
