import type { ApiResponse } from "@/lib/backend/contracts/http";

export type UserSession = {
  user: {
    id: string;
    email?: string;
  };
  tenantId: string;
  role: string;
};

export type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
  isActive: boolean;
};

export type BootstrapTenantResult = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    role: string;
    isActive: boolean;
  };
  created: boolean;
};

export type SignupResult = {
  user: {
    id: string;
    email: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    role: string;
    isActive: boolean;
  };
};

export type MembershipUser = {
  user_id: string;
  role: string;
  is_active: boolean;
};

export type AlertListItem = {
  id: string;
  title: string;
  description: string;
  fraud_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  status: "new" | "acknowledged" | "closed";
  created_at: string;
};

export type CaseListItem = {
  id: string;
  title: string;
  status: "open" | "investigating" | "resolved" | "closed";
  assignee_user_id: string | null;
  alert_id: string | null;
  revenue_impact: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CaseSummary = {
  statusBreakdown: Record<string, number>;
  recoveryImpact: number;
};

export type ReconciliationResult = {
  recordKey: string;
  mismatchAmount: number;
  leakageAmount: number;
  severity: "low" | "medium" | "high" | "critical";
  status: "matched" | "mismatch";
};

export type QualityResult = {
  validCount: number;
  invalidCount: number;
  issues: Array<{
    type: string;
    count: number;
  }>;
};

export type ApiEnvelope<T> = ApiResponse<T>;

export type ApiHealthItem = {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastCheckedAt: string;
  errorRate: number;
};

export type ReportJob = {
  id: string;
  name: string;
  type: "compliance" | "leakage" | "fraud" | "executive";
  frequency: "on-demand" | "daily" | "weekly" | "monthly";
  status: "queued" | "running" | "completed" | "failed";
  generatedAt: string;
};

export type LineageNode = {
  id: string;
  dataset: string;
  sourceSystem: string;
  operation: string;
  recordCount: number;
  timestamp: string;
};

export type AnalyticsKpis = {
  cdrCount: number;
  alertCount: number;
  caseCount: number;
};

export type AnalyticsTimelineItem = {
  date: string;
  alerts: number;
  cases: number;
  reconciliations: number;
  leakage: number;
};

export type ReportRecord = {
  id: string;
  report_type: string;
  status: string;
  generated_at: string;
  payload: Record<string, unknown>;
};

export type AuditEvent = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
};

export type QualityEvent = {
  id: string;
  quality_score: number;
  checked_count: number;
  failed_count: number;
  created_at: string;
};

export type LineageEvent = {
  id: string;
  source_system: string;
  dataset: string;
  operation: string;
  record_count: number;
  processed_at: string;
};

export type ReconciliationHistoryItem = {
  id: string;
  record_key: string;
  mismatch_amount: number;
  leakage_amount: number;
  severity: "low" | "medium" | "high" | "critical";
  status: "matched" | "mismatch";
  created_at: string;
};

export type PartnerItem = {
  id: string;
  name: string;
  partner_type: string;
  status: string;
  created_at: string;
};

export type NetworkElementItem = {
  id: string;
  element_code: string;
  element_type: string;
  region: string;
  status: string;
  anomaly_score: number;
  revenue_impact: number;
};

export type RuleItem = {
  id: string;
  rule_name: string;
  rule_type: string;
  is_active: boolean;
  threshold: number;
  created_at: string;
};

export type WorkflowItem = {
  id: string;
  workflow_name: string;
  workflow_type: string;
  is_active: boolean;
  updated_at: string;
};

export type SettlementItem = {
  id: string;
  partner_id: string | null;
  period_start: string;
  period_end: string;
  amount_due: number;
  amount_paid: number;
  status: string;
};

export type DashboardCard = {
  id: string;
  title: string;
  widget: string;
};

export type InterconnectResult = {
  partnerId: string;
  routeCode: string;
  expectedTariff: number;
  actualTariff: number;
  variance: number;
  revenueImpact: number;
  status: "valid" | "invalid";
};

export type RoamingResult = {
  subscriberId: string;
  homeCountry: string;
  visitedCountry: string;
  deviationAmount: number;
  status: "valid" | "suspicious";
  reason?: string;
};

export type RecoveryMetrics = {
  estimatedLoss: number;
  recoveredAmount: number;
  preventedLoss: number;
  recoveryRate: number;
};

export type BillingConnector = {
  name: string;
};

export type ConnectorSyncResult = {
  connector: string;
  status: "success" | "failed";
  recordsPulled: number;
  syncedAt: string;
  details?: string;
};

export type CdrIngestJob = {
  id: string;
  tenantId: string;
  status: "pending" | "processing" | "completed" | "failed";
  priority: number;
  recordCount: number;
  attempts: number;
  maxAttempts: number;
  workerId: string | null;
  createdBy: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CdrJobProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  workerId: string;
};

export type FraudModelStatus = {
  enabled: boolean;
  available: boolean;
  version?: string;
  trainedAt?: string;
  classes?: string[];
  featureCount?: number;
};

export type ExistingCdrAnalysisResult = {
  scanned: number;
  alertsGenerated: number;
  byFraudType: Record<string, number>;
};
