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
