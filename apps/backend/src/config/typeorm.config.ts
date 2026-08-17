import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { types as pgTypes } from 'pg';

// node-postgres returns PostgreSQL `bigint`/int8 (OID 20) columns as
// JavaScript strings to avoid silent precision loss above
// Number.MAX_SAFE_INTEGER. Every money column in this codebase is declared
// `@Column('bigint')` and the money-integer invariant requires integer VND
// amounts, so register one process-wide parser that converts int8 back to
// number. Without this, a bigint column loaded through a repository reaches
// the domain layer as a string, and `Receivable.applyPaymentAllocation()`'s
// `paidAmount + amount` would string-concatenate ("30000000" + 20000000 =
// "3000000020000000") instead of adding. VND amounts stay far below
// MAX_SAFE_INTEGER (9e15) — that is the explicit assumption of this parse.
pgTypes.setTypeParser(20, (value: string) => parseInt(value, 10));

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
