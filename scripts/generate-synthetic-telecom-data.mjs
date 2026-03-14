#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), process.argv[2] || "data/synthetic");
const BASE_DATE = new Date(process.argv[3] || "2026-03-14T12:00:00.000Z");
const SEED = 20260314;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

function chance(probability) {
  return rand() < probability;
}

function int(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function float(min, max, decimals = 2) {
  return Number((min + rand() * (max - min)).toFixed(decimals));
}

function pick(items) {
  return items[int(0, items.length - 1)];
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const threshold = rand() * total;
  let cursor = 0;
  for (const item of items) {
    cursor += item.weight;
    if (threshold <= cursor) {
      return item.value;
    }
  }
  return items[items.length - 1]?.value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function iso(date) {
  return new Date(date).toISOString();
}

function dateOnly(date) {
  return iso(date).slice(0, 10);
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60_000);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * 86_400_000);
}

function randomRecentDate(maxDaysBack, recentBias = 2.2) {
  const minutesBack = Math.floor(Math.pow(rand(), recentBias) * maxDaysBack * 24 * 60);
  return new Date(BASE_DATE.getTime() - minutesBack * 60_000);
}

function hourBucket(isoString) {
  return `${isoString.slice(0, 13)}:00:00.000Z`;
}

function monthString(date) {
  return iso(date).slice(0, 7);
}

function escapeCsv(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function writeCsv(filename, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
  }
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  return rows.length;
}

let uuidCounter = 1;

function nextUuid() {
  const hex = uuidCounter.toString(16).padStart(32, "0");
  uuidCounter += 1;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function sequence(prefix, index, digits = 4) {
  return `${prefix}${String(index).padStart(digits, "0")}`;
}

function countryPoolFor(homeCountry) {
  if (homeCountry === "IN") {
    return ["AE", "US", "GB", "SG", "SA", "MY"];
  }
  return ["IN", "SA", "GB", "DE", "EG", "TR"];
}

function msisdnFor(countryCode, serial) {
  const prefix = countryCode === "IN" ? "91" : "971";
  const firstDigit = countryCode === "IN" ? "9" : "5";
  return `${prefix}${firstDigit}${String(70000000 + serial).padStart(8, "0")}`;
}

function imsiFor(mcc, mnc, serial) {
  return `${mcc}${mnc}${String(1000000000 + serial).slice(-10)}`;
}

function imeiFor(serial) {
  return `35${String(1000000000000 + serial).slice(-13)}`;
}

function fraudTypeFromCdr(cdr) {
  const international = cdr.origin_country !== cdr.destination_country;
  const delta = Math.abs(Number(cdr.charge_amount) - Number(cdr.billed_amount));
  if (
    cdr.call_type === "voice" &&
    (Number(cdr.duration_seconds) > 7200 ||
      (international && Number(cdr.duration_seconds) > 3600 && delta > 500))
  ) {
    return "pbx_hacking";
  }
  if (
    cdr.call_type === "voice" &&
    international &&
    Number(cdr.duration_seconds) <= 6 &&
    (Number(cdr.billed_amount) === 0 || Number(cdr.charge_amount) <= 0.05)
  ) {
    return "sim_box";
  }
  if (
    cdr.call_type === "data" &&
    ((Number(cdr.charge_amount) === 0 && Number(cdr.billed_amount) > 0) ||
      (Number(cdr.billed_amount) > 0 &&
        Number(cdr.charge_amount) / Math.max(0.01, Number(cdr.billed_amount)) < 0.2))
  ) {
    return "subscription_fraud";
  }
  if (
    international &&
    (Number(cdr.billed_amount) > Number(cdr.charge_amount) * 2 ||
      (cdr.call_type === "data" &&
        Number(cdr.billed_amount) > 200 &&
        Number(cdr.duration_seconds) < 60))
  ) {
    return "roaming_fraud";
  }
  if (Number(cdr.billed_amount) < Number(cdr.charge_amount) * 0.85) {
    return "interconnect_leakage";
  }
  return "unknown";
}

function severityForCdr(cdr, fraudType) {
  const delta = Math.abs(Number(cdr.charge_amount) - Number(cdr.billed_amount));
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

function confidenceForCdr(cdr, fraudType) {
  const chargeAmount = Number(cdr.charge_amount);
  const billedAmount = Number(cdr.billed_amount);
  const deltaRatio =
    chargeAmount === 0 ? 1 : Math.min(1, Math.abs(chargeAmount - billedAmount) / Math.max(0.01, chargeAmount));
  const international = cdr.origin_country !== cdr.destination_country;
  const intlBoost = international ? 0.04 : 0;
  const durationBoost = Number(cdr.duration_seconds) > 3600 ? 0.03 : 0;
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
  return round(Math.min(0.99, base + deltaRatio * 0.15 + intlBoost + durationBoost), 2);
}

function reconcileItem(item) {
  const billedVsMediated = Math.abs(Number(item.billed_amount) - Number(item.mediated_amount));
  const billedVsCollected = Math.max(0, Number(item.billed_amount) - Number(item.collected_amount));
  const mediatedVsCollected = Math.max(0, Number(item.mediated_amount) - Number(item.collected_amount));
  const mismatchAmount = round(billedVsMediated, 2);
  const leakageAmount = round(Math.max(billedVsCollected, mediatedVsCollected) + billedVsMediated, 2);
  let severity = "low";
  if (leakageAmount >= 1000) {
    severity = "critical";
  } else if (leakageAmount >= 300) {
    severity = "high";
  } else if (leakageAmount >= 50) {
    severity = "medium";
  }
  return {
    mismatch_amount: mismatchAmount,
    leakage_amount: leakageAmount,
    severity,
    status: leakageAmount > 0 ? "mismatch" : "matched",
  };
}

function validateRoamingEvent(item) {
  const deviationAmount = round(Number(item.billed_amount) - Number(item.expected_amount), 2);
  const suspicious =
    item.home_country !== item.visited_country &&
    (Math.abs(deviationAmount) > 50 ||
      (Number(item.usage_mb) > 5000 &&
        Number(item.billed_amount) < Number(item.expected_amount) * 0.5));
  return {
    deviation_amount: deviationAmount,
    status: suspicious ? "suspicious" : "valid",
    reason: suspicious ? "Potential roaming revenue anomaly" : "",
  };
}

function validateInterconnectCheck(item) {
  const variance = round(Number(item.actual_tariff) - Number(item.expected_tariff), 4);
  const variancePct = round(
    Number(item.expected_tariff) === 0
      ? 100
      : (Math.abs(variance) / Math.max(0.0001, Number(item.expected_tariff))) * 100,
    2,
  );
  const revenueImpact = round(Math.abs(variance) * Number(item.minutes), 2);
  return {
    variance,
    variance_pct: variancePct,
    revenue_impact: revenueImpact,
    status: variancePct <= 2 ? "valid" : "invalid",
  };
}

const tenants = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo Telecom India",
    slug: "demo-telecom-india",
    status: "active",
    created_at: "2025-11-01T08:00:00.000Z",
    code: "DTI",
    homeCountry: "IN",
    currency: "INR",
    mcc: "404",
    mnc: "45",
    locations: [
      { city: "Mumbai", region: "west", code: "MUM", lat: 19.076, lon: 72.8777 },
      { city: "Delhi", region: "north", code: "DEL", lat: 28.6139, lon: 77.209 },
      { city: "Bengaluru", region: "south", code: "BLR", lat: 12.9716, lon: 77.5946 },
      { city: "Kolkata", region: "east", code: "CCU", lat: 22.5726, lon: 88.3639 },
    ],
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Skyline Mobile Gulf",
    slug: "skyline-mobile-gulf",
    status: "active",
    created_at: "2025-11-18T08:00:00.000Z",
    code: "SMG",
    homeCountry: "AE",
    currency: "AED",
    mcc: "424",
    mnc: "02",
    locations: [
      { city: "Dubai", region: "north", code: "DXB", lat: 25.2048, lon: 55.2708 },
      { city: "Abu Dhabi", region: "west", code: "AUH", lat: 24.4539, lon: 54.3773 },
      { city: "Sharjah", region: "east", code: "SHJ", lat: 25.3463, lon: 55.4209 },
      { city: "Al Ain", region: "south", code: "AAN", lat: 24.2075, lon: 55.7447 },
    ],
  },
];

const roles = [
  {
    role_name: "owner",
    description: "Full tenant administration and commercial approval authority",
    can_manage_users: true,
    can_manage_rules: true,
    can_view_reports: true,
    can_manage_connectors: true,
  },
  {
    role_name: "admin",
    description: "Operational administration across fraud, RA, and integrations",
    can_manage_users: true,
    can_manage_rules: true,
    can_view_reports: true,
    can_manage_connectors: true,
  },
  {
    role_name: "analyst",
    description: "Investigates alerts, executes reconciliations, and prepares reports",
    can_manage_users: false,
    can_manage_rules: true,
    can_view_reports: true,
    can_manage_connectors: false,
  },
  {
    role_name: "viewer",
    description: "Read-only access for executives, auditors, and partner observers",
    can_manage_users: false,
    can_manage_rules: false,
    can_view_reports: true,
    can_manage_connectors: false,
  },
];

