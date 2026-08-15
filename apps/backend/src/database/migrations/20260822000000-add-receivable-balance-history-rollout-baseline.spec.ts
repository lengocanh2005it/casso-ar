import type { QueryRunner } from 'typeorm';
import { AddReceivableBalanceHistoryRolloutBaseline20260822000000 } from './20260822000000-add-receivable-balance-history-rollout-baseline';

describe('AddReceivableBalanceHistoryRolloutBaseline20260822000000', () => {
  it('runs as an atomic cutover and locks receivable mutations first', async () => {
    const migration =
      new AddReceivableBalanceHistoryRolloutBaseline20260822000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain(
      'LOCK TABLE "receivables" IN SHARE MODE',
    );
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('receivable_balance_history_coverage');
    expect(sql).toContain('HISTORY_COVERAGE_START');
    expect(sql).not.toContain('"actorType"');
    expect(sql).not.toContain('"reasonCode"');
  });
});
