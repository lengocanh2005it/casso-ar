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
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface AcceptOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  actingUserId: string;
}

@Injectable()
export class AcceptOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: AcceptOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, actingUserId } = input;

    return this.dataSource.transaction(async (manager) => {
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
      if (request.toUserId !== actingUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Bạn không phải người được đề nghị nhận quyền sở hữu.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (reclaimed.status !== 'PENDING_ACCEPTANCE') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu không còn ở trạng thái chờ chấp nhận.',
        );
      }

      // Re-validate every precondition against current state — never trust
      // what was true when the request was created or confirmed.
      const targetMembership =
        await this.membershipRepo.findByUserAndOrganization(
          reclaimed.toUserId,
          organizationId,
          manager,
        );
      if (!targetMembership?.isActive() || targetMembership.isBlocked()) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Bạn không còn đủ điều kiện nhận quyền sở hữu.',
        );
      }

      const fromMembership =
        await this.membershipRepo.findByUserAndOrganization(
          reclaimed.fromUserId,
          organizationId,
          manager,
        );
      if (!fromMembership || fromMembership.role !== Role.OWNER) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Người chuyển quyền không còn là OWNER của tổ chức.',
        );
      }

      await this.membershipRepo.save(
        fromMembership.withRole(Role.FINANCE_MANAGER),
        manager,
      );
      await this.membershipRepo.save(
        targetMembership.withRole(Role.OWNER),
        manager,
      );

      const accepted = reclaimed.accept();
      await this.requestRepo.save(accepted, manager);
      return accepted;
    });
  }
}
