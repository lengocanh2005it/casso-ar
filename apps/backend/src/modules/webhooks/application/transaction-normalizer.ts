export interface NormalizedTransaction {
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Webhook field ${key} is invalid`);
  }
  return value;
}

export function normalizeBalanceHookPayload(
  payload: Record<string, unknown>,
): NormalizedTransaction {
  const amount = payload.amount;
  const transactionDateTime = stringField(payload, 'transactionDateTime');
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new Error('Webhook field amount must be an integer');
  }
  const date = new Date(transactionDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Webhook field transactionDateTime is invalid');
  }
  return {
    providerTransactionId: stringField(payload, 'transactionId'),
    amount,
    transactionDateTime: date,
    counterpartyAccountNumber: stringField(
      payload,
      'counterpartyAccountNumber',
    ),
    counterpartyName: stringField(payload, 'counterpartyName'),
    transferContent: stringField(payload, 'transferContent'),
  };
}
