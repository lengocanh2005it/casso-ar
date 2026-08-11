import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CopilotRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user;
    if (typeof user === 'object' && user !== null && 'userId' in user) {
      const userId = user.userId;
      if (typeof userId === 'string' && userId.length > 0) {
        return `copilot:${userId}`;
      }
    }
    return `copilot:ip:${typeof req.ip === 'string' ? req.ip : 'unknown'}`;
  }
}
