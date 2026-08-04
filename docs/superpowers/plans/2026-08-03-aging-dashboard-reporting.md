# Aging Dashboard & Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time aging + dashboard reporting queries on top of the `Receivable`/`Customer`/`BankTransaction` tables built by `2026-08-03-project-scaffolding-and-domain-core.md`, `2026-08-03-multi-tenancy-rbac.md`, and `2026-08-03-webhook-matching-engine.md`. No precompute, no materialized view — `GET /api/v1/reports/aging` and `GET /api/v1/reports/dashboard-summary` run parameterized raw SQL directly against Postgres on every request, per `2026-08-03-aging-dashboard-reporting-design.md` mục 1.

**Architecture:** New `apps/backend/src/modules/reporting/` module with two read-only query services (`AgingReportQueryService`, `DashboardSummaryQueryService`) that inject `DataSource` directly (via `@InjectDataSource()`) and `TenantContextService` (to read `organizationId` the same way `BaseRepository` does), bypassing the Repository/UseCase layering because these are cross-entity aggregate reads, not single-entity CRUD — this is the explicit exception called out in the multi-tenancy plan's architecture ("aggregate read queries ... a raw parameterized SQL query using `this.tenantContext.getOrganizationId()` directly, wrapped in a dedicated read-only query service, is acceptable"). `ReportsController` exposes both endpoints behind the existing `JwtAuthGuard` + `PermissionGuard` + `@RequirePermission(Permission.REPORT_READ)` (already defined in the multi-tenancy plan — reused, not redefined).

**Tech Stack:** NestJS 10, TypeORM 0.3 `DataSource.query()` (raw parameterized SQL), PostgreSQL 16, Jest + testcontainers + supertest (same as prior plans) — no new dependencies.

## Global Constraints

- No precompute / materialized view / cron job — every report query runs live against `receivables` (and `bank_transactions` for auto-match rate) on each request (spec mục 1, mục 5).
- Required composite index `Receivable(organizationId, status, dueDate)` (spec mục 1) must exist before this plan's queries are considered done.
- Aging buckets and their boundary formula are copied verbatim from spec mục 2 (`NOT_DUE`, `OVERDUE_1_7`, `OVERDUE_8_30`, `OVERDUE_31_60`, `OVERDUE_60_PLUS`) — do not invent different bucket names or boundaries.
- Money fields stay integer (đồng), never `float` — SQL aggregates return values that get `Number(...)`-converted the same way the existing `payment-allocation.integration.spec.ts` does for `bigint` columns (scaffolding plan mục 4).
- Reads must go through `TenantContextService.getOrganizationId()`, never accept `organizationId` as a request parameter — same rule the multi-tenancy plan applied to every other repository (multi-tenancy plan mục 1).
- Reuse `Permission.REPORT_READ` and `PermissionGuard`/`@RequirePermission` from the multi-tenancy plan — do not add a new permission or guard.
- Out of scope per spec mục 5, explicitly not built in this plan: materialized views/precompute, forecast adjusted by each customer's historical on-time-payment rate, and a separate reporting data warehouse (ClickHouse).
- Also out of scope for this plan specifically: **Reminder effectiveness** (spec mục 4). The metric belongs to the Reminder Automation/Email Notification plans, which own `ReminderExecution`; `DashboardSummaryQueryService` does not duplicate that metric here.

---

## File Structure

```
apps/backend/src/
  modules/
    receivables/
      infrastructure/receivable.orm-entity.ts        -- MODIFY: add composite index
    reporting/
      application/aging-report-query.service.ts
      application/dashboard-summary-query.service.ts
      presentation/reports.controller.ts
      reporting.module.ts
  app.module.ts                                        -- MODIFY: register ReportingModule
test/
  aging-dashboard-reporting.integration.spec.ts
```

---

### Task 1: Composite index on `receivables(organizationId, status, dueDate)`

**Files:**
- Modify: `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts`

**Interfaces:**
- Consumes: `ReceivableOrmEntity` from the project-scaffolding plan
- Produces: DB index that `AgingReportQueryService` and `DashboardSummaryQueryService` (Task 2-3) rely on for their `WHERE organizationId = ? AND status IN (...) AND dueDate ...` filters

