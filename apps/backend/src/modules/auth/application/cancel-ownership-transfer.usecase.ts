import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOwnershipTransferRequestRepository,
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface CancelOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  requestedByUserId: string;
}

@Injectable()
export class CancelOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: CancelOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, requestedByUserId } = input;

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
      if (request.fromUserId !== requestedByUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Chỉ người khởi tạo yêu cầu mới có thể huỷ.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (!reclaimed.isNonTerminal()) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu đã được xử lý hoặc hết hạn.',
        );
      }

      const cancelled = reclaimed.cancel();
      await this.requestRepo.save(cancelled, manager);
      return cancelled;
    });
  }
}
