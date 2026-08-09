# Aging Dashboard & Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time aging + dashboard reporting queries on top of the `Receivable`/`Customer`/`BankTransaction`/`ReminderExecution` tables, per `2026-08-03-aging-dashboard-reporting-design.md`. No precompute, no materialized view — `GET /api/v1/reports/aging` and `GET /api/v1/reports/dashboard-summary` run parameterized raw SQL directly against Postgres on every request (spec section 1).

**Revision note (2026-08-09, grilling session):** This plan was rewritten after a grilling session found the original draft's architecture line cited a "multi-tenancy plan exception" for bypassing Repository/UseCase layering that does not exist anywhere in `2026-08-03-multi-tenancy-rbac-design.md` or its plan — grepped, zero matches. This revision drops that bypass and goes through proper `application/` ports + `infrastructure/` repositories, matching the codebase's existing read-query precedent (`UnmatchedBankTransactionsQueryService` in `exception-queue/`). It also adds `reminderEffectiveness` to the MVP scope (spec section 4/6, resolved 2026-08-09) and adds date-range validation.

**Task numbering note:** the original draft's Task 1 (a composite index on `receivables(organizationId, status, dueDate)`) is removed entirely — that index already exists in `receivable.orm-entity.ts` as of this session, added by a later plan; there is nothing left to implement for it. The "Task 1" slot below is a **different, new task** (a `bank_transactions(organizationId, createdAt)` index) that took over the number — it is not a leftover of the original Task 1.

**Architecture:** New `apps/backend/src/modules/reporting/` module, one query service + one repository port per endpoint:

- `application/aging-report.repository.port.ts` — `IAgingReportRepository`
- `application/aging-report-query.service.ts` — `AgingReportQueryService`, depends on the port
- `application/dashboard-summary.repository.port.ts` — `IDashboardSummaryRepository`
- `application/dashboard-summary-query.service.ts` — `DashboardSummaryQueryService`, depends on the port
- `infrastructure/typeorm-aging-report.repository.ts` / `typeorm-dashboard-summary.repository.ts` — implement the ports via `@InjectDataSource()` + raw parameterized SQL against table names (`receivables`, `customers`, `bank_transactions`, `reminder_executions`); this is the reporting module's own infrastructure, not a reach into another module's `infrastructure/`, so it does not violate `.claude/rules/infrastructure.md`'s "MUST NOT import another module's infrastructure/ directly" rule — no ORM entity class from another module is imported, only raw table/column names (same pattern the original plan already used for `bank_transactions`).
- `presentation/reports.controller.ts` + `presentation/dto/get-dashboard-summary-query.dto.ts` — `ReportsController` behind `JwtAuthGuard` + `PermissionGuard` + `@RequirePermission(Permission.REPORT_READ)` (already defined in the multi-tenancy plan — reused, not redefined; verified present in `common/rbac/permission.enum.ts`).

Both services read `organizationId` only from `TenantContextService.getOrganizationId()` — never a request parameter — same as every other repository in the codebase.

