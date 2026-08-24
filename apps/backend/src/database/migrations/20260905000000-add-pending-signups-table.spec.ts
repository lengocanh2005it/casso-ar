import type { QueryRunner } from 'typeorm';
import { AddPendingSignupsTable20260905000000 } from './20260905000000-add-pending-signups-table';

describe('AddPendingSignupsTable20260905000000', () => {
  it('creates the table and the email/tax-code unique indexes', async () => {
    const migration = new AddPendingSignupsTable20260905000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "pending_signups"');
    expect(sql).toContain('"email" character varying NOT NULL');
    expect(sql).toContain('"passwordHash" character varying NOT NULL');
    expect(sql).toContain('"taxCode" character varying NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_email" ON "pending_signups" ("email")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_tax_code" ON "pending_signups" ("taxCode")',
    );
  });

  it('reverts by dropping the indexes and table', async () => {
    const migration = new AddPendingSignupsTable20260905000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_pending_signups_email"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_pending_signups_tax_code"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "pending_signups"',
    );
  });
});