- [ ] **Step 1: Add the composite index to `ReceivableOrmEntity`**

Modify `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts` — add `Index` to the TypeORM import and the class decorator:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';

@Entity({ name: 'receivables' })
@Index(['organizationId', 'status', 'dueDate'])
export class ReceivableOrmEntity {
  // ... rest of the class is unchanged
}
```

- [ ] **Step 2: Verify the index is created (integration check)**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- payment-allocation.integration.spec.ts` (existing test from the scaffolding plan — with `synchronize: true`, TypeORM recreates the schema including the new index; this test still passing confirms no regression)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts
git commit -m "feat: add composite index on receivables(organizationId, status, dueDate) for reporting queries"
```

---

### Task 2: `AgingReportQueryService`

**Files:**
- Create: `apps/backend/src/modules/reporting/application/aging-report-query.service.ts`
- Test: `apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService` (multi-tenancy plan), `DataSource` (TypeORM)
- Produces: `AgingReportQueryService.getAgingBuckets(): Promise<AgingBucketResult[]>` — always returns all 5 buckets in fixed order, zero-filled if empty — used by Task 4 (`ReportsController`)

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts`:

```typescript
import { AgingReportQueryService } from './aging-report-query.service';

describe('AgingReportQueryService', () => {
  function buildService(rows: Array<{ bucket: string; count: string; totalRemaining: string }>) {
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const service = new AgingReportQueryService(dataSource as any, tenantContext as any);
    return { service, dataSource };
  }

  it('returns all 5 buckets in fixed order, zero-filled when missing from the query result', async () => {
    const { service } = buildService([
      { bucket: 'OVERDUE_1_7', count: '2', totalRemaining: '15000000' },
    ]);

    const result = await service.getAgingBuckets();

    expect(result).toEqual([
      { bucket: 'NOT_DUE', count: 0, totalRemaining: 0 },
      { bucket: 'OVERDUE_1_7', count: 2, totalRemaining: 15_000_000 },
      { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 },
      { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 },
      { bucket: 'OVERDUE_60_PLUS', count: 0, totalRemaining: 0 },
    ]);
  });

  it('scopes the query by the current tenant organizationId', async () => {
    const { service, dataSource } = buildService([]);

    await service.getAgingBuckets();

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), ['org-1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test aging-report-query.service.spec.ts`
Expected: FAIL — Cannot find module './aging-report-query.service'

- [ ] **Step 3: Create `apps/backend/src/modules/reporting/application/aging-report-query.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export type AgingBucket =
  | 'NOT_DUE'
  | 'OVERDUE_1_7'
  | 'OVERDUE_8_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_60_PLUS';

export interface AgingBucketResult {
  bucket: AgingBucket;
  count: number;
  totalRemaining: number;
}

interface AgingBucketRow {
  bucket: AgingBucket;
  count: string;
  totalRemaining: string | null;
}

const BUCKET_ORDER: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

const AGING_BUCKETS_SQL = `
  SELECT
    CASE
      WHEN "dueDate"::date >= CURRENT_DATE THEN 'NOT_DUE'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 1 AND 7 THEN 'OVERDUE_1_7'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 8 AND 30 THEN 'OVERDUE_8_30'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 31 AND 60 THEN 'OVERDUE_31_60'
      ELSE 'OVERDUE_60_PLUS'
    END AS bucket,
    COUNT(*) AS count,
    COALESCE(SUM("originalAmount" - "paidAmount"), 0) AS "totalRemaining"
  FROM receivables
  WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
  GROUP BY bucket
`;

@Injectable()
export class AgingReportQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getAgingBuckets(): Promise<AgingBucketResult[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows: AgingBucketRow[] = await this.dataSource.query(AGING_BUCKETS_SQL, [organizationId]);

    const byBucket = new Map(rows.map((row) => [row.bucket, row]));

    return BUCKET_ORDER.map((bucket) => {
      const row = byBucket.get(bucket);
      return {
        bucket,
        count: row ? Number(row.count) : 0,
        totalRemaining: row ? Number(row.totalRemaining) : 0,
      };
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test aging-report-query.service.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/application/aging-report-query.service.ts apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts
git commit -m "feat: add AgingReportQueryService with zero-filled bucket aggregation"
```

