import type { QueryRunner } from 'typeorm';
import { BackfillSingleOwnerPerOrganization20260902000000 } from './20260902000000-backfill-single-owner-per-organization';

describe('BackfillSingleOwnerPerOrganization20260902000000', () => {
  it('demotes every OWNER except the earliest-joined one per organization', async () => {
    const migration = new BackfillSingleOwnerPerOrganization20260902000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(true);
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'LOCK TABLE "memberships" IN SHARE ROW EXCLUSIVE MODE',
    );
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY "organizationId"');
    expect(sql).toContain('ORDER BY "createdAt" ASC, "id" ASC');
    expect(sql).toContain('SET "role" = \'FINANCE_MANAGER\'');
    expect(sql).toContain('rank > 1');
  });

  it('is a one-directional data backfill with no down migration', async () => {
    const migration = new BackfillSingleOwnerPerOrganization20260902000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
