import type { CdrRecord } from "@/lib/backend/types";

export function fraudFeatureVector(cdr: CdrRecord): Record<string, number> {
  const international = cdr.originCountry !== cdr.destinationCountry;
  const delta = cdr.billedAmount - cdr.chargeAmount;
  const absDelta = Math.abs(delta);
  const durationNorm = Math.min(3, Math.max(0, cdr.durationSeconds / 3600));
  const chargeNorm = Math.min(10, Math.max(0, cdr.chargeAmount / 100));
  const billedNorm = Math.min(10, Math.max(0, cdr.billedAmount / 100));
  const absDeltaNorm = Math.min(10, absDelta / 100);
  const billedToCharge = cdr.chargeAmount <= 0 ? (cdr.billedAmount > 0 ? 5 : 1) : cdr.billedAmount / cdr.chargeAmount;
  const chargeToBilled = cdr.billedAmount <= 0 ? (cdr.chargeAmount > 0 ? 5 : 1) : cdr.chargeAmount / cdr.billedAmount;

  return {
    is_voice: cdr.callType === "voice" ? 1 : 0,
    is_sms: cdr.callType === "sms" ? 1 : 0,
    is_data: cdr.callType === "data" ? 1 : 0,
    is_international: international ? 1 : 0,
    duration_norm: durationNorm,
    charge_norm: chargeNorm,
    billed_norm: billedNorm,
    abs_delta_norm: absDeltaNorm,
    delta_positive: delta > 0 ? 1 : 0,
    delta_negative: delta < 0 ? 1 : 0,
    billed_to_charge: Math.min(10, Math.max(0, billedToCharge)),
    charge_to_billed: Math.min(10, Math.max(0, chargeToBilled)),
    long_call_flag: cdr.durationSeconds >= 7200 ? 1 : 0,
    short_call_flag: cdr.durationSeconds <= 6 ? 1 : 0,
    zero_charge_flag: cdr.chargeAmount <= 0 ? 1 : 0,
    high_bill_flag: cdr.billedAmount >= 200 ? 1 : 0,
    src_billing: cdr.sourceSystem === "billing" ? 1 : 0,
    src_mediation: cdr.sourceSystem === "mediation" ? 1 : 0,
    src_network: cdr.sourceSystem === "network" ? 1 : 0,
  };
}
