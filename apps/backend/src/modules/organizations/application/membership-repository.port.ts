import type { EntityManager } from 'typeorm';
import type { Membership } from '../domain/membership';

export interface IMembershipRepository {
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null>;
  findFirstActiveByUserId(userId: string): Promise<Membership | null>;
  save(membership: Membership, manager?: EntityManager): Promise<void>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
