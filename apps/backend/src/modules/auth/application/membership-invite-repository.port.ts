import type { EntityManager } from 'typeorm';
import type {
  MembershipInvite,
  PendingInviteSummary,
} from '../domain/membership-invite';

export interface IMembershipInviteRepository {
  findByTokenHash(tokenHash: string): Promise<MembershipInvite | null>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<MembershipInvite | null>;
  save(invite: MembershipInvite, manager?: EntityManager): Promise<void>;
  delete(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void>;
  findPendingPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<PendingInviteSummary[]>;
  countPendingByOrganization(organizationId: string): Promise<number>;
}

export const MEMBERSHIP_INVITE_REPOSITORY = Symbol(
  'MEMBERSHIP_INVITE_REPOSITORY',
);
