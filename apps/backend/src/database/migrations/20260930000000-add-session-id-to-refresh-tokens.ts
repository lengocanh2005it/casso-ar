import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionIdToRefreshTokens20260930000000
  implements MigrationInterface
{
  name = 'AddSessionIdToRefreshTokens20260930000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // One login = one session; rotation and grace replays inherit it so a
    // logout can revoke every token of that device session (ADR-0030). No
    // backfill: tokens issued before this migration keep a NULL session, and
    // logging out with one revokes only that token, as before. No FK and no
    // index: sessions are only ever matched together with a live token.
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "sessionId" uuid',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "sessionId"',
    );
  }
}
