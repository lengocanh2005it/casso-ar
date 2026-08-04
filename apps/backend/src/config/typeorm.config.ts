import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

// ponytail: reads process.env at call time, not import time — required so
// tests that set DB_HOST/DB_PORT from a dynamically-provisioned testcontainer
// in beforeAll() (after AppModule is already imported) see the real values.
export function getTypeOrmConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'casso',
    password: process.env.DB_PASSWORD ?? 'casso',
    database: process.env.DB_DATABASE ?? 'casso_ledger',
    autoLoadEntities: true,
    synchronize: true,
  };
}
