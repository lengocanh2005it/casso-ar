import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceCasIdWithCassoFlow20260828000000
  implements MigrationInterface
{
  name = 'ReplaceCasIdWithCassoFlow20260828000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "casIdConnectionSessionId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedAccessToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountIdentity"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "scopes"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "accountNumber" character varying NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "bankName" character varying NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedSecureToken" text NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoApiKey" text NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "cas_id_connection_sessions"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_bank_connections_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "bankName"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountNumber"',
    );
  }
}
