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
  variancePct: number;
  minutes: number;
  revenueImpact: number;
  status: "valid" | "invalid";
  reason?: string;
};

export function validateInterconnectTariff(input: InterconnectCheckInput): InterconnectCheckResult {
  const variance = Number((input.actualTariff - input.expectedTariff).toFixed(4));
  const variancePct = Number(
    (
      input.expectedTariff === 0
        ? 100
        : (Math.abs(variance) / Math.max(0.0001, input.expectedTariff)) * 100
    ).toFixed(2),
  );
  const revenueImpact = Number((Math.abs(variance) * input.minutes).toFixed(2));
  const tolerancePct = 2;
  const status = variancePct <= tolerancePct ? "valid" : "invalid";
  return {
    partnerId: input.partnerId,
    routeCode: input.routeCode,
    expectedTariff: input.expectedTariff,
    actualTariff: input.actualTariff,
    variance,
    variancePct,
    minutes: input.minutes,
    revenueImpact,
    status,
    reason: status === "invalid" ? `Tariff variance ${variancePct}% exceeds tolerance ${tolerancePct}%` : undefined,
  };
}
