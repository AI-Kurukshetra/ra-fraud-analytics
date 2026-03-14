#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const CLASSES = [
  "subscription_fraud",
  "pbx_hacking",
  "sim_box",
  "roaming_fraud",
  "interconnect_leakage",
];

const FEATURE_NAMES = [
  "is_voice",
  "is_sms",
  "is_data",
  "is_international",
  "duration_norm",
  "charge_norm",
  "billed_norm",
  "abs_delta_norm",
  "delta_positive",
  "delta_negative",
  "billed_to_charge",
  "charge_to_billed",
  "long_call_flag",
  "short_call_flag",
  "zero_charge_flag",
  "high_bill_flag",
  "src_billing",
  "src_mediation",
  "src_network",
];

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return rows;
  const headers = lines[0].split(",").map((h) => h.trim());

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j].trim();
    }
    rows.push(row);
  }

  return rows;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function featureVectorFromRow(row) {
  const callType = (row.call_type || "").toLowerCase();
  const sourceSystem = (row.source_system || "").toLowerCase();
  const originCountry = row.origin_country || "";
  const destinationCountry = row.destination_country || "";
  const durationSeconds = toNumber(row.duration_seconds, 0);
  const chargeAmount = toNumber(row.charge_amount, 0);
  const billedAmount = toNumber(row.billed_amount, 0);

  const international = originCountry !== destinationCountry;
  const delta = billedAmount - chargeAmount;
  const absDelta = Math.abs(delta);
  const durationNorm = Math.min(3, Math.max(0, durationSeconds / 3600));
  const chargeNorm = Math.min(10, Math.max(0, chargeAmount / 100));
  const billedNorm = Math.min(10, Math.max(0, billedAmount / 100));
  const absDeltaNorm = Math.min(10, absDelta / 100);
  const billedToCharge = chargeAmount <= 0 ? (billedAmount > 0 ? 5 : 1) : billedAmount / chargeAmount;
  const chargeToBilled = billedAmount <= 0 ? (chargeAmount > 0 ? 5 : 1) : chargeAmount / billedAmount;

  return {
    is_voice: callType === "voice" ? 1 : 0,
    is_sms: callType === "sms" ? 1 : 0,
    is_data: callType === "data" ? 1 : 0,
    is_international: international ? 1 : 0,
    duration_norm: durationNorm,
    charge_norm: chargeNorm,
    billed_norm: billedNorm,
    abs_delta_norm: absDeltaNorm,
    delta_positive: delta > 0 ? 1 : 0,
    delta_negative: delta < 0 ? 1 : 0,
    billed_to_charge: Math.min(10, Math.max(0, billedToCharge)),
    charge_to_billed: Math.min(10, Math.max(0, chargeToBilled)),
    long_call_flag: durationSeconds >= 7200 ? 1 : 0,
    short_call_flag: durationSeconds <= 6 ? 1 : 0,
    zero_charge_flag: chargeAmount <= 0 ? 1 : 0,
    high_bill_flag: billedAmount >= 200 ? 1 : 0,
    src_billing: sourceSystem === "billing" ? 1 : 0,
    src_mediation: sourceSystem === "mediation" ? 1 : 0,
    src_network: sourceSystem === "network" ? 1 : 0,
  };
}

function dot(weights, vector) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += weights[i] * vector[i];
  }
  return sum;
}

function trainOneVsRest(dataset, targetClass, iterations = 600, lr = 0.03, l2 = 0.0005) {
  const weights = new Array(FEATURE_NAMES.length).fill(0);
  let bias = 0;

  for (let iter = 0; iter < iterations; iter += 1) {
    let gradBias = 0;
    const grad = new Array(FEATURE_NAMES.length).fill(0);

    for (const item of dataset) {
      const y = item.label === targetClass ? 1 : 0;
      const z = dot(weights, item.vector) + bias;
      const p = sigmoid(z);
      const err = p - y;

      gradBias += err;
      for (let j = 0; j < FEATURE_NAMES.length; j += 1) {
        grad[j] += err * item.vector[j];
      }
    }

    const n = Math.max(1, dataset.length);
    bias -= (lr * gradBias) / n;
    for (let j = 0; j < FEATURE_NAMES.length; j += 1) {
      const reg = l2 * weights[j];
      weights[j] -= lr * (grad[j] / n + reg);
    }
  }

  return { weights, bias };
}

function evaluate(dataset, model) {
  let correct = 0;

  for (const item of dataset) {
    let bestClass = "unknown";
    let bestScore = 0;

    for (const klass of CLASSES) {
      const w = model.weights[klass];
      const b = model.bias[klass];
      const score = sigmoid(dot(w, item.vector) + b);
      if (score > bestScore) {
        bestScore = score;
        bestClass = klass;
      }
    }

    if (bestClass === item.label) {
      correct += 1;
    }
  }

  return dataset.length === 0 ? 0 : correct / dataset.length;
}

function main() {
  const inputPath = process.argv[2];
  const outputPathArg = process.argv[3];

  if (!inputPath) {
    console.error("Usage: node scripts/ml/train-fraud-model.mjs <dataset.csv> [output.json]");
    process.exit(1);
  }

  const outputPath =
    outputPathArg || path.join(process.cwd(), "models", "fraud-model-trained.json");

  const raw = fs.readFileSync(inputPath, "utf8");
  const rows = parseCSV(raw);

  const dataset = rows
    .filter((row) => CLASSES.includes((row.label || "").toLowerCase()))
    .map((row) => {
      const features = featureVectorFromRow(row);
      return {
        label: row.label.toLowerCase(),
        vector: FEATURE_NAMES.map((name) => features[name] || 0),
      };
    });

  if (dataset.length < 50) {
    console.error(`Dataset too small (${dataset.length}). Need at least 50 labeled rows.`);
    process.exit(1);
  }

  const weights = {};
  const bias = {};
  const thresholds = {};

  for (const klass of CLASSES) {
    const trained = trainOneVsRest(dataset, klass);
    weights[klass] = trained.weights.map((w) => Number(w.toFixed(6)));
    bias[klass] = Number(trained.bias.toFixed(6));
    thresholds[klass] = 0.62;
  }

  const model = {
    version: "v1",
    trainedAt: new Date().toISOString(),
    classes: CLASSES,
    featureNames: FEATURE_NAMES,
    thresholds,
    weights,
    bias,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));

  const accuracy = evaluate(dataset, model);
  console.log(`Model trained from ${dataset.length} rows`);
  console.log(`Training-set top-1 accuracy: ${(accuracy * 100).toFixed(2)}%`);
  console.log(`Saved model: ${outputPath}`);
}

main();
