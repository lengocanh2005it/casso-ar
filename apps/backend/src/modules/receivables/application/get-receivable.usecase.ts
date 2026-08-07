import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from '../../disputes/application/dispute-repository.port';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface ReceivableWithDisputeStatus {
  receivable: Receivable;
  isDisputed: boolean;
  disputeId: string | null;
}

@Injectable()
export class GetReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
  ) {}

  async execute(id: string): Promise<ReceivableWithDisputeStatus> {
    const receivable = await this.receivableRepo.findById(id);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }

    const openDispute = await this.disputeRepo.findOpenDispute(id);
    return {
      receivable,
      isDisputed: openDispute !== null,
      disputeId: openDispute?.id ?? null,
    };
  }
}
