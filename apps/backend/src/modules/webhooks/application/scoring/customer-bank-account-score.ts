export function customerBankAccountScore(
  counterpartyAccountNumber: string,
  savedAccountNumbers: string[],
): number {
  return savedAccountNumbers.includes(counterpartyAccountNumber) ? 10 : 0;
}
