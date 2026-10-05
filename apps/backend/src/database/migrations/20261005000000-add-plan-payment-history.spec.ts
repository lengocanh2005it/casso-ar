import type { QueryRunner } from 'typeorm';
import { AddPlanPaymentHistory20261005000000 } from './20261005000000-add-plan-payment-history';

describe('AddPlanPaymentHistory20261005000000', () => {
  it('atomically locks payment writers and backfills paid sources as unknown legacy receipts', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddPlanPaymentHistory20261005000000();

    await migration.up(runner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(migration.transaction).toBe(true);
    expect(sql).toContain(
      'LOCK TABLE "plan_upgrade_orders", "period_charges" IN SHARE MODE',
    );
    expect(sql).toContain('WHERE sourceOrder."status"::text = \'PAID\'');
    expect(sql).toContain("'LEGACY_BACKFILL'");
    expect(sql).toContain('sourceOrder."orderCode" + 100000000');
    expect(sql).toContain(
      'sourceOrder."planId"::text::"plan_upgrade_orders_targetPlanId_enum"',
    );
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('"receivedAmount" bigint');
    expect(sql).toContain('"quotedAmount" bigint');
  });

  it('keeps immutable receipt history on rollback', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;

    await new AddPlanPaymentHistory20261005000000().down(runner);

    expect(query).not.toHaveBeenCalled();
  });
});
