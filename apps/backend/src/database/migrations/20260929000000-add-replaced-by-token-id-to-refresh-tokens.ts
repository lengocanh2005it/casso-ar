import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReplacedByTokenIdToRefreshTokens20260929000000
  implements MigrationInterface
{
  name = 'AddReplacedByTokenIdToRefreshTokens20260929000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Successor link set by refresh-token rotation (ADR-0030). No backfill:
    // tokens revoked before this migration have no successor, so they never
    // qualify for the rotation grace window. No FK (userId has none either)
    // and no index (successors are looked up by primary key).
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replacedByTokenId" uuid',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "replacedByTokenId"',
    );
  }
}
