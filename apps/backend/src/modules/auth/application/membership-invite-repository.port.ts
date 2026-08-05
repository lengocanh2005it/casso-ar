import type { EntityManager } from 'typeorm';
import type { MembershipInvite } from '../domain/membership-invite';

export interface IMembershipInviteRepository {
  findByTokenHash(tokenHash: string): Promise<MembershipInvite | null>;
  save(invite: MembershipInvite, manager?: EntityManager): Promise<void>;
}

export const MEMBERSHIP_INVITE_REPOSITORY = Symbol(
  'MEMBERSHIP_INVITE_REPOSITORY',
);
