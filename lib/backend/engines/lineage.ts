export function buildLineageEvent(params: {
  tenantId: string;
  sourceSystem: string;
  dataset: string;
  operation: "ingest" | "transform" | "reconcile" | "detect";
  recordCount: number;
}) {
  return {
    tenant_id: params.tenantId,
    source_system: params.sourceSystem,
    dataset: params.dataset,
    operation: params.operation,
    record_count: params.recordCount,
    processed_at: new Date().toISOString(),
  };
}
