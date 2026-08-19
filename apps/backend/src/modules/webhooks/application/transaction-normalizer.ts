import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export interface NormalizedTransaction {
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

interface BalanceHookTransactionPayload {
  id?: unknown;
  amount?: unknown;
  transactionDateTime?: unknown;
  description?: unknown;
  counterAccountNumber?: unknown;
  counterAccountName?: unknown;
}

function toStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function normalizeBalanceHookPayload(
  payload: Record<string, unknown>,
): NormalizedTransaction {
  const transaction = (payload.transaction ??
    {}) as BalanceHookTransactionPayload;

  const id = transaction.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.id is invalid',
    );
  }

  const amount = transaction.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.amount must be an integer',
    );
  }

  const transactionDateTimeRaw = transaction.transactionDateTime;
  if (typeof transactionDateTimeRaw !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.transactionDateTime is invalid',
    );
  }
  const transactionDateTime = new Date(transactionDateTimeRaw);
  if (Number.isNaN(transactionDateTime.getTime())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.transactionDateTime is invalid',
    );
  }

  return {
    providerTransactionId: id,
    amount,
    transactionDateTime,
    counterpartyAccountNumber: toStringOrEmpty(
      transaction.counterAccountNumber,
    ),
    counterpartyName: toStringOrEmpty(transaction.counterAccountName),
    transferContent: toStringOrEmpty(transaction.description),
  };
}