const userTemplates = [
  ["aarav.shah", "Aarav Shah", "Fraud Operations", "Director"],
  ["meera.nair", "Meera Nair", "Revenue Assurance", "Lead Analyst"],
  ["aditya.rao", "Aditya Rao", "Fraud Operations", "Senior Analyst"],
  ["zara.khan", "Zara Khan", "Network Assurance", "Analyst"],
  ["liam.fernandes", "Liam Fernandes", "Executive Office", "VP Operations"],
  ["omar.haddad", "Omar Haddad", "Fraud Operations", "Director"],
  ["noura.almansoori", "Noura Al Mansoori", "Revenue Assurance", "Lead Analyst"],
  ["samir.qureshi", "Samir Qureshi", "Network Assurance", "Analyst"],
  ["hana.lee", "Hana Lee", "Customer Risk", "Analyst"],
  ["daniel.reed", "Daniel Reed", "Executive Office", "COO"],
];

const users = userTemplates.map(([login, fullName, department, title], index) => ({
  id: nextUuid(),
  email: `${login}@example.com`,
  full_name: fullName,
  department,
  title,
  status: "active",
  primary_tenant_id: index < 5 ? tenants[0].id : tenants[1].id,
  created_at: iso(addDays(BASE_DATE, -(160 - index * 7))),
  updated_at: iso(addDays(BASE_DATE, -(4 + index))),
}));

const memberships = [
  { tenant: tenants[0], user: users[0], role: "owner" },
  { tenant: tenants[0], user: users[1], role: "admin" },
  { tenant: tenants[0], user: users[2], role: "analyst" },
  { tenant: tenants[0], user: users[3], role: "analyst" },
  { tenant: tenants[0], user: users[4], role: "viewer" },
  { tenant: tenants[1], user: users[5], role: "owner" },
  { tenant: tenants[1], user: users[6], role: "admin" },
  { tenant: tenants[1], user: users[7], role: "analyst" },
  { tenant: tenants[1], user: users[8], role: "analyst" },
  { tenant: tenants[1], user: users[9], role: "viewer" },
  { tenant: tenants[0], user: users[8], role: "viewer" },
].map((item, index) => ({
  id: nextUuid(),
  tenant_id: item.tenant.id,
  user_id: item.user.id,
  role: item.role,
  is_active: true,
  created_at: iso(addDays(BASE_DATE, -(140 - index * 5))),
}));

const locations = tenants.flatMap((tenant) =>
  tenant.locations.map((location, index) => ({
    location_id: sequence(`loc_${tenant.code.toLowerCase()}_`, index + 1, 3),
    tenant_id: tenant.id,
    site_code: `${tenant.code}-${location.code}-S${String(index + 1).padStart(2, "0")}`,
    country_code: tenant.homeCountry,
    city: location.city,
    region: location.region,
    latitude: location.lat,
    longitude: location.lon,
    location_type: index % 2 === 0 ? "switch_site" : "data_center",
    status: "active",
  })),
);

const networks = tenants.flatMap((tenant) => [
  {
    network_id: sequence(`net_${tenant.code.toLowerCase()}_`, 1, 2),
    tenant_id: tenant.id,
    operator_name: `${tenant.name} Mobile`,
    mcc: tenant.mcc,
    mnc: tenant.mnc,
    country_code: tenant.homeCountry,
    network_type: "mobile_core",
    technology: "4G/5G",
    roaming_supported: true,
    status: "active",
  },
  {
    network_id: sequence(`net_${tenant.code.toLowerCase()}_`, 2, 2),
    tenant_id: tenant.id,
    operator_name: `${tenant.name} Enterprise Voice`,
    mcc: tenant.mcc,
    mnc: String(Number(tenant.mnc) + 1).padStart(2, "0"),
    country_code: tenant.homeCountry,
    network_type: "enterprise_sip",
    technology: "VoIP",
    roaming_supported: false,
    status: "active",
  },
  {
    network_id: sequence(`net_${tenant.code.toLowerCase()}_`, 3, 2),
    tenant_id: tenant.id,
    operator_name: `${tenant.name} IoT`,
    mcc: tenant.mcc,
    mnc: String(Number(tenant.mnc) + 2).padStart(2, "0"),
    country_code: tenant.homeCountry,
    network_type: "iot",
    technology: "NB-IoT/5G",
    roaming_supported: true,
    status: "active",
  },
]);

const services = tenants.flatMap((tenant) => [
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 1, 2),
    tenant_id: tenant.id,
    service_name: "Domestic Voice",
    category: "voice",
    billing_unit: "minute",
    base_currency: tenant.currency,
    status: "active",
  },
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 2, 2),
    tenant_id: tenant.id,
    service_name: "International Voice",
    category: "voice",
    billing_unit: "minute",
    base_currency: tenant.currency,
    status: "active",
  },
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 3, 2),
    tenant_id: tenant.id,
    service_name: "Domestic SMS",
    category: "sms",
    billing_unit: "sms",
    base_currency: tenant.currency,
    status: "active",
  },
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 4, 2),
    tenant_id: tenant.id,
    service_name: "Mobile Data",
    category: "data",
    billing_unit: "mb",
    base_currency: tenant.currency,
    status: "active",
  },
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 5, 2),
    tenant_id: tenant.id,
    service_name: "Roaming Data",
    category: "roaming",
    billing_unit: "mb",
    base_currency: tenant.currency,
    status: "active",
  },
  {
    service_id: sequence(`svc_${tenant.code.toLowerCase()}_`, 6, 2),
    tenant_id: tenant.id,
    service_name: "Enterprise SIP",
    category: "voice",
    billing_unit: "minute",
    base_currency: tenant.currency,
    status: "active",
  },
]);

const tariffs = [];
for (const tenant of tenants) {
  const tenantServices = services.filter((service) => service.tenant_id === tenant.id);
  tariffs.push(
    {
      tariff_id: sequence(`tar_${tenant.code.toLowerCase()}_`, 1, 2),
      tenant_id: tenant.id,
      service_id: tenantServices[0].service_id,
      tariff_name: "Retail Prepaid Voice",
      origin_country: tenant.homeCountry,
      destination_country: tenant.homeCountry,
      charge_per_minute: tenant.homeCountry === "IN" ? 0.45 : 0.32,
      charge_per_sms: 0,
      charge_per_mb: 0,
      currency: tenant.currency,
      valid_from: "2025-10-01",
      valid_to: "2026-12-31",
      status: "active",
    },
    {
      tariff_id: sequence(`tar_${tenant.code.toLowerCase()}_`, 2, 2),
      tenant_id: tenant.id,
      service_id: tenantServices[1].service_id,
      tariff_name: "Retail International Voice",
      origin_country: tenant.homeCountry,
      destination_country: countryPoolFor(tenant.homeCountry)[0],
      charge_per_minute: tenant.homeCountry === "IN" ? 1.6 : 0.95,
      charge_per_sms: 0,
      charge_per_mb: 0,
      currency: tenant.currency,
      valid_from: "2025-10-01",
      valid_to: "2026-12-31",
      status: "active",
    },
    {
      tariff_id: sequence(`tar_${tenant.code.toLowerCase()}_`, 3, 2),
      tenant_id: tenant.id,
      service_id: tenantServices[3].service_id,
      tariff_name: "Retail Mobile Data 4G/5G",
      origin_country: tenant.homeCountry,
      destination_country: tenant.homeCountry,
      charge_per_minute: 0,
      charge_per_sms: 0,
      charge_per_mb: tenant.homeCountry === "IN" ? 0.02 : 0.03,
      currency: tenant.currency,
      valid_from: "2025-10-01",
      valid_to: "2026-12-31",
      status: "active",
    },
    {
      tariff_id: sequence(`tar_${tenant.code.toLowerCase()}_`, 4, 2),
      tenant_id: tenant.id,
      service_id: tenantServices[4].service_id,
      tariff_name: "Roaming Data Standard",
      origin_country: tenant.homeCountry,
      destination_country: countryPoolFor(tenant.homeCountry)[1],
      charge_per_minute: 0,
      charge_per_sms: 0,
      charge_per_mb: tenant.homeCountry === "IN" ? 0.28 : 0.24,
      currency: tenant.currency,
      valid_from: "2025-10-01",
      valid_to: "2026-12-31",
      status: "active",
    },
    {
      tariff_id: sequence(`tar_${tenant.code.toLowerCase()}_`, 5, 2),
      tenant_id: tenant.id,
      service_id: tenantServices[5].service_id,
      tariff_name: "Enterprise SIP Wholesale",
      origin_country: tenant.homeCountry,
      destination_country: countryPoolFor(tenant.homeCountry)[2],
      charge_per_minute: tenant.homeCountry === "IN" ? 0.72 : 0.51,
      charge_per_sms: 0,
      charge_per_mb: 0,
      currency: tenant.currency,
      valid_from: "2025-10-01",
      valid_to: "2026-12-31",
      status: "active",
    },
  );
}

