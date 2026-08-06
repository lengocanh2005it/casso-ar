import type { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

export function getJwtSecret(config: ConfigService): string {
  return config.getOrThrow<string>('JWT_SECRET');
}

export function getJwtModuleOptions(config: ConfigService): JwtModuleOptions {
  return {
    secret: getJwtSecret(config),
    signOptions: { expiresIn: '15m' },
  };
}
