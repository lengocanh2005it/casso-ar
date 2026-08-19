import type { QueryRunner } from 'typeorm';
import { ReplaceCasIdWithCassoFlow20260828000000 } from './20260828000000-replace-cas-id-with-casso-flow';

describe('ReplaceCasIdWithCassoFlow20260828000000', () => {
  it('drops Cas ID columns/table and adds Casso Flow columns on up', async () => {
    const migration = new ReplaceCasIdWithCassoFlow20260828000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "casIdConnectionSessionId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedAccessToken"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountIdentity"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "scopes"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "accountNumber" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "bankName" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedSecureToken" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoApiKey" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "cas_id_connection_sessions"',
    );
  });

  it('is destructive on down (no Cas ID data to restore)', async () => {
    const migration = new ReplaceCasIdWithCassoFlow20260828000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_bank_connections_account_number"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
  });
});
