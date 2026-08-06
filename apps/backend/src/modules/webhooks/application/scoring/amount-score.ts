export function amountScore(
  transactionAmount: number,
  remainingAmount: number,
): number {
  if (transactionAmount === remainingAmount) return 20;
  if (remainingAmount === 0) return 0;
  return Math.abs(transactionAmount - remainingAmount) / remainingAmount <= 0.01
    ? 10
    : 0;
}