const revenueStreams = tenants.flatMap((tenant) => [
  {
    revenue_stream_id: sequence(`rev_${tenant.code.toLowerCase()}_`, 1, 2),
    tenant_id: tenant.id,
    stream_name: "Retail Voice",
    category: "retail",
    reporting_month: monthString(BASE_DATE),
    target_amount: tenant.homeCountry === "IN" ? 2400000 : 1600000,
    actual_amount: tenant.homeCountry === "IN" ? 2316000 : 1548000,
    variance_amount: tenant.homeCountry === "IN" ? -84000 : -52000,
    status: "watch",
  },
  {
    revenue_stream_id: sequence(`rev_${tenant.code.toLowerCase()}_`, 2, 2),
    tenant_id: tenant.id,
    stream_name: "Mobile Data",
    category: "retail",
    reporting_month: monthString(BASE_DATE),
    target_amount: tenant.homeCountry === "IN" ? 3600000 : 2400000,
    actual_amount: tenant.homeCountry === "IN" ? 3512000 : 2345000,
    variance_amount: tenant.homeCountry === "IN" ? -88000 : -55000,
    status: "stable",
  },
  {
    revenue_stream_id: sequence(`rev_${tenant.code.toLowerCase()}_`, 3, 2),
    tenant_id: tenant.id,
    stream_name: "Roaming",
    category: "partner",
    reporting_month: monthString(BASE_DATE),
    target_amount: tenant.homeCountry === "IN" ? 680000 : 940000,
    actual_amount: tenant.homeCountry === "IN" ? 612000 : 872000,
    variance_amount: tenant.homeCountry === "IN" ? -68000 : -68000,
    status: "watch",
  },
  {
    revenue_stream_id: sequence(`rev_${tenant.code.toLowerCase()}_`, 4, 2),
    tenant_id: tenant.id,
    stream_name: "Interconnect",
    category: "partner",
    reporting_month: monthString(BASE_DATE),
    target_amount: tenant.homeCountry === "IN" ? 910000 : 1040000,
    actual_amount: tenant.homeCountry === "IN" ? 821000 : 955000,
    variance_amount: tenant.homeCountry === "IN" ? -89000 : -85000,
    status: "investigate",
  },
  {
    revenue_stream_id: sequence(`rev_${tenant.code.toLowerCase()}_`, 5, 2),
    tenant_id: tenant.id,
    stream_name: "Enterprise SIP",
    category: "wholesale",
    reporting_month: monthString(BASE_DATE),
    target_amount: tenant.homeCountry === "IN" ? 720000 : 610000,
    actual_amount: tenant.homeCountry === "IN" ? 736000 : 624000,
    variance_amount: tenant.homeCountry === "IN" ? 16000 : 14000,
    status: "stable",
  },
]);

const deviceCatalog = [
  { vendor: "Samsung", model: "Galaxy A54", device_type: "smartphone", os_version: "Android 14" },
  { vendor: "Apple", model: "iPhone 14", device_type: "smartphone", os_version: "iOS 18" },
  { vendor: "Xiaomi", model: "Redmi Note 13", device_type: "smartphone", os_version: "Android 14" },
  { vendor: "OnePlus", model: "Nord 4", device_type: "smartphone", os_version: "Android 14" },
  { vendor: "Nokia", model: "Industrial Gateway 5G", device_type: "iot_gateway", os_version: "Embedded Linux" },
  { vendor: "Huawei", model: "B535 Router", device_type: "router", os_version: "HarmonyOS" },
];

const subscribers = [];
const devices = [];

for (const tenant of tenants) {
  const tenantNetworks = networks.filter((network) => network.tenant_id === tenant.id);
  const tenantTariffs = tariffs.filter((tariff) => tariff.tenant_id === tenant.id);
  for (let i = 1; i <= 60; i += 1) {
    const customerType = weightedPick([
      { value: "prepaid", weight: 46 },
      { value: "postpaid", weight: 34 },
      { value: "enterprise", weight: 12 },
      { value: "iot", weight: 8 },
    ]);
    const segment =
      customerType === "enterprise"
        ? "enterprise"
        : customerType === "iot"
          ? "iot"
          : chance(0.55)
            ? "mass_market"
            : "high_value";
    const tariff = (() => {
      if (customerType === "enterprise") return tenantTariffs[4];
      if (customerType === "iot") return tenantTariffs[3];
      if (customerType === "postpaid" && chance(0.35)) return tenantTariffs[1];
      if (chance(0.4)) return tenantTariffs[2];
      return tenantTariffs[0];
    })();
    const network =
      customerType === "iot"
        ? tenantNetworks[2]
        : customerType === "enterprise"
          ? tenantNetworks[1]
          : tenantNetworks[0];
    const subscriberId = `${tenant.code}-SUB-${String(i).padStart(4, "0")}`;
    const deviceId = `${tenant.code}-DEV-${String(i).padStart(4, "0")}`;
    const riskBand = weightedPick([
      { value: "low", weight: 56 },
      { value: "medium", weight: 31 },
      { value: "high", weight: 13 },
    ]);
    const arpu =
      customerType === "enterprise"
        ? float(120, 520)
        : customerType === "iot"
          ? float(12, 48)
          : customerType === "postpaid"
            ? float(30, 180)
            : float(8, 65);
    const serial = tenant.homeCountry === "IN" ? i + 1000 : i + 5000;
    subscribers.push({
      subscriber_id: subscriberId,
      tenant_id: tenant.id,
      msisdn: msisdnFor(tenant.homeCountry, serial),
      imsi: imsiFor(tenant.mcc, tenant.mnc, serial),
      customer_type: customerType,
      segment,
      status: chance(0.96) ? "active" : "suspended",
      home_country: tenant.homeCountry,
      home_network_id: network.network_id,
      tariff_id: tariff.tariff_id,
      device_id: deviceId,
      activation_date: dateOnly(addDays(BASE_DATE, -int(45, 720))),
      avg_monthly_revenue: arpu,
      fraud_risk_band: riskBand,
    });
    const deviceProfile = customerType === "iot" ? deviceCatalog[4] : customerType === "enterprise" ? deviceCatalog[5] : pick(deviceCatalog.slice(0, 4));
    devices.push({
      device_id: deviceId,
      tenant_id: tenant.id,
      subscriber_id: subscriberId,
      imei: imeiFor(serial),
      vendor: deviceProfile.vendor,
      model: deviceProfile.model,
      device_type: deviceProfile.device_type,
      os_version: deviceProfile.os_version,
      first_seen_at: iso(addDays(BASE_DATE, -int(20, 420))),
      status: chance(0.97) ? "active" : "inactive",
    });
  }
}

const partnerTemplates = {
  IN: [
    ["Global Interconnect A", "interconnect"],
    ["RoamWide Alliance", "roaming"],
    ["National Carrier Exchange", "interconnect"],
    ["Enterprise SIP Hub", "wholesale"],
  ],
  AE: [
    ["Gulf Interconnect Hub", "interconnect"],
    ["Desert Roaming Exchange", "roaming"],
    ["Regional Carrier Alliance", "interconnect"],
    ["Premium Enterprise Voice", "wholesale"],
  ],
};

const partners = tenants.flatMap((tenant) =>
  partnerTemplates[tenant.homeCountry].map(([name, type], index) => ({
    id: nextUuid(),
    tenant_id: tenant.id,
    name,
    partner_type: type,
    status: chance(0.92) ? "active" : "review",
    created_at: iso(addDays(BASE_DATE, -(120 - index * 10))),
  })),
);

const agreements = [];
for (const tenant of tenants) {
  const tenantPartners = partners.filter((partner) => partner.tenant_id === tenant.id);
  const foreignCountries = countryPoolFor(tenant.homeCountry);
  tenantPartners.forEach((partner, index) => {
    const interconnectRate = tenant.homeCountry === "IN" ? float(0.07, 0.14, 4) : float(0.05, 0.11, 4);
    agreements.push({
      agreement_id: sequence(`agr_${tenant.code.toLowerCase()}_`, index + 1, 3),
      tenant_id: tenant.id,
      partner_id: partner.id,
      agreement_name: `${partner.name} ${partner.partner_type === "roaming" ? "Roaming" : "Traffic"} Agreement`,
      agreement_type: partner.partner_type,
      route_code:
        partner.partner_type === "roaming"
          ? `${tenant.homeCountry}-${foreignCountries[index % foreignCountries.length]}-DATA`
          : `${tenant.homeCountry}-${foreignCountries[index % foreignCountries.length]}-VOICE`,
      expected_tariff: interconnectRate,
      sla_target_pct: partner.partner_type === "roaming" ? 99.2 : 99.5,
      effective_from: "2025-10-01",
      effective_to: "2026-12-31",
      status: "active",
    });
  });
}

