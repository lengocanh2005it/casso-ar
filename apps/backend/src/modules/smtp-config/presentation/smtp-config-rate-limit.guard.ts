import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getScopedRateLimitTracker } from '../../../common/rate-limit/rate-limit-tracker';

@Injectable()
export class SmtpConfigRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return getScopedRateLimitTracker(req, 'smtp', ['organizationId', 'userId']);
  }
}
