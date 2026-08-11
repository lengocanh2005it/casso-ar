import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getScopedRateLimitTracker } from '../../../common/rate-limit/rate-limit-tracker';

@Injectable()
export class CopilotRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return getScopedRateLimitTracker(req, 'copilot', ['userId']);
  }
}
