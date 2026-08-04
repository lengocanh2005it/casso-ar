import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'casso',
  password: process.env.DB_PASSWORD ?? 'casso',
  database: process.env.DB_DATABASE ?? 'casso_ledger',
  autoLoadEntities: true,
  synchronize: true,
};
