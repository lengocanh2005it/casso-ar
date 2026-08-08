import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function getTypeOrmConfig(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '5432')),
    username: config.get<string>('DB_USERNAME', 'casso'),
    password: config.get<string>('DB_PASSWORD', ''),
    database: config.get<string>('DB_DATABASE', 'casso_ledger'),
    autoLoadEntities: true,
    synchronize: config.get<string>('NODE_ENV', 'development') !== 'production',
    migrations: [join(__dirname, '../database/migrations/*{.js,.ts}')],
    migrationsRun:
      config.get<string>('NODE_ENV', 'development') === 'production',
  };
}
