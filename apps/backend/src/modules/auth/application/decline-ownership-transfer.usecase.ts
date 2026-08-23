import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface DeclineOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  actingUserId: string;
}

@Injectable()
export class DeclineOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: DeclineOwnershipTransferInput,
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

      const declined = reclaimed.decline();
      await this.requestRepo.save(declined, manager);
      return declined;
    });
  }
}
