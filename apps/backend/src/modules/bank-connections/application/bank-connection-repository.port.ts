import type { EntityManager } from 'typeorm';
import type { BankConnection } from '../domain/bank-connection';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null>;
  // Unscoped on purpose: called from MarkRequiresReauthorizationUseCase and
  // SyncTransactionsUseCase, which run outside an authenticated request (a
  // background sync / a Cas ID error callback with only a connectionId) —
  // there is no TenantContextService organizationId to scope by at that point.
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  // Unscoped on purpose, same reasoning as findByIdUnscoped above: called
  // from ReceiveWebhookUseCase, which handles an inbound Cas ID Balance Hook
  // delivery — there is no TenantContextService organizationId at that point,
  // only the grantId Cas ID's payload carries.
  findByGrantId(grantId: string): Promise<BankConnection | null>;
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
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
