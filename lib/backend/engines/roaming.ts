export type RoamingValidationInput = {
  tenantId: string;
  subscriberId: string;
  homeCountry: string;
  visitedCountry: string;
  billedAmount: number;
  expectedAmount: number;
  usageMb: number;
};

export type RoamingValidationResult = {
  subscriberId: string;
  homeCountry: string;
  visitedCountry: string;
  deviationAmount: number;
  status: "valid" | "suspicious";
  reason?: string;
};

export function validateRoamingRecord(input: RoamingValidationInput): RoamingValidationResult {
  const deviationAmount = Number((input.billedAmount - input.expectedAmount).toFixed(2));
  const suspicious =
    input.homeCountry !== input.visitedCountry &&
    (Math.abs(deviationAmount) > 50 || (input.usageMb > 5000 && input.billedAmount < input.expectedAmount * 0.5));

  return {
    subscriberId: input.subscriberId,
    homeCountry: input.homeCountry,
    visitedCountry: input.visitedCountry,
    deviationAmount,
    status: suspicious ? "suspicious" : "valid",
    reason: suspicious ? "Potential roaming revenue anomaly" : undefined,
  };
}
