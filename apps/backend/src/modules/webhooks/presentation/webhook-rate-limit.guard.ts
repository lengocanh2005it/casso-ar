import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class WebhookRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, unknown> | undefined;
    const clientId = headers?.['x-client-id'];
    if (typeof clientId === 'string' && clientId) return `webhook:${clientId}`;
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return `webhook:${ip}`;
  }
}
