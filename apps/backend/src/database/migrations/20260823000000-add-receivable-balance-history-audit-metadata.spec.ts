import type { QueryRunner } from 'typeorm';
import { AddReceivableBalanceHistoryAuditMetadata20260823000000 } from './20260823000000-add-receivable-balance-history-audit-metadata';

describe('AddReceivableBalanceHistoryAuditMetadata20260823000000', () => {
  it('adds the nullable audit columns and actor checks in one transaction', async () => {
    const migration =
      new AddReceivableBalanceHistoryAuditMetadata20260823000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(true);
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "actorType"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "actorUserId"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "reasonCode"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "note"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "transitionReferenceId"');
    expect(sql).toContain('CHK_receivable_balance_history_actor_type');
    expect(sql).toContain("'USER', 'SYSTEM', 'WEBHOOK'");
    expect(sql).toContain('CHK_receivable_balance_history_actor_user_id');
  });

  it('backfills only organization-matching allocation references', async () => {
    const migration =
      new AddReceivableBalanceHistoryAuditMetadata20260823000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const updateStatement = String(query.mock.calls.at(-1)?.[0]);
    expect(updateStatement).toContain('UPDATE "receivable_balance_history" h');
    expect(updateStatement).toContain(
      `h."changeSource" IN ('ALLOCATE', 'UNDO')`,
    );
    expect(updateStatement).toContain(
      'pa."organizationId" = h."organizationId"',
    );
  });

  it('reverts by dropping the columns and checks', async () => {
    const migration =
      new AddReceivableBalanceHistoryAuditMetadata20260823000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_receivable_balance_history_actor_user_id"',
    );
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_receivable_balance_history_actor_type"',
    );
    for (const column of [
      'transitionReferenceId',
      'note',
      'reasonCode',
      'actorUserId',
      'actorType',
    ]) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS "${column}"`);
    }
  });
});
