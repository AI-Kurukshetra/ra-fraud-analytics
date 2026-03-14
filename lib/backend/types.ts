export type Severity = "low" | "medium" | "high" | "critical";

export type FraudType =
  | "subscription_fraud"
  | "pbx_hacking"
  | "sim_box"
  | "roaming_fraud"
  | "interconnect_leakage"
  | "unknown";

export type CaseStatus = "open" | "investigating" | "resolved" | "closed";

export type CdrRecord = {
  id?: string;
  tenantId: string;
  subscriberId: string;
  imsi?: string;
  msisdn: string;
  callType: "voice" | "sms" | "data";
  originCountry: string;
  destinationCountry: string;
  durationSeconds: number;
  chargeAmount: number;
  billedAmount: number;
  eventTime: string;
  sourceSystem: "billing" | "mediation" | "network";
  cellId?: string;
  networkElementId?: string;
};

export type FraudAlert = {
  id: string;
  tenantId: string;
  cdrId?: string;
  title: string;
  description: string;
  fraudType: FraudType;
  severity: Severity;
  confidence: number;
  dedupeKey: string;
  status: "new" | "acknowledged" | "closed";
  createdAt: string;
};

export type ReconciliationItem = {
  id?: string;
  tenantId: string;
  recordKey: string;
  billedAmount: number;
  mediatedAmount: number;
  collectedAmount: number;
};

export type CaseItem = {
  id: string;
  tenantId: string;
  title: string;
  status: CaseStatus;
  assigneeUserId?: string;
  alertId?: string;
  revenueImpact: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type BillingConnectorType = "amdocs" | "oracle" | "ericsson" | "huawei";