const billingSystemDescriptors = [
  {
    name: "amdocs",
    vendor: "Amdocs",
    supports_realtime: true,
    supports_mobile_monitoring: true,
    supports_report_distribution: true,
    health: "healthy",
    average_latency_ms: 340,
    records_last_pull: 1187,
  },
  {
    name: "oracle",
    vendor: "Oracle",
    supports_realtime: false,
    supports_mobile_monitoring: true,
    supports_report_distribution: true,
    health: "degraded",
    average_latency_ms: 520,
    records_last_pull: 943,
  },
  {
    name: "ericsson",
    vendor: "Ericsson",
    supports_realtime: true,
    supports_mobile_monitoring: true,
    supports_report_distribution: false,
    health: "healthy",
    average_latency_ms: 410,
    records_last_pull: 742,
  },
  {
    name: "huawei",
    vendor: "Huawei",
    supports_realtime: true,
    supports_mobile_monitoring: true,
    supports_report_distribution: false,
    health: "degraded",
    average_latency_ms: 610,
    records_last_pull: 681,
  },
];

const billingSystems = tenants.flatMap((tenant) =>
  billingSystemDescriptors.map((descriptor, index) => ({
    billing_system_id: sequence(`bss_${tenant.code.toLowerCase()}_`, index + 1, 2),
    tenant_id: tenant.id,
    name: descriptor.name,
    vendor: descriptor.vendor,
    supports_realtime: descriptor.supports_realtime,
    supports_mobile_monitoring: descriptor.supports_mobile_monitoring,
    supports_report_distribution: descriptor.supports_report_distribution,
    health: descriptor.health,
    last_synced_at: iso(addMinutes(BASE_DATE, -(index + 1) * 37)),
    average_latency_ms: descriptor.average_latency_ms + (tenant.homeCountry === "AE" ? 22 : 0),
    records_last_pull: descriptor.records_last_pull + int(-35, 90),
  })),
);

const networkElements = [];
for (const tenant of tenants) {
  const tenantLocations = locations.filter((location) => location.tenant_id === tenant.id);
  tenantLocations.forEach((location, index) => {
    const types = [
      { type: "msc", code: "MSC" },
      { type: "sbc", code: "SBC" },
      { type: "mediation", code: "MED" },
    ];
    types.forEach((elementType, offset) => {
      const anomalyScore = round(
        clamp(
          0.08 + rand() * 0.18 + (elementType.type === "sbc" && chance(0.35) ? rand() * 0.5 : 0),
          0.05,
          0.96,
        ),
        4,
      );
      networkElements.push({
        id: nextUuid(),
        tenant_id: tenant.id,
        element_code: `${elementType.code}-${location.site_code}`,
        element_type: elementType.type,
        region: location.region,
        status: anomalyScore > 0.78 ? "degraded" : "active",
        anomaly_score: anomalyScore,
        revenue_impact: round(anomalyScore * (1500 + index * 130 + offset * 240), 2),
        created_at: iso(addDays(BASE_DATE, -(90 - index * 6 - offset * 3))),
      });
    });
  });
}

const ruleTemplates = [
  ["PBX Duration Spike", "pbx_hacking", 7200],
  ["SIM Box Burst Short Calls", "sim_box", 5],
  ["Data Billing Gap", "subscription_fraud", 0.2],
  ["Roaming Tariff Mismatch", "roaming_fraud", 50],
  ["Under-billed Voice Route", "interconnect_leakage", 0.85],
];

const rules = tenants.flatMap((tenant) =>
  ruleTemplates.map(([name, type, threshold], index) => ({
    id: nextUuid(),
    tenant_id: tenant.id,
    rule_name: name,
    rule_type: type,
    threshold,
    is_active: !(type === "subscription_fraud" && tenant.homeCountry === "AE" && index % 2 === 0),
    created_at: iso(addDays(BASE_DATE, -(100 - index * 4))),
  })),
);

const workflowTemplates = [
  ["Fraud Triage", "alert_to_case", "active", true],
  ["Leakage Recovery", "reconciliation", "active", true],
  ["Executive Report Distribution", "report_distribution", "active", true],
  ["Roaming Dispute Escalation", "roaming", "paused", false],
];

const workflows = tenants.flatMap((tenant) =>
  workflowTemplates.map(([name, type, status, isActive], index) => ({
    id: nextUuid(),
    tenant_id: tenant.id,
    workflow_name: name,
    workflow_type: type,
    status,
    is_active: isActive,
    updated_at: iso(addDays(BASE_DATE, -(index * 3 + 2))),
  })),
);

function normalCdrValues(homeCountry) {
  const foreignCountries = countryPoolFor(homeCountry);
  const callType = weightedPick([
    { value: "voice", weight: 48 },
    { value: "data", weight: 37 },
    { value: "sms", weight: 15 },
  ]);
  const international = chance(callType === "voice" ? 0.18 : 0.1);
  const destinationCountry = international ? pick(foreignCountries) : homeCountry;
  if (callType === "voice") {
    const duration = int(35, international ? 1800 : 1200);
    const charge = float(international ? 30 : 4, international ? 220 : 55);
    const billed = round(charge * float(0.92, 1.08, 4), 2);
    return { callType, destinationCountry, duration, charge, billed };
  }
  if (callType === "sms") {
    const charge = float(0.15, international ? 2.8 : 0.8);
    const billed = round(charge * float(0.96, 1.05, 4), 2);
    return { callType, destinationCountry, duration: int(1, 3), charge, billed };
  }
  const duration = int(international ? 180 : 240, international ? 3600 : 5400);
  const charge = float(international ? 25 : 6, international ? 140 : 90);
  const billed = round(charge * float(0.9, 1.12, 4), 2);
  return { callType, destinationCountry, duration, charge, billed };
}

function scenarioCdrValues(homeCountry, scenario) {
  const foreignCountry = pick(countryPoolFor(homeCountry));
  if (scenario === "pbx_hacking") {
    const charge = float(900, 2200);
    return {
      callType: "voice",
      destinationCountry: foreignCountry,
      duration: int(7600, 14800),
      charge,
      billed: round(charge * float(0.15, 0.6, 4), 2),
    };
  }
  if (scenario === "sim_box") {
    return {
      callType: "voice",
      destinationCountry: foreignCountry,
      duration: int(1, 6),
      charge: float(0, 0.05, 2),
      billed: chance(0.7) ? 0 : float(0, 0.04, 2),
    };
  }
  if (scenario === "subscription_fraud") {
    const billed = float(110, 310);
    const charge = chance(0.55) ? 0 : round(billed * float(0.03, 0.18, 4), 2);
    return {
      callType: "data",
      destinationCountry: homeCountry,
      duration: int(45, 720),
      charge,
      billed,
    };
  }
  if (scenario === "roaming_fraud") {
    if (chance(0.55)) {
      const charge = float(35, 140);
      return {
        callType: "voice",
        destinationCountry: foreignCountry,
        duration: int(90, 1400),
        charge,
        billed: round(charge * float(2.3, 4.2, 4), 2),
      };
    }
    return {
      callType: "data",
      destinationCountry: foreignCountry,
      duration: int(10, 55),
      charge: float(20, 80),
      billed: float(220, 520),
    };
  }
  const charge = float(70, 420);
  return {
    callType: chance(0.82) ? "voice" : "sms",
    destinationCountry: chance(0.24) ? foreignCountry : homeCountry,
    duration: int(30, 1200),
    charge,
    billed: round(charge * float(0.4, 0.82, 4), 2),
  };
}

const cdrs = [];
for (const tenant of tenants) {
  const tenantSubscribers = subscribers.filter((subscriber) => subscriber.tenant_id === tenant.id);
  const tenantElements = networkElements.filter((element) => element.tenant_id === tenant.id);
  const tenantLocations = locations.filter((location) => location.tenant_id === tenant.id);
  const cdrCount = 480;
  for (let i = 0; i < cdrCount; i += 1) {
    const scenario = weightedPick([
      { value: "normal", weight: 74 },
      { value: "pbx_hacking", weight: 5 },
      { value: "sim_box", weight: 4 },
      { value: "subscription_fraud", weight: 6 },
      { value: "roaming_fraud", weight: 6 },
      { value: "interconnect_leakage", weight: 5 },
    ]);
    const subscriber = pick(tenantSubscribers);
    const element = pick(tenantElements);
    const location = pick(tenantLocations);
    const eventTime = randomRecentDate(14);
    const values =
      scenario === "normal"
        ? normalCdrValues(tenant.homeCountry)
        : scenarioCdrValues(tenant.homeCountry, scenario);
    cdrs.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      subscriber_id: subscriber.subscriber_id,
      imsi: subscriber.imsi,
      msisdn: subscriber.msisdn,
      call_type: values.callType,
      origin_country: tenant.homeCountry,
      destination_country: values.destinationCountry,
      duration_seconds: values.duration,
      charge_amount: round(values.charge, 2),
      billed_amount: round(values.billed, 2),
      event_time: iso(eventTime),
      source_system: weightedPick([
        { value: "billing", weight: 46 },
        { value: "mediation", weight: 32 },
        { value: "network", weight: 22 },
      ]),
      cell_id: `${location.site_code}-CELL-${String(int(1, 6)).padStart(2, "0")}`,
      network_element_id: element.id,
      created_at: iso(addMinutes(eventTime, int(0, 20))),
    });
  }
}

cdrs.sort((left, right) => left.event_time.localeCompare(right.event_time));

