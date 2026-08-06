const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function timingScore(transactionDateTime: Date, dueDate: Date): number {
  return Math.abs(transactionDateTime.getTime() - dueDate.getTime()) <=
    THIRTY_DAYS_MS
    ? 5
    : 0;
}
