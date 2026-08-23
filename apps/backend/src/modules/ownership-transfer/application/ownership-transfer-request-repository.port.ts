import type { EntityManager } from 'typeorm';
import type { OwnershipTransferRequest } from '../domain/ownership-transfer-request';

export interface IOwnershipTransferRequestRepository {
  save(
    request: OwnershipTransferRequest,
    manager?: EntityManager,
  ): Promise<void>;
  findById(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null>;
  findNonTerminalByOrganization(
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null>;
}

export const OWNERSHIP_TRANSFER_REQUEST_REPOSITORY = Symbol(
  'OWNERSHIP_TRANSFER_REQUEST_REPOSITORY',
);
