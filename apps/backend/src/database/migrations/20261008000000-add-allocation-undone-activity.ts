import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllocationUndoneActivity20261008000000
  implements MigrationInterface
{
  name = 'AddAllocationUndoneActivity20261008000000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "collection_activities_activityType_enum" ADD VALUE IF NOT EXISTS 'ALLOCATION_UNDONE'`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Keep the enum value because stored allocation undo activities may use it.
  }
}
