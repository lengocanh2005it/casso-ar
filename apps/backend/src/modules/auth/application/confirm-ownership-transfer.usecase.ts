import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from '../../organizations/application/organization-repository.port';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../users/application/user-repository.port';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from './member-notification.port';
import { hashOtp } from './token-hasher';

export interface ConfirmOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  requestedByUserId: string;
  otp: string;
}

const ACCEPTANCE_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ConfirmOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly notificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: ConfirmOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, requestedByUserId, otp } = input;

    const confirmed = await this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findById(
        requestId,
        organizationId,
        manager,
      );
      if (!request) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy yêu cầu chuyển quyền sở hữu.',
        );
      }
      if (request.fromUserId !== requestedByUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Chỉ người khởi tạo yêu cầu mới có thể xác nhận.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (reclaimed.status !== 'PENDING_OTP_CONFIRMATION') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu không còn ở trạng thái chờ xác nhận OTP.',
        );
      }

      if (hashOtp(otp) !== reclaimed.otpHash) {
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          'OTP không hợp lệ hoặc đã hết hạn.',
        );
      }

      const nextRequest = reclaimed.confirm(
        new Date(Date.now() + ACCEPTANCE_TTL_MS),
      );
      await this.requestRepo.save(nextRequest, manager);
      return nextRequest;
    });

    const [targetUser, organization] = await Promise.all([
      this.userRepo.findById(confirmed.toUserId),
      this.organizationRepo.findById(confirmed.organizationId),
    ]);
    if (targetUser && organization) {
      await this.notificationSender.sendOwnershipTransferPendingEmail(
        targetUser.email,
        organization.name,
      );
    }

    return confirmed;
  }
}
