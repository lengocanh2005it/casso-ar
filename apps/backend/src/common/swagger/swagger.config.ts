import type { ConfigService } from '@nestjs/config';

export function shouldProtectSwagger(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

export function getSwaggerBasicAuthUsers(config: ConfigService): {
  user: string;
  password: string;
} {
  const user = config.getOrThrow<string>('SWAGGER_USER');
  const password = config.getOrThrow<string>('SWAGGER_PASSWORD');
  if (user.trim() === '' || password.trim() === '') {
    throw new Error('SWAGGER_USER and SWAGGER_PASSWORD must not be empty');
  }
  return { user, password };
}
