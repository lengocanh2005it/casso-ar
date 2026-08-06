import type { CustomerBankAccount } from '../domain/customer-bank-account';

export interface ICustomerBankAccountRepository {
  findByAccountNumber(
    accountNumber: string,
  ): Promise<CustomerBankAccount | null>;
  save(account: CustomerBankAccount): Promise<void>;
}

export const CUSTOMER_BANK_ACCOUNT_REPOSITORY = Symbol(
  'CUSTOMER_BANK_ACCOUNT_REPOSITORY',
);
