import type { QueryRunner } from 'typeorm';
import { AddReplacedByTokenIdToRefreshTokens20260929000000 } from './20260929000000-add-replaced-by-token-id-to-refresh-tokens';

describe('AddReplacedByTokenIdToRefreshTokens20260929000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('adds a nullable replacedByTokenId column without backfilling it', async () => {
    const { query, runner } = makeRunner();
    await new AddReplacedByTokenIdToRefreshTokens20260929000000().up(runner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replacedByTokenId" uuid',
    );
  });

  it('drops the column on down', async () => {
    const { query, runner } = makeRunner();
    await new AddReplacedByTokenIdToRefreshTokens20260929000000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "replacedByTokenId"',
    );
  });
});
