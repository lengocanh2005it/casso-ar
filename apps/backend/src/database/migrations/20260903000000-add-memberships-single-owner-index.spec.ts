import type { QueryRunner } from 'typeorm';
import { AddMembershipsSingleOwnerIndex20260903000000 } from './20260903000000-add-memberships-single-owner-index';

describe('AddMembershipsSingleOwnerIndex20260903000000', () => {
  it('creates a partial unique index enforcing one active OWNER per organization', async () => {
    const migration = new AddMembershipsSingleOwnerIndex20260903000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_memberships_one_owner_per_organization"',
    );
    expect(sql).toContain('ON "memberships" ("organizationId")');
    expect(sql).toContain(
      'WHERE "role" = \'OWNER\' AND "joinedAt" IS NOT NULL',
    );
  });

  it('drops the index on rollback', async () => {
    const migration = new AddMembershipsSingleOwnerIndex20260903000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_memberships_one_owner_per_organization"',
    );
  });
});
