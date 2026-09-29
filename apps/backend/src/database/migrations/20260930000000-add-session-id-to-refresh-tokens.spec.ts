import type { QueryRunner } from 'typeorm';
import { AddSessionIdToRefreshTokens20260930000000 } from './20260930000000-add-session-id-to-refresh-tokens';

describe('AddSessionIdToRefreshTokens20260930000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('adds a nullable sessionId column without backfilling it', async () => {
    const { query, runner } = makeRunner();
    await new AddSessionIdToRefreshTokens20260930000000().up(runner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "sessionId" uuid',
    );
  });

  it('drops the column on down', async () => {
    const { query, runner } = makeRunner();
    await new AddSessionIdToRefreshTokens20260930000000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "sessionId"',
    );
  });
});
