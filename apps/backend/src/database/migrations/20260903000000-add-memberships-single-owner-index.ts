import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMembershipsSingleOwnerIndex20260903000000
  implements MigrationInterface
{
  name = 'AddMembershipsSingleOwnerIndex20260903000000';

  // Defense-in-depth backstop for issue #314 / ADR-0024's single-owner
  // invariant (CONTEXT.md Business Rule 15). invite-member and
  // change-member-role already reject OWNER at the DTO boundary, and
  // 20260902000000 backfilled any pre-existing multi-owner organizations
  // down to one — this index is the last line of defense against a future
  // write path reintroducing a second OWNER. Mirrors the partial unique
  // index pattern used for "one open dispute per receivable"
  // (DisputeOrmEntity's IDX_disputes_one_open_per_receivable).
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_memberships_one_owner_per_organization"
      ON "memberships" ("organizationId")
      WHERE "role" = 'OWNER' AND "joinedAt" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_memberships_one_owner_per_organization"',
    );
  }
}
