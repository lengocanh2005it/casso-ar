import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropEmailVerificationTokenHashUniqueIndex20260829000000
  implements MigrationInterface
{
  name = 'DropEmailVerificationTokenHashUniqueIndex20260829000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_90489f8f3368c45f461e90efbe"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_90489f8f3368c45f461e90efbe" ON "email_verification_tokens" ("tokenHash")',
    );
  }
}
