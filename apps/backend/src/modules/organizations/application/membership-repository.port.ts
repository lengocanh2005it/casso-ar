import type { EntityManager } from 'typeorm';
import type { Membership, Role } from '../domain/membership';

export interface IMembershipRepository {
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null>;
  findFirstActiveByUserId(userId: string): Promise<Membership | null>;
  findOwnerByOrganization(organizationId: string): Promise<Membership | null>;
  findFirstByRole(
    organizationId: string,
    role: Role,
  ): Promise<Membership | null>;
  save(membership: Membership, manager?: EntityManager): Promise<void>;
  deleteByUserAndOrganization(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void>;
  findPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<Membership[]>;
  countByOrganization(organizationId: string): Promise<number>;
  countActiveByRole(organizationId: string, role: Role): Promise<number>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
