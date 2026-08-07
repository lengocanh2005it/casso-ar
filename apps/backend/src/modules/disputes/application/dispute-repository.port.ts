import type { EntityManager } from 'typeorm';
import type { Dispute } from '../domain/dispute';

export interface IDisputeRepository {
  findById(id: string): Promise<Dispute | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Dispute | null>;
  findOpenDispute(
    receivableId: string,
    manager?: EntityManager,
  ): Promise<Dispute | null>;
  findOpenDisputesByReceivableIds(
    receivableIds: string[],
  ): Promise<Map<string, string>>;
  save(dispute: Dispute, manager?: EntityManager): Promise<void>;
}

export const DISPUTE_REPOSITORY = Symbol('DISPUTE_REPOSITORY');
