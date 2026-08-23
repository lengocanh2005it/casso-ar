import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnershipTransferRequestsTable20260904000000
  implements MigrationInterface
{
  name = 'AddOwnershipTransferRequestsTable20260904000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ownership_transfer_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "fromUserId" character varying NOT NULL,
        "toUserId" character varying NOT NULL,
        "status" character varying NOT NULL,
        "otpHash" character varying NOT NULL,
        "otpExpiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "acceptanceExpiresAt" TIMESTAMP WITH TIME ZONE,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ownership_transfer_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ownership_transfer_requests_organization" ON "ownership_transfer_requests" ("organizationId")',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"
      ON "ownership_transfer_requests" ("organizationId")
      WHERE "status" IN ('PENDING_OTP_CONFIRMATION', 'PENDING_ACCEPTANCE')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ownership_transfer_requests_organization"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "ownership_transfer_requests"',
    );
  }
}
