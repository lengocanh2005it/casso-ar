import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Membership } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { User } from '../../users/domain/user';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';
import { hashPassword } from './password-hasher';
import { hashToken } from './token-hasher';

export interface AcceptInviteInput {
  token: string;
  password?: string;
  authenticatedUserId?: string;
}

@Injectable()
export class AcceptInviteUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: AcceptInviteInput): Promise<void> {
    const invite = await this.inviteRepo.findByTokenHash(
      hashToken(input.token),
    );
    if (!invite?.isValid(new Date())) {
      throw new Error('Invite expired or already accepted');
    }

    let user = await this.userRepo.findByEmail(invite.email);
    const now = new Date();
    if (user && input.authenticatedUserId !== user.id) {
      throw new Error('Existing user must log in before accepting this invite');
    }
    if (!user) {
      if (!input.password) {
        throw new Error('Password is required to create a new account');
      }
      user = new User({
        id: randomUUID(),
        name: invite.email,
        email: invite.email,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: now,
        createdAt: now,
      });
    }

    const existingMembership =
      await this.membershipRepo.findByUserAndOrganization(
        user.id,
        invite.organizationId,
      );
    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    await this.dataSource.transaction(async (manager) => {
      if (!input.authenticatedUserId) {
        await this.userRepo.save(user as User, manager);
      }
      await this.membershipRepo.save(
        new Membership({
          id: randomUUID(),
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
          invitedAt: invite.createdAt,
          joinedAt: now,
          createdAt: now,
        }),
        manager,
      );
      await this.inviteRepo.save(invite.markAccepted(), manager);
    });
  }
}
