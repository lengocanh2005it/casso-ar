import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Membership, Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';

export interface BlockMemberInput {
  organizationId: string;
  organizationName: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class BlockMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: BlockMemberInput): Promise<Membership> {
    if (input.actorUserId === input.targetUserId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Không thể tự chặn quyền truy cập của chính mình.',
      );
    }

    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.targetUserId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy thành viên trong tổ chức.',
      );
    }
    if (membership.role === Role.OWNER) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Không thể chặn quyền truy cập của chủ sở hữu tổ chức.',
      );
    }
    if (membership.isBlocked()) {
      return membership;
    }

    const blocked = membership.block();
    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(blocked, manager);
    });

    const user = await this.userRepo.findById(input.targetUserId);
    if (user) {
      await this.authEmailSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    }
    return blocked;
  }
}
