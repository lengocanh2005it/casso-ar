import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationsStatus20260822010000
  implements MigrationInterface
{
  name = 'AddOrganizationsStatus20260822010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'ACTIVE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "status"',
    );
  }
}
