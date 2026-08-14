import { maskAccountNumber } from '../application/account-number-normalizer';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

export class CustomerBankAccountResponseDto {
  id: string;
  customerId: string;
  accountNumberMasked: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ListCustomerBankAccountsResponseDto {
  items: CustomerBankAccountResponseDto[];
  total: number;
}

export function toCustomerBankAccountResponse(
  account: CustomerBankAccount,
): CustomerBankAccountResponseDto {
  return {
    id: account.id,
    customerId: account.customerId,
    accountNumberMasked: maskAccountNumber(account.accountNumber),
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}
