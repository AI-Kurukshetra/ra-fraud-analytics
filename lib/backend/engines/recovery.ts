export function calculateRecoveryImpact({
  estimatedLoss,
  recoveredAmount,
}: {
  estimatedLoss: number;
  recoveredAmount: number;
}) {
  const preventedLoss = Math.max(0, estimatedLoss - recoveredAmount);
  const recoveryRate = estimatedLoss === 0 ? 0 : Number(((recoveredAmount / estimatedLoss) * 100).toFixed(2));

  return {
    estimatedLoss,
    recoveredAmount,
    preventedLoss,
    recoveryRate,
  };
}
