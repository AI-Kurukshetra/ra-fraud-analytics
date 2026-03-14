import type { BillingConnector } from "@/lib/backend/connectors/types";

export class OracleBillingConnector implements BillingConnector {
  name = "oracle";
  descriptor = {
    name: this.name,
    vendor: "Oracle" as const,
    supportsRealtime: false,
    supportsMobileMonitoring: true,
    supportsReportDistribution: true,
    health: "degraded" as const,
  };

  async sync(tenantId: string, options?: { dryRun?: boolean }) {
    const dryRun = Boolean(options?.dryRun);
    return {
      connector: this.name,
      vendor: this.descriptor.vendor,
      status: "success" as const,
      recordsPulled: dryRun ? 980 : 943,
      syncedAt: new Date().toISOString(),
      latencyMs: 520,
      dryRun,
      details: dryRun
        ? `Oracle Billing dry-run completed for tenant ${tenantId}`
        : `Oracle Billing sync completed for tenant ${tenantId}`,
    };
  }
}