const alertStatusWeights = {
  low: [
    { value: "new", weight: 46 },
    { value: "acknowledged", weight: 40 },
    { value: "closed", weight: 14 },
  ],
  medium: [
    { value: "new", weight: 38 },
    { value: "acknowledged", weight: 42 },
    { value: "closed", weight: 20 },
  ],
  high: [
    { value: "new", weight: 24 },
    { value: "acknowledged", weight: 46 },
    { value: "closed", weight: 30 },
  ],
  critical: [
    { value: "new", weight: 16 },
    { value: "acknowledged", weight: 44 },
    { value: "closed", weight: 40 },
  ],
};

const alerts = [];
const alertByDedupeKey = new Map();
const cdrLookup = new Map(cdrs.map((cdr) => [cdr.id, cdr]));

for (const cdr of cdrs) {
  const fraudType = fraudTypeFromCdr(cdr);
  if (fraudType === "unknown") {
    continue;
  }
  const severity = severityForCdr(cdr, fraudType);
  const confidence = confidenceForCdr(cdr, fraudType);
  const dedupeKey = `${cdr.tenant_id}:${cdr.subscriber_id}:${fraudType}:${new Date(cdr.event_time).toISOString().slice(0, 13)}`;
  if (alertByDedupeKey.has(dedupeKey)) {
    continue;
  }
  const ageDays = Math.max(0, Math.floor((BASE_DATE.getTime() - new Date(cdr.event_time).getTime()) / 86_400_000));
  const createdAt = iso(addMinutes(cdr.event_time, int(1, 18)));
  const weightedStatus = weightedPick(alertStatusWeights[severity]);
  const status =
    ageDays <= 1 && weightedStatus === "closed"
      ? "acknowledged"
      : ageDays <= 2 && weightedStatus === "closed"
        ? "acknowledged"
        : weightedStatus;
  const alert = {
    id: sequence("alert_", alerts.length + 1, 5),
    tenant_id: cdr.tenant_id,
    cdr_id: cdr.id,
    title: `Potential ${fraudType.replaceAll("_", " ")}`,
    description: `Detected ${fraudType} pattern on subscriber ${cdr.subscriber_id}`,
    fraud_type: fraudType,
    severity,
    confidence,
    dedupe_key: dedupeKey,
    status,
    created_at: createdAt,
  };
  alertByDedupeKey.set(dedupeKey, alert);
  alerts.push(alert);
}

const usersByTenant = new Map();
for (const membership of memberships) {
  if (!usersByTenant.has(membership.tenant_id)) {
    usersByTenant.set(membership.tenant_id, []);
  }
  usersByTenant.get(membership.tenant_id).push(membership);
}

const cases = [];
for (const alert of alerts) {
  const shouldCreateCase =
    alert.severity === "critical" ||
    alert.severity === "high" ||
    (alert.severity === "medium" && chance(0.45)) ||
    (alert.severity === "low" && chance(0.12));
  if (!shouldCreateCase) {
    continue;
  }
  const tenantMemberships = usersByTenant
    .get(alert.tenant_id)
    .filter((membership) => membership.role === "admin" || membership.role === "analyst");
  const assignee = pick(tenantMemberships);
  const alertCdr = cdrLookup.get(alert.cdr_id);
  const delta = alertCdr ? Math.abs(Number(alertCdr.charge_amount) - Number(alertCdr.billed_amount)) : float(15, 1200);
  const ageDays = Math.max(0, Math.floor((BASE_DATE.getTime() - new Date(alert.created_at).getTime()) / 86_400_000));
  const status =
    ageDays > 9
      ? weightedPick([
          { value: "resolved", weight: 55 },
          { value: "closed", weight: 45 },
        ])
      : ageDays > 4
        ? weightedPick([
            { value: "investigating", weight: 45 },
            { value: "resolved", weight: 40 },
            { value: "closed", weight: 15 },
          ])
        : weightedPick([
            { value: "open", weight: 52 },
            { value: "investigating", weight: 48 },
          ]);
  const createdAt = iso(addMinutes(alert.created_at, int(12, 120)));
  const updatedAt =
    status === "open"
      ? createdAt
      : iso(addMinutes(createdAt, int(40, 6000)));
  cases.push({
    id: nextUuid(),
    tenant_id: alert.tenant_id,
    title: `Investigate ${alert.fraud_type.replaceAll("_", " ")} on ${alertCdr?.msisdn ?? alert.cdr_id}`,
    status,
    assignee_user_id: assignee.user_id,
    alert_id: alert.id,
    revenue_impact: round(delta * float(0.9, 1.7, 4), 2),
    notes:
      status === "resolved" || status === "closed"
        ? "Mitigation completed and financial impact quantified."
        : "Pending analyst validation and partner/billing correlation.",
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

const reconciliationItems = [];
const reconciliationResults = [];
for (const tenant of tenants) {
  for (let i = 1; i <= 60; i += 1) {
    const scenario = weightedPick([
      { value: "matched", weight: 26 },
      { value: "low", weight: 28 },
      { value: "medium", weight: 24 },
      { value: "high", weight: 16 },
      { value: "critical", weight: 6 },
    ]);
    const billed = float(300, 8800);
    let mediated = billed;
    let collected = billed;
    if (scenario === "low") {
      mediated = round(billed * float(0.96, 1.04, 4), 2);
      collected = round(Math.min(billed, mediated) * float(0.91, 0.98, 4), 2);
    } else if (scenario === "medium") {
      mediated = round(billed * float(0.85, 1.08, 4), 2);
      collected = round(Math.min(billed, mediated) * float(0.78, 0.9, 4), 2);
    } else if (scenario === "high") {
      mediated = round(billed * float(0.68, 1.14, 4), 2);
      collected = round(Math.min(billed, mediated) * float(0.55, 0.8, 4), 2);
    } else if (scenario === "critical") {
      mediated = round(billed * float(0.5, 1.2, 4), 2);
      collected = round(Math.min(billed, mediated) * float(0.35, 0.68, 4), 2);
    }
    const item = {
      tenant_id: tenant.id,
      record_key: `${tenant.code}-REC-${monthString(BASE_DATE).replace("-", "")}-${String(i).padStart(4, "0")}`,
      billed_amount: billed,
      mediated_amount: mediated,
      collected_amount: collected,
    };
    reconciliationItems.push(item);
    const result = reconcileItem(item);
    reconciliationResults.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      record_key: item.record_key,
      mismatch_amount: result.mismatch_amount,
      leakage_amount: result.leakage_amount,
      severity: result.severity,
      status: result.status,
      created_at: iso(randomRecentDate(14, 1.7)),
    });
  }
}

reconciliationResults.sort((left, right) => left.created_at.localeCompare(right.created_at));

const settlements = [];
for (const tenant of tenants) {
  const tenantPartners = partners.filter((partner) => partner.tenant_id === tenant.id);
  tenantPartners.forEach((partner, index) => {
    for (let period = 0; period < 2; period += 1) {
      const periodEnd = addDays(new Date(Date.UTC(2026, 1 - period, 28, 12, 0, 0)), period === 0 ? 0 : -28);
      const periodStart = addDays(periodEnd, -29);
      const amountDue =
        partner.partner_type === "roaming"
          ? float(18000, 92000)
          : partner.partner_type === "interconnect"
            ? float(26000, 125000)
            : float(12000, 58000);
      const paymentRatio = weightedPick([
        { value: float(0.98, 1.0, 4), weight: 35 },
        { value: float(0.8, 0.96, 4), weight: 40 },
        { value: float(0.45, 0.78, 4), weight: 25 },
      ]);
      const amountPaid = round(amountDue * paymentRatio, 2);
      const status =
        amountPaid >= amountDue * 0.98
          ? "paid"
          : amountPaid >= amountDue * 0.8
            ? "partial"
            : index % 2 === 0
              ? "overdue"
              : "open";
      settlements.push({
        id: nextUuid(),
        tenant_id: tenant.id,
        partner_id: partner.id,
        period_start: dateOnly(periodStart),
        period_end: dateOnly(periodEnd),
        amount_due: round(amountDue, 2),
        amount_paid: amountPaid,
        status,
        created_at: iso(addDays(periodEnd, int(2, 7))),
      });
    }
  });
}

const roamingEvents = [];
for (const tenant of tenants) {
  const tenantSubscribers = subscribers.filter((subscriber) => subscriber.tenant_id === tenant.id);
  for (let i = 0; i < 30; i += 1) {
    const subscriber = pick(tenantSubscribers);
    const visitedCountry = pick(countryPoolFor(tenant.homeCountry));
    const highUsage = chance(0.3);
    const usage = highUsage ? int(5200, 13000) : int(180, 4800);
    const expectedAmount = round(usage * (tenant.homeCountry === "IN" ? 0.18 : 0.14), 2);
    const billedAmount =
      highUsage && chance(0.55)
        ? round(expectedAmount * float(0.18, 0.48, 4), 2)
        : round(expectedAmount * float(0.82, 1.35, 4), 2);
    const validation = validateRoamingEvent({
      home_country: tenant.homeCountry,
      visited_country: visitedCountry,
      usage_mb: usage,
      expected_amount: expectedAmount,
      billed_amount: billedAmount,
    });
    roamingEvents.push({
      tenant_id: tenant.id,
      subscriber_id: subscriber.subscriber_id,
      home_country: tenant.homeCountry,
      visited_country: visitedCountry,
      usage_mb: usage,
      expected_amount: expectedAmount,
      billed_amount: billedAmount,
      event_time: iso(randomRecentDate(14, 2)),
      status: validation.status,
      reason: validation.reason,
    });
  }
}

roamingEvents.sort((left, right) => left.event_time.localeCompare(right.event_time));

const interconnectChecks = [];
for (const agreement of agreements.filter((row) => row.agreement_type === "interconnect")) {
  for (let i = 0; i < 6; i += 1) {
    const actualTariff = chance(0.55)
      ? round(agreement.expected_tariff * float(0.985, 1.015, 4), 4)
      : round(agreement.expected_tariff * float(0.92, 1.08, 4), 4);
    const minutes = int(800, 52000);
    const validated = validateInterconnectCheck({
      expected_tariff: agreement.expected_tariff,
      actual_tariff: actualTariff,
      minutes,
    });
    interconnectChecks.push({
      tenant_id: agreement.tenant_id,
      partner_id: agreement.partner_id,
      route_code: agreement.route_code,
      expected_tariff: agreement.expected_tariff,
      actual_tariff: actualTariff,
      minutes,
      revenue_impact: validated.revenue_impact,
      status: validated.status,
      checked_at: iso(randomRecentDate(14, 1.8)),
    });
  }
}

interconnectChecks.sort((left, right) => left.checked_at.localeCompare(right.checked_at));

const dataQualityRuns = [];
for (const tenant of tenants) {
  for (let day = 13; day >= 0; day -= 1) {
    const total = int(3500, 6200);
    const missingMsisdn = int(0, 3);
    const invalidDuration = int(0, 4);
    const negativeAmounts = chance(0.2) ? 1 : 0;
    const failedCount = missingMsisdn + invalidDuration + negativeAmounts;
    const qualityScore = round(((total - failedCount) / total) * 100, 2);
    dataQualityRuns.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      quality_score: qualityScore,
      checked_count: total,
      failed_count: failedCount,
      payload: JSON.stringify({
        total,
        missingMsisdn,
        invalidDuration,
        negativeAmounts,
        qualityScore,
      }),
      created_at: iso(addMinutes(addDays(BASE_DATE, -day), -int(10, 90))),
    });
  }
}

