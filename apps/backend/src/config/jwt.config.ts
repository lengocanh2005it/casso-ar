import type { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

export function getJwtSecret(config: ConfigService): string {
  const secret = config.getOrThrow<string>('JWT_SECRET');
  if (secret.trim() === '') {
    throw new Error('JWT_SECRET must not be empty');
  }
  return secret;
}

export function getJwtModuleOptions(config: ConfigService): JwtModuleOptions {
  return {
    secret: getJwtSecret(config),
    signOptions: { expiresIn: '15m' },
  };
}
