import type { EntityManager } from 'typeorm';
import type { BankTransaction } from '../domain/bank-transaction';

export interface IBankTransactionRepository {
  save(transaction: BankTransaction, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<BankTransaction | null>;
}

export const BANK_TRANSACTION_REPOSITORY = Symbol(
  'BANK_TRANSACTION_REPOSITORY',
);
