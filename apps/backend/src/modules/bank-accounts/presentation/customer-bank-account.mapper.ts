import { maskAccountNumber } from '../application/account-number-normalizer';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

export interface CustomerBankAccountResponse {
  id: string;
  customerId: string;
  accountNumberMasked: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toCustomerBankAccountResponse(
  account: CustomerBankAccount,
): CustomerBankAccountResponse {
  return {
    id: account.id,
    customerId: account.customerId,
    accountNumberMasked: maskAccountNumber(account.accountNumber),
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}
