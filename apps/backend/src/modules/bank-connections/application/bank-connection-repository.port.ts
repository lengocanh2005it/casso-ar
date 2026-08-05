import type { EntityManager } from 'typeorm';
import type { BankConnection } from '../domain/bank-connection';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null>;
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
