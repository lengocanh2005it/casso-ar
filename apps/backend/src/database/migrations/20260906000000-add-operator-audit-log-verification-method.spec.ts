import type { QueryRunner } from 'typeorm';
import { AddOperatorAuditLogVerificationMethod20260906000000 } from './20260906000000-add-operator-audit-log-verification-method';

describe('AddOperatorAuditLogVerificationMethod20260906000000', () => {
  it('adds the nullable verificationMethod column', async () => {
    const migration = new AddOperatorAuditLogVerificationMethod20260906000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "verificationMethod" character varying',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddOperatorAuditLogVerificationMethod20260906000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "verificationMethod"',
    );
  });
});
