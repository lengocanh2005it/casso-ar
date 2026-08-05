import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { AuthError } from '../../../common/errors/auth.error';
import { ErrorCode } from '../../../common/errors/error-code';
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
      throw new AuthError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Lời mời đã hết hạn hoặc đã được sử dụng.',
      );
    }

    let user = await this.userRepo.findByEmail(invite.email);
    let createdUser = false;
    const now = new Date();
    if (user && input.authenticatedUserId !== user.id) {
      throw new AuthError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Người dùng hiện tại phải đăng nhập để nhận lời mời.',
      );
    }
    if (!user) {
      if (!input.password) {
        throw new AuthError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Mật khẩu là bắt buộc để tạo tài khoản mới.',
        );
      }
      user = new User({
        id: randomUUID(),
        name: invite.email,
        email: invite.email,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: now,
        createdAt: now,
      });
      createdUser = true;
    }

    const existingMembership =
      await this.membershipRepo.findByUserAndOrganization(
        user.id,
        invite.organizationId,
      );
    if (existingMembership) {
      throw new AuthError(
        409,
        ErrorCode.CONFLICT,
        'Người dùng đã là thành viên của tổ chức này.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (createdUser) {
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
