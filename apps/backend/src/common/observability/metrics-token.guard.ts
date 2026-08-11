import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_TOKEN;
    // No token configured: leave the endpoint open (local/dev default).
    if (!expected) return true;
    const headers = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>().headers;
    const authorization = headers.authorization;
    const provided =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
    const providedBytes = Buffer.from(provided);
    const expectedBytes = Buffer.from(expected);
    if (
      providedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(providedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }
}
