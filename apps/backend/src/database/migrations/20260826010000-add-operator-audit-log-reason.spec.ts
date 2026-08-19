import type { QueryRunner } from 'typeorm';
import { AddOperatorAuditLogReason20260826010000 } from './20260826010000-add-operator-audit-log-reason';

describe('AddOperatorAuditLogReason20260826010000', () => {
  it('adds the nullable reason column', async () => {
    const migration = new AddOperatorAuditLogReason20260826010000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "reason" character varying',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddOperatorAuditLogReason20260826010000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "reason"',
    );
  });
});
