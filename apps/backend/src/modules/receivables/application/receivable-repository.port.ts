import type { EntityManager } from 'typeorm';
import type { Receivable } from '../domain/receivable';

export interface IReceivableRepository {
  findById(id: string): Promise<Receivable | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Receivable | null>;
  save(receivable: Receivable, manager?: EntityManager): Promise<void>;
  findOpenByCustomerId(customerId: string): Promise<Receivable[]>;
  findOpenTopNByOrganization(
    organizationId: string,
    limit: number,
    referenceDate: Date,
  ): Promise<Receivable[]>;
}

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');
