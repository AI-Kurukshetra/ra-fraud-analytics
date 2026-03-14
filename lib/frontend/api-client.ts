import type { CdrRecord, ReconciliationItem } from "@/lib/backend/types";
import type {
  AlertListItem,
  ApiEnvelope,
  AnalyticsKpis,
  AnalyticsTimelineItem,
  AuditEvent,
  BootstrapTenantResult,
  DashboardCard,
  BillingConnector,
  CaseListItem,
  CaseSummary,
  CdrIngestJob,
  CdrJobProcessResult,
  FraudModelStatus,
  ExistingCdrAnalysisResult,
  InterconnectResult,
  LineageEvent,
  ConnectorSyncResult,
  MembershipUser,
  NetworkElementItem,
  PartnerItem,
  QualityResult,
  QualityEvent,
  RecoveryMetrics,
  ReportRecord,
  ReconciliationResult,
  ReconciliationHistoryItem,
  RoamingResult,
  RuleItem,
  SettlementItem,
  SignupResult,
  TenantMembership,
  UserSession,
  WorkflowItem,
} from "@/lib/frontend/types";

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "REQUEST_FAILED", status = 500) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

type TenantParams = {
  tenantId: string;
};

async function request<T>(
  path: string,
  options: RequestInit & TenantParams,
): Promise<T> {
  const { tenantId, ...requestOptions } = options;
  const response = await fetch(path, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      ...(requestOptions.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !json || !json.success) {
    const message = json && !json.success ? json.error.message : "Unexpected API error";
    const code = json && !json.success ? json.error.code : "REQUEST_FAILED";
    throw new ApiClientError(message, code, response.status);
  }

  return json.data;
}

async function requestWithoutTenant<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !json || !json.success) {
    const message = json && !json.success ? json.error.message : "Unexpected API error";
    const code = json && !json.success ? json.error.code : "REQUEST_FAILED";
    throw new ApiClientError(message, code, response.status);
  }

  return json.data;
}