const dataLineageEvents = [];
for (const tenant of tenants) {
  for (let day = 13; day >= 0; day -= 1) {
    dataLineageEvents.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      source_system: "cdr-ingestion",
      dataset: "cdrs",
      operation: "ingest",
      record_count: int(220, 420),
      processed_at: iso(addMinutes(addDays(BASE_DATE, -day), -int(120, 10))),
    });
    dataLineageEvents.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      source_system: "fraud-engine",
      dataset: "alerts",
      operation: "detect",
      record_count: int(18, 48),
      processed_at: iso(addMinutes(addDays(BASE_DATE, -day), -int(95, 5))),
    });
    if (day % 2 === 0) {
      dataLineageEvents.push({
        id: nextUuid(),
        tenant_id: tenant.id,
        source_system: "ra-reconcile",
        dataset: "reconciliation_results",
        operation: "reconcile",
        record_count: int(16, 34),
        processed_at: iso(addMinutes(addDays(BASE_DATE, -day), -int(75, 1))),
      });
    }
  }
}

const reports = [];
const reportTypes = ["operational", "compliance", "executive", "fraud", "recovery"];
for (const tenant of tenants) {
  const tenantUsers = memberships.filter((membership) => membership.tenant_id === tenant.id);
  for (let i = 0; i < 8; i += 1) {
    const reportType = reportTypes[i % reportTypes.length];
    const quality = pick(dataQualityRuns.filter((run) => run.tenant_id === tenant.id));
    const createdAt = iso(randomRecentDate(21, 1.5));
    reports.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      report_type: reportType,
      status: "generated",
      payload: JSON.stringify({
        generatedBy: pick(tenantUsers).user_id,
        generatedForTenant: tenant.id,
        generatedAt: createdAt,
        distribution: reportType === "executive" ? ["email", "dashboard"] : ["dashboard"],
        summary: {
          qualityScore: quality.quality_score,
          period: reportType === "operational" ? "daily" : "weekly",
        },
      }),
      generated_at: createdAt,
    });
  }
}

reports.sort((left, right) => left.generated_at.localeCompare(right.generated_at));

const auditActions = [
  "cdr_ingest",
  "report_generate",
  "case_update",
  "case_create",
  "reconcile_run",
  "connectors_sync",
  "rules_list",
  "partners_list",
  "network_elements_list",
  "dashboards_list",
];

const auditLogs = [];
for (const tenant of tenants) {
  const tenantUsers = memberships.filter((membership) => membership.tenant_id === tenant.id);
  const tenantCases = cases.filter((item) => item.tenant_id === tenant.id);
  const tenantReports = reports.filter((item) => item.tenant_id === tenant.id);
  const tenantAlerts = alerts.filter((item) => item.tenant_id === tenant.id);
  const tenantReconciliations = reconciliationResults.filter((item) => item.tenant_id === tenant.id);
  for (let i = 0; i < 40; i += 1) {
    const action = pick(auditActions);
    const actor = pick(tenantUsers);
    let resource_type = "report";
    let resource_id = "";
    if (action.includes("case")) {
      resource_type = "case";
      resource_id = pick(tenantCases)?.id ?? "";
    } else if (action === "cdr_ingest") {
      resource_type = "cdr";
      resource_id = pick(cdrs.filter((cdr) => cdr.tenant_id === tenant.id))?.id ?? "";
    } else if (action === "reconcile_run") {
      resource_type = "reconciliation_results";
      resource_id = pick(tenantReconciliations)?.id ?? "";
    } else if (action === "connectors_sync") {
      resource_type = "billing_connector";
      resource_id = pick(billingSystems.filter((item) => item.tenant_id === tenant.id)).billing_system_id;
    } else if (action === "partners_list") {
      resource_type = "partner";
      resource_id = pick(partners.filter((item) => item.tenant_id === tenant.id)).id;
    } else if (action === "network_elements_list") {
      resource_type = "network_element";
      resource_id = pick(networkElements.filter((item) => item.tenant_id === tenant.id)).id;
    } else if (action === "rules_list") {
      resource_type = "rule";
      resource_id = pick(rules.filter((item) => item.tenant_id === tenant.id)).id;
    } else if (action === "dashboards_list") {
      resource_type = "dashboard";
      resource_id = `dashboard_${tenant.code.toLowerCase()}`;
    } else if (action === "report_generate") {
      resource_type = "report";
      resource_id = pick(tenantReports)?.id ?? "";
    } else {
      resource_type = "alert";
      resource_id = pick(tenantAlerts)?.id ?? "";
    }
    auditLogs.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      actor_user_id: actor.user_id,
      action,
      resource_type,
      resource_id,
      payload: JSON.stringify({
        source: "synthetic-seed",
        action,
      }),
      created_at: iso(randomRecentDate(14, 1.9)),
    });
  }
}

auditLogs.sort((left, right) => left.created_at.localeCompare(right.created_at));

const kpis = [];
for (const tenant of tenants) {
  const qualityByDate = new Map(
    dataQualityRuns
      .filter((run) => run.tenant_id === tenant.id)
      .map((run) => [run.created_at.slice(0, 10), run.quality_score]),
  );
  for (let day = 13; day >= 0; day -= 1) {
    const metricDate = dateOnly(addDays(BASE_DATE, -day));
    const dayCdrs = cdrs.filter((cdr) => cdr.tenant_id === tenant.id && cdr.event_time.startsWith(metricDate));
    const dayAlerts = alerts.filter((alert) => alert.tenant_id === tenant.id && alert.created_at.startsWith(metricDate));
    const dayCases = cases.filter((item) => item.tenant_id === tenant.id && item.created_at.startsWith(metricDate));
    const dayReconciliations = reconciliationResults.filter(
      (item) => item.tenant_id === tenant.id && item.created_at.startsWith(metricDate),
    );
    const recoveredAmount = round(
      dayCases
        .filter((item) => item.status === "resolved" || item.status === "closed")
        .reduce((sum, item) => sum + Number(item.revenue_impact), 0),
      2,
    );
    const leakageAmount = round(
      dayReconciliations.reduce((sum, item) => sum + Number(item.leakage_amount), 0),
      2,
    );
    kpis.push({
      tenant_id: tenant.id,
      metric_date: metricDate,
      cdr_count: dayCdrs.length,
      alert_count: dayAlerts.length,
      case_count: dayCases.length,
      critical_alert_count: dayAlerts.filter((item) => item.severity === "critical").length,
      recovered_amount: recoveredAmount,
      leakage_amount: leakageAmount,
      quality_score: qualityByDate.get(metricDate) ?? 99.9,
    });
  }
}