**Tech Stack:** NestJS 11, TypeORM 1.1 `DataSource.query()` (raw parameterized SQL), PostgreSQL 16, `date-fns-tz` or native `Intl` for `Asia/Ho_Chi_Minh` month bounds (check `package.json` before adding a dependency — prefer what's already installed), `class-validator` for the date-range DTO, Jest + testcontainers + supertest (same as prior plans).

## Global Constraints

- No precompute / materialized view / cron job — every report query runs live against `receivables`/`bank_transactions`/`reminder_executions`/`customers` on each request (spec sections 1 and 5).
- Aging buckets and their boundary formula are copied verbatim from spec section 2 (`NOT_DUE`, `OVERDUE_1_7`, `OVERDUE_8_30`, `OVERDUE_31_60`, `OVERDUE_60_PLUS`) — do not invent different bucket names or boundaries.
- Money fields stay integer (VND), never `float` — SQL aggregates return values that get `Number(...)`-converted the same way `payment-allocation.integration.spec.ts` does for `bigint` columns.
- Reads must go through `TenantContextService.getOrganizationId()`, never accept `organizationId` as a request parameter.
- Reuse `Permission.REPORT_READ` and `PermissionGuard`/`@RequirePermission` — do not add a new permission or guard.
- Forecast stays the spec's optimistic "customer pays on time" assumption with no BE-side caveat field — any UX framing (tooltip, disclaimer) belongs to Plan #21 (FE), not this plan.
- Cash forecast (`forecast7d/14d/30d`), `totalOutstanding`/`totalOverdue`/`overdueRate`, and `topOverdueCustomers` are always computed "as of now" — the `from`/`to` period applies only to `autoMatchRate`/`manualHandlingRate`/`reminderEffectiveness`.
- Out of scope per spec section 5: materialized views/precompute, forecast adjusted by historical on-time-payment rate, a separate reporting data warehouse (ClickHouse).

---

## File Structure

```
apps/backend/src/
  database/
    migrations/
      <timestamp>-add-bank-transactions-created-at-index.ts   -- NEW
  modules/
    webhooks/
      infrastructure/bank-transaction.orm-entity.ts             -- MODIFY: add (organizationId, createdAt) index
    reporting/
      application/
        aging-report.repository.port.ts
        aging-report-query.service.ts
        dashboard-summary.repository.port.ts
        dashboard-summary-query.service.ts
      infrastructure/
        typeorm-aging-report.repository.ts
        typeorm-dashboard-summary.repository.ts
      presentation/
        reports.controller.ts
        dto/get-dashboard-summary-query.dto.ts
      reporting.module.ts
  app.module.ts                                                  -- MODIFY: register ReportingModule
test/
  aging-dashboard-reporting.integration.spec.ts
```

Note: the composite index `receivables(organizationId, status, dueDate)` that the original Task 1 created is **already present** in `receivable.orm-entity.ts` (confirmed by reading the file during the grilling session) — no action needed here.

---

### Task 1: Composite index on `bank_transactions(organizationId, createdAt)` + migration

**Files:**
- Modify: `apps/backend/src/modules/webhooks/infrastructure/bank-transaction.orm-entity.ts`
- Create: `apps/backend/src/database/migrations/<timestamp>-add-bank-transactions-created-at-index.ts`

**Interfaces:**
- Consumes: `BankTransactionOrmEntity` (webhook-matching-engine plan)
- Produces: DB index that `TypeOrmDashboardSummaryRepository`'s auto-match-rate and reminder-effectiveness queries rely on for `WHERE organizationId = ? AND createdAt/sentAt BETWEEN ? AND ?`

- [ ] **Step 1: Add the composite index to `BankTransactionOrmEntity`**

Modify the `@Index` decorators (existing one is `@Index(['organizationId', 'status'])`) to add a second:

```typescript
@Entity({ name: 'bank_transactions' })
@Index(['organizationId', 'status'])
@Index(['organizationId', 'createdAt'])
export class BankTransactionOrmEntity {
  // ... rest of the class is unchanged
}
```

- [ ] **Step 2: Write a migration matching the existing convention**

Look at `apps/backend/src/database/migrations/20260808000000-add-invoice-unique-index.ts` for the exact `MigrationInterface`/`up()`/`down()` shape used in this repo, then create `apps/backend/src/database/migrations/<today's-timestamp>-add-bank-transactions-created-at-index.ts` following it — `up()` creates the index, `down()` drops it.

- [ ] **Step 3: Run existing e2e to confirm no regression**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-matching.e2e-spec.ts`
Expected: PASS (synchronize:true in test env recreates schema including the new index; migration is for production only)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/webhooks/infrastructure/bank-transaction.orm-entity.ts apps/backend/src/database/migrations/
git commit -m "feat: add composite index on bank_transactions(organizationId, createdAt) for reporting queries"
```

---

### Task 2: `IAgingReportRepository` port + `TypeOrmAgingReportRepository` + `AgingReportQueryService`

**Files:**
- Create: `apps/backend/src/modules/reporting/application/aging-report.repository.port.ts`
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-aging-report.repository.ts`
- Create: `apps/backend/src/modules/reporting/application/aging-report-query.service.ts`
- Test: `apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService`
- Produces: `AgingReportQueryService.getAgingBuckets(): Promise<AgingBucketResult[]>` — always returns all 5 buckets in fixed order, zero-filled if empty — used by Task 4 (`ReportsController`)

- [ ] **Step 1: Write failing unit test for the query service (mock the port, not `DataSource`)**

Create `apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts`:

```typescript
import { AgingReportQueryService } from './aging-report-query.service';
import type { IAgingReportRepository } from './aging-report.repository.port';

describe('AgingReportQueryService', () => {
  function buildService(rows: Array<{ bucket: string; count: number; totalRemaining: number }>) {
    const repo: IAgingReportRepository = {
      findBucketCounts: jest.fn().mockResolvedValue(rows),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const service = new AgingReportQueryService(repo, tenantContext as any);
    return { service, repo };
  }

  it('returns all 5 buckets in fixed order, zero-filled when missing from the repository result', async () => {
    const { service } = buildService([{ bucket: 'OVERDUE_1_7', count: 2, totalRemaining: 15_000_000 }]);

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
    const { service, repo } = buildService([]);

    await service.getAgingBuckets();

    expect(repo.findBucketCounts).toHaveBeenCalledWith('org-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test aging-report-query.service.spec.ts`
Expected: FAIL — cannot find module `./aging-report-query.service` / `./aging-report.repository.port`

- [ ] **Step 3: Create the port**

`apps/backend/src/modules/reporting/application/aging-report.repository.port.ts`:

```typescript
export type AgingBucket =
  | 'NOT_DUE'
  | 'OVERDUE_1_7'
  | 'OVERDUE_8_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_60_PLUS';

export interface AgingBucketCount {
  bucket: AgingBucket;
  count: number;
  totalRemaining: number;
}

export const AGING_REPORT_REPOSITORY = Symbol('AGING_REPORT_REPOSITORY');

export interface IAgingReportRepository {
  findBucketCounts(organizationId: string): Promise<AgingBucketCount[]>;
}
```

- [ ] **Step 4: Create the query service**

`apps/backend/src/modules/reporting/application/aging-report-query.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  AGING_REPORT_REPOSITORY,
  type AgingBucket,
  type AgingBucketCount,
  type IAgingReportRepository,
} from './aging-report.repository.port';

const BUCKET_ORDER: AgingBucket[] = [
  'NOT_DUE',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_60_PLUS',
];

@Injectable()
export class AgingReportQueryService {
  constructor(
    @Inject(AGING_REPORT_REPOSITORY)
    private readonly agingReportRepo: IAgingReportRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getAgingBuckets(): Promise<AgingBucketCount[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.agingReportRepo.findBucketCounts(organizationId);
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));

    return BUCKET_ORDER.map((bucket) => byBucket.get(bucket) ?? { bucket, count: 0, totalRemaining: 0 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test aging-report-query.service.spec.ts`
Expected: both tests PASS

- [ ] **Step 6: Create the TypeORM repository (infrastructure)**

`apps/backend/src/modules/reporting/infrastructure/typeorm-aging-report.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AgingBucket,
  AgingBucketCount,
  IAgingReportRepository,
} from '../application/aging-report.repository.port';

interface AgingBucketRow {
  bucket: AgingBucket;
  count: string;
  totalRemaining: string | null;
}

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
export class TypeOrmAgingReportRepository implements IAgingReportRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findBucketCounts(organizationId: string): Promise<AgingBucketCount[]> {
    const rows: AgingBucketRow[] = await this.dataSource.query(AGING_BUCKETS_SQL, [organizationId]);
    return rows.map((row) => ({
      bucket: row.bucket,
      count: Number(row.count),
      totalRemaining: Number(row.totalRemaining ?? 0),
    }));
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/reporting/application/aging-report.repository.port.ts apps/backend/src/modules/reporting/application/aging-report-query.service.ts apps/backend/src/modules/reporting/application/aging-report-query.service.spec.ts apps/backend/src/modules/reporting/infrastructure/typeorm-aging-report.repository.ts
git commit -m "feat: add AgingReportQueryService with zero-filled bucket aggregation"
```

---

### Task 3: `GetDashboardSummaryQueryDto` (date-range validation)

**Files:**
- Create: `apps/backend/src/modules/reporting/presentation/dto/get-dashboard-summary-query.dto.ts`
- Test: `apps/backend/src/modules/reporting/presentation/dto/get-dashboard-summary-query.dto.spec.ts`

**Interfaces:**
- Consumes: `class-validator`
- Produces: a validated `{ from?: Date; to?: Date }` shape used by Task 5 (`ReportsController`) and Task 4 (`DashboardSummaryQueryService`'s default-period logic)

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/modules/reporting/presentation/dto/get-dashboard-summary-query.dto.spec.ts` covering: both omitted → valid; both present and `from <= to` and range <= 90 days → valid; `from > to` → validation error; range > 90 days → validation error; non-ISO-date string → validation error. Use `class-validator`'s `validate()` against a `plainToInstance`-constructed DTO, matching the pattern other DTO spec files in this repo already use (check `apps/backend/src/modules/**/presentation/dto/*.spec.ts` for the exact `plainToInstance`/`validate` idiom before writing this).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test get-dashboard-summary-query.dto.spec.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Create the DTO**

`apps/backend/src/modules/reporting/presentation/dto/get-dashboard-summary-query.dto.ts` — use `@IsOptional() @IsDateString()` on `from`/`to`, plus a class-level `@ValidatorConstraint` (or a single custom `@Validate()` decorator) enforcing `from <= to` and `(to - from) <= 90 days` only when both are present. Throw via the standard `ValidationPipe` (already global — check `main.ts`), which already emits the repo's `{ statusCode, errorCode: 'VALIDATION_ERROR', message, details }` shape via the existing exception filter — do not hand-roll error formatting here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test get-dashboard-summary-query.dto.spec.ts`
Expected: all cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/presentation/dto/
git commit -m "feat: add validated date-range DTO for dashboard-summary (from<=to, max 90 days)"
```

---

### Task 4: `IDashboardSummaryRepository` port + `TypeOrmDashboardSummaryRepository` + `DashboardSummaryQueryService`

**Files:**
- Create: `apps/backend/src/modules/reporting/application/dashboard-summary.repository.port.ts`
- Create: `apps/backend/src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository.ts`
- Create: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts`
- Test: `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService`, `IDashboardSummaryRepository`, `GetDashboardSummaryQueryDto`'s validated `{ from?, to? }` (Task 3)
- Produces: `DashboardSummaryQueryService.getSummary(period?: { from: Date; to: Date }): Promise<DashboardSummary>` — used by Task 5 (`ReportsController`)

MVP scope (spec section 4 + section 6 resolution): total outstanding, total overdue, overdue rate (by amount), cash collection forecast at 7/14/30 days, top 10 overdue customers, auto-match rate + manual handling rate (period-scoped), **reminder effectiveness** (period-scoped, 7-day post-send window — newly in scope per the 2026-08-09 grilling session, not deferred).

- [ ] **Step 1: Write failing unit test for the query service (mock the port)**

Create `apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts`. Mock `IDashboardSummaryRepository` with one jest.fn() per port method (`getOutstandingSummary`, `getForecast`, `getTopOverdueCustomers`, `getAutoMatchStats`, `getReminderEffectivenessStats`). Cover:
- happy path: `totalOutstanding`/`totalOverdue`/`overdueRate` computed correctly
- `autoMatchRate`/`manualHandlingRate` both `null` when `totalCount === 0`
- `autoMatchRate`/`manualHandlingRate` computed as complements when `totalCount > 0`
- `reminderEffectiveness` `null` when `sentCount === 0`, computed as `paidWithin7d / sentCount` otherwise
- when no `period` argument is passed, the service computes the current-month default in `Asia/Ho_Chi_Minh` and passes it to every period-scoped port method

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test dashboard-summary-query.service.spec.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Create the port**

`apps/backend/src/modules/reporting/application/dashboard-summary.repository.port.ts`:

```typescript
export interface DashboardPeriod {
  from: Date;
  to: Date;
}

export interface OutstandingSummary {
  totalOutstanding: number;
  totalOverdue: number;
}

export interface ForecastSummary {
  forecast7d: number;
  forecast14d: number;
  forecast30d: number;
}

export interface TopOverdueCustomer {
  customerId: string;
  customerName: string;
  totalOverdue: number;
}

export interface AutoMatchStats {
  matchedCount: number;
  totalCount: number;
}

export interface ReminderEffectivenessStats {
  paidWithin7dCount: number;
  sentCount: number;
}

export const DASHBOARD_SUMMARY_REPOSITORY = Symbol('DASHBOARD_SUMMARY_REPOSITORY');

export interface IDashboardSummaryRepository {
  getOutstandingSummary(organizationId: string): Promise<OutstandingSummary>;
  getForecast(organizationId: string): Promise<ForecastSummary>;
  getTopOverdueCustomers(organizationId: string): Promise<TopOverdueCustomer[]>;
  getAutoMatchStats(organizationId: string, period: DashboardPeriod): Promise<AutoMatchStats>;
  getReminderEffectivenessStats(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<ReminderEffectivenessStats>;
}
```

- [ ] **Step 4: Create the query service**

`apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts` — orchestrates the 5 port calls via `Promise.all`, computes `overdueRate`/`autoMatchRate`/`manualHandlingRate`/`reminderEffectiveness` from the raw counts (all `null`-guarded on a zero denominator), and — when `period` is not passed by the caller — defaults to the current calendar month in `Asia/Ho_Chi_Minh` (check what's already installed for timezone handling before adding `date-fns-tz`; a `Temporal`/`Intl.DateTimeFormat` with `timeZone: 'Asia/Ho_Chi_Minh'` may already cover this without a new dependency — see the Reminder Automation plan for how it computed "today" in this timezone and reuse that helper if one already exists in `common/`).

`DashboardSummary` return type gains `reminderEffectiveness: number | null` alongside the fields already in the spec's `DashboardSummaryResponse` (section 2).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test dashboard-summary-query.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 6: Create the TypeORM repository (infrastructure)**

`apps/backend/src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository.ts` implements `IDashboardSummaryRepository` via `@InjectDataSource()` + raw SQL, one method per query:

```sql
-- getOutstandingSummary
SELECT
  COALESCE(SUM("originalAmount" - "paidAmount"), 0) AS "totalOutstanding",
  COALESCE(SUM("originalAmount" - "paidAmount") FILTER (WHERE "dueDate"::date < CURRENT_DATE), 0) AS "totalOverdue"
FROM receivables
WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')

-- getForecast
SELECT
  COALESCE(SUM("originalAmount" - "paidAmount") FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 day'), 0) AS "forecast7d",
  COALESCE(SUM("originalAmount" - "paidAmount") FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 day'), 0) AS "forecast14d",
  COALESCE(SUM("originalAmount" - "paidAmount") FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 day'), 0) AS "forecast30d"
FROM receivables
WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')

-- getTopOverdueCustomers
SELECT r."customerId" AS "customerId", c.name AS "customerName",
  COALESCE(SUM(r."originalAmount" - r."paidAmount"), 0) AS "totalOverdue"
FROM receivables r
JOIN customers c ON c.id = r."customerId"
WHERE r."organizationId" = $1 AND r.status IN ('OPEN', 'PARTIALLY_PAID') AND r."dueDate"::date < CURRENT_DATE
GROUP BY r."customerId", c.name
ORDER BY "totalOverdue" DESC
LIMIT 10

-- getAutoMatchStats  (uses the (organizationId, createdAt) index from Task 1)
SELECT
  COUNT(*) FILTER (WHERE status = 'MATCHED') AS "matchedCount",
  COUNT(*) AS "totalCount"
FROM bank_transactions
WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3

-- getReminderEffectivenessStats
SELECT
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM receivables rec
      WHERE rec.id = re."receivableId"
        AND rec.status = 'PAID'
        AND rec."closedAt" IS NOT NULL
        AND rec."closedAt" <= re."sentAt" + INTERVAL '7 day'
    )
  ) AS "paidWithin7dCount",
  COUNT(*) AS "sentCount"
FROM reminder_executions re
WHERE re."organizationId" = $1 AND re.status = 'SENT' AND re."sentAt" BETWEEN $2 AND $3
```

Every `SELECT`/`WHERE` column name must be checked against the live entity files (`ReceivableOrmEntity`, `CustomerOrmEntity`, `BankTransactionOrmEntity`, `ReminderExecutionOrmEntity`) before writing the query — confirm `receivables.closedAt` exists and its type (the receivables domain plan defines a `closedAt` field; verify the exact column name/nullability in `receivable.orm-entity.ts` rather than assuming).

`autoMatchRate`/`manualHandlingRate` use the persisted `MATCHED` status — the Webhook Matching Engine only sets it after a transient score reaches `>= 90`, so no `totalScore` column is needed.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/reporting/application/dashboard-summary.repository.port.ts apps/backend/src/modules/reporting/application/dashboard-summary-query.service.ts apps/backend/src/modules/reporting/application/dashboard-summary-query.service.spec.ts apps/backend/src/modules/reporting/infrastructure/typeorm-dashboard-summary.repository.ts
git commit -m "feat: add DashboardSummaryQueryService (outstanding, overdue rate, forecast, top overdue customers, auto-match rate, reminder effectiveness)"
```

---

### Task 5: `ReportsController` + `ReportingModule`

**Files:**
- Create: `apps/backend/src/modules/reporting/presentation/reports.controller.ts`
- Create: `apps/backend/src/modules/reporting/reporting.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `AgingReportQueryService` (Task 2), `GetDashboardSummaryQueryDto` (Task 3), `DashboardSummaryQueryService` (Task 4), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`/`Permission.REPORT_READ`
- Produces: `GET /api/v1/reports/aging`, `GET /api/v1/reports/dashboard-summary` HTTP endpoints, used by Task 6's integration test

- [ ] **Step 1: Create `apps/backend/src/modules/reporting/presentation/reports.controller.ts`**

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { AgingReportQueryService } from '../application/aging-report-query.service';
import { DashboardSummaryQueryService } from '../application/dashboard-summary-query.service';
import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';

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
  async getDashboardSummary(@Query() query: GetDashboardSummaryQueryDto) {
    const period = query.from && query.to ? { from: new Date(query.from), to: new Date(query.to) } : undefined;
    return this.dashboardSummaryQueryService.getSummary(period);
  }
}
```

(`GetDashboardSummaryQueryDto`'s own class-validator decorators, wired through the app's global `ValidationPipe`, reject bad input before this method body runs.)

- [ ] **Step 2: Create `apps/backend/src/modules/reporting/reporting.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AGING_REPORT_REPOSITORY } from './application/aging-report.repository.port';
import { AgingReportQueryService } from './application/aging-report-query.service';
import { DASHBOARD_SUMMARY_REPOSITORY } from './application/dashboard-summary.repository.port';
import { DashboardSummaryQueryService } from './application/dashboard-summary-query.service';
import { TypeOrmAgingReportRepository } from './infrastructure/typeorm-aging-report.repository';
import { TypeOrmDashboardSummaryRepository } from './infrastructure/typeorm-dashboard-summary.repository';
import { ReportsController } from './presentation/reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [
    AgingReportQueryService,
    DashboardSummaryQueryService,
    { provide: AGING_REPORT_REPOSITORY, useClass: TypeOrmAgingReportRepository },
    { provide: DASHBOARD_SUMMARY_REPOSITORY, useClass: TypeOrmDashboardSummaryRepository },
  ],
})
export class ReportingModule {}
```

No `TypeOrmModule.forFeature([...])` needed — both repository implementations use `@InjectDataSource()` directly rather than an entity `Repository`.

- [ ] **Step 3: Register `ReportingModule` in `apps/backend/src/app.module.ts`**

Add `ReportingModule` to the `imports` array alongside the other feature modules.

- [ ] **Step 4: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- app.e2e-spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reporting/presentation apps/backend/src/modules/reporting/reporting.module.ts apps/backend/src/app.module.ts
git commit -m "feat: add ReportsController with GET /api/v1/reports/aging and GET /api/v1/reports/dashboard-summary"
```

---

### Task 6: Integration test — aging buckets, dashboard summary, and reminder effectiveness (testcontainers)

**Files:**
- Create: `apps/backend/test/aging-dashboard-reporting.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-5), real Postgres via testcontainers
- Produces: end-to-end proof that seeded `Receivable`s at different overdue ages land in the correct aging bucket, roll up correctly into the dashboard summary, and that seeded `ReminderExecution`/`Receivable` pairs produce the correct `reminderEffectiveness` ratio.

- [ ] **Step 1: Write the integration test**

Extend the original plan's seed data (5 receivables spanning all 5 aging buckets, one customer) with:
- an invalid `from > to` request → expect 400 `VALIDATION_ERROR`
- an invalid range > 90 days → expect 400 `VALIDATION_ERROR`
- at least 2 `ReminderExecution` rows (`status='SENT'`) in the default period: one whose receivable closed `PAID` within 7 days of `sentAt` (counts toward the numerator), one whose receivable is still `OPEN` past 7 days (does not) — assert `reminderEffectiveness` on the dashboard-summary response matches the expected ratio.

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- aging-dashboard-reporting.integration.spec.ts`
Expected: PASS — all tests green (401 without token, correct bucket assignment, correct dashboard rollup, correct reminder-effectiveness ratio, 400 on invalid date range)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/aging-dashboard-reporting.integration.spec.ts
git commit -m "test: add integration test for aging buckets, dashboard summary, and reminder effectiveness"
```

---

## Self-Review Notes

- **Spec coverage:** Aging buckets (spec section 2) → Task 2. Cash collection forecast (spec section 3) → Task 4. Total outstanding/overdue/rate, top overdue customers, auto-match rate, manual handling rate, **reminder effectiveness** (spec section 4, now in MVP per section 6) → Task 4. Required `receivables` index already present (verified, not re-created); new `bank_transactions` index → Task 1.
- **No precompute:** every query is a live `DataSource.query()` call, run per-request.
- **Tenant isolation:** both services take `organizationId` only from `TenantContextService.getOrganizationId()`; both endpoints sit behind `JwtAuthGuard` + `PermissionGuard` + `@RequirePermission(Permission.REPORT_READ)`.
- **Clean Architecture:** unlike the original draft of this plan, `application/` depends only on repository ports (`IAgingReportRepository`, `IDashboardSummaryRepository`); `infrastructure/` is the only layer touching `DataSource`/raw SQL. No exception to `presentation → application → domain` / `infrastructure → application` layering was needed or invoked.
- **bigint handling:** `dataSource.query()` returns Postgres `bigint`/`numeric` aggregates as strings — every repository method explicitly wraps results in `Number(...)` before returning.
- **Type/column consistency:** every raw SQL column name must be checked against the live ORM entity files before implementation (Task 4, Step 6) — do not assume column names from this plan's SQL snippets are still accurate; entities may have drifted since this plan was written.
