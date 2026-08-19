import type { QueryRunner } from 'typeorm';
import { AddBankConnectionGrantId20260827000000 } from './20260827000000-add-bank-connection-grant-id';

describe('AddBankConnectionGrantId20260827000000', () => {
  it('adds the required, unique grantId column', async () => {
    const migration = new AddBankConnectionGrantId20260827000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "grantId" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "UQ_bank_connections_grant_id" ON "bank_connections" ("grantId")',
    );
  });

  it('reverts by dropping the index then the column', async () => {
    const migration = new AddBankConnectionGrantId20260827000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_bank_connections_grant_id"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
  });
});
