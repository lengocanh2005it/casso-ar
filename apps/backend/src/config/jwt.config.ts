import type { ConfigService } from '@nestjs/config';

export function getJwtSecret(config: ConfigService): string {
  return config.getOrThrow<string>('JWT_SECRET');
}
