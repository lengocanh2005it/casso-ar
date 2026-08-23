import type { QueryRunner } from 'typeorm';
import { AddOwnershipTransferRequestsTable20260904000000 } from './20260904000000-add-ownership-transfer-requests-table';

describe('AddOwnershipTransferRequestsTable20260904000000', () => {
  it('creates the table and the one-non-terminal-per-org partial unique index', async () => {
    const migration = new AddOwnershipTransferRequestsTable20260904000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "ownership_transfer_requests"',
    );
    expect(sql).toContain('"fromUserId" character varying NOT NULL');
    expect(sql).toContain('"toUserId" character varying NOT NULL');
    expect(sql).toContain('"status" character varying NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    expect(sql).toContain(
      `WHERE "status" IN ('PENDING_OTP_CONFIRMATION', 'PENDING_ACCEPTANCE')`,
    );
  });

  it('reverts by dropping the indexes and table', async () => {
    const migration = new AddOwnershipTransferRequestsTable20260904000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_ownership_transfer_requests_organization"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "ownership_transfer_requests"',
    );
  });
});
