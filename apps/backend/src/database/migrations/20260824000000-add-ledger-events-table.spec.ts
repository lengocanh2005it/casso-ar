import type { QueryRunner } from 'typeorm';
import { AddLedgerEventsTable20260824000000 } from './20260824000000-add-ledger-events-table';

describe('AddLedgerEventsTable20260824000000', () => {
  it('creates the ledger_events table with expected columns', async () => {
    const migration = new AddLedgerEventsTable20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('"ledger_events"');
    expect(sql).toContain('"id" uuid NOT NULL');
    expect(sql).toContain('"organizationId"');
    expect(sql).toContain('"subjectType"');
    expect(sql).toContain('"subjectId" uuid NOT NULL');
    expect(sql).toContain('"kind"');
    expect(sql).toContain('"amount" bigint NOT NULL');
    expect(sql).toContain('"effectiveAt"');
    expect(sql).toContain('"transitionReferenceId"');
    expect(sql).toContain('"createdAt"');
    expect(sql).toContain('"sequence" BIGSERIAL NOT NULL');
    expect(sql).toContain('CHK_ledger_events_amount_not_zero');
  });

  it('creates the subject type and kind enums', async () => {
    const migration = new AddLedgerEventsTable20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ledger_event_subject_type_enum');
    expect(sql).toContain('ledger_event_kind_enum');
    expect(sql).toContain("'RECEIVABLE'");
    expect(sql).toContain("'PAYMENT'");
    expect(sql).toContain("'RECEIVABLE_CREATED'");
    expect(sql).toContain("'PAYMENT_RECEIVED'");
  });

  it('creates indexes for organization-scoped queries', async () => {
    const migration = new AddLedgerEventsTable20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('IDX_ledger_events_organization_effective');
    expect(sql).toContain('IDX_ledger_events_organization_subject_effective');
  });

  it('reverts by dropping indexes, table, and enums', async () => {
    const migration = new AddLedgerEventsTable20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('DROP INDEX IF EXISTS');
    expect(sql).toContain('DROP TABLE IF EXISTS "ledger_events"');
    expect(sql).toContain('DROP TYPE IF EXISTS');
  });
});
