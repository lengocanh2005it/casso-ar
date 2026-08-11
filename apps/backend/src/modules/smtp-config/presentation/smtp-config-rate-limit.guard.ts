import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class SmtpConfigRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user;
    if (typeof user === 'object' && user !== null) {
      const organizationId =
        'organizationId' in user ? user.organizationId : null;
      const userId = 'userId' in user ? user.userId : null;
      if (typeof organizationId === 'string' && typeof userId === 'string') {
        return `smtp:${organizationId}:${userId}`;
      }
    }
    return `smtp:ip:${typeof req.ip === 'string' ? req.ip : 'unknown'}`;
  }
}
