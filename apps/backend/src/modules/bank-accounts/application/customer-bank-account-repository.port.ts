import type { EntityManager } from 'typeorm';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

export interface ICustomerBankAccountRepository {
  findActiveByAccountNumber(
    accountNumber: string,
  ): Promise<CustomerBankAccount[]>;
  findByCustomerId(customerId: string): Promise<CustomerBankAccount[]>;
  findById(id: string): Promise<CustomerBankAccount | null>;
  save(account: CustomerBankAccount, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_BANK_ACCOUNT_REPOSITORY = Symbol(
  'CUSTOMER_BANK_ACCOUNT_REPOSITORY',
);
