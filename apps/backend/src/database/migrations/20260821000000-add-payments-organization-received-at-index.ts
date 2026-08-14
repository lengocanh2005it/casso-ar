import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentsOrganizationReceivedAtIndex20260821000000
  implements MigrationInterface
{
  name = 'AddPaymentsOrganizationReceivedAtIndex20260821000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_payments_organization_received_at" ON "payments" ("organizationId", "receivedAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payments_organization_received_at"',
    );
  }
}
