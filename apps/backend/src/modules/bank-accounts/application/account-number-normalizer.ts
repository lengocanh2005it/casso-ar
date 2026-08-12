import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

const ACCOUNT_NUMBER_PATTERN = /^[0-9]{4,34}$/;

export function normalizeAccountNumber(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Account number must be a string');
  const normalized = value.trim().replace(/[\s-]/g, '');
  if (!ACCOUNT_NUMBER_PATTERN.test(normalized)) {
    throw new Error('Account number must contain 4-34 digits');
  }
  return normalized;
}

// Both create and update use cases need the same "normalize or reject with a
// user-facing AppError" behavior and the same DB-race duplicate detection --
// centralized here instead of duplicated per use case.
export function normalizeOrThrow(value: string): string {
  try {
    return normalizeAccountNumber(value);
  } catch {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Số tài khoản ngân hàng không hợp lệ.',
    );
  }
}

export function maskAccountNumber(normalized: string): string {
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

export function toAuditedBankAccount(account: CustomerBankAccount) {
  return {
    id: account.id,
    customerId: account.customerId,
    accountNumberMasked: maskAccountNumber(account.accountNumber),
    isActive: account.isActive,
  };
}
