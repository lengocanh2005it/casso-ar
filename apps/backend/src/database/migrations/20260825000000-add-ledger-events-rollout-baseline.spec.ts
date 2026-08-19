import type { QueryRunner } from 'typeorm';
import { AddLedgerEventsRolloutBaseline20260825000000 } from './20260825000000-add-ledger-events-rollout-baseline';

describe('AddLedgerEventsRolloutBaseline20260825000000', () => {
  it('runs as an atomic cutover and locks receivable/payment mutations first', async () => {
    const migration = new AddLedgerEventsRolloutBaseline20260825000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain(
      'LOCK TABLE "receivables" IN SHARE MODE',
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      'LOCK TABLE "payments" IN SHARE MODE',
    );
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('RECEIVABLE_ROLLOUT_BASELINE');
    expect(sql).toContain('PAYMENT_ROLLOUT_BASELINE');
    expect(sql).toContain('UQ_ledger_events_receivable_rollout_baseline');
    expect(sql).toContain('UQ_ledger_events_payment_rollout_baseline');
  });

  it('down only drops the idempotency constraints', async () => {
    const migration = new AddLedgerEventsRolloutBaseline20260825000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('DROP INDEX IF EXISTS');
    expect(sql).not.toContain('DELETE');
  });
});
