import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

function equalsConstantTime(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const headers = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers;
    const clientId = headers['x-client-id'];
    const secretKey = headers['x-secret-key'];
    const expectedClientId = process.env.CASSO_WEBHOOK_CLIENT_ID ?? '';
    const expectedSecretKey = process.env.CASSO_WEBHOOK_SECRET_KEY ?? '';
    if (
      typeof clientId !== 'string' ||
      typeof secretKey !== 'string' ||
      !equalsConstantTime(clientId, expectedClientId) ||
      !equalsConstantTime(secretKey, expectedSecretKey)
    )
      throw new UnauthorizedException('Invalid webhook credentials');
    return true;
  }
}
