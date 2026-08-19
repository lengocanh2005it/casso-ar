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

interface BalanceHookDataPayload {
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

// Casso Flow sends "YYYY-MM-DD HH:mm:ss" with no timezone marker, always in
// Asia/Ho_Chi_Minh (+07:00) — this product's standard timezone (AGENTS.md).
// Appending the offset explicitly avoids relying on `new Date(...)`'s
// locale/engine-dependent parsing of a space-separated, timezone-less string.
function parseCassoFlowDateTime(value: string): Date {
  const isoLike = `${value.replace(' ', 'T')}+07:00`;
  return new Date(isoLike);
}

export function normalizeBalanceHookPayload(
  payload: Record<string, unknown>,
): NormalizedTransaction {
  const data = (payload.data ?? {}) as BalanceHookDataPayload;

  const id = data.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.id is invalid',
    );
  }

  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.amount must be an integer',
    );
  }

  const transactionDateTimeRaw = data.transactionDateTime;
  if (typeof transactionDateTimeRaw !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.transactionDateTime is invalid',
    );
  }
  const transactionDateTime = parseCassoFlowDateTime(transactionDateTimeRaw);
  if (Number.isNaN(transactionDateTime.getTime())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.transactionDateTime is invalid',
    );
  }

  return {
    providerTransactionId: String(id),
    amount,
    transactionDateTime,
    counterpartyAccountNumber: toStringOrEmpty(data.counterAccountNumber),
    counterpartyName: toStringOrEmpty(data.counterAccountName),
    transferContent: toStringOrEmpty(data.description),
  };
}
