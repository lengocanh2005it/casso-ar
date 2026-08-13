import { createHmac } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { equalsConstantTime } from '../../../common/security/constant-time-compare';

function buildSignedQueryString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key] ?? ''}`)
    .join('&');
}

@Injectable()
export class PayosWebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
    if (!checksumKey) {
      throw new UnauthorizedException('PayOS checksum key not configured');
    }

    const body = context.switchToHttp().getRequest<{
      body: { data?: Record<string, unknown>; signature?: string };
    }>().body;

    if (!body?.data || typeof body.signature !== 'string') {
      throw new UnauthorizedException('Invalid webhook payload');
    }

    const expectedSignature = createHmac('sha256', checksumKey)
      .update(buildSignedQueryString(body.data))
      .digest('hex');

    if (!equalsConstantTime(body.signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }
}
