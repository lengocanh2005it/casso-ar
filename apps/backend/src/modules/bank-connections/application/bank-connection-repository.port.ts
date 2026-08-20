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
  // Unscoped on purpose: the CassoFlowAuthorization id, not the caller's org,
  // is the natural key here — used by rotate/preview flows that already hold
  // (and have verified) the authorization, and by disconnect to inspect its
  // sibling connections. The authorization itself is always org-scoped when
  // it's looked up, so this can't leak across tenants in practice.
  findByAuthorizationId(
    cassoFlowAuthorizationId: string,
  ): Promise<BankConnection[]>;
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
  // Unscoped on purpose, same reasoning as findByAuthorizationId above —
  // called from DisconnectConnectionUseCase to decide whether this was the
  // last active connection under a given (already-verified) authorization.
  countActiveByAuthorization(
    cassoFlowAuthorizationId: string,
    manager: EntityManager,
  ): Promise<number>;
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
