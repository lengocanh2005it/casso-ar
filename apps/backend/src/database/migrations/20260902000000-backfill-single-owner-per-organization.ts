import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillSingleOwnerPerOrganization20260902000000
  implements MigrationInterface
{
  name = 'BackfillSingleOwnerPerOrganization20260902000000';
  transaction = true;

  // Issue #314 / ADR-0024: an Organization must have exactly one active
  // OWNER. Organizations that already have more than one (the pre-#314
  // bug this migration closes) keep their earliest-joined OWNER and get
  // the rest demoted to FINANCE_MANAGER.
  async up(queryRunner: QueryRunner): Promise<void> {
    // Blocks concurrent role writes on `memberships` for the duration of
    // the backfill, so an in-flight invite/change-role request can't race
    // the demote and leave the organization with an inconsistent count.
    await queryRunner.query(
      'LOCK TABLE "memberships" IN SHARE ROW EXCLUSIVE MODE',
    );
    await queryRunner.query(`
      WITH ranked_owners AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "organizationId"
            ORDER BY "createdAt" ASC, "id" ASC
          ) AS rank
        FROM "memberships"
        WHERE "role" = 'OWNER' AND "joinedAt" IS NOT NULL
      )
      UPDATE "memberships" m
      SET "role" = 'FINANCE_MANAGER'
      FROM ranked_owners ro
      WHERE m."id" = ro."id" AND ro.rank > 1
    `);
  }

  // Which memberships were demoted is not recoverable from data alone
  // (a demoted row looks identical to one that was always FINANCE_MANAGER)
  // — this backfill is one-directional, like the balance-history rollout
  // baseline (20260822000000-add-receivable-balance-history-rollout-baseline.ts).
  async down(_queryRunner: QueryRunner): Promise<void> {}
}
