import type { QueryRunner } from 'typeorm';
import { AddAuditLogsRelatedReceivableId20260907000000 } from './20260907000000-add-audit-logs-related-receivable-id';

describe('AddAuditLogsRelatedReceivableId20260907000000', () => {
  it('adds the nullable relatedReceivableId column and an index', async () => {
    const migration = new AddAuditLogsRelatedReceivableId20260907000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "relatedReceivableId" character varying',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_org_related_receivable_id" ON "audit_logs" ("organizationId", "relatedReceivableId")',
    );
  });

  it('reverts by dropping the index then the column', async () => {
    const migration = new AddAuditLogsRelatedReceivableId20260907000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'DROP INDEX IF EXISTS "IDX_audit_logs_org_related_receivable_id"',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "relatedReceivableId"',
    );
  });
});