---

### Task 3: `DashboardSummaryQueryService`

**Files:**
- Create: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts`
- Test: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService`, `DataSource`
- Produces: `DashboardSummaryQueryService.getSummary(period?): Promise<DashboardSummary>` — used by Task 4 (`ReportsController`)

MVP scope for this endpoint (spec mục 4, excluding reminder effectiveness per Global Constraints): total outstanding, total overdue, overdue rate (by amount), cash collection forecast at 7/14/30 days (spec mục 3, optimistic same-day assumption), top 10 overdue customers, auto-match rate and manual handling rate (spec mục 4, computed over `bank_transactions`, default period = current calendar month per spec mục 6's suggested fixed-window default).

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts`:

```typescript
import { DashboardSummaryQueryService } from './dashboard-summary-query.service';

describe('DashboardSummaryQueryService', () => {
  function buildService(queryResults: unknown[][]) {
    const query = jest.fn();
    queryResults.forEach((result) => query.mockResolvedValueOnce(result));
    const dataSource = { query };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const service = new DashboardSummaryQueryService(dataSource as any, tenantContext as any);
    return { service, dataSource };
  }

  it('computes totalOutstanding, totalOverdue and overdueRate from the first query', async () => {
    const { service } = buildService([
      [{ totalOutstanding: '150000000', totalOverdue: '140000000' }],
      [{ forecast7d: '20000000', forecast14d: '20000000', forecast30d: '20000000' }],
      [{ customerId: 'cust-1', customerName: 'Công ty B', totalOverdue: '140000000' }],
      [{ matchedCount: '8', totalCount: '10' }],
    ]);

    const summary = await service.getSummary({ from: new Date('2026-08-01'), to: new Date('2026-09-01') });

    expect(summary.totalOutstanding).toBe(150_000_000);
    expect(summary.totalOverdue).toBe(140_000_000);
    expect(summary.overdueRate).toBeCloseTo(140_000_000 / 150_000_000);
  });

  it('returns null auto-match/manual-handling rates when there are no bank transactions in the period', async () => {
    const { service } = buildService([
      [{ totalOutstanding: '0', totalOverdue: '0' }],
      [{ forecast7d: '0', forecast14d: '0', forecast30d: '0' }],
      [],
      [{ matchedCount: '0', totalCount: '0' }],
    ]);

    const summary = await service.getSummary({ from: new Date('2026-08-01'), to: new Date('2026-09-01') });

    expect(summary.autoMatchRate).toBeNull();
    expect(summary.manualHandlingRate).toBeNull();
    expect(summary.overdueRate).toBe(0);
    expect(summary.topOverdueCustomers).toEqual([]);
  });

  it('computes autoMatchRate and manualHandlingRate as complements', async () => {
    const { service } = buildService([
      [{ totalOutstanding: '1', totalOverdue: '0' }],
      [{ forecast7d: '0', forecast14d: '0', forecast30d: '0' }],
      [],
      [{ matchedCount: '8', totalCount: '10' }],
    ]);

    const summary = await service.getSummary({ from: new Date('2026-08-01'), to: new Date('2026-09-01') });

    expect(summary.autoMatchRate).toBeCloseTo(0.8);
    expect(summary.manualHandlingRate).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test dashboard-summary-query.service.spec.ts`
Expected: FAIL — Cannot find module './dashboard-summary-query.service'

- [ ] **Step 3: Create `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface DashboardSummaryPeriod {
  from: Date;
  to: Date;
}

export interface TopOverdueCustomer {
  customerId: string;
  customerName: string;
  totalOverdue: number;
}

export interface DashboardSummary {
  totalOutstanding: number;
  totalOverdue: number;
  overdueRate: number;
  cashForecast: {
    forecast7d: number;
    forecast14d: number;
    forecast30d: number;
  };
  topOverdueCustomers: TopOverdueCustomer[];
  autoMatchRate: number | null;
  manualHandlingRate: number | null;
}

const OUTSTANDING_SQL = `
  SELECT
    COALESCE(SUM("originalAmount" - "paidAmount"), 0) AS "totalOutstanding",
    COALESCE(SUM("originalAmount" - "paidAmount") FILTER (WHERE "dueDate"::date < CURRENT_DATE), 0) AS "totalOverdue"
  FROM receivables
  WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
`;

const FORECAST_SQL = `
  SELECT
    COALESCE(SUM("originalAmount" - "paidAmount") FILTER (
      WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 day'
    ), 0) AS "forecast7d",
    COALESCE(SUM("originalAmount" - "paidAmount") FILTER (
      WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 day'
    ), 0) AS "forecast14d",
    COALESCE(SUM("originalAmount" - "paidAmount") FILTER (
      WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 day'
    ), 0) AS "forecast30d"
  FROM receivables
  WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
`;

const TOP_OVERDUE_CUSTOMERS_SQL = `
  SELECT r."customerId" AS "customerId", c.name AS "customerName",
    COALESCE(SUM(r."originalAmount" - r."paidAmount"), 0) AS "totalOverdue"
  FROM receivables r
  JOIN customers c ON c.id = r."customerId"
  WHERE r."organizationId" = $1
    AND r.status IN ('OPEN', 'PARTIALLY_PAID')
    AND r."dueDate"::date < CURRENT_DATE
  GROUP BY r."customerId", c.name
  ORDER BY "totalOverdue" DESC
  LIMIT 10
`;

const AUTO_MATCH_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE status = 'MATCHED') AS "matchedCount",
    COUNT(*) AS "totalCount"
  FROM bank_transactions
  WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3
`;

function currentMonthRange(): DashboardSummaryPeriod {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

@Injectable()
export class DashboardSummaryQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getSummary(period: DashboardSummaryPeriod = currentMonthRange()): Promise<DashboardSummary> {
    const organizationId = this.tenantContext.getOrganizationId();

    const [outstandingRows, forecastRows, topCustomerRows, matchRows] = await Promise.all([
      this.dataSource.query(OUTSTANDING_SQL, [organizationId]),
      this.dataSource.query(FORECAST_SQL, [organizationId]),
      this.dataSource.query(TOP_OVERDUE_CUSTOMERS_SQL, [organizationId]),
      this.dataSource.query(AUTO_MATCH_SQL, [organizationId, period.from, period.to]),
    ]);

    const totalOutstanding = Number(outstandingRows[0].totalOutstanding);
    const totalOverdue = Number(outstandingRows[0].totalOverdue);
    const overdueRate = totalOutstanding === 0 ? 0 : totalOverdue / totalOutstanding;

    const totalCount = Number(matchRows[0].totalCount);
    const matchedCount = Number(matchRows[0].matchedCount);
    const autoMatchRate = totalCount === 0 ? null : matchedCount / totalCount;
    const manualHandlingRate = autoMatchRate === null ? null : 1 - autoMatchRate;

    return {
      totalOutstanding,
      totalOverdue,
      overdueRate,
      cashForecast: {
        forecast7d: Number(forecastRows[0].forecast7d),
        forecast14d: Number(forecastRows[0].forecast14d),
        forecast30d: Number(forecastRows[0].forecast30d),
      },
      topOverdueCustomers: topCustomerRows.map(
        (row: { customerId: string; customerName: string; totalOverdue: string }) => ({
          customerId: row.customerId,
          customerName: row.customerName,
          totalOverdue: Number(row.totalOverdue),
        }),
      ),
      autoMatchRate,
      manualHandlingRate,
    };
  }
}
```

`autoMatchRate`/`manualHandlingRate` use the persisted `MATCHED` status. The Webhook Matching Engine only sets `status = 'MATCHED'` after a transient score reaches `>= 90`, so no `totalScore` column is needed on `bank_transactions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test dashboard-summary-query.service.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts
git commit -m "feat: add DashboardSummaryQueryService (outstanding, overdue rate, forecast, top overdue customers, auto-match rate)"
```

---

### Task 4: `ReportsController` + `ReportingModule`

**Files:**
- Create: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`
- Create: `apps/backend/src/modules/reporting/reporting.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `AgingReportQueryService` (Task 2), `DashboardSummaryQueryService` (Task 3), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`/`Permission.REPORT_READ` (multi-tenancy plan)
- Produces: `GET /api/v1/reports/aging`, `GET /api/v1/reports/dashboard-summary` HTTP endpoints, used by Task 5's integration test

- [ ] **Step 1: Create `apps/backend/src/modules/reporting/presentation/reports.controller.ts`**

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { AgingReportQueryService } from '../application/aging-report-query.service';
import { DashboardSummaryQueryService } from '../application/dashboard-summary-query.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
    private readonly dashboardSummaryQueryService: DashboardSummaryQueryService,
  ) {}

  @Get('aging')
  @RequirePermission(Permission.REPORT_READ)
  async getAgingReport() {
    return { buckets: await this.agingReportQueryService.getAgingBuckets() };
  }

  @Get('dashboard-summary')
  @RequirePermission(Permission.REPORT_READ)
  async getDashboardSummary(@Query('from') from?: string, @Query('to') to?: string) {
    const period = from && to ? { from: new Date(from), to: new Date(to) } : undefined;
    return this.dashboardSummaryQueryService.getSummary(period);
  }
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/reporting/reporting.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AgingReportQueryService } from './application/aging-report-query.service';
import { DashboardSummaryQueryService } from './application/dashboard-summary-query.service';
import { ReportsController } from './presentation/reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [AgingReportQueryService, DashboardSummaryQueryService],
})
export class ReportingModule {}
```

No `TypeOrmModule.forFeature([...])` needed — both services use `@InjectDataSource()` directly rather than an entity `Repository`, matching the "dedicated read-only query service" pattern the multi-tenancy plan's architecture calls out for aggregate reads.

- [ ] **Step 3: Register `ReportingModule` in `apps/backend/src/app.module.ts`**

Add `ReportingModule` to the `imports` array alongside `CustomersModule`, `InvoicesModule`, `ReceivablesModule`, `PaymentsModule`, `OrganizationsModule` (same pattern as every prior module registration).

- [ ] **Step 4: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- app.e2e-spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/presentation apps/backend/src/modules/reporting/reporting.module.ts apps/backend/src/app.module.ts
git commit -m "feat: add ReportsController with GET /api/v1/reports/aging and GET /api/v1/reports/dashboard-summary"
```

---

### Task 5: Integration test — aging buckets and dashboard summary (testcontainers)

**Files:**
- Create: `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-4), real Postgres via testcontainers
- Produces: end-to-end proof that seeded `Receivable`s at different overdue ages land in the correct aging bucket and roll up correctly into the dashboard summary — matches testing-strategy-design.md's integration-test pattern (same shape as `payment-allocation.integration.spec.ts`)

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';

describe('Aging & dashboard reporting (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000010';
  const customerId = '00000000-0000-0000-0000-000000000011';

  function daysFromToday(days: number): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  }

  function authHeader(): string {
    const token = jwtService.sign({ userId: 'user-1', organizationId, role: 'OWNER' });
    return `Bearer ${token}`;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty Quá Hạn',
      taxCode: '0399999999',
      email: 'ap@quahan.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 200_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const seeds = [
      { id: '00000000-0000-0000-0000-000000000021', dueDate: daysFromToday(10), originalAmount: 10_000_000 }, // NOT_DUE
      { id: '00000000-0000-0000-0000-000000000022', dueDate: daysFromToday(-5), originalAmount: 20_000_000 }, // OVERDUE_1_7
      { id: '00000000-0000-0000-0000-000000000023', dueDate: daysFromToday(-20), originalAmount: 30_000_000 }, // OVERDUE_8_30
      { id: '00000000-0000-0000-0000-000000000024', dueDate: daysFromToday(-45), originalAmount: 40_000_000 }, // OVERDUE_31_60
      { id: '00000000-0000-0000-0000-000000000025', dueDate: daysFromToday(-90), originalAmount: 50_000_000 }, // OVERDUE_60_PLUS
    ];

    for (const seed of seeds) {
      await dataSource.getRepository(ReceivableOrmEntity).save({
        id: seed.id,
        organizationId,
        customerId,
        invoiceId: null,
        originalAmount: seed.originalAmount,
        paidAmount: 0,
        dueDate: seed.dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: customerId,
        createdAt: new Date(),
        closedAt: null,
      });
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('rejects requests with no Authorization header', () => {
    return request(app.getHttpServer()).get('/api/v1/reports/aging').expect(401);
  });

  it('buckets receivables into the correct aging categories with correct counts and sums', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/aging')
      .set('Authorization', authHeader())
      .expect(200);

    const byBucket = Object.fromEntries(
      res.body.buckets.map((bucket: { bucket: string }) => [bucket.bucket, bucket]),
    );

    expect(byBucket.NOT_DUE).toEqual({ bucket: 'NOT_DUE', count: 1, totalRemaining: 10_000_000 });
    expect(byBucket.OVERDUE_1_7).toEqual({ bucket: 'OVERDUE_1_7', count: 1, totalRemaining: 20_000_000 });
    expect(byBucket.OVERDUE_8_30).toEqual({ bucket: 'OVERDUE_8_30', count: 1, totalRemaining: 30_000_000 });
    expect(byBucket.OVERDUE_31_60).toEqual({ bucket: 'OVERDUE_31_60', count: 1, totalRemaining: 40_000_000 });
    expect(byBucket.OVERDUE_60_PLUS).toEqual({ bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 50_000_000 });
  });

  it('computes dashboard summary totals, overdue rate, and top overdue customers across all receivables', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/dashboard-summary')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body).toMatchObject({
      totalOutstanding: 150_000_000,
      totalOverdue: 140_000_000,
      overdueRate: 140_000_000 / 150_000_000,
      cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
      autoMatchRate: null,
      manualHandlingRate: null,
    });
    expect(res.body.topOverdueCustomers[0]).toMatchObject({
      customerId,
      totalOverdue: 140_000_000,
    });
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- aging-dashboard-reporting.integration.spec.ts`
Expected: PASS — all 3 tests green (401 without token, correct bucket assignment, correct dashboard rollup)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/aging-dashboard-reporting.integration.spec.ts
git commit -m "test: add integration test for aging buckets and dashboard summary reporting"
```

---

## Self-Review Notes

- **Spec coverage:** Aging buckets (spec mục 2) → Task 2, bucket names/boundaries copied verbatim. Cash collection forecast (spec mục 3) → Task 3 `cashForecast`. Top overdue customers, auto-match rate, manual handling rate (spec mục 4) → Task 3. Required index (spec mục 1) → Task 1. Reminder effectiveness (spec mục 4) is intentionally excluded from the MVP response and owned by the Reminder Automation/Email Notification plans; this plan does not duplicate that metric.
- **No precompute:** every query in Task 2-3 is a live `DataSource.query()` call against `receivables`/`bank_transactions`, run per-request — matches spec mục 1's explicit "no materialized view/cron job at this scale" decision.
- **Tenant isolation:** both services take `organizationId` only from `TenantContextService.getOrganizationId()` (never a request parameter), and both endpoints sit behind `JwtAuthGuard` + `PermissionGuard` + `@RequirePermission(Permission.REPORT_READ)`, reusing the exact `Permission` enum member and guard classes defined in the multi-tenancy plan — no new permission or guard was introduced.
- **Type/table consistency checked:** SQL column names (`organizationId`, `customerId`, `originalAmount`, `paidAmount`, `dueDate`, `status`, `createdAt`) match `ReceivableOrmEntity`/`CustomerOrmEntity` (project-scaffolding plan) and `BankTransactionOrmEntity` (webhook-matching-engine plan) exactly, including `@Entity({ name: 'receivables' })`/`{ name: 'bank_transactions' })` table names. `status = 'MATCHED'` is the persisted reporting condition; the Webhook plan only sets it after a transient matching score reaches `>= 90`, so `totalScore` is not a persisted reporting field. This is documented inline in Task 3.
- **bigint handling:** `dataSource.query()` returns Postgres `bigint`/`numeric` aggregates as strings — every service method explicitly wraps results in `Number(...)` before returning, same pattern the scaffolding plan's `payment-allocation.integration.spec.ts` already uses for `paidAmount`.