export const apiClient = {
  getMemberships: async () => {
    return requestWithoutTenant<{ memberships: TenantMembership[] }>("/api/v1/auth/memberships", {
      method: "GET",
    });
  },

  bootstrapTenant: async (payload: { tenantName: string; tenantSlug?: string }) => {
    return requestWithoutTenant<BootstrapTenantResult>("/api/v1/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  signup: async (payload: { email: string; password: string; tenantName: string; tenantSlug?: string }) => {
    return requestWithoutTenant<SignupResult>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getSession: async (tenantId: string) => {
    return request<UserSession>("/api/v1/auth/session", {
      method: "GET",
      tenantId,
    });
  },

  getUsers: async (tenantId: string) => {
    return request<{ users: MembershipUser[] }>("/api/v1/users", {
      method: "GET",
      tenantId,
    });
  },

  getAlerts: async (tenantId: string) => {
    return request<{ alerts: AlertListItem[] }>("/api/v1/alerts", {
      method: "GET",
      tenantId,
    });
  },

  updateAlertStatus: async (
    tenantId: string,
    payload: {
      id: string;
      status: "new" | "acknowledged" | "closed";
    },
  ) => {
    return request<{ alert: AlertListItem }>("/api/v1/alerts", {
      method: "PATCH",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  getCases: async (tenantId: string) => {
    return request<{ cases: CaseListItem[] }>("/api/v1/cases", {
      method: "GET",
      tenantId,
    });
  },

  getCasesWithSummary: async (tenantId: string) => {
    return request<{ cases: CaseListItem[]; summary?: CaseSummary }>("/api/v1/cases", {
      method: "GET",
      tenantId,
    });
  },

  createCase: async (
    tenantId: string,
    payload: {
      title: string;
      assigneeUserId?: string;
      alertId?: string;
      revenueImpact?: number;
      notes?: string;
    },
  ) => {
    return request<{ case: CaseListItem }>("/api/v1/cases", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  updateCase: async (
    tenantId: string,
    payload: {
      id: string;
      status?: string;
      assigneeUserId?: string;
      notes?: string;
      revenueImpact?: number;
    },
  ) => {
    return request<{ case: CaseListItem }>("/api/v1/cases", {
      method: "PATCH",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  ingestCdrs: async (tenantId: string, records: CdrRecord[]) => {
    return request<{
      inserted: number;
      alertsGenerated: number;
      quality: QualityResult;
    }>("/api/v1/cdrs/ingest", {
      method: "POST",
      tenantId,
      body: JSON.stringify({ records }),
    });
  },

  analyzeFraud: async (tenantId: string, records: CdrRecord[]) => {
    return request<{
      alerts: AlertListItem[];
      count: number;
    }>("/api/v1/fraud-detection/analyze", {
      method: "POST",
      tenantId,
      body: JSON.stringify({ records }),
    });
  },

  runReconciliation: async (tenantId: string, items: ReconciliationItem[]) => {
    return request<{
      results: ReconciliationResult[];
      count: number;
    }>("/api/v1/revenue-assurance/reconcile", {
      method: "POST",
      tenantId,
      body: JSON.stringify({ items }),
    });
  },

  getBillingSystems: async (tenantId: string) => {
    return request<{ connectors: BillingConnector[] }>("/api/v1/billing-systems", {
      method: "GET",
      tenantId,
    });
  },

  syncBillingSystems: async (tenantId: string) => {
    return request<{ syncResults: ConnectorSyncResult[] }>("/api/v1/billing-systems", {
      method: "POST",
      tenantId,
    });
  },

  getAnalytics: async (tenantId: string) => {
    return request<{ kpis: AnalyticsKpis }>("/api/v1/analytics", {
      method: "GET",
      tenantId,
    });
  },

  getAnalyticsWindow: async (tenantId: string, windowDays: number) => {
    return request<{
      kpis: AnalyticsKpis;
      timeline: AnalyticsTimelineItem[];
      recovery?: { recoveredAmount: number };
      distributions?: {
        alertsBySeverity: Record<string, number>;
        caseStatusBreakdown: Record<string, number>;
      };
    }>(`/api/v1/analytics?windowDays=${windowDays}`, {
      method: "GET",
      tenantId,
    });
  },

  getReports: async (tenantId: string) => {
    return request<{ reports: ReportRecord[] }>("/api/v1/reports", {
      method: "GET",
      tenantId,
    });
  },

  generateReport: async (tenantId: string, payload: { reportType: string }) => {
    return request<{ report: ReportRecord }>("/api/v1/reports", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  getCompliance: async (tenantId: string) => {
    return request<{
      auditEvents: AuditEvent[];
      qualityEvents: QualityEvent[];
      lineageEvents: LineageEvent[];
    }>("/api/v1/compliance", {
      method: "GET",
      tenantId,
    });
  },

  getReconciliationHistory: async (tenantId: string) => {
    return request<{ reconciliation: ReconciliationHistoryItem[] }>("/api/v1/reconciliation", {
      method: "GET",
      tenantId,
    });
  },

  getReconciliationSummary: async (tenantId: string, limit = 500) => {
    return request<{
      reconciliation: ReconciliationHistoryItem[];
      summary: {
        total: number;
        totalLeakageAmount: number;
        totalMismatchAmount: number;
        bySeverity: Record<string, number>;
      };
    }>(`/api/v1/reconciliation?limit=${limit}`, {
      method: "GET",
      tenantId,
    });
  },

  getPartners: async (tenantId: string) => {
    return request<{ partners: PartnerItem[] }>("/api/v1/partners", {
      method: "GET",
      tenantId,
    });
  },

  getNetworkElements: async (tenantId: string) => {
    return request<{ networkElements: NetworkElementItem[] }>("/api/v1/network-elements", {
      method: "GET",
      tenantId,
    });
  },

  getRules: async (tenantId: string) => {
    return request<{ rules: RuleItem[] }>("/api/v1/rules", {
      method: "GET",
      tenantId,
    });
  },

  getWorkflows: async (tenantId: string) => {
    return request<{ workflows: WorkflowItem[] }>("/api/v1/workflows", {
      method: "GET",
      tenantId,
    });
  },

  getSettlements: async (tenantId: string) => {
    return request<{ settlements: SettlementItem[] }>("/api/v1/settlements", {
      method: "GET",
      tenantId,
    });
  },

  getDashboards: async (tenantId: string) => {
    return request<{ cards: DashboardCard[] }>("/api/v1/dashboards", {
      method: "GET",
      tenantId,
    });
  },

  validateInterconnect: async (
    tenantId: string,
    payload: { partnerId: string; routeCode: string; expectedTariff: number; actualTariff: number; minutes: number },
  ) => {
    return request<{ result: InterconnectResult }>("/api/v1/revenue-assurance/interconnect", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  validateRoaming: async (
    tenantId: string,
    payload: {
      subscriberId: string;
      homeCountry: string;
      visitedCountry: string;
      billedAmount: number;
      expectedAmount: number;
      usageMb: number;
    },
  ) => {
    return request<{ result: RoamingResult }>("/api/v1/revenue-assurance/roaming", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  calculateRecovery: async (tenantId: string, payload: { estimatedLoss: number; recoveredAmount: number }) => {
    return request<{ metrics: RecoveryMetrics }>("/api/v1/revenue-assurance/recovery", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  enqueueCdrIngestJob: async (
    tenantId: string,
    payload: { records: CdrRecord[]; priority?: number; maxAttempts?: number },
  ) => {
    return request<{ job: CdrIngestJob }>("/api/v1/cdrs/ingest-async", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload),
    });
  },

  listCdrIngestJobs: async (
    tenantId: string,
    params?: { status?: CdrIngestJob["status"]; limit?: number },
  ) => {
    const search = new URLSearchParams();
    if (params?.status) {
      search.set("status", params.status);
    }
    if (typeof params?.limit === "number") {
      search.set("limit", String(params.limit));
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<{ jobs: CdrIngestJob[] }>(`/api/v1/cdrs/ingest-async${suffix}`, {
      method: "GET",
      tenantId,
    });
  },

  processCdrJobs: async (tenantId: string, payload?: { maxJobs?: number; workerId?: string }) => {
    return request<CdrJobProcessResult>("/api/v1/cdrs/jobs/process", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload ?? {}),
    });
  },

  getFraudModelStatus: async (tenantId: string) => {
    return request<FraudModelStatus>("/api/v1/fraud-detection/model", {
      method: "GET",
      tenantId,
    });
  },

  analyzeExistingCdrs: async (
    tenantId: string,
    payload?: {
      limit?: number;
      sourceSystem?: "billing" | "mediation" | "network";
      dateFrom?: string;
      dateTo?: string;
    },
  ) => {
    return request<ExistingCdrAnalysisResult>("/api/v1/cdrs/analyze-existing", {
      method: "POST",
      tenantId,
      body: JSON.stringify(payload ?? {}),
    });
  },
};
