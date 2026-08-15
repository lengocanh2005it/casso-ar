import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function getTypeOrmConfig(config: ConfigService): TypeOrmModuleOptions {
  const password = config.getOrThrow<string>('DB_PASSWORD');
  if (password.trim() === '') {
    throw new Error('DB_PASSWORD must not be empty');
  }
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '5432')),
    username: config.get<string>('DB_USERNAME', 'casso'),
    password,
    database: config.get<string>('DB_DATABASE', 'casso_ledger'),
    autoLoadEntities: true,
    synchronize: config.get<string>('NODE_ENV', 'development') !== 'production',
    migrations: [join(__dirname, '../database/migrations/!(*.spec){.js,.ts}')],
    migrationsRun:
      config.get<string>('NODE_ENV', 'development') === 'production',
  };
}
