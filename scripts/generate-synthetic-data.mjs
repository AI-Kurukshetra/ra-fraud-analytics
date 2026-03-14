#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "sample-data", "teleguard-pro");
const outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : DEFAULT_OUTPUT_DIR;

const anchor = new Date();
anchor.setUTCMinutes(0, 0, 0);

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260314);

function rand() {
  return random();
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 2) {
  return Number((min + rand() * (max - min)).toFixed(decimals));
}

function chance(probability) {
  return rand() < probability;
}

function pick(items) {
  return items[randInt(0, items.length - 1)];
}

function weightedPick(options) {
  const total = options.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rand() * total;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) {
      return option.value;
    }
  }
  return options[options.length - 1]?.value;
}

function iso(value) {
  return new Date(value).toISOString();
}

function dateOnly(value) {
  return iso(value).slice(0, 10);
}

function shift(date, { days = 0, hours = 0, minutes = 0 } = {}) {
  return new Date(
    date.getTime() +
      days * 24 * 60 * 60 * 1000 +
      hours * 60 * 60 * 1000 +
      minutes * 60 * 1000,
  );
}

function randomBetween(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return new Date(startMs + Math.floor(rand() * (endMs - startMs)));
}

function pad(value, size = 3) {
  return String(value).padStart(size, "0");
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

const idCounters = new Map();

function nextUuid(namespace) {
  const nextValue = (idCounters.get(namespace) ?? 0) + 1;
  idCounters.set(namespace, nextValue);
  return `${namespace}-0000-4000-8000-${nextValue.toString(16).padStart(12, "0")}`;
}

const textCounters = new Map();

function nextTextId(prefix) {
  const nextValue = (textCounters.get(prefix) ?? 0) + 1;
  textCounters.set(prefix, nextValue);
  return `${prefix}_${pad(nextValue, 4)}`;
}

function scalar(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value) {
  const text = scalar(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const manifest = [];

function writeCsv(relativePath, rows, headers) {
  const filePath = path.join(outputDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const orderedHeaders = headers ?? Object.keys(rows[0] ?? {});
  const lines = [orderedHeaders.join(",")];
  for (const row of rows) {
    lines.push(orderedHeaders.map((header) => escapeCsv(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  manifest.push({
    path: relativePath,
    row_count: rows.length,
    category: relativePath.split(path.sep)[0] || "root",
  });
}

const countryInfo = {
  IN: { name: "India", currency: "INR", callingCode: "91", imsiPrefix: "40445", timezone: "Asia/Kolkata" },
  AE: {
    name: "United Arab Emirates",
    currency: "AED",
    callingCode: "971",
    imsiPrefix: "42403",
    timezone: "Asia/Dubai",
  },
  US: { name: "United States", currency: "USD", callingCode: "1", imsiPrefix: "31026", timezone: "America/New_York" },
  GB: { name: "United Kingdom", currency: "GBP", callingCode: "44", imsiPrefix: "23415", timezone: "Europe/London" },
  SG: { name: "Singapore", currency: "SGD", callingCode: "65", imsiPrefix: "52501", timezone: "Asia/Singapore" },
  SA: { name: "Saudi Arabia", currency: "SAR", callingCode: "966", imsiPrefix: "42001", timezone: "Asia/Riyadh" },
};

const connectorCatalog = [
  {
    name: "amdocs",
    vendor: "Amdocs",
    supportsRealtime: true,
    supportsMobileMonitoring: true,
    supportsReportDistribution: true,
    health: "healthy",
    latencyMs: 340,
    recordsPulled: 1187,
  },
  {
    name: "oracle",
    vendor: "Oracle",
    supportsRealtime: false,
    supportsMobileMonitoring: true,
    supportsReportDistribution: true,
    health: "degraded",
    latencyMs: 520,
    recordsPulled: 943,
  },
  {
    name: "ericsson",
    vendor: "Ericsson",
    supportsRealtime: true,
    supportsMobileMonitoring: true,
    supportsReportDistribution: false,
    health: "healthy",
    latencyMs: 410,
    recordsPulled: 742,
  },
  {
    name: "huawei",
    vendor: "Huawei",
    supportsRealtime: true,
    supportsMobileMonitoring: true,
    supportsReportDistribution: false,
    health: "degraded",
    latencyMs: 610,
    recordsPulled: 681,
  },
];

const roles = [
  {
    role_name: "owner",
    description: "Full tenant administration with bootstrap, RBAC, and connector sync access.",
    permissions_json: ["tenant_manage", "user_manage", "view_dashboards", "generate_reports", "run_connectors"],
  },
  {
    role_name: "admin",
    description: "Operational administration for fraud, reconciliation, and reporting.",
    permissions_json: ["user_view", "cdr_ingest", "alert_manage", "case_manage", "report_generate"],
  },
  {
    role_name: "analyst",
    description: "Day-to-day investigation and analytics execution role.",
    permissions_json: ["cdr_ingest", "fraud_analyze", "reconcile", "alert_view", "case_manage", "report_generate"],
  },
  {
    role_name: "viewer",
    description: "Read-only dashboard and report access.",
    permissions_json: ["view_dashboards", "view_reports", "view_analytics"],
  },
];

const tenants = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    key: "demo",
    code: "DEM",
    name: "Demo Telecom",
    slug: "demo-telecom",
    status: "active",
    homeCountry: "IN",
    createdAt: iso(shift(anchor, { days: -180 })),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    key: "northstar",
    code: "NST",
    name: "NorthStar Wireless",
    slug: "northstar-wireless",
    status: "active",
    homeCountry: "AE",
    createdAt: iso(shift(anchor, { days: -140 })),
  },
];

const dashboardCards = [
  { channel: "web", id: "leakage-rate", title: "Leakage Rate", widget: "timeseries", priority: "high" },
  { channel: "web", id: "fraud-alerts", title: "Fraud Alerts", widget: "severity-distribution", priority: "high" },
  { channel: "web", id: "recovery", title: "Revenue Recovery", widget: "kpi", priority: "medium" },
  { channel: "web", id: "network-anomaly", title: "Network Anomaly", widget: "heatmap", priority: "medium" },
  { channel: "mobile", id: "mobile-critical-alerts", title: "Critical Alerts", widget: "counter", priority: "high" },
  { channel: "mobile", id: "mobile-open-cases", title: "Open Cases", widget: "counter", priority: "high" },
  { channel: "mobile", id: "mobile-recovery", title: "Recovery", widget: "kpi", priority: "medium" },
];

const locationDefinitions = [
  {
    tenantKey: "demo",
    site_name: "Ahmedabad NOC",
    city: "Ahmedabad",
    region: "west",
    country_code: "IN",
    latitude: 23.0225,
    longitude: 72.5714,
  },
  {
    tenantKey: "demo",
    site_name: "Mumbai Switch Center",
    city: "Mumbai",
    region: "west",
    country_code: "IN",
    latitude: 19.076,
    longitude: 72.8777,
  },
  {
    tenantKey: "demo",
    site_name: "Delhi Mediation Hub",
    city: "Delhi",
    region: "north",
    country_code: "IN",
    latitude: 28.6139,
    longitude: 77.209,
  },
  {
    tenantKey: "demo",
    site_name: "Bengaluru 5G Core",
    city: "Bengaluru",
    region: "south",
    country_code: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
  },
  {
    tenantKey: "northstar",
    site_name: "Dubai Command Center",
    city: "Dubai",
    region: "north",
    country_code: "AE",
    latitude: 25.2048,
    longitude: 55.2708,
  },
  {
    tenantKey: "northstar",
    site_name: "Abu Dhabi Billing Hub",
    city: "Abu Dhabi",
    region: "west",
    country_code: "AE",
    latitude: 24.4539,
    longitude: 54.3773,
  },
  {
    tenantKey: "northstar",
    site_name: "Sharjah Mediation Edge",
    city: "Sharjah",
    region: "north",
    country_code: "AE",
    latitude: 25.3463,
    longitude: 55.4209,
  },
  {
    tenantKey: "northstar",
    site_name: "Al Ain Roaming Desk",
    city: "Al Ain",
    region: "south",
    country_code: "AE",
    latitude: 24.1302,
    longitude: 55.8023,
  },
  {
    tenantKey: "",
    site_name: "Singapore Interconnect POP",
    city: "Singapore",
    region: "apac",
    country_code: "SG",
    latitude: 1.3521,
    longitude: 103.8198,
  },
  {
    tenantKey: "",
    site_name: "London Transit POP",
    city: "London",
    region: "europe",
    country_code: "GB",
    latitude: 51.5072,
    longitude: -0.1276,
  },
  {
    tenantKey: "",
    site_name: "New York Fraud Intel POP",
    city: "New York",
    region: "americas",
    country_code: "US",
    latitude: 40.7128,
    longitude: -74.006,
  },
];

const locations = locationDefinitions.map((location) => {
  const tenant = tenants.find((item) => item.key === location.tenantKey);
  const country = countryInfo[location.country_code];
  return {
    location_id: `loc_${location.site_name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    tenant_id: tenant?.id ?? "",
    site_name: location.site_name,
    city: location.city,
    region: location.region,
    country_code: location.country_code,
    country_name: country.name,
    latitude: location.latitude,
    longitude: location.longitude,
    time_zone: country.timezone,
  };
});

const locationsByTenant = new Map();
for (const location of locations) {
  if (!location.tenant_id) continue;
  const rows = locationsByTenant.get(location.tenant_id) ?? [];
  rows.push(location);
  locationsByTenant.set(location.tenant_id, rows);
}

const networkDefinitions = [
  { tenantKey: "demo", network_code: "DEM-LTE", network_name: "Demo Telecom LTE", technology: "4G", mcc: "404", mnc: "45" },
  { tenantKey: "demo", network_code: "DEM-5G", network_name: "Demo Telecom 5G Core", technology: "5G", mcc: "404", mnc: "45" },
  { tenantKey: "northstar", network_code: "NST-LTE", network_name: "NorthStar LTE", technology: "4G", mcc: "424", mnc: "03" },
  { tenantKey: "northstar", network_code: "NST-5G", network_name: "NorthStar 5G Standalone", technology: "5G", mcc: "424", mnc: "03" },
];

const networks = networkDefinitions.map((network, index) => {
  const tenant = tenants.find((item) => item.key === network.tenantKey);
  return {
    network_id: `net_${network.network_code.toLowerCase()}`,
    tenant_id: tenant.id,
    network_code: network.network_code,
    network_name: network.network_name,
    technology: network.technology,
    country_code: tenant.homeCountry,
    mcc: network.mcc,
    mnc: network.mnc,
    status: "active",
    launch_date: dateOnly(shift(anchor, { days: -(500 + index * 45) })),
  };
});

const networkByTenant = new Map(networks.map((network) => [network.tenant_id, network]));

const services = [
  {
    service_id: "svc_voice_domestic",
    service_code: "VOICE_DOM",
    service_name: "Domestic Voice",
    category: "voice",
    billing_unit: "minute",
    description: "Domestic switched voice traffic",
  },
  {
    service_id: "svc_voice_intl",
    service_code: "VOICE_INTL",
    service_name: "International Voice",
    category: "voice",
    billing_unit: "minute",
    description: "International outbound and inbound voice traffic",
  },
  {
    service_id: "svc_sms",
    service_code: "SMS",
    service_name: "Short Message Service",
    category: "messaging",
    billing_unit: "message",
    description: "Domestic and international SMS traffic",
  },
  {
    service_id: "svc_data",
    service_code: "DATA",
    service_name: "Packet Data",
    category: "data",
    billing_unit: "MB",
    description: "Domestic mobile data sessions",
  },
  {
    service_id: "svc_roaming_data",
    service_code: "ROAM_DATA",
    service_name: "Roaming Data",
    category: "roaming",
    billing_unit: "MB",
    description: "Visited-network mobile data sessions",
  },
  {
    service_id: "svc_iot",
    service_code: "IOT",
    service_name: "IoT Connectivity",
    category: "iot",
    billing_unit: "MB",
    description: "Low-bandwidth IoT device sessions",
  },
];

const tariffTemplates = [
  {
    suffix: "prepaid-smart",
    tariff_name: "Prepaid Smart",
    service_code: "VOICE_DOM",
    zone: "domestic",
    rate: 0.05,
    currency: "USD",
    billing_basis: "per_minute",
    is_roaming: false,
    monthly_plan_amount: 8.5,
  },
  {
    suffix: "postpaid-max",
    tariff_name: "Postpaid Max",
    service_code: "DATA",
    zone: "domestic",
    rate: 0.02,
    currency: "USD",
    billing_basis: "per_mb",
    is_roaming: false,
    monthly_plan_amount: 24.99,
  },
  {
    suffix: "enterprise-global",
    tariff_name: "Enterprise Global",
    service_code: "VOICE_INTL",
    zone: "international",
    rate: 0.22,
    currency: "USD",
    billing_basis: "per_minute",
    is_roaming: false,
    monthly_plan_amount: 79.99,
  },
  {
    suffix: "roaming-day-pass",
    tariff_name: "Roaming Day Pass",
    service_code: "ROAM_DATA",
    zone: "roaming",
    rate: 0.08,
    currency: "USD",
    billing_basis: "per_mb",
    is_roaming: true,
    monthly_plan_amount: 34.5,
  },
  {
    suffix: "iot-connect",
    tariff_name: "IoT Connect",
    service_code: "IOT",
    zone: "domestic",
    rate: 0.01,
    currency: "USD",
    billing_basis: "per_mb",
    is_roaming: false,
    monthly_plan_amount: 12.75,
  },
  {
    suffix: "sms-bundle",
    tariff_name: "SMS Bundle",
    service_code: "SMS",
    zone: "domestic",
    rate: 0.03,
    currency: "USD",
    billing_basis: "per_message",
    is_roaming: false,
    monthly_plan_amount: 6.25,
  },
];

const tariffs = [];
for (const tenant of tenants) {
  for (const template of tariffTemplates) {
    tariffs.push({
      tariff_id: `tariff_${tenant.key}_${template.suffix}`,
      tenant_id: tenant.id,
      service_id: services.find((service) => service.service_code === template.service_code).service_id,
      tariff_name: template.tariff_name,
      zone: template.zone,
      rate: template.rate,
      currency: template.currency,
      billing_basis: template.billing_basis,
      is_roaming: template.is_roaming,
      status: "active",
      effective_from: dateOnly(shift(anchor, { days: -120 })),
      monthly_plan_amount: template.monthly_plan_amount,
    });
  }
}

const tariffsByTenant = new Map();
for (const tariff of tariffs) {
  const rows = tariffsByTenant.get(tariff.tenant_id) ?? [];
  rows.push(tariff);
  tariffsByTenant.set(tariff.tenant_id, rows);
}

const userDefinitions = [
  {
    tenantKey: "demo",
    role: "owner",
    fullName: "Priya Nair",
    email: "priya.nair@demo-telecom.test",
    title: "Revenue Assurance Director",
    department: "Risk Operations",
    phone: "919810100001",
  },
  {
    tenantKey: "demo",
    role: "admin",
    fullName: "Rohan Mehta",
    email: "rohan.mehta@demo-telecom.test",
    title: "Fraud Operations Manager",
    department: "Fraud Control",
    phone: "919810100002",
  },
  {
    tenantKey: "demo",
    role: "analyst",
    fullName: "Sanjana Rao",
    email: "sanjana.rao@demo-telecom.test",
    title: "Senior Fraud Analyst",
    department: "Analytics",
    phone: "919810100003",
  },
  {
    tenantKey: "demo",
    role: "viewer",
    fullName: "Amit Shah",
    email: "amit.shah@demo-telecom.test",
    title: "Finance Controller",
    department: "Finance",
    phone: "919810100004",
  },
  {
    tenantKey: "northstar",
    role: "owner",
    fullName: "Omar Al Mansoori",
    email: "omar.almansoori@northstar.test",
    title: "Chief Risk Officer",
    department: "Executive",
    phone: "971501000001",
  },
  {
    tenantKey: "northstar",
    role: "admin",
    fullName: "Layla Hassan",
    email: "layla.hassan@northstar.test",
    title: "Billing Assurance Lead",
    department: "Revenue Assurance",
    phone: "971501000002",
  },
  {
    tenantKey: "northstar",
    role: "analyst",
    fullName: "Noor Khan",
    email: "noor.khan@northstar.test",
    title: "Fraud Analytics Specialist",
    department: "Analytics",
    phone: "971501000003",
  },
];

const users = userDefinitions.map((definition, index) => {
  const tenant = tenants.find((item) => item.key === definition.tenantKey);
  const tenantLocations = locationsByTenant.get(tenant.id) ?? [];
  return {
    userId: `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    tenantId: tenant.id,
    email: definition.email,
    fullName: definition.fullName,
    title: definition.title,
    department: definition.department,
    phone: definition.phone,
    role: definition.role,
    locationId: pick(tenantLocations).location_id,
    isActive: true,
    createdAt: iso(shift(anchor, { days: -(120 - index * 4) })),
  };
});

const profiles = users.map((user) => ({
  id: user.userId,
  full_name: user.fullName,
  created_at: user.createdAt,
  updated_at: iso(shift(new Date(user.createdAt), { days: 2 })),
}));

const memberships = users.map((user) => ({
  id: nextUuid("31000000"),
  tenant_id: user.tenantId,
  user_id: user.userId,
  role: user.role,
  is_active: true,
  created_at: user.createdAt,
}));

const usersByTenant = new Map();
for (const user of users) {
  const rows = usersByTenant.get(user.tenantId) ?? [];
  rows.push(user);
  usersByTenant.set(user.tenantId, rows);
}

const partnerDefinitions = {
  demo: [
    { name: "Global Interconnect A", partnerType: "interconnect" },
    { name: "Roaming Partner B", partnerType: "roaming" },
    { name: "WalletHub Digital Services", partnerType: "digital_service" },
  ],
  northstar: [
    { name: "India Transit Hub", partnerType: "interconnect" },
    { name: "APAC Roaming Exchange", partnerType: "roaming" },
    { name: "EdgePay Merchant Network", partnerType: "digital_service" },
  ],
};

const partners = [];
for (const tenant of tenants) {
  for (const definition of partnerDefinitions[tenant.key]) {
    partners.push({
      id: nextUuid("32000000"),
      tenant_id: tenant.id,
      name: definition.name,
      partner_type: definition.partnerType,
      status: "active",
      created_at: iso(shift(anchor, { days: -95 })),
    });
  }
}

const partnersByTenant = new Map();
for (const partner of partners) {
  const rows = partnersByTenant.get(partner.tenant_id) ?? [];
  rows.push(partner);
  partnersByTenant.set(partner.tenant_id, rows);
}

const agreementTemplates = [
  {
    agreement_type: "interconnect",
    route_code: "IN-AE-VOICE",
    expected_tariff: 0.12,
    settlement_cycle_days: 30,
  },
  {
    agreement_type: "roaming",
    route_code: "IN-SG-DATA",
    expected_tariff: 0.08,
    settlement_cycle_days: 30,
  },
  {
    agreement_type: "digital_service",
    route_code: "OTT-WALLET",
    expected_tariff: 0.045,
    settlement_cycle_days: 15,
  },
];

const agreements = [];
for (const tenant of tenants) {
  const tenantPartners = partnersByTenant.get(tenant.id) ?? [];
  for (const template of agreementTemplates) {
    const partner = tenantPartners.find((item) => item.partner_type === template.agreement_type);
    agreements.push({
      agreement_id: `agreement_${tenant.key}_${template.agreement_type}`,
      tenant_id: tenant.id,
      partner_id: partner.id,
      agreement_name: `${partner.name} ${template.agreement_type.replace("_", " ")} agreement`,
      agreement_type: template.agreement_type,
      route_code: template.route_code,
      expected_tariff: template.expected_tariff,
      agreed_tariff: roundMoney(template.expected_tariff * randFloat(0.98, 1.01, 4)),
      currency: "USD",
      effective_from: dateOnly(shift(anchor, { days: -180 })),
      effective_to: dateOnly(shift(anchor, { days: 185 })),
      settlement_cycle_days: template.settlement_cycle_days,
      status: "active",
    });
  }
}

const networkElementDefinitions = {
  demo: [
    { code: "MSC-001", type: "msc", region: "west", anomaly: 0.18, impact: 145.3 },
    { code: "SBC-101", type: "sbc", region: "north", anomaly: 0.74, impact: 1180.45 },
    { code: "PGW-201", type: "pgw", region: "south", anomaly: 0.22, impact: 208.1 },
    { code: "SMSC-301", type: "smsc", region: "west", anomaly: 0.12, impact: 38.2 },
    { code: "OCS-401", type: "ocs", region: "south", anomaly: 0.81, impact: 1540.6 },
    { code: "UPF-501", type: "upf", region: "south", anomaly: 0.27, impact: 275.9 },
  ],
  northstar: [
    { code: "MSC-011", type: "msc", region: "north", anomaly: 0.21, impact: 165.1 },
    { code: "SBC-111", type: "sbc", region: "west", anomaly: 0.68, impact: 920.2 },
    { code: "PGW-211", type: "pgw", region: "south", anomaly: 0.19, impact: 140.8 },
    { code: "SMSC-311", type: "smsc", region: "north", anomaly: 0.11, impact: 27.9 },
    { code: "OCS-411", type: "ocs", region: "west", anomaly: 0.72, impact: 1322.44 },
    { code: "UPF-511", type: "upf", region: "south", anomaly: 0.25, impact: 210.55 },
  ],
};

const networkElements = [];
for (const tenant of tenants) {
  for (const definition of networkElementDefinitions[tenant.key]) {
    networkElements.push({
      id: nextUuid("33000000"),
      tenant_id: tenant.id,
      element_code: definition.code,
      element_type: definition.type,
      region: definition.region,
      status: "active",
      anomaly_score: definition.anomaly,
      revenue_impact: definition.impact,
      created_at: iso(shift(anchor, { days: -90 })),
    });
  }
}

const networkElementsByTenant = new Map();
for (const element of networkElements) {
  const rows = networkElementsByTenant.get(element.tenant_id) ?? [];
  rows.push(element);
  networkElementsByTenant.set(element.tenant_id, rows);
}

const ruleTemplates = [
  { rule_name: "PBX Duration Spike", rule_type: "pbx_hacking", threshold: 7200 },
  { rule_name: "SIM Box Burst Short Calls", rule_type: "sim_box", threshold: 5 },
  { rule_name: "Subscription Charge Gap", rule_type: "subscription_fraud", threshold: 0.2 },
  { rule_name: "Roaming Tariff Mismatch", rule_type: "roaming_fraud", threshold: 50 },
  { rule_name: "Interconnect Underbilling", rule_type: "interconnect_leakage", threshold: 0.85 },
];

const rules = [];
for (const tenant of tenants) {
  for (const template of ruleTemplates) {
    rules.push({
      id: nextUuid("34000000"),
      tenant_id: tenant.id,
      rule_name: template.rule_name,
      rule_type: template.rule_type,
      threshold: template.threshold,
      is_active: true,
      created_at: iso(shift(anchor, { days: -80 })),
    });
  }
}

const workflowTemplates = [
  { workflow_name: "Fraud Triage", workflow_type: "alert_to_case", status: "active", is_active: true },
  { workflow_name: "Leakage Recovery", workflow_type: "reconciliation", status: "active", is_active: true },
  { workflow_name: "Executive Report Distribution", workflow_type: "report_distribution", status: "active", is_active: true },
  { workflow_name: "Mobile Critical Alert Fanout", workflow_type: "mobile_alerting", status: "paused", is_active: false },
];

const workflows = [];
for (const tenant of tenants) {
  for (const template of workflowTemplates) {
    workflows.push({
      id: nextUuid("35000000"),
      tenant_id: tenant.id,
      workflow_name: template.workflow_name,
      workflow_type: template.workflow_type,
      status: template.status,
      is_active: template.is_active,
      updated_at: iso(shift(anchor, { days: -randInt(1, 18), hours: -randInt(1, 12) })),
    });
  }
}

const subscriberNamePools = {
  IN: {
    first: ["Aarav", "Ishaan", "Riya", "Ananya", "Neha", "Dev", "Karan", "Sana", "Rahul", "Kavya", "Aditi", "Vikram"],
    last: ["Patel", "Shah", "Gupta", "Rao", "Nair", "Kapoor", "Mehta", "Desai", "Singh", "Joshi"],
  },
  AE: {
    first: ["Omar", "Layla", "Noor", "Aisha", "Hassan", "Mariam", "Saif", "Amal", "Zayed", "Fatima", "Rashed", "Khalid"],
    last: ["Al Mansoori", "Hassan", "Rahman", "Al Nuaimi", "Khan", "Al Falasi", "Saeed", "Haddad"],
  },
};

const segmentTemplates = [
  { customer_segment: "enterprise", tariffSuffix: "enterprise-global", primaryServiceCode: "VOICE_INTL", risk_band: "high", roaming: true },
  { customer_segment: "prepaid", tariffSuffix: "prepaid-smart", primaryServiceCode: "VOICE_DOM", risk_band: "medium", roaming: false },
  { customer_segment: "postpaid", tariffSuffix: "postpaid-max", primaryServiceCode: "DATA", risk_band: "low", roaming: true },
  { customer_segment: "iot", tariffSuffix: "iot-connect", primaryServiceCode: "IOT", risk_band: "medium", roaming: false },
  { customer_segment: "postpaid", tariffSuffix: "roaming-day-pass", primaryServiceCode: "ROAM_DATA", risk_band: "medium", roaming: true },
  { customer_segment: "prepaid", tariffSuffix: "sms-bundle", primaryServiceCode: "SMS", risk_band: "low", roaming: false },
];

function msisdnFor(tenant, index) {
  const country = countryInfo[tenant.homeCountry];
  const localSeed = tenant.key === "demo" ? `98${pad(index, 8)}` : `50${pad(index, 7)}`;
  return `${country.callingCode}${localSeed}`;
}

function imsiFor(tenant, index) {
  const country = countryInfo[tenant.homeCountry];
  return `${country.imsiPrefix}${String(1000000000 + index).slice(-10)}`;
}

function imeiFor(index) {
  return `3569${String(10000000000 + index).slice(-11)}`;
}

function pickSubscriberName(countryCode, index) {
  const pool = subscriberNamePools[countryCode];
  const first = pool.first[index % pool.first.length];
  const last = pool.last[Math.floor(index / pool.first.length) % pool.last.length];
  return `${first} ${last}`;
}

const subscribers = [];
const devices = [];

const subscriberCounts = { demo: 12, northstar: 10 };

for (const tenant of tenants) {
  const tenantTariffs = tariffsByTenant.get(tenant.id) ?? [];
  const tenantLocations = locationsByTenant.get(tenant.id) ?? [];
  const network = networkByTenant.get(tenant.id);
  const total = subscriberCounts[tenant.key];
  for (let i = 0; i < total; i += 1) {
    const segmentTemplate = segmentTemplates[i % segmentTemplates.length];
    const tariff = tenantTariffs.find((item) => item.tariff_id.endsWith(segmentTemplate.tariffSuffix));
    const customerName = pickSubscriberName(tenant.homeCountry, i);
    const subscriberId = `${tenant.key}_sub_${pad(i + 1)}`;
    const deviceId = `${tenant.key}_dev_${pad(i + 1)}`;
    const activationDate = dateOnly(shift(anchor, { days: -(300 - i * 9) }));
    const location = tenantLocations[i % tenantLocations.length];
    subscribers.push({
      subscriberId,
      tenantId: tenant.id,
      tenantKey: tenant.key,
      customerName,
      customerSegment: segmentTemplate.customer_segment,
      imsi: imsiFor(tenant, i + 1),
      msisdn: msisdnFor(tenant, i + 1),
      activationDate,
      status: i === total - 1 ? "suspended" : "active",
      homeCountry: tenant.homeCountry,
      homeLocationId: location.location_id,
      networkId: network.network_id,
      deviceId,
      tariffId: tariff.tariff_id,
      monthlyPlanAmount: tariff.monthly_plan_amount,
      riskBand: segmentTemplate.risk_band,
      primaryServiceCode: segmentTemplate.primaryServiceCode,
      isRoamingEnabled: segmentTemplate.roaming,
    });

    const isIot = segmentTemplate.customer_segment === "iot";
    const modelChoices = isIot
      ? [
          ["Quectel BG95", "Quectel", "IoT 1.2"],
          ["Teltonika FMB920", "Teltonika", "IoT 2.0"],
        ]
      : [
          ["Galaxy S23", "Samsung", "Android 14"],
          ["iPhone 15", "Apple", "iOS 18"],
          ["Pixel 9", "Google", "Android 15"],
        ];
    const [model, manufacturer, osVersion] = pick(modelChoices);
    devices.push({
      device_id: deviceId,
      tenant_id: tenant.id,
      subscriber_id: subscriberId,
      imei: imeiFor(i + 1 + (tenant.key === "demo" ? 0 : 50)),
      device_type: isIot ? "iot_gateway" : "smartphone",
      manufacturer,
      model,
      os_version: osVersion,
      is_roaming_capable: segmentTemplate.roaming,
      first_seen_at: iso(shift(anchor, { days: -(250 - i * 4) })),
      last_seen_at: iso(shift(anchor, { hours: -randInt(1, 20) })),
    });
  }
}

const subscribersByTenant = new Map();
for (const subscriber of subscribers) {
  const rows = subscribersByTenant.get(subscriber.tenantId) ?? [];
  rows.push(subscriber);
  subscribersByTenant.set(subscriber.tenantId, rows);
}

function serviceMixFor(segment) {
  if (segment === "enterprise") {
    return [
      { value: "voice", weight: 0.5 },
      { value: "sms", weight: 0.08 },
      { value: "data", weight: 0.42 },
    ];
  }
  if (segment === "iot") {
    return [
      { value: "voice", weight: 0.1 },
      { value: "sms", weight: 0.05 },
      { value: "data", weight: 0.85 },
    ];
  }
  if (segment === "prepaid") {
    return [
      { value: "voice", weight: 0.55 },
      { value: "sms", weight: 0.2 },
      { value: "data", weight: 0.25 },
    ];
  }
  return [
    { value: "voice", weight: 0.35 },
    { value: "sms", weight: 0.12 },
    { value: "data", weight: 0.53 },
  ];
}

function pickVisitedCountry(homeCountry) {
  const options = homeCountry === "IN" ? ["AE", "SG", "GB", "US"] : ["IN", "SA", "SG", "GB"];
  return pick(options);
}

function pickDestinationCountry(homeCountry, callType, international) {
  if (!international) {
    return homeCountry;
  }
  const intlOptions = homeCountry === "IN" ? ["AE", "US", "GB", "SG"] : ["IN", "SA", "GB", "US"];
  if (callType === "data") {
    return pick([homeCountry, ...intlOptions]);
  }
  return pick(intlOptions);
}

function pickNetworkElement(tenantId, callType) {
  const elements = networkElementsByTenant.get(tenantId) ?? [];
  const allowedTypes =
    callType === "voice"
      ? ["msc", "sbc", "ocs"]
      : callType === "sms"
        ? ["smsc", "ocs"]
        : ["pgw", "upf", "ocs"];
  const filtered = elements.filter((element) => allowedTypes.includes(element.element_type));
  return pick(filtered.length > 0 ? filtered : elements);
}

function buildCellId(tenantKey, region) {
  return `${tenantKey.toUpperCase()}-${region.toUpperCase()}-${randInt(1001, 1299)}`;
}

function normalVoiceCharge(durationSeconds, international, segment) {
  const rate =
    international
      ? segment === "enterprise"
        ? 0.18
        : 0.22
      : segment === "prepaid"
        ? 0.05
        : 0.04;
  return roundMoney((durationSeconds / 60) * rate);
}

function normalSmsCharge(international) {
  return roundMoney(international ? randFloat(0.08, 0.14) : randFloat(0.03, 0.06));
}

function normalDataUsageMb(segment) {
  if (segment === "iot") return randFloat(2, 80);
  if (segment === "enterprise") return randFloat(180, 1200);
  return randFloat(40, 900);
}

function normalDataCharge(usageMb, international, segment) {
  const baseRate =
    international
      ? segment === "enterprise"
        ? 0.06
        : 0.08
      : segment === "iot"
        ? 0.01
        : 0.02;
  return roundMoney(usageMb * baseRate);
}

function createCdrRecord(subscriber, overrides = {}) {
  const callType = overrides.callType ?? weightedPick(serviceMixFor(subscriber.customerSegment));
  const isInternational = overrides.isInternational ?? chance(subscriber.isRoamingEnabled ? 0.12 : 0.05);
  const originCountry = overrides.originCountry ?? (isInternational ? pickVisitedCountry(subscriber.homeCountry) : subscriber.homeCountry);
  const destinationCountry = overrides.destinationCountry ?? pickDestinationCountry(subscriber.homeCountry, callType, isInternational);
  const sourceSystem =
    overrides.sourceSystem ??
    weightedPick([
      { value: "billing", weight: 0.45 },
      { value: "mediation", weight: 0.35 },
      { value: "network", weight: 0.2 },
    ]);
  const networkElement = pickNetworkElement(subscriber.tenantId, callType);
  let durationSeconds = overrides.durationSeconds ?? 60;
  let chargeAmount = overrides.chargeAmount ?? 0;
  let billedAmount = overrides.billedAmount ?? 0;
  let usageMb = overrides.usageMb ?? null;

  if (overrides.durationSeconds === undefined || overrides.chargeAmount === undefined || overrides.billedAmount === undefined) {
    if (callType === "voice") {
      durationSeconds = randInt(45, 1800);
      chargeAmount = normalVoiceCharge(durationSeconds, isInternational, subscriber.customerSegment);
      billedAmount = roundMoney(chargeAmount * randFloat(0.96, 1.08));
      if (billedAmount < chargeAmount * 0.9) billedAmount = roundMoney(chargeAmount * 0.96);
    } else if (callType === "sms") {
      durationSeconds = randInt(1, 4);
      chargeAmount = normalSmsCharge(isInternational);
      billedAmount = roundMoney(chargeAmount * randFloat(0.98, 1.05));
      if (isInternational && durationSeconds <= 6 && chargeAmount <= 0.05) {
        chargeAmount = 0.08;
        billedAmount = 0.09;
      }
    } else {
      usageMb = usageMb ?? normalDataUsageMb(subscriber.customerSegment);
      durationSeconds = Math.max(20, Math.round(usageMb * randFloat(1.5, 4.2)));
      chargeAmount = normalDataCharge(usageMb, isInternational, subscriber.customerSegment);
      billedAmount = roundMoney(chargeAmount * randFloat(0.98, 1.12));
      if (chargeAmount === 0) chargeAmount = 0.5;
      if (billedAmount < chargeAmount * 0.9) billedAmount = roundMoney(chargeAmount * 0.98);
      if (billedAmount > chargeAmount * 1.8) billedAmount = roundMoney(chargeAmount * 1.15);
    }
  }

  const eventTime =
    overrides.eventTime ??
    iso(randomBetween(shift(anchor, { days: -14 }), shift(anchor, { minutes: -10 })));

  return {
    id: nextUuid("36000000"),
    tenantId: subscriber.tenantId,
    subscriberId: subscriber.subscriberId,
    imsi: subscriber.imsi,
    msisdn: subscriber.msisdn,
    callType,
    originCountry,
    destinationCountry,
    durationSeconds,
    chargeAmount: roundMoney(chargeAmount),
    billedAmount: roundMoney(billedAmount),
    eventTime,
    sourceSystem,
    cellId: overrides.cellId ?? buildCellId(subscriber.tenantKey, networkElement.region),
    networkElementId: overrides.networkElementId ?? networkElement.id,
    scenario: overrides.scenario ?? "normal",
    usageMb,
  };
}

function buildFraudRecord(subscriber, fraudType, hoursBack, index) {
  const eventTime = iso(shift(anchor, { hours: -hoursBack, minutes: -(index % 4) * 7 }));
  if (fraudType === "pbx_hacking") {
    const durationSeconds = randInt(7800, 12600);
    const chargeAmount = randFloat(280, 620);
    const billedAmount = roundMoney(chargeAmount + randFloat(650, 1500));
    return createCdrRecord(subscriber, {
      callType: "voice",
      isInternational: true,
      originCountry: subscriber.homeCountry,
      destinationCountry: pick(subscriber.homeCountry === "IN" ? ["AE", "US", "GB"] : ["IN", "US", "GB"]),
      durationSeconds,
      chargeAmount,
      billedAmount,
      sourceSystem: pick(["billing", "mediation"]),
      eventTime,
      scenario: fraudType,
    });
  }

  if (fraudType === "sim_box") {
    return createCdrRecord(subscriber, {
      callType: "voice",
      isInternational: true,
      originCountry: subscriber.homeCountry,
      destinationCountry: pick(subscriber.homeCountry === "IN" ? ["AE", "SA", "GB"] : ["IN", "SA", "SG"]),
      durationSeconds: randInt(1, 6),
      chargeAmount: randFloat(0, 0.04, 2),
      billedAmount: chance(0.7) ? 0 : randFloat(0, 0.02, 2),
      sourceSystem: "network",
      eventTime,
      scenario: fraudType,
    });
  }

  if (fraudType === "subscription_fraud") {
    const usageMb = randFloat(1200, 5200);
    const chargeAmount = chance(0.6) ? 0 : randFloat(5, 20);
    const billedAmount = randFloat(180, 650);
    return createCdrRecord(subscriber, {
      callType: "data",
      isInternational: false,
      originCountry: subscriber.homeCountry,
      destinationCountry: subscriber.homeCountry,
      durationSeconds: randInt(25, 180),
      usageMb,
      chargeAmount,
      billedAmount,
      sourceSystem: pick(["billing", "mediation"]),
      eventTime,
      scenario: fraudType,
    });
  }

  if (fraudType === "roaming_fraud") {
    const visitedCountry = pickVisitedCountry(subscriber.homeCountry);
    const isVoice = chance(0.45);
    if (isVoice) {
      const chargeAmount = randFloat(60, 160);
      return createCdrRecord(subscriber, {
        callType: "voice",
        isInternational: true,
        originCountry: subscriber.homeCountry,
        destinationCountry: visitedCountry,
        durationSeconds: randInt(180, 1400),
        chargeAmount,
        billedAmount: roundMoney(chargeAmount * randFloat(2.2, 4.1)),
        sourceSystem: "billing",
        eventTime,
        scenario: fraudType,
      });
    }
    return createCdrRecord(subscriber, {
      callType: "data",
      isInternational: true,
      originCountry: subscriber.homeCountry,
      destinationCountry: visitedCountry,
      durationSeconds: randInt(15, 55),
      usageMb: randFloat(2500, 7200),
      chargeAmount: randFloat(40, 120),
      billedAmount: randFloat(240, 780),
      sourceSystem: "billing",
      eventTime,
      scenario: fraudType,
    });
  }

  return createCdrRecord(subscriber, {
    callType: "voice",
    isInternational: chance(0.5),
    originCountry: subscriber.homeCountry,
    destinationCountry: chance(0.5) ? subscriber.homeCountry : pickVisitedCountry(subscriber.homeCountry),
    durationSeconds: randInt(240, 2100),
    chargeAmount: randFloat(90, 420),
    billedAmount: randFloat(35, 210),
    sourceSystem: pick(["billing", "mediation"]),
    eventTime,
    scenario: "interconnect_leakage",
  });
}

const cdrs = [];

for (const subscriber of subscribers) {
  const baseCount =
    subscriber.customerSegment === "iot"
      ? 20
      : subscriber.customerSegment === "enterprise"
        ? 28
        : 24;
  for (let i = 0; i < baseCount; i += 1) {
    cdrs.push(createCdrRecord(subscriber));
  }
}

function pickSubscribers(tenantId, predicate) {
  return (subscribersByTenant.get(tenantId) ?? []).filter(predicate);
}

function addScenarioBatch(tenantId, fraudType, count, subscriberPredicate) {
  const pool = pickSubscribers(tenantId, subscriberPredicate);
  for (let i = 0; i < count; i += 1) {
    const subscriber = pool[i % pool.length];
    cdrs.push(buildFraudRecord(subscriber, fraudType, 72 - i * 2, i));
  }
}

addScenarioBatch(tenants[0].id, "pbx_hacking", 12, (subscriber) => subscriber.customerSegment === "enterprise");
addScenarioBatch(tenants[0].id, "sim_box", 16, (subscriber) => subscriber.customerSegment === "prepaid");
addScenarioBatch(tenants[0].id, "subscription_fraud", 14, (subscriber) => subscriber.primaryServiceCode === "DATA" || subscriber.primaryServiceCode === "IOT");
addScenarioBatch(tenants[0].id, "roaming_fraud", 12, (subscriber) => subscriber.isRoamingEnabled);
addScenarioBatch(tenants[0].id, "interconnect_leakage", 16, (subscriber) => subscriber.customerSegment === "enterprise" || subscriber.customerSegment === "postpaid");
addScenarioBatch(tenants[1].id, "pbx_hacking", 6, (subscriber) => subscriber.customerSegment === "enterprise");
addScenarioBatch(tenants[1].id, "sim_box", 8, (subscriber) => subscriber.customerSegment === "prepaid");
addScenarioBatch(tenants[1].id, "subscription_fraud", 8, (subscriber) => subscriber.primaryServiceCode === "DATA" || subscriber.primaryServiceCode === "IOT");
addScenarioBatch(tenants[1].id, "roaming_fraud", 6, (subscriber) => subscriber.isRoamingEnabled);
addScenarioBatch(tenants[1].id, "interconnect_leakage", 8, (subscriber) => subscriber.customerSegment === "enterprise" || subscriber.customerSegment === "postpaid");

cdrs.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

function isInternational(cdr) {
  return cdr.originCountry !== cdr.destinationCountry;
}

function amountDelta(cdr) {
  return Math.abs(cdr.chargeAmount - cdr.billedAmount);
}

function classifyFraudType(cdr) {
  const delta = amountDelta(cdr);
  if (cdr.callType === "voice" && (cdr.durationSeconds > 7200 || (isInternational(cdr) && cdr.durationSeconds > 3600 && delta > 500))) {
    return "pbx_hacking";
  }
  if (
    cdr.callType === "voice" &&
    isInternational(cdr) &&
    cdr.durationSeconds <= 6 &&
    (cdr.billedAmount === 0 || cdr.chargeAmount <= 0.05)
  ) {
    return "sim_box";
  }
  if (cdr.callType === "data" && ((cdr.chargeAmount === 0 && cdr.billedAmount > 0) || (cdr.billedAmount > 0 && cdr.chargeAmount / cdr.billedAmount < 0.2))) {
    return "subscription_fraud";
  }
  if (isInternational(cdr) && (cdr.billedAmount > cdr.chargeAmount * 2 || (cdr.callType === "data" && cdr.billedAmount > 200 && cdr.durationSeconds < 60))) {
    return "roaming_fraud";
  }
  if (cdr.billedAmount < cdr.chargeAmount * 0.85) {
    return "interconnect_leakage";
  }
  return "unknown";
}

function severityFor(cdr, fraudType) {
  const delta = amountDelta(cdr);
  if (fraudType === "pbx_hacking" || delta > 1000 || (fraudType === "roaming_fraud" && delta > 500)) {
    return "critical";
  }
  if (fraudType === "sim_box" || delta > 300 || (fraudType === "interconnect_leakage" && delta > 250)) {
    return "high";
  }
  if (fraudType === "subscription_fraud" || delta > 100) {
    return "medium";
  }
  return "low";
}

function confidenceFor(cdr, fraudType) {
  const deltaRatio =
    cdr.chargeAmount === 0 ? 1 : Math.min(1, amountDelta(cdr) / Math.max(0.01, cdr.chargeAmount));
  const intlBoost = isInternational(cdr) ? 0.04 : 0;
  const durationBoost = cdr.durationSeconds > 3600 ? 0.03 : 0;
  const base =
    fraudType === "pbx_hacking"
      ? 0.92
      : fraudType === "sim_box"
        ? 0.88
        : fraudType === "subscription_fraud"
          ? 0.8
          : fraudType === "roaming_fraud"
            ? 0.77
            : fraudType === "interconnect_leakage"
              ? 0.74
              : 0.4;
  return Number(Math.min(0.99, base + deltaRatio * 0.15 + intlBoost + durationBoost).toFixed(2));
}

const alerts = [];
const alertById = new Map();
const seenDedupeKeys = new Set();
const cdrById = new Map(cdrs.map((cdr) => [cdr.id, cdr]));

for (const cdr of cdrs) {
  const fraudType = classifyFraudType(cdr);
  if (fraudType === "unknown") continue;
  const dedupeKey = `${cdr.tenantId}:${cdr.subscriberId}:${fraudType}:${new Date(cdr.eventTime).toISOString().slice(0, 13)}`;
  if (seenDedupeKeys.has(dedupeKey)) continue;
  seenDedupeKeys.add(dedupeKey);
  const ageHours = Math.max(1, Math.round((anchor.getTime() - new Date(cdr.eventTime).getTime()) / (60 * 60 * 1000)));
  const status = ageHours <= 8 ? "new" : ageHours <= 36 ? "acknowledged" : chance(0.5) ? "closed" : "acknowledged";
  const alert = {
    id: nextTextId(`alert_${cdr.tenantId === tenants[0].id ? "demo" : "northstar"}`),
    tenant_id: cdr.tenantId,
    cdr_id: cdr.id,
    title: `Potential ${fraudType.replaceAll("_", " ")}`,
    description: `Detected ${fraudType} pattern on subscriber ${cdr.subscriberId}`,
    fraud_type: fraudType,
    severity: severityFor(cdr, fraudType),
    confidence: confidenceFor(cdr, fraudType),
    dedupe_key: dedupeKey,
    status,
    created_at: iso(shift(new Date(cdr.eventTime), { minutes: randInt(1, 12) })),
  };
  alerts.push(alert);
  alertById.set(alert.id, alert);
}

const cases = [];
const casedAlertIds = new Set();

for (const alert of alerts) {
  if (!(alert.severity === "critical" || alert.severity === "high" || chance(0.22))) {
    continue;
  }
  if (casedAlertIds.size >= 26) break;
  casedAlertIds.add(alert.id);
  const tenantUsers = (usersByTenant.get(alert.tenant_id) ?? []).filter((user) => user.role === "admin" || user.role === "analyst");
  const assignee = tenantUsers[cases.length % tenantUsers.length];
  const relatedCdr = cdrById.get(alert.cdr_id);
  const createdAt = shift(new Date(alert.created_at), { hours: randInt(1, 8) });
  const ageDays = Math.max(0, Math.round((anchor.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
  const status =
    ageDays >= 7 ? "closed" : ageDays >= 4 ? "resolved" : ageDays >= 2 ? "investigating" : "open";
  const delta = relatedCdr ? Math.abs(relatedCdr.billedAmount - relatedCdr.chargeAmount) : randFloat(50, 400);
  cases.push({
    id: nextUuid("37000000"),
    tenant_id: alert.tenant_id,
    title: `Investigate ${alert.fraud_type.replaceAll("_", " ")} on ${relatedCdr?.subscriberId ?? "subscriber"}`,
    status,
    assignee_user_id: assignee.userId,
    alert_id: alert.id,
    revenue_impact: roundMoney(delta * randFloat(1.2, 3)),
    notes:
      status === "open"
        ? "Awaiting first analyst review."
        : status === "investigating"
          ? "Correlated with roaming and billing events for validation."
          : status === "resolved"
            ? "Customer account corrected and partner dispute prepared."
            : "Case closed after recovery posting and control confirmation.",
    created_at: iso(createdAt),
    updated_at: iso(shift(createdAt, { hours: randInt(4, 36) })),
  });
}

function reconcileItem(item) {
  const billedVsMediated = Math.abs(item.billedAmount - item.mediatedAmount);
  const billedVsCollected = Math.max(0, item.billedAmount - item.collectedAmount);
  const mediatedVsCollected = Math.max(0, item.mediatedAmount - item.collectedAmount);
  const mismatchAmount = Number(billedVsMediated.toFixed(2));
  const leakageAmount = Number((Math.max(billedVsCollected, mediatedVsCollected) + billedVsMediated).toFixed(2));
  let severity = "low";
  if (leakageAmount >= 1000) {
    severity = "critical";
  } else if (leakageAmount >= 300) {
    severity = "high";
  } else if (leakageAmount >= 50) {
    severity = "medium";
  }
  return {
    mismatchAmount,
    leakageAmount,
    severity,
    status: leakageAmount > 0 ? "mismatch" : "matched",
  };
}

const reconciliationItems = [];
const reconciliationResults = [];

for (const tenant of tenants) {
  const count = tenant.key === "demo" ? 40 : 24;
  for (let i = 0; i < count; i += 1) {
    const billedAmount = randFloat(120, 2400);
    const mismatchProfile = i % 5;
    const mediatedAmount =
      mismatchProfile === 0
        ? billedAmount
        : roundMoney(billedAmount - randFloat(5, mismatchProfile === 4 ? 450 : 160));
    const collectedAmount =
      mismatchProfile === 0
        ? billedAmount
        : roundMoney(mediatedAmount - randFloat(0, mismatchProfile >= 3 ? 900 : 220));

    const item = {
      tenantId: tenant.id,
      recordKey: `${tenant.code}-REC-${dateOnly(anchor).replaceAll("-", "")}-${pad(i + 1, 4)}`,
      billedAmount: roundMoney(billedAmount),
      mediatedAmount: roundMoney(mediatedAmount),
      collectedAmount: roundMoney(Math.max(0, collectedAmount)),
    };
    reconciliationItems.push(item);
    const result = reconcileItem(item);
    reconciliationResults.push({
      id: nextUuid("38000000"),
      tenant_id: tenant.id,
      record_key: item.recordKey,
      mismatch_amount: result.mismatchAmount,
      leakage_amount: result.leakageAmount,
      severity: result.severity,
      status: result.status,
      created_at: iso(shift(anchor, { days: -randInt(0, 13), hours: -randInt(0, 20) })),
    });
  }
}

const settlements = [];
for (const tenant of tenants) {
  const tenantPartners = partnersByTenant.get(tenant.id) ?? [];
  for (const partner of tenantPartners.filter((item) => item.partner_type !== "digital_service")) {
    for (let monthOffset = 2; monthOffset >= 0; monthOffset -= 1) {
      const periodStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthOffset, 1));
      const periodEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthOffset + 1, 0));
      const amountDue = randFloat(1200, 14500);
      const paymentRatio = monthOffset === 0 ? randFloat(0.45, 0.9) : randFloat(0.92, 1.02);
      const amountPaid = roundMoney(amountDue * paymentRatio);
      const status =
        amountPaid >= amountDue
          ? "closed"
          : monthOffset === 0
            ? "open"
            : "partial";
      settlements.push({
        id: nextUuid("39000000"),
        tenant_id: tenant.id,
        partner_id: partner.id,
        period_start: dateOnly(periodStart),
        period_end: dateOnly(periodEnd),
        amount_due: roundMoney(amountDue),
        amount_paid: amountPaid,
        status,
        created_at: iso(shift(periodEnd, { days: 2 })),
      });
    }
  }
}

const billingSystems = [];
for (const tenant of tenants) {
  for (const connector of connectorCatalog) {
    billingSystems.push({
      tenant_id: tenant.id,
      name: connector.name,
      vendor: connector.vendor,
      supports_realtime: connector.supportsRealtime,
      supports_mobile_monitoring: connector.supportsMobileMonitoring,
      supports_report_distribution: connector.supportsReportDistribution,
      health: connector.health,
      last_sync_at: iso(shift(anchor, { hours: -randInt(1, 18) })),
      latency_ms: connector.latencyMs + randInt(-40, 60),
      records_pulled_last_sync: connector.recordsPulled + randInt(-25, 35),
    });
  }
}

const revenueStreams = [];
for (const tenant of tenants) {
  const tenantPartners = partnersByTenant.get(tenant.id) ?? [];
  const streamTemplates = [
    { stream_name: "Domestic Voice", channel: "core", service_code: "VOICE_DOM" },
    { stream_name: "International Voice", channel: "interconnect", service_code: "VOICE_INTL" },
    { stream_name: "Messaging", channel: "retail", service_code: "SMS" },
    { stream_name: "Domestic Data", channel: "retail", service_code: "DATA" },
    { stream_name: "Roaming Data", channel: "roaming", service_code: "ROAM_DATA" },
    { stream_name: "IoT Connectivity", channel: "iot", service_code: "IOT" },
  ];
  for (const template of streamTemplates) {
    const monthlyTarget = randFloat(10000, 65000);
    const actual = roundMoney(monthlyTarget * randFloat(0.72, 1.08));
    revenueStreams.push({
      revenue_stream_id: `stream_${tenant.key}_${template.service_code.toLowerCase()}`,
      tenant_id: tenant.id,
      stream_name: template.stream_name,
      channel: template.channel,
      service_id: services.find((service) => service.service_code === template.service_code).service_id,
      partner_id: template.channel === "interconnect" ? tenantPartners.find((item) => item.partner_type === "interconnect")?.id ?? "" : "",
      monthly_target: roundMoney(monthlyTarget),
      month_to_date_actual: actual,
      variance_amount: roundMoney(actual - monthlyTarget),
      status: actual < monthlyTarget * 0.9 ? "under_target" : "on_track",
    });
  }
}

const qualityRuns = [];
for (const tenant of tenants) {
  for (let i = 0; i < 7; i += 1) {
    const checkedCount = randInt(120, 320);
    const missingMsisdn = i === 5 ? 1 : 0;
    const invalidDuration = i === 3 ? 2 : 0;
    const negativeAmounts = i === 1 ? 1 : 0;
    const failedCount = missingMsisdn + invalidDuration + negativeAmounts;
    const qualityScore = Number((((checkedCount - failedCount) / checkedCount) * 100).toFixed(2));
    qualityRuns.push({
      id: nextUuid("40000000"),
      tenant_id: tenant.id,
      quality_score: qualityScore,
      checked_count: checkedCount,
      failed_count: failedCount,
      payload: {
        total: checkedCount,
        missingMsisdn,
        invalidDuration,
        negativeAmounts,
        qualityScore,
      },
      created_at: iso(shift(anchor, { days: -i, hours: -randInt(1, 8) })),
    });
  }
}

const lineageEvents = [];
for (const tenant of tenants) {
  lineageEvents.push(
    {
      id: nextUuid("41000000"),
      tenant_id: tenant.id,
      source_system: "cdr-ingestion",
      dataset: "cdrs",
      operation: "ingest",
      record_count: cdrs.filter((cdr) => cdr.tenantId === tenant.id).length,
      processed_at: iso(shift(anchor, { hours: -2 })),
    },
    {
      id: nextUuid("41000000"),
      tenant_id: tenant.id,
      source_system: "fraud-engine",
      dataset: "alerts",
      operation: "detect",
      record_count: alerts.filter((alert) => alert.tenant_id === tenant.id).length,
      processed_at: iso(shift(anchor, { hours: -2, minutes: -25 })),
    },
    {
      id: nextUuid("41000000"),
      tenant_id: tenant.id,
      source_system: "reconciliation-engine",
      dataset: "reconciliation_results",
      operation: "reconcile",
      record_count: reconciliationResults.filter((row) => row.tenant_id === tenant.id).length,
      processed_at: iso(shift(anchor, { days: -1, hours: -3 })),
    },
    {
      id: nextUuid("41000000"),
      tenant_id: tenant.id,
      source_system: "reporting-service",
      dataset: "reports",
      operation: "transform",
      record_count: 4,
      processed_at: iso(shift(anchor, { days: -1, hours: -5 })),
    },
  );
}

const reports = [];
for (const tenant of tenants) {
  const tenantQuality = qualityRuns
    .filter((row) => row.tenant_id === tenant.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const tenantUsers = usersByTenant.get(tenant.id) ?? [];
  const generatedBy = tenantUsers.find((user) => user.role === "analyst") ?? tenantUsers[0];
  const reportTypes = ["operational", "fraud", "compliance", "executive"];
  for (let i = 0; i < reportTypes.length; i += 1) {
    const reportType = reportTypes[i];
    reports.push({
      id: nextUuid("42000000"),
      tenant_id: tenant.id,
      report_type: reportType,
      status: "generated",
      payload: {
        generatedBy: generatedBy.userId,
        generatedForTenant: tenant.id,
        generatedAt: iso(shift(anchor, { days: -i })),
        period: {
          from: dateOnly(shift(anchor, { days: -(14 + i * 2) })),
          to: dateOnly(shift(anchor, { days: -i })),
        },
        distribution:
          reportType === "executive"
            ? [`cfo@${tenant.slug}.test`, `risk-committee@${tenant.slug}.test`]
            : [`fraud-ops@${tenant.slug}.test`],
        summary: {
          alerts: alerts.filter((alert) => alert.tenant_id === tenant.id).length,
          cases: cases.filter((row) => row.tenant_id === tenant.id).length,
          reconciliations: reconciliationResults.filter((row) => row.tenant_id === tenant.id).length,
          latestQuality: tenantQuality
            ? {
                quality_score: tenantQuality.quality_score,
                checked_count: tenantQuality.checked_count,
                failed_count: tenantQuality.failed_count,
                created_at: tenantQuality.created_at,
              }
            : null,
        },
      },
      generated_at: iso(shift(anchor, { days: -i, hours: -randInt(2, 12) })),
    });
  }
}

const auditLogs = [];
for (const tenant of tenants) {
  const tenantUsers = usersByTenant.get(tenant.id) ?? [];
  const actorOwner = tenantUsers.find((user) => user.role === "owner") ?? tenantUsers[0];
  const actorAnalyst = tenantUsers.find((user) => user.role === "analyst") ?? tenantUsers[0];
  const tenantAlerts = alerts.filter((alert) => alert.tenant_id === tenant.id);
  const tenantCases = cases.filter((row) => row.tenant_id === tenant.id);
  auditLogs.push(
    {
      id: nextUuid("43000000"),
      tenant_id: tenant.id,
      actor_user_id: actorAnalyst.userId,
      action: "cdr_ingest",
      resource_type: "cdr",
      resource_id: cdrs.find((cdr) => cdr.tenantId === tenant.id)?.id ?? null,
      payload: {
        inserted: cdrs.filter((cdr) => cdr.tenantId === tenant.id).length,
        alertsGenerated: tenantAlerts.length,
      },
      created_at: iso(shift(anchor, { hours: -2 })),
    },
    {
      id: nextUuid("43000000"),
      tenant_id: tenant.id,
      actor_user_id: actorAnalyst.userId,
      action: "reconcile_run",
      resource_type: "reconciliation_results",
      resource_id: null,
      payload: { count: reconciliationResults.filter((row) => row.tenant_id === tenant.id).length },
      created_at: iso(shift(anchor, { hours: -3 })),
    },
    {
      id: nextUuid("43000000"),
      tenant_id: tenant.id,
      actor_user_id: actorOwner.userId,
      action: "report_generate",
      resource_type: "report",
      resource_id: reports.find((row) => row.tenant_id === tenant.id)?.id ?? null,
      payload: { reportType: "operational" },
      created_at: iso(shift(anchor, { hours: -6 })),
    },
    {
      id: nextUuid("43000000"),
      tenant_id: tenant.id,
      actor_user_id: actorAnalyst.userId,
      action: "alert_status_update",
      resource_type: "alert",
      resource_id: tenantAlerts[0]?.id ?? null,
      payload: { status: tenantAlerts[0]?.status ?? "new" },
      created_at: iso(shift(anchor, { hours: -5 })),
    },
    {
      id: nextUuid("43000000"),
      tenant_id: tenant.id,
      actor_user_id: actorAnalyst.userId,
      action: "case_update",
      resource_type: "case",
      resource_id: tenantCases[0]?.id ?? null,
      payload: { status: tenantCases[0]?.status ?? "open" },
      created_at: iso(shift(anchor, { hours: -4 })),
    },
  );
}

const recentApiBatch = cdrs
  .filter((cdr) => cdr.tenantId === tenants[0].id)
  .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
  .slice(0, 180)
  .reverse();

const cdrIngestJobs = [
  {
    id: nextUuid("44000000"),
    tenant_id: tenants[0].id,
    created_by: users.find((user) => user.tenantId === tenants[0].id && user.role === "analyst").userId,
    status: "completed",
    priority: 8,
    payload: { records: recentApiBatch.slice(0, 12).map(toApiCdrRow) },
    record_count: 12,
    attempts: 0,
    max_attempts: 3,
    worker_id: "worker_demo_ingest_01",
    error_message: null,
    result: {
      inserted: 12,
      alertsGenerated: 5,
      quality: { total: 12, missingMsisdn: 0, invalidDuration: 0, negativeAmounts: 0, qualityScore: 100 },
    },
    started_at: iso(shift(anchor, { hours: -4, minutes: -20 })),
    completed_at: iso(shift(anchor, { hours: -4 })),
    created_at: iso(shift(anchor, { hours: -4, minutes: -30 })),
    updated_at: iso(shift(anchor, { hours: -4 })),
  },
  {
    id: nextUuid("44000000"),
    tenant_id: tenants[0].id,
    created_by: users.find((user) => user.tenantId === tenants[0].id && user.role === "admin").userId,
    status: "pending",
    priority: 9,
    payload: { records: recentApiBatch.slice(12, 24).map(toApiCdrRow) },
    record_count: 12,
    attempts: 0,
    max_attempts: 4,
    worker_id: null,
    error_message: null,
    result: null,
    started_at: null,
    completed_at: null,
    created_at: iso(shift(anchor, { hours: -1, minutes: -15 })),
    updated_at: iso(shift(anchor, { hours: -1, minutes: -15 })),
  },
  {
    id: nextUuid("44000000"),
    tenant_id: tenants[0].id,
    created_by: users.find((user) => user.tenantId === tenants[0].id && user.role === "admin").userId,
    status: "failed",
    priority: 6,
    payload: { records: recentApiBatch.slice(24, 30).map(toApiCdrRow) },
    record_count: 6,
    attempts: 3,
    max_attempts: 3,
    worker_id: "worker_demo_ingest_02",
    error_message: "Transient duplicate key conflict on alert upsert.",
    result: null,
    started_at: iso(shift(anchor, { hours: -10, minutes: -30 })),
    completed_at: iso(shift(anchor, { hours: -10, minutes: -10 })),
    created_at: iso(shift(anchor, { hours: -10, minutes: -40 })),
    updated_at: iso(shift(anchor, { hours: -10, minutes: -10 })),
  },
  {
    id: nextUuid("44000000"),
    tenant_id: tenants[1].id,
    created_by: users.find((user) => user.tenantId === tenants[1].id && user.role === "analyst").userId,
    status: "completed",
    priority: 7,
    payload: {
      records: cdrs
        .filter((cdr) => cdr.tenantId === tenants[1].id)
        .slice(-10)
        .map(toApiCdrRow),
    },
    record_count: 10,
    attempts: 0,
    max_attempts: 3,
    worker_id: "worker_nst_ingest_01",
    error_message: null,
    result: {
      inserted: 10,
      alertsGenerated: 3,
      quality: { total: 10, missingMsisdn: 0, invalidDuration: 0, negativeAmounts: 0, qualityScore: 100 },
    },
    started_at: iso(shift(anchor, { hours: -6, minutes: -30 })),
    completed_at: iso(shift(anchor, { hours: -6 })),
    created_at: iso(shift(anchor, { hours: -6, minutes: -40 })),
    updated_at: iso(shift(anchor, { hours: -6 })),
  },
];

const mlModelRegistry = [
  {
    id: nextUuid("45000000"),
    tenant_id: "",
    model_name: "fraud-model",
    model_version: "v1-default",
    source_type: "local",
    metrics: { accuracy: 0.91, precision: 0.88, recall: 0.86, f1: 0.87 },
    artifact_path: "models/fraud-model-v1.json",
    is_active: true,
    created_by: users.find((user) => user.role === "owner" && user.tenantId === tenants[0].id).userId,
    created_at: iso(shift(anchor, { days: -7 })),
  },
  {
    id: nextUuid("45000000"),
    tenant_id: tenants[0].id,
    model_name: "fraud-model",
    model_version: "v1-demo-20260314",
    source_type: "local",
    metrics: { accuracy: 0.94, precision: 0.9, recall: 0.89, f1: 0.895 },
    artifact_path: "models/fraud-model-v1.json",
    is_active: true,
    created_by: users.find((user) => user.role === "analyst" && user.tenantId === tenants[0].id).userId,
    created_at: iso(shift(anchor, { days: -1 })),
  },
];

function dailyCounts(sourceRows, tenantId, dateSelector) {
  const rows = sourceRows.filter((row) => row.tenant_id === tenantId || row.tenantId === tenantId);
  const map = new Map();
  for (const row of rows) {
    const key = dateSelector(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

const kpisDaily = [];
for (const tenant of tenants) {
  const cdrDaily = dailyCounts(cdrs, tenant.id, (row) => new Date(row.eventTime).toISOString().slice(0, 10));
  const alertDaily = dailyCounts(alerts, tenant.id, (row) => row.created_at.slice(0, 10));
  const caseDaily = dailyCounts(cases, tenant.id, (row) => row.created_at.slice(0, 10));
  const reconciliationDaily = dailyCounts(reconciliationResults, tenant.id, (row) => row.created_at.slice(0, 10));
  const qualityByDay = new Map(
    qualityRuns
      .filter((row) => row.tenant_id === tenant.id)
      .map((row) => [row.created_at.slice(0, 10), row.quality_score]),
  );
  for (let i = 13; i >= 0; i -= 1) {
    const date = dateOnly(shift(anchor, { days: -i }));
    const leakageAmount = reconciliationResults
      .filter((row) => row.tenant_id === tenant.id && row.created_at.startsWith(date))
      .reduce((sum, row) => sum + row.leakage_amount, 0);
    const recoveredAmount = cases
      .filter((row) => row.tenant_id === tenant.id && row.created_at.startsWith(date) && (row.status === "resolved" || row.status === "closed"))
      .reduce((sum, row) => sum + row.revenue_impact, 0);
    kpisDaily.push({
      date,
      tenant_id: tenant.id,
      cdr_count: cdrDaily.get(date) ?? 0,
      alert_count: alertDaily.get(date) ?? 0,
      case_count: caseDaily.get(date) ?? 0,
      reconciliation_count: reconciliationDaily.get(date) ?? 0,
      leakage_amount: roundMoney(leakageAmount),
      recovered_amount: roundMoney(recoveredAmount),
      quality_score: qualityByDay.get(date) ?? 99.5,
    });
  }
}

const trafficGroup = new Map();
for (const cdr of cdrs.filter((row) => new Date(row.eventTime).getTime() >= shift(anchor, { days: -3 }).getTime())) {
  const hourBucket = new Date(cdr.eventTime);
  hourBucket.setUTCMinutes(0, 0, 0);
  const routeClass = cdr.originCountry === cdr.destinationCountry ? "domestic" : "international";
  const key = [cdr.tenantId, hourBucket.toISOString(), cdr.callType, routeClass].join("|");
  if (!trafficGroup.has(key)) {
    trafficGroup.set(key, {
      hour_bucket: hourBucket.toISOString(),
      tenant_id: cdr.tenantId,
      call_type: cdr.callType,
      route_class: routeClass,
      record_count: 0,
      total_duration_seconds: 0,
      total_charge_amount: 0,
      total_billed_amount: 0,
      anomaly_count: 0,
    });
  }
  const row = trafficGroup.get(key);
  row.record_count += 1;
  row.total_duration_seconds += cdr.durationSeconds;
  row.total_charge_amount += cdr.chargeAmount;
  row.total_billed_amount += cdr.billedAmount;
  if (cdr.scenario !== "normal") row.anomaly_count += 1;
}

const trafficPatternsHourly = Array.from(trafficGroup.values())
  .sort((a, b) => new Date(a.hour_bucket).getTime() - new Date(b.hour_bucket).getTime())
  .map((row) => ({
    hour_bucket: row.hour_bucket,
    tenant_id: row.tenant_id,
    call_type: row.call_type,
    route_class: row.route_class,
    record_count: row.record_count,
    total_duration_seconds: row.total_duration_seconds,
    total_charge_amount: roundMoney(row.total_charge_amount),
    total_billed_amount: roundMoney(row.total_billed_amount),
    anomaly_score: Number(Math.min(0.99, row.anomaly_count / Math.max(1, row.record_count) + Math.abs(row.total_billed_amount - row.total_charge_amount) / Math.max(100, row.total_charge_amount) / 10).toFixed(2)),
  }));

const apiInterconnectChecks = agreements
  .filter((agreement) => agreement.agreement_type === "interconnect")
  .flatMap((agreement) => [
    {
      partnerId: agreement.partner_id,
      routeCode: agreement.route_code,
      expectedTariff: agreement.expected_tariff,
      actualTariff: roundMoney(agreement.expected_tariff * 1.01),
      minutes: 3200,
    },
    {
      partnerId: agreement.partner_id,
      routeCode: agreement.route_code,
      expectedTariff: agreement.expected_tariff,
      actualTariff: roundMoney(agreement.expected_tariff * 1.19),
      minutes: 5100,
    },
  ]);

const apiRoamingChecks = cdrs
  .filter((cdr) => cdr.scenario === "roaming_fraud" || (cdr.callType === "data" && cdr.originCountry !== cdr.destinationCountry))
  .slice(0, 16)
  .map((cdr) => ({
    subscriberId: cdr.subscriberId,
    homeCountry: subscribers.find((subscriber) => subscriber.subscriberId === cdr.subscriberId).homeCountry,
    visitedCountry: cdr.destinationCountry,
    billedAmount: cdr.billedAmount,
    expectedAmount: cdr.scenario === "roaming_fraud" ? roundMoney(cdr.chargeAmount * randFloat(0.9, 1.1)) : roundMoney(cdr.billedAmount * randFloat(0.92, 1.04)),
    usageMb: cdr.usageMb ?? randFloat(250, 3200),
  }));

const apiRecoveryInputs = [
  { estimatedLoss: 18000, recoveredAmount: 6200 },
  { estimatedLoss: 9500, recoveredAmount: 5100 },
  { estimatedLoss: 4200, recoveredAmount: 3900 },
  { estimatedLoss: 15000, recoveredAmount: 10400 },
  { estimatedLoss: 2600, recoveredAmount: 1800 },
];

const apiReportRequests = [
  {
    reportType: "operational",
    periodFrom: dateOnly(shift(anchor, { days: -7 })),
    periodTo: dateOnly(anchor),
    distribution_json: ["fraud-ops@demo-telecom.test"],
  },
  {
    reportType: "compliance",
    periodFrom: dateOnly(shift(anchor, { days: -30 })),
    periodTo: dateOnly(anchor),
    distribution_json: ["audit@demo-telecom.test", "cfo@demo-telecom.test"],
  },
  {
    reportType: "executive",
    periodFrom: dateOnly(shift(anchor, { days: -14 })),
    periodTo: dateOnly(anchor),
    distribution_json: ["risk-committee@northstar-wireless.test"],
  },
];

const apiAlertStatusUpdates = alerts.slice(0, 12).map((alert, index) => ({
  id: alert.id,
  status: index % 3 === 0 ? "acknowledged" : index % 3 === 1 ? "closed" : "new",
}));

const uncasedAlerts = alerts.filter((alert) => !casedAlertIds.has(alert.id)).slice(0, 8);
const apiCaseCreateRequests = uncasedAlerts.map((alert, index) => {
  const tenantUsers = (usersByTenant.get(alert.tenant_id) ?? []).filter((user) => user.role === "analyst" || user.role === "admin");
  return {
    title: `Investigate ${alert.fraud_type.replaceAll("_", " ")} signal ${index + 1}`,
    assigneeUserId: tenantUsers[index % tenantUsers.length].userId,
    alertId: alert.id,
    revenueImpact: roundMoney(randFloat(200, 2400)),
    notes: "Synthetic case creation payload for API testing.",
  };
});

const apiCaseUpdates = cases.slice(0, 12).map((row) => ({
  id: row.id,
  status:
    row.status === "open"
      ? "investigating"
      : row.status === "investigating"
        ? "resolved"
        : "closed",
  assigneeUserId: row.assignee_user_id,
  notes: `Update payload for ${row.id}`,
  revenueImpact: roundMoney(row.revenue_impact * randFloat(1, 1.15)),
}));

const apiConnectorSyncRequests = [
  { connectorNames_json: ["amdocs", "oracle"], dryRun: true },
  { connectorNames_json: ["ericsson"], dryRun: false },
  { connectorNames_json: ["huawei", "amdocs"], dryRun: false },
];

function toApiCdrRow(cdr) {
  return {
    tenantId: cdr.tenantId,
    subscriberId: cdr.subscriberId,
    imsi: cdr.imsi,
    msisdn: cdr.msisdn,
    callType: cdr.callType,
    originCountry: cdr.originCountry,
    destinationCountry: cdr.destinationCountry,
    durationSeconds: cdr.durationSeconds,
    chargeAmount: cdr.chargeAmount,
    billedAmount: cdr.billedAmount,
    eventTime: cdr.eventTime,
    sourceSystem: cdr.sourceSystem,
    cellId: cdr.cellId,
    networkElementId: cdr.networkElementId,
  };
}

function trainingRowFromCdr(cdr) {
  return {
    call_type: cdr.callType,
    origin_country: cdr.originCountry,
    destination_country: cdr.destinationCountry,
    duration_seconds: cdr.durationSeconds,
    charge_amount: cdr.chargeAmount,
    billed_amount: cdr.billedAmount,
    source_system: cdr.sourceSystem,
    label: cdr.scenario,
  };
}

function mutateTrainingRow(baseRow, label) {
  const row = { ...baseRow };
  if (label === "pbx_hacking") {
    row.duration_seconds = randInt(8000, 13200);
    row.charge_amount = randFloat(260, 680);
    row.billed_amount = roundMoney(row.charge_amount + randFloat(620, 1600));
  } else if (label === "sim_box") {
    row.duration_seconds = randInt(1, 6);
    row.charge_amount = randFloat(0, 0.04, 2);
    row.billed_amount = chance(0.7) ? 0 : randFloat(0, 0.02, 2);
  } else if (label === "subscription_fraud") {
    row.duration_seconds = randInt(20, 180);
    row.charge_amount = chance(0.5) ? 0 : randFloat(4, 18);
    row.billed_amount = randFloat(160, 680);
  } else if (label === "roaming_fraud") {
    if (chance(0.5)) {
      row.call_type = "voice";
      row.duration_seconds = randInt(180, 1600);
      row.charge_amount = randFloat(50, 170);
      row.billed_amount = roundMoney(row.charge_amount * randFloat(2.2, 4.5));
    } else {
      row.call_type = "data";
      row.duration_seconds = randInt(15, 55);
      row.charge_amount = randFloat(40, 120);
      row.billed_amount = randFloat(240, 780);
    }
  } else if (label === "interconnect_leakage") {
    row.call_type = "voice";
    row.duration_seconds = randInt(240, 2200);
    row.charge_amount = randFloat(90, 420);
    row.billed_amount = randFloat(35, 210);
  }
  return row;
}

const anomaliesByClass = new Map();
for (const cdr of cdrs.filter((row) => row.scenario !== "normal")) {
  const rows = anomaliesByClass.get(cdr.scenario) ?? [];
  rows.push(cdr);
  anomaliesByClass.set(cdr.scenario, rows);
}

const mlTrainingRows = [];
for (const fraudType of ["subscription_fraud", "pbx_hacking", "sim_box", "roaming_fraud", "interconnect_leakage"]) {
  const seeds = anomaliesByClass.get(fraudType) ?? [];
  for (const seed of seeds) {
    mlTrainingRows.push(trainingRowFromCdr(seed));
  }
  let counter = 0;
  while (mlTrainingRows.filter((row) => row.label === fraudType).length < 40) {
    const seed = seeds[counter % seeds.length];
    mlTrainingRows.push(mutateTrainingRow(trainingRowFromCdr(seed), fraudType));
    counter += 1;
  }
}

writeCsv(
  "db/tenants.csv",
  tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    created_at: tenant.createdAt,
  })),
  ["id", "name", "slug", "status", "created_at"],
);

writeCsv("db/profiles.csv", profiles, ["id", "full_name", "created_at", "updated_at"]);
writeCsv("db/memberships.csv", memberships, ["id", "tenant_id", "user_id", "role", "is_active", "created_at"]);

writeCsv(
  "db/cdrs.csv",
  cdrs.map((cdr) => ({
    id: cdr.id,
    tenant_id: cdr.tenantId,
    subscriber_id: cdr.subscriberId,
    imsi: cdr.imsi,
    msisdn: cdr.msisdn,
    call_type: cdr.callType,
    origin_country: cdr.originCountry,
    destination_country: cdr.destinationCountry,
    duration_seconds: cdr.durationSeconds,
    charge_amount: cdr.chargeAmount,
    billed_amount: cdr.billedAmount,
    event_time: cdr.eventTime,
    source_system: cdr.sourceSystem,
    cell_id: cdr.cellId,
    network_element_id: cdr.networkElementId,
    created_at: iso(shift(new Date(cdr.eventTime), { minutes: 2 })),
  })),
  [
    "id",
    "tenant_id",
    "subscriber_id",
    "imsi",
    "msisdn",
    "call_type",
    "origin_country",
    "destination_country",
    "duration_seconds",
    "charge_amount",
    "billed_amount",
    "event_time",
    "source_system",
    "cell_id",
    "network_element_id",
    "created_at",
  ],
);

writeCsv(
  "db/alerts.csv",
  alerts,
  ["id", "tenant_id", "cdr_id", "title", "description", "fraud_type", "severity", "confidence", "dedupe_key", "status", "created_at"],
);

writeCsv(
  "db/cases.csv",
  cases,
  ["id", "tenant_id", "title", "status", "assignee_user_id", "alert_id", "revenue_impact", "notes", "created_at", "updated_at"],
);

writeCsv(
  "db/rules.csv",
  rules,
  ["id", "tenant_id", "rule_name", "rule_type", "threshold", "is_active", "created_at"],
);

writeCsv(
  "db/reconciliation_results.csv",
  reconciliationResults,
  ["id", "tenant_id", "record_key", "mismatch_amount", "leakage_amount", "severity", "status", "created_at"],
);

writeCsv("db/partners.csv", partners, ["id", "tenant_id", "name", "partner_type", "status", "created_at"]);
writeCsv(
  "db/network_elements.csv",
  networkElements,
  ["id", "tenant_id", "element_code", "element_type", "region", "status", "anomaly_score", "revenue_impact", "created_at"],
);

writeCsv(
  "db/workflows.csv",
  workflows,
  ["id", "tenant_id", "workflow_name", "workflow_type", "status", "is_active", "updated_at"],
);

writeCsv(
  "db/settlements.csv",
  settlements,
  ["id", "tenant_id", "partner_id", "period_start", "period_end", "amount_due", "amount_paid", "status", "created_at"],
);

writeCsv(
  "db/reports.csv",
  reports,
  ["id", "tenant_id", "report_type", "status", "payload", "generated_at"],
);

writeCsv(
  "db/audit_logs.csv",
  auditLogs,
  ["id", "tenant_id", "actor_user_id", "action", "resource_type", "resource_id", "payload", "created_at"],
);

writeCsv(
  "db/data_quality_runs.csv",
  qualityRuns,
  ["id", "tenant_id", "quality_score", "checked_count", "failed_count", "payload", "created_at"],
);

writeCsv(
  "db/data_lineage_events.csv",
  lineageEvents,
  ["id", "tenant_id", "source_system", "dataset", "operation", "record_count", "processed_at"],
);

writeCsv(
  "db/cdr_ingest_jobs.csv",
  cdrIngestJobs,
  [
    "id",
    "tenant_id",
    "created_by",
    "status",
    "priority",
    "payload",
    "record_count",
    "attempts",
    "max_attempts",
    "worker_id",
    "error_message",
    "result",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
  ],
);

writeCsv(
  "db/ml_model_registry.csv",
  mlModelRegistry,
  ["id", "tenant_id", "model_name", "model_version", "source_type", "metrics", "artifact_path", "is_active", "created_by", "created_at"],
);

writeCsv(
  "api/cdr_ingest_batch.csv",
  recentApiBatch.map(toApiCdrRow),
  ["tenantId", "subscriberId", "imsi", "msisdn", "callType", "originCountry", "destinationCountry", "durationSeconds", "chargeAmount", "billedAmount", "eventTime", "sourceSystem", "cellId", "networkElementId"],
);

writeCsv(
  "api/fraud_analyze_batch.csv",
  recentApiBatch.slice(0, 120).map(toApiCdrRow),
  ["tenantId", "subscriberId", "imsi", "msisdn", "callType", "originCountry", "destinationCountry", "durationSeconds", "chargeAmount", "billedAmount", "eventTime", "sourceSystem", "cellId", "networkElementId"],
);

writeCsv(
  "api/reconciliation_items.csv",
  reconciliationItems,
  ["tenantId", "recordKey", "billedAmount", "mediatedAmount", "collectedAmount"],
);

writeCsv(
  "api/interconnect_checks.csv",
  apiInterconnectChecks,
  ["partnerId", "routeCode", "expectedTariff", "actualTariff", "minutes"],
);

writeCsv(
  "api/roaming_checks.csv",
  apiRoamingChecks,
  ["subscriberId", "homeCountry", "visitedCountry", "billedAmount", "expectedAmount", "usageMb"],
);

writeCsv(
  "api/recovery_inputs.csv",
  apiRecoveryInputs,
  ["estimatedLoss", "recoveredAmount"],
);

writeCsv(
  "api/report_requests.csv",
  apiReportRequests,
  ["reportType", "periodFrom", "periodTo", "distribution_json"],
);

writeCsv(
  "api/alert_status_updates.csv",
  apiAlertStatusUpdates,
  ["id", "status"],
);

writeCsv(
  "api/case_create_requests.csv",
  apiCaseCreateRequests,
  ["title", "assigneeUserId", "alertId", "revenueImpact", "notes"],
);

writeCsv(
  "api/case_updates.csv",
  apiCaseUpdates,
  ["id", "status", "assigneeUserId", "notes", "revenueImpact"],
);

writeCsv(
  "api/connector_sync_requests.csv",
  apiConnectorSyncRequests,
  ["connectorNames_json", "dryRun"],
);

writeCsv(
  "ml/cdr_ml_training.csv",
  mlTrainingRows,
  ["call_type", "origin_country", "destination_country", "duration_seconds", "charge_amount", "billed_amount", "source_system", "label"],
);

writeCsv(
  "supplemental/users.csv",
  users.map((user) => ({
    user_id: user.userId,
    tenant_id: user.tenantId,
    email: user.email,
    full_name: user.fullName,
    title: user.title,
    department: user.department,
    role: user.role,
    phone: user.phone,
    location_id: user.locationId,
    is_active: user.isActive,
    created_at: user.createdAt,
  })),
  ["user_id", "tenant_id", "email", "full_name", "title", "department", "role", "phone", "location_id", "is_active", "created_at"],
);

writeCsv("supplemental/roles.csv", roles, ["role_name", "description", "permissions_json"]);
writeCsv(
  "supplemental/locations.csv",
  locations,
  ["location_id", "tenant_id", "site_name", "city", "region", "country_code", "country_name", "latitude", "longitude", "time_zone"],
);
writeCsv(
  "supplemental/networks.csv",
  networks,
  ["network_id", "tenant_id", "network_code", "network_name", "technology", "country_code", "mcc", "mnc", "status", "launch_date"],
);
writeCsv(
  "supplemental/services.csv",
  services,
  ["service_id", "service_code", "service_name", "category", "billing_unit", "description"],
);
writeCsv(
  "supplemental/tariffs.csv",
  tariffs,
  ["tariff_id", "tenant_id", "service_id", "tariff_name", "zone", "rate", "currency", "billing_basis", "is_roaming", "status", "effective_from", "monthly_plan_amount"],
);
writeCsv(
  "supplemental/subscribers.csv",
  subscribers.map((subscriber) => ({
    subscriber_id: subscriber.subscriberId,
    tenant_id: subscriber.tenantId,
    customer_name: subscriber.customerName,
    customer_segment: subscriber.customerSegment,
    imsi: subscriber.imsi,
    msisdn: subscriber.msisdn,
    activation_date: subscriber.activationDate,
    status: subscriber.status,
    home_country: subscriber.homeCountry,
    home_location_id: subscriber.homeLocationId,
    network_id: subscriber.networkId,
    device_id: subscriber.deviceId,
    tariff_id: subscriber.tariffId,
    monthly_plan_amount: subscriber.monthlyPlanAmount,
    risk_band: subscriber.riskBand,
    primary_service_code: subscriber.primaryServiceCode,
    is_roaming_enabled: subscriber.isRoamingEnabled,
  })),
  ["subscriber_id", "tenant_id", "customer_name", "customer_segment", "imsi", "msisdn", "activation_date", "status", "home_country", "home_location_id", "network_id", "device_id", "tariff_id", "monthly_plan_amount", "risk_band", "primary_service_code", "is_roaming_enabled"],
);
writeCsv(
  "supplemental/devices.csv",
  devices,
  ["device_id", "tenant_id", "subscriber_id", "imei", "device_type", "manufacturer", "model", "os_version", "is_roaming_capable", "first_seen_at", "last_seen_at"],
);
writeCsv(
  "supplemental/agreements.csv",
  agreements,
  ["agreement_id", "tenant_id", "partner_id", "agreement_name", "agreement_type", "route_code", "expected_tariff", "agreed_tariff", "currency", "effective_from", "effective_to", "settlement_cycle_days", "status"],
);
writeCsv(
  "supplemental/revenue_streams.csv",
  revenueStreams,
  ["revenue_stream_id", "tenant_id", "stream_name", "channel", "service_id", "partner_id", "monthly_target", "month_to_date_actual", "variance_amount", "status"],
);
writeCsv(
  "supplemental/billing_systems.csv",
  billingSystems,
  ["tenant_id", "name", "vendor", "supports_realtime", "supports_mobile_monitoring", "supports_report_distribution", "health", "last_sync_at", "latency_ms", "records_pulled_last_sync"],
);
writeCsv(
  "supplemental/dashboard_cards.csv",
  dashboardCards,
  ["channel", "id", "title", "widget", "priority"],
);
writeCsv(
  "supplemental/kpis_daily.csv",
  kpisDaily,
  ["date", "tenant_id", "cdr_count", "alert_count", "case_count", "reconciliation_count", "leakage_amount", "recovered_amount", "quality_score"],
);
writeCsv(
  "supplemental/traffic_patterns_hourly.csv",
  trafficPatternsHourly,
  ["hour_bucket", "tenant_id", "call_type", "route_class", "record_count", "total_duration_seconds", "total_charge_amount", "total_billed_amount", "anomaly_score"],
);

writeCsv(
  "manifest.csv",
  manifest.map((item) => ({
    path: item.path,
    row_count: item.row_count,
    category: item.category,
  })),
  ["path", "row_count", "category"],
);

const summary = {
  outputDir,
  files: manifest.length,
  cdrs: cdrs.length,
  alerts: alerts.length,
  cases: cases.length,
  reconciliationResults: reconciliationResults.length,
  mlTrainingRows: mlTrainingRows.length,
};

console.log("Synthetic sample data generated.");
console.log(JSON.stringify(summary, null, 2));
