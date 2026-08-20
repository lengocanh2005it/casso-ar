import type { QueryRunner } from 'typeorm';
import { AddCassoFlowAuthorizations20260901000000 } from './20260901000000-add-casso-flow-authorizations';

describe('AddCassoFlowAuthorizations20260901000000', () => {
  it('creates the table, alters bank_connections, backfills, and drops the old columns', async () => {
    const migration = new AddCassoFlowAuthorizations20260901000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "casso_flow_authorizations"',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE INDEX IF NOT EXISTS "IDX_casso_flow_authorizations_organizationId" ON "casso_flow_authorizations" ("organizationId")',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "cassoFlowAuthorizationId" uuid',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "accountHolderName" character varying NOT NULL DEFAULT \'\'',
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DO $$'));
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ALTER COLUMN "cassoFlowAuthorizationId" SET NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD CONSTRAINT "FK_bank_connections_casso_flow_authorization" FOREIGN KEY ("cassoFlowAuthorizationId") REFERENCES "casso_flow_authorizations" ("id")',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
  });

  it('reverts by restoring the old columns, copying values back, and dropping the new table', async () => {
    const migration = new AddCassoFlowAuthorizations20260901000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedCassoApiKey" text',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedSecureToken" text',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "bank_connections" bc'),
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP CONSTRAINT IF EXISTS "FK_bank_connections_casso_flow_authorization"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "cassoFlowAuthorizationId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountHolderName"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "casso_flow_authorizations"',
    );
  });
});
