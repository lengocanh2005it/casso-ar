import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AddPlanPaymentHistory20261005000000 } from '../src/database/migrations/20261005000000-add-plan-payment-history';

describe('AddPlanPaymentHistory migration (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    });
    await dataSource.initialize();
  }, 60_000);

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  }, 60_000);

  it('backfills both paid sources with tenant, external code, and unknown money fields', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(
        `CREATE TYPE "plan_upgrade_orders_status_enum" AS ENUM ('PENDING', 'PAID', 'FAILED')`,
      );
      await runner.query(
        `CREATE TYPE "period_charges_status_enum" AS ENUM ('PENDING', 'PAID', 'FAILED')`,
      );
      await runner.query(
        `CREATE TYPE "plan_upgrade_orders_targetPlanId_enum" AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE')`,
      );
      await runner.query(
        `CREATE TYPE "period_charges_planId_enum" AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE')`,
      );
      await runner.query(`
        CREATE TABLE "plan_upgrade_orders" (
          "id" uuid PRIMARY KEY,
          "organizationId" varchar NOT NULL,
          "targetPlanId" "plan_upgrade_orders_targetPlanId_enum" NOT NULL,
          "orderCode" bigint NOT NULL,
          "status" "plan_upgrade_orders_status_enum" NOT NULL,
          "updatedAt" timestamptz NOT NULL
        )
      `);
      await runner.query(`
        CREATE TABLE "period_charges" (
          "id" uuid PRIMARY KEY,
          "organizationId" varchar NOT NULL,
          "planId" "period_charges_planId_enum" NOT NULL,
          "orderCode" bigint NOT NULL,
          "periodStart" timestamptz NOT NULL,
          "periodEnd" timestamptz NOT NULL,
          "status" "period_charges_status_enum" NOT NULL,
          "updatedAt" timestamptz NOT NULL
        )
      `);
      await runner.query(
        `INSERT INTO "plan_upgrade_orders" VALUES ($1, $2, 'STARTER', 41, 'PAID', $3), ($4, $5, 'BUSINESS', 42, 'PENDING', $6)`,
        [
          '00000000-0000-4000-8000-000000000041',
          'org-upgrade',
          '2026-10-01T10:00:00Z',
          '00000000-0000-4000-8000-000000000042',
          'org-pending',
          '2026-10-02T10:00:00Z',
        ],
      );
      await runner.query(
        `INSERT INTO "period_charges" VALUES ($1, $2, 'BUSINESS', 7, $3, $4, 'PAID', $5), ($6, $7, 'STARTER', 8, $8, $9, 'PENDING', $10)`,
        [
          '00000000-0000-4000-8000-000000000043',
          'org-period',
          '2026-09-01T00:00:00Z',
          '2026-10-01T00:00:00Z',
          '2026-10-03T10:00:00Z',
          '00000000-0000-4000-8000-000000000044',
          'org-period-pending',
          '2026-10-01T00:00:00Z',
          '2026-11-01T00:00:00Z',
          '2026-10-04T10:00:00Z',
        ],
      );

      const migration = new AddPlanPaymentHistory20261005000000();
      await runner.startTransaction();
      await migration.up(runner);
      await runner.commitTransaction();

      const rows = await runner.query(
        `SELECT "organizationId", "sourceType"::text AS "sourceType", "sourceId", "orderCode"::text AS "orderCode", "planId"::text AS "planId", "periodStart", "periodEnd", "receivedAmount", "quotedAmount", "transferIdentity", "provenance"::text AS "provenance", "confirmedAt" FROM "plan_payment_history" ORDER BY "sourceType"`,
      );
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            organizationId: 'org-period',
            sourceType: 'PERIOD_CHARGE',
            sourceId: '00000000-0000-4000-8000-000000000043',
            orderCode: '100000007',
            planId: 'BUSINESS',
            receivedAmount: null,
            quotedAmount: null,
            transferIdentity: null,
            provenance: 'LEGACY_BACKFILL',
            confirmedAt: new Date('2026-10-03T10:00:00Z'),
          }),
          expect.objectContaining({
            organizationId: 'org-upgrade',
            sourceType: 'PLAN_UPGRADE_ORDER',
            sourceId: '00000000-0000-4000-8000-000000000041',
            orderCode: '41',
            planId: 'STARTER',
            receivedAmount: null,
            quotedAmount: null,
            transferIdentity: null,
            provenance: 'LEGACY_BACKFILL',
            confirmedAt: new Date('2026-10-01T10:00:00Z'),
          }),
        ]),
      );
      await runner.query(
        `INSERT INTO "plan_payment_history" ("id", "organizationId", "sourceType", "sourceId", "orderCode", "planId", "receivedAmount", "quotedAmount", "initialOutcome", "provenance", "confirmedAt", "createdAt") SELECT gen_random_uuid(), "organizationId", "sourceType", "sourceId", "orderCode", "planId", "receivedAmount", "quotedAmount", "initialOutcome", "provenance", "confirmedAt", "createdAt" FROM "plan_payment_history" WHERE "sourceId" = $1 ON CONFLICT DO NOTHING`,
        ['00000000-0000-4000-8000-000000000041'],
      );
      expect(
        await runner.query(
          `SELECT count(*)::int AS "count" FROM "plan_payment_history"`,
        ),
      ).toEqual([{ count: 2 }]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