const trafficPatternMap = new Map();
for (const cdr of cdrs) {
  const key = [
    cdr.tenant_id,
    hourBucket(cdr.event_time),
    cdr.origin_country,
    cdr.destination_country,
    cdr.call_type,
  ].join("|");
  if (!trafficPatternMap.has(key)) {
    trafficPatternMap.set(key, {
      tenant_id: cdr.tenant_id,
      time_bucket: hourBucket(cdr.event_time),
      origin_country: cdr.origin_country,
      destination_country: cdr.destination_country,
      call_type: cdr.call_type,
      record_count: 0,
      total_duration_seconds: 0,
      total_charge_amount: 0,
      total_billed_amount: 0,
    });
  }
  const row = trafficPatternMap.get(key);
  row.record_count += 1;
  row.total_duration_seconds += Number(cdr.duration_seconds);
  row.total_charge_amount += Number(cdr.charge_amount);
  row.total_billed_amount += Number(cdr.billed_amount);
}

const trafficPatterns = Array.from(trafficPatternMap.values())
  .map((row) => ({
    ...row,
    total_charge_amount: round(row.total_charge_amount, 2),
    total_billed_amount: round(row.total_billed_amount, 2),
    anomaly_score: round(
      clamp(
        Math.abs(row.total_billed_amount - row.total_charge_amount) / Math.max(1, row.total_charge_amount),
        0,
        0.99,
      ),
      4,
    ),
  }))
  .sort((left, right) => left.time_bucket.localeCompare(right.time_bucket));

const mlModelRegistry = tenants.map((tenant, index) => ({
  id: nextUuid(),
  tenant_id: tenant.id,
  model_name: "fraud-model",
  model_version: index === 0 ? "v1-demo" : "v1-gulf",
  source_type: "local",
  metrics: JSON.stringify({
    accuracy: index === 0 ? 0.91 : 0.89,
    precision: index === 0 ? 0.87 : 0.84,
    recall: index === 0 ? 0.82 : 0.8,
  }),
  artifact_path: index === 0 ? "models/fraud-model-v1.json" : "models/fraud-model-v1.json",
  is_active: true,
  created_by: memberships.find((membership) => membership.tenant_id === tenant.id && membership.role === "owner").user_id,
  created_at: iso(addDays(BASE_DATE, -(20 - index * 5))),
}));

const cdrIngestJobs = [];
for (const tenant of tenants) {
  const tenantUsers = memberships.filter((membership) => membership.tenant_id === tenant.id);
  const tenantCdrs = cdrs.filter((cdr) => cdr.tenant_id === tenant.id);
  for (let i = 0; i < 6; i += 1) {
    const status = weightedPick([
      { value: "completed", weight: 55 },
      { value: "processing", weight: 12 },
      { value: "pending", weight: 18 },
      { value: "failed", weight: 15 },
    ]);
    const sampleRecords = tenantCdrs.slice(i * 3, i * 3 + 3).map((cdr) => ({
      subscriberId: cdr.subscriber_id,
      msisdn: cdr.msisdn,
      callType: cdr.call_type,
      eventTime: cdr.event_time,
    }));
    const startedAt = status === "pending" ? "" : iso(addMinutes(randomRecentDate(6, 1.7), -int(15, 120)));
    const completedAt = status === "completed" || status === "failed" ? iso(randomRecentDate(6, 1.5)) : "";
    cdrIngestJobs.push({
      id: nextUuid(),
      tenant_id: tenant.id,
      created_by: pick(tenantUsers).user_id,
      status,
      priority: int(3, 9),
      payload: JSON.stringify({ records: sampleRecords }),
      record_count: int(120, 420),
      attempts: status === "failed" ? int(2, 3) : status === "processing" ? 1 : 0,
      max_attempts: 3,
      worker_id: status === "pending" ? "" : `worker_${tenant.code.toLowerCase()}_${i + 1}`,
      error_message: status === "failed" ? "Synthetic upstream timeout during batch commit" : "",
      result:
        status === "completed"
          ? JSON.stringify({
              inserted: int(110, 410),
              alertsGenerated: int(8, 42),
              qualityScore: float(99.1, 100, 2),
            })
          : "",
      started_at: startedAt,
      completed_at: completedAt,
      created_at: iso(randomRecentDate(7, 1.4)),
      updated_at: status === "pending" ? iso(randomRecentDate(7, 1.3)) : completedAt || iso(randomRecentDate(7, 1.2)),
    });
  }
}

cdrIngestJobs.sort((left, right) => left.created_at.localeCompare(right.created_at));

function trainingRowFor(label) {
  if (label === "unknown") {
    const baseline = normalCdrValues("IN");
    return {
      call_type: baseline.callType,
      origin_country: "IN",
      destination_country: baseline.destinationCountry,
      duration_seconds: baseline.duration,
      charge_amount: round(baseline.charge, 2),
      billed_amount: round(baseline.billed, 2),
      source_system: weightedPick([
        { value: "billing", weight: 46 },
        { value: "mediation", weight: 32 },
        { value: "network", weight: 22 },
      ]),
      label: "unknown",
    };
  }
  const scenario = scenarioCdrValues("IN", label);
  return {
    call_type: scenario.callType,
    origin_country: "IN",
    destination_country: scenario.destinationCountry,
    duration_seconds: scenario.duration,
    charge_amount: round(scenario.charge, 2),
    billed_amount: round(scenario.billed, 2),
    source_system: weightedPick([
      { value: "billing", weight: 46 },
      { value: "mediation", weight: 32 },
      { value: "network", weight: 22 },
    ]),
    label,
  };
}

const mlTrainingDataset = [];
for (const label of [
  "subscription_fraud",
  "pbx_hacking",
  "sim_box",
  "roaming_fraud",
  "interconnect_leakage",
]) {
  for (let i = 0; i < 60; i += 1) {
    mlTrainingDataset.push(trainingRowFor(label));
  }
}
for (let i = 0; i < 40; i += 1) {
  mlTrainingDataset.push(trainingRowFor("unknown"));
}

