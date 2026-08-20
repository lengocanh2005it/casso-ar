import type { EntityManager } from 'typeorm';
import type { BankConnection } from '../domain/bank-connection';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null>;
  // Unscoped on purpose — see typeorm-bank-connection.repository.ts.
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  // Unscoped on purpose — see typeorm-bank-connection.repository.ts.
  findByAccountNumber(accountNumber: string): Promise<BankConnection | null>;
  // Unscoped on purpose, same reasoning as findByAccountNumber: used by the
  // preview/confirm connect flow to classify each Casso Flow account as
  // AVAILABLE / ALREADY_CONNECTED / TAKEN_BY_ANOTHER_ORG *before* knowing
  // which organization (if any) already owns a given accountNumber.
  findByAccountNumbers(
    accountNumbers: string[],
  ): Promise<Map<string, BankConnection>>;
  findPage(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<BankConnection[]>;
  count(organizationId: string): Promise<number>;
  hasActiveByOrganization(organizationId: string): Promise<boolean>;
  countActiveByOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<number>;
  countActiveByAuthorization(
    cassoFlowAuthorizationId: string,
    manager: EntityManager,
  ): Promise<number>;
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
