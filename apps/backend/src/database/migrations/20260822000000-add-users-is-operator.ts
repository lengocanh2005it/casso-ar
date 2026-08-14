import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersIsOperator20260822000000 implements MigrationInterface {
  name = 'AddUsersIsOperator20260822000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isOperator" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "isOperator"',
    );
  }
}