const tables = [
  {
    filename: "tenants.csv",
    description: "Tenant master data for multi-tenant isolation tests",
    headers: ["id", "name", "slug", "status", "created_at"],
    rows: tenants.map(({ id, name, slug, status, created_at }) => ({ id, name, slug, status, created_at })),
  },
  {
    filename: "users.csv",
    description: "Application users for ownership, admin, analyst, and viewer roles",
    headers: [
      "id",
      "email",
      "full_name",
      "department",
      "title",
      "status",
      "primary_tenant_id",
      "created_at",
      "updated_at",
    ],
    rows: users,
  },
  {
    filename: "roles.csv",
    description: "Role catalog used by RBAC and report/audit testing",
    headers: [
      "role_name",
      "description",
      "can_manage_users",
      "can_manage_rules",
      "can_view_reports",
      "can_manage_connectors",
    ],
    rows: roles,
  },
  {
    filename: "memberships.csv",
    description: "Tenant-scoped memberships that link users to roles",
    headers: ["id", "tenant_id", "user_id", "role", "is_active", "created_at"],
    rows: memberships,
  },
  {
    filename: "locations.csv",
    description: "Physical switch and data-center sites used by network elements",
    headers: [
      "location_id",
      "tenant_id",
      "site_code",
      "country_code",
      "city",
      "region",
      "latitude",
      "longitude",
      "location_type",
      "status",
    ],
    rows: locations,
  },
  {
    filename: "networks.csv",
    description: "Home, enterprise, and IoT network footprints",
    headers: [
      "network_id",
      "tenant_id",
      "operator_name",
      "mcc",
      "mnc",
      "country_code",
      "network_type",
      "technology",
      "roaming_supported",
      "status",
    ],
    rows: networks,
  },
  {
    filename: "services.csv",
    description: "Revenue-bearing telecom services used by tariffs and revenue streams",
    headers: ["service_id", "tenant_id", "service_name", "category", "billing_unit", "base_currency", "status"],
    rows: services,
  },
  {
    filename: "tariffs.csv",
    description: "Tariff reference data for domestic, international, data, roaming, and enterprise usage",
    headers: [
      "tariff_id",
      "tenant_id",
      "service_id",
      "tariff_name",
      "origin_country",
      "destination_country",
      "charge_per_minute",
      "charge_per_sms",
      "charge_per_mb",
      "currency",
      "valid_from",
      "valid_to",
      "status",
    ],
    rows: tariffs,
  },
  {
    filename: "revenue_streams.csv",
    description: "Monthly revenue streams and variance targets for RA testing",
    headers: [
      "revenue_stream_id",
      "tenant_id",
      "stream_name",
      "category",
      "reporting_month",
      "target_amount",
      "actual_amount",
      "variance_amount",
      "status",
    ],
    rows: revenueStreams,
  },
  {
    filename: "subscribers.csv",
    description: "Subscriber inventory with MSISDN, IMSI, tariff, and risk-band assignments",
    headers: [
      "subscriber_id",
      "tenant_id",
      "msisdn",
      "imsi",
      "customer_type",
      "segment",
      "status",
      "home_country",
      "home_network_id",
      "tariff_id",
      "device_id",
      "activation_date",
      "avg_monthly_revenue",
      "fraud_risk_band",
    ],
    rows: subscribers,
  },
  {
    filename: "devices.csv",
    description: "Handset, router, and IoT device inventory attached to subscribers",
    headers: [
      "device_id",
      "tenant_id",
      "subscriber_id",
      "imei",
      "vendor",
      "model",
      "device_type",
      "os_version",
      "first_seen_at",
      "status",
    ],
    rows: devices,
  },
  {
    filename: "partners.csv",
    description: "Interconnect, roaming, and wholesale partner records",
    headers: ["id", "tenant_id", "name", "partner_type", "status", "created_at"],
    rows: partners,
  },
  {
    filename: "agreements.csv",
    description: "Partner agreements with route codes and expected interconnect tariffs",
    headers: [
      "agreement_id",
      "tenant_id",
      "partner_id",
      "agreement_name",
      "agreement_type",
      "route_code",
      "expected_tariff",
      "sla_target_pct",
      "effective_from",
      "effective_to",
      "status",
    ],
    rows: agreements,
  },
  {
    filename: "billing_systems.csv",
    description: "Connector metadata aligned with Amdocs, Oracle, Ericsson, and Huawei integrations",
    headers: [
      "billing_system_id",
      "tenant_id",
      "name",
      "vendor",
      "supports_realtime",
      "supports_mobile_monitoring",
      "supports_report_distribution",
      "health",
      "last_synced_at",
      "average_latency_ms",
      "records_last_pull",
    ],
    rows: billingSystems,
  },
  {
    filename: "network_elements.csv",
    description: "Network element anomaly indicators used by the dashboard and compliance views",
    headers: [
      "id",
      "tenant_id",
      "element_code",
      "element_type",
      "region",
      "status",
      "anomaly_score",
      "revenue_impact",
      "created_at",
    ],
    rows: networkElements,
  },
  {
    filename: "rules.csv",
    description: "Fraud and leakage detection rules aligned to the current backend",
    headers: ["id", "tenant_id", "rule_name", "rule_type", "threshold", "is_active", "created_at"],
    rows: rules,
  },
  {
    filename: "workflows.csv",
    description: "Workflow configuration for case escalation, reconciliation, and report distribution",
    headers: ["id", "tenant_id", "workflow_name", "workflow_type", "status", "is_active", "updated_at"],
    rows: workflows,
  },
  {
    filename: "cdrs.csv",
    description: "Recent CDR/event stream with normal traffic plus fraud and leakage scenarios",
    headers: [
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
    rows: cdrs,
  },
  {
    filename: "alerts.csv",
    description: "Fraud/leakage alerts derived from the synthetic CDR stream",
    headers: [
      "id",
      "tenant_id",
      "cdr_id",
      "title",
      "description",
      "fraud_type",
      "severity",
      "confidence",
      "dedupe_key",
      "status",
      "created_at",
    ],
    rows: alerts,
  },
  {
    filename: "cases.csv",
    description: "Case-management records tied to generated alerts",
    headers: [
      "id",
      "tenant_id",
      "title",
      "status",
      "assignee_user_id",
      "alert_id",
      "revenue_impact",
      "notes",
      "created_at",
      "updated_at",
    ],
    rows: cases,
  },
  {
    filename: "reconciliation_items.csv",
    description: "Input items for the revenue-assurance reconcile API",
    headers: ["tenant_id", "record_key", "billed_amount", "mediated_amount", "collected_amount"],
    rows: reconciliationItems,
  },
  {
    filename: "reconciliation_results.csv",
    description: "Historical reconciliation outcomes derived from the synthetic input items",
    headers: [
      "id",
      "tenant_id",
      "record_key",
      "mismatch_amount",
      "leakage_amount",
      "severity",
      "status",
      "created_at",
    ],
    rows: reconciliationResults,
  },
  {
    filename: "settlements.csv",
    description: "Partner settlement positions across recent billing periods",
    headers: [
      "id",
      "tenant_id",
      "partner_id",
      "period_start",
      "period_end",
      "amount_due",
      "amount_paid",
      "status",
      "created_at",
    ],
    rows: settlements,
  },
  {
    filename: "roaming_events.csv",
    description: "Roaming validation inputs and expected suspicious/valid outcomes",
    headers: [
      "tenant_id",
      "subscriber_id",
      "home_country",
      "visited_country",
      "usage_mb",
      "expected_amount",
      "billed_amount",
      "event_time",
      "status",
      "reason",
    ],
    rows: roamingEvents,
  },
  {
    filename: "interconnect_checks.csv",
    description: "Interconnect tariff validation scenarios with revenue impact",
    headers: [
      "tenant_id",
      "partner_id",
      "route_code",
      "expected_tariff",
      "actual_tariff",
      "minutes",
      "revenue_impact",
      "status",
      "checked_at",
    ],
    rows: interconnectChecks,
  },
  {
    filename: "audit_logs.csv",
    description: "Audit trail events for operational, reconciliation, and reporting actions",
    headers: [
      "id",
      "tenant_id",
      "actor_user_id",
      "action",
      "resource_type",
      "resource_id",
      "payload",
      "created_at",
    ],
    rows: auditLogs,
  },
  {
    filename: "reports.csv",
    description: "Generated report history for operational, compliance, and executive views",
    headers: ["id", "tenant_id", "report_type", "status", "payload", "generated_at"],
    rows: reports,
  },
  {
    filename: "kpis.csv",
    description: "Daily KPI rollups derived from CDRs, alerts, cases, and reconciliations",
    headers: [
      "tenant_id",
      "metric_date",
      "cdr_count",
      "alert_count",
      "case_count",
      "critical_alert_count",
      "recovered_amount",
      "leakage_amount",
      "quality_score",
    ],
    rows: kpis,
  },
  {
    filename: "data_quality_runs.csv",
    description: "Recent data quality runs used by the compliance and reporting APIs",
    headers: ["id", "tenant_id", "quality_score", "checked_count", "failed_count", "payload", "created_at"],
    rows: dataQualityRuns,
  },
  {
    filename: "data_lineage_events.csv",
    description: "Lineage events for ingestion, fraud detection, and reconciliation pipelines",
    headers: ["id", "tenant_id", "source_system", "dataset", "operation", "record_count", "processed_at"],
    rows: dataLineageEvents,
  },
  {
    filename: "traffic_patterns.csv",
    description: "Hourly traffic pattern aggregates for dashboarding and anomaly trend tests",
    headers: [
      "tenant_id",
      "time_bucket",
      "origin_country",
      "destination_country",
      "call_type",
      "record_count",
      "total_duration_seconds",
      "total_charge_amount",
      "total_billed_amount",
      "anomaly_score",
    ],
    rows: trafficPatterns,
  },
  {
    filename: "ml_model_registry.csv",
    description: "Optional model registry rows for ML availability and audit checks",
    headers: [
      "id",
      "tenant_id",
      "model_name",
      "model_version",
      "source_type",
      "metrics",
      "artifact_path",
      "is_active",
      "created_by",
      "created_at",
    ],
    rows: mlModelRegistry,
  },
  {
    filename: "cdr_ingest_jobs.csv",
    description: "Optional async ingest job history for queue and worker testing",
    headers: [
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
    rows: cdrIngestJobs,
  },
  {
    filename: "ml_training_dataset.csv",
    description: "Labelled CDR feature dataset compatible with scripts/ml/train-fraud-model.mjs",
    headers: [
      "call_type",
      "origin_country",
      "destination_country",
      "duration_seconds",
      "charge_amount",
      "billed_amount",
      "source_system",
      "label",
    ],
    rows: mlTrainingDataset,
  },
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const catalogRows = tables.map((table) => ({
  file_name: table.filename,
  row_count: writeCsv(table.filename, table.headers, table.rows),
  description: table.description,
}));

writeCsv("dataset_catalog.csv", ["file_name", "row_count", "description"], catalogRows);

const readme = `# Synthetic Telecom Test Data

Generated at: ${iso(new Date())}
Seed: ${SEED}
Anchor date: ${iso(BASE_DATE)}

This folder contains realistic synthetic CSVs for telecom fraud analytics, revenue assurance, reconciliation, compliance, and ML prediction testing.

Key files:
- \`cdrs.csv\`: near-real-time event stream with normal and anomalous usage
- \`alerts.csv\` and \`cases.csv\`: rule-derived outputs for the generated CDR stream
- \`reconciliation_items.csv\` and \`reconciliation_results.csv\`: inputs and expected RA outputs
- \`roaming_events.csv\` and \`interconnect_checks.csv\`: route-specific validation scenarios
- \`ml_training_dataset.csv\`: labelled training set for \`scripts/ml/train-fraud-model.mjs\`

Regeneration:
\`\`\`bash
node scripts/generate-synthetic-telecom-data.mjs
\`\`\`

Train a model from the generated ML CSV:
\`\`\`bash
node scripts/ml/train-fraud-model.mjs data/synthetic/ml_training_dataset.csv models/fraud-model-trained.json
\`\`\`

Catalog:
${catalogRows.map((row) => `- ${row.file_name}: ${row.row_count} rows`).join("\n")}
`;

fs.writeFileSync(path.join(OUTPUT_DIR, "README.md"), readme);

console.log(`Synthetic dataset written to ${OUTPUT_DIR}`);
for (const row of catalogRows) {
  console.log(`${row.file_name}: ${row.row_count} rows`);
}
