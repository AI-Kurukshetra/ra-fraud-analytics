export type InterconnectCheckInput = {
  tenantId: string;
  partnerId: string;
  routeCode: string;
  expectedTariff: number;
  actualTariff: number;
  minutes: number;
};

export type InterconnectCheckResult = {
  partnerId: string;
  routeCode: string;
  expectedTariff: number;
  actualTariff: number;
  variance: number;
  revenueImpact: number;
  status: "valid" | "invalid";
};

export function validateInterconnectTariff(input: InterconnectCheckInput): InterconnectCheckResult {
  const variance = Number((input.actualTariff - input.expectedTariff).toFixed(4));
  const revenueImpact = Number((Math.abs(variance) * input.minutes).toFixed(2));
  return {
    partnerId: input.partnerId,
    routeCode: input.routeCode,
    expectedTariff: input.expectedTariff,
    actualTariff: input.actualTariff,
    variance,
    revenueImpact,
    status: variance === 0 ? "valid" : "invalid",
  };
}
