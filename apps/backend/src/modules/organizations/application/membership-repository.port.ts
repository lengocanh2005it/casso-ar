import type { EntityManager } from 'typeorm';
import type { Membership, MembershipStatus, Role } from '../domain/membership';

export interface MembershipListFilters {
  status?: MembershipStatus;
  userIds?: string[];
}

export interface IMembershipRepository {
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
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
    filters?: MembershipListFilters,
  ): Promise<Membership[]>;
  countByOrganization(
    organizationId: string,
    filters?: MembershipListFilters,
  ): Promise<number>;
  findUserIdsByOrganizationSearch(
    organizationId: string,
    search: string,
  ): Promise<string[]>;
  countActiveByRole(
    organizationId: string,
    role: Role,
    manager?: EntityManager,
  ): Promise<number>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
