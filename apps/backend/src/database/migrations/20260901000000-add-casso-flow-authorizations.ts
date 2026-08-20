import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCassoFlowAuthorizations20260901000000
  implements MigrationInterface
{
  name = 'AddCassoFlowAuthorizations20260901000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "casso_flow_authorizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "businessId" character varying,
        "encryptedApiKey" text NOT NULL,
        "encryptedSecureToken" text NOT NULL,
        "createdAt" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_casso_flow_authorizations_organizationId" ON "casso_flow_authorizations" ("organizationId")',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "cassoFlowAuthorizationId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "accountHolderName" character varying NOT NULL DEFAULT \'\'',
    );
    // Backfill: one CassoFlowAuthorization per pre-existing BankConnection,
    // copying its encrypted key/secret verbatim (no re-encryption).
    // businessId is left NULL — unknown for connections created before this
    // feature existed; the first rotate against that authorization adopts a
    // real businessId (see application-layer RotateCassoFlowAuthorizationUseCase).
    await queryRunner.query(`
      DO $$
      DECLARE
        conn RECORD;
        new_auth_id uuid;
      BEGIN
        FOR conn IN
          SELECT "id", "organizationId", "encryptedCassoApiKey", "encryptedSecureToken"
          FROM "bank_connections"
          WHERE "cassoFlowAuthorizationId" IS NULL
        LOOP
          new_auth_id := gen_random_uuid();
          INSERT INTO "casso_flow_authorizations"
            ("id", "organizationId", "businessId", "encryptedApiKey", "encryptedSecureToken", "createdAt")
          VALUES
            (new_auth_id, conn."organizationId", NULL, conn."encryptedCassoApiKey", conn."encryptedSecureToken", now());
          UPDATE "bank_connections" SET "cassoFlowAuthorizationId" = new_auth_id WHERE "id" = conn."id";
        END LOOP;
      END $$
    `);
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ALTER COLUMN "cassoFlowAuthorizationId" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD CONSTRAINT "FK_bank_connections_casso_flow_authorization" FOREIGN KEY ("cassoFlowAuthorizationId") REFERENCES "casso_flow_authorizations" ("id")',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedCassoApiKey" text',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedSecureToken" text',
    );
    await queryRunner.query(`
      UPDATE "bank_connections" bc
      SET "encryptedCassoApiKey" = a."encryptedApiKey",
          "encryptedSecureToken" = a."encryptedSecureToken"
      FROM "casso_flow_authorizations" a
      WHERE bc."cassoFlowAuthorizationId" = a."id"
    `);
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP CONSTRAINT IF EXISTS "FK_bank_connections_casso_flow_authorization"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "cassoFlowAuthorizationId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountHolderName"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "casso_flow_authorizations"');
  }
}
