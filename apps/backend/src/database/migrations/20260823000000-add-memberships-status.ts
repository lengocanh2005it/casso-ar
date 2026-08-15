import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMembershipsStatus20260823000000 implements MigrationInterface {
  name = 'AddMembershipsStatus20260823000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "memberships" DROP COLUMN IF EXISTS "blockedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "memberships" DROP COLUMN IF EXISTS "status"',
    );
  }
}
