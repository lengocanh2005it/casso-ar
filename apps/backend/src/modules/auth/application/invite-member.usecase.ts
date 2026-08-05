import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';
import { generateToken } from './token-hasher';

export interface InviteMemberInput {
  organizationId: string;
  organizationName: string;
  email: string;
  role: Role;
  invitedByUserId: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InviteMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: InviteMemberInput): Promise<void> {
    const { token, hash } = generateToken();
    const invite = new MembershipInvite({
      id: randomUUID(),
      organizationId: input.organizationId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      acceptedAt: null,
      createdAt: new Date(),
    });

    await this.dataSource.transaction(async (manager) => {
      await this.inviteRepo.save(invite, manager);
    });
    await this.emailSender.sendInviteEmail(
      invite.email,
      `/invites/accept?token=${token}`,
      input.organizationName,
    );
  }
}
