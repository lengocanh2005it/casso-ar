import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getScopedRateLimitTracker } from '../../../common/rate-limit/rate-limit-tracker';

@Injectable()
export class ReceivableBalanceHistoryExportRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return getScopedRateLimitTracker(req, 'receivable-balance-history-export', [
      'organizationId',
      'userId',
    ]);
  }
}
