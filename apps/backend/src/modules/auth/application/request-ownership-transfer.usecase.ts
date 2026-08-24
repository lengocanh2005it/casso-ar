import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IOwnershipTransferRequestRepository,
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from './member-notification.port';
import { comparePassword } from './password-hasher';
import { generateOtp } from './token-hasher';

export interface RequestOwnershipTransferInput {
  organizationId: string;
  requestedByUserId: string;
  targetUserId: string;
  currentPassword: string;
}

const OTP_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class RequestOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly notificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: RequestOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestedByUserId, targetUserId, currentPassword } =
      input;

    if (targetUserId === requestedByUserId) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Không thể chuyển quyền sở hữu cho chính mình.',
      );
    }

    const user = await this.userRepo.findById(requestedByUserId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
    }
    const validPassword = await comparePassword(
      currentPassword,
      user.passwordHash,
    );
    if (!validPassword) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Mật khẩu hiện tại không đúng.',
      );
    }

    const targetMembership =
      await this.membershipRepo.findByUserAndOrganization(
        targetUserId,
        organizationId,
      );
    if (
      !targetMembership ||
      !targetMembership.isActive() ||
      targetMembership.isBlocked()
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Người nhận phải là thành viên đang hoạt động của tổ chức.',
      );
    }
    if (targetMembership.role === Role.OWNER) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Người nhận đã là OWNER.');
    }

    const { otp, hash } = generateOtp();

    const request = await this.dataSource.transaction(async (manager) => {
      const existing = await this.requestRepo.findNonTerminalByOrganization(
        organizationId,
        manager,
      );
      if (existing) {
        const reclaimed = await reclaimIfExpired(
          this.requestRepo,
          existing,
          manager,
        );
        if (reclaimed.isNonTerminal()) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Đã có một yêu cầu chuyển quyền sở hữu đang chờ xử lý.',
          );
        }
      }

      const created = new OwnershipTransferRequest({
        id: randomUUID(),
        organizationId,
        fromUserId: requestedByUserId,
        toUserId: targetUserId,
        status: 'PENDING_OTP_CONFIRMATION',
        otpHash: hash,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        acceptanceExpiresAt: null,
        resolvedAt: null,
        createdAt: new Date(),
      });
      await this.requestRepo.save(created, manager);
      return created;
    });

    await this.notificationSender.sendOwnershipTransferOtpEmail(
      user.email,
      otp,
    );

    return request;
  }
}
