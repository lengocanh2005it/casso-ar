import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankTransactionAiRecommendation20260908000000
  implements MigrationInterface
{
  name = 'AddBankTransactionAiRecommendation20260908000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "aiRecommendation" jsonb',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_transactions" DROP COLUMN IF EXISTS "aiRecommendation"',
    );
  }
}
