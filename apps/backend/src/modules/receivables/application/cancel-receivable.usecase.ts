import { Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import type { Receivable } from '../domain/receivable';
import { ReceivableTransitionRunnerService } from './receivable-transition-runner.service';

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    private readonly transitionRunner: ReceivableTransitionRunnerService,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    return this.transitionRunner.run({
      receivableId,
      changeSource: BalanceHistoryChangeSource.CANCEL,
      assertTransitionAllowed: (receivable) => {
        if (receivable.paidAmount > 0) {
          throw new AppError(
            ErrorCode.RECEIVABLE_HAS_PAYMENTS,
            'Không thể hủy khoản phải thu đã nhận thanh toán.',
          );
        }
      },
      transition: (receivable) => {
        try {
          return receivable.cancel();
        } catch (error) {
          throw new AppError(
            ErrorCode.CONFLICT,
            error instanceof Error
              ? error.message
              : 'Không thể hủy khoản phải thu.',
          );
        }
      },
    });
  }
}
