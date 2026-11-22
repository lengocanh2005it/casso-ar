# Copilot Cash-Flow Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `getCashFlowSnapshot` Copilot tool that relays dashboard, aging and 6-month trend data from the `reporting/` query services so the agent can answer cash-flow questions from real numbers.

**Architecture:** One application-layer tool calls three existing query services via `Promise.all` and returns a combined snapshot. `ReportingModule` exports the services; `CopilotModule` imports it. The existing ReAct loop gains one whitelisted read tool and one dispatch case; the model only paraphrases code-produced numbers. No endpoint, migration, dependency, or ML.

**Tech Stack:** NestJS 11, TypeScript 6, Jest 30, existing reporting query services and `TenantContextService`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-22-copilot-cash-flow-snapshot-design.md` — read before starting.
- Input: none. Output: `{ dashboard, aging, trend }` with `trend.months = 6`, five zero-filled aging buckets in fixed order, integer VND money as strings.
- Application layer: ports/query services only; no infrastructure import, no `@nestjs/common` HTTP exception, no `any`, no casts, no concrete SDK. `@Injectable()`/`@Inject()` allowed.
- Tenant scoping: `DashboardSummaryQueryService` and `TrendReportQueryService` scope internally; the tool passes `userId` to `AgingReportQueryService.getAgingBuckets()` only for `Role.SALES_REP`.
- Do NOT recompute any metric in the tool. Relay the numbers exactly as returned.
- Never show `customerId` or bucket codes to the user — prompt line handles this.
- Keep the 7 existing tools and their tests unchanged. No new HTTP endpoint, table, migration, dependency, or `ErrorCode`.
- TDD RED → GREEN → REFACTOR. Observe a failing test before production code.
- Verification: focused Jest → `pnpm verify` → `/domain-check`. Fresh evidence only.
- Work in a worktree per AGENTS.md: `git worktree add .worktrees/feat/copilot-cash-flow-snapshot -b feat/copilot-cash-flow-snapshot`, copy `apps/backend/.env`, run `pnpm install`. Do not code on `main`.
- Naming: kebab-case files, PascalCase classes, camelCase vars. Biome: single quotes, semicolons, 2-space indent, no trailing commas. Jest 30 uses `--testPathPatterns`.

---

### Task 1: ReportingModule exports + failing tool test

**Files:**
- Modify: `apps/backend/src/modules/reporting/reporting.module.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-cash-flow-snapshot.tool.spec.ts`

**Interfaces:**
- Consumes: `AgingReportQueryService.getAgingBuckets(salesRepresentativeId?)`, `DashboardSummaryQueryService.getSummary(period?)`, `TrendReportQueryService.getTrend(months?)`.
- Produces: no code yet — this task only adds exports and the RED test.

- [ ] **Step 1: Export the three query services from ReportingModule**

In `apps/backend/src/modules/reporting/reporting.module.ts`, add at the end of the `@Module({...})` object (after `controllers: [ReportsController],`):

```typescript
  exports: [
    AgingReportQueryService,
    DashboardSummaryQueryService,
    TrendReportQueryService,
  ],
```

- [ ] **Step 2: Write the failing tool spec**

Create `get-cash-flow-snapshot.tool.spec.ts`:

```typescript
import { Role } from '../../../organizations/domain/membership';
import { GetCashFlowSnapshotTool } from './get-cash-flow-snapshot.tool';

function buildServices(overrides: Record<string, unknown> = {}) {
  return {
    dashboard: {
      getSummary: jest.fn().mockResolvedValue({
        totalOutstanding: '1000000',
        totalOverdue: '200000',
        overdueRate: 0.2,
        cashForecast: {
          forecast7d: '10',
          forecast14d: '20',
          forecast30d: '30',
        },
        autoMatchRate: 0.8,
        manualHandlingRate: 0.2,
        reminderEffectiveness: 0.5,
        topOverdueCustomers: [
          {
            customerId: 'cust-1',
            customerName: 'Alpha',
            totalOverdue: '200000',
          },
        ],
      }),
    },
    aging: {
      getAgingBuckets: jest.fn().mockResolvedValue([
        { bucket: 'OVERDUE_8_30', count: 2, totalRemaining: '9' },
      ]),
    },
    trend: {
      getTrend: jest.fn().mockResolvedValue({
        months: 6,
        items: [{ month: '2026-11', outstanding: '5', collected: '7' }],
      }),
    },
    tenantContext: {
      getCurrentUser: jest
        .fn()
        .mockReturnValue({ role: Role.FINANCE_MANAGER, userId: 'user-1' }),
    },
    ...overrides,
  };
}

describe('GetCashFlowSnapshotTool', () => {
  it('calls each reporting query service once and returns the assembled snapshot', async () => {
    const services = buildServices();
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    const result = await tool.execute();

    expect(services.dashboard.getSummary).toHaveBeenCalledTimes(1);
    expect(services.aging.getAgingBuckets).toHaveBeenCalledTimes(1);
    expect(services.trend.getTrend).toHaveBeenCalledWith(6);
    expect(result).toEqual({
      dashboard: await services.dashboard.getSummary.mock.results[0].value,
      aging: await services.aging.getAgingBuckets.mock.results[0].value,
      trend: await services.trend.getTrend.mock.results[0].value,
    });
  });

  it('passes the user id to aging only for SALES_REP', async () => {
    const services = buildServices({
      tenantContext: {
        getCurrentUser: jest
          .fn()
          .mockReturnValue({ role: Role.SALES_REP, userId: 'sales-1' }),
      },
    });
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await tool.execute();

    expect(services.aging.getAgingBuckets).toHaveBeenCalledWith('sales-1');
  });

  it('calls aging with no argument for non-SALES_REP roles', async () => {
    const services = buildServices();
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await tool.execute();

    expect(services.aging.getAgingBuckets).toHaveBeenCalledWith();
  });

  it('rejects when a query service fails, without a partial snapshot', async () => {
    const services = buildServices({
      dashboard: { getSummary: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await expect(tool.execute()).rejects.toThrow('db down');
  });
});
```

Note: the test compares each section to the exact object its service returned; missing buckets are zero-filled by `AgingReportQueryService`, not by this tool — a service returning only one bucket is fine because the tool relays it unchanged.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns get-cash-flow-snapshot`
Expected: FAIL — `Cannot find module './get-cash-flow-snapshot.tool'`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/reporting/reporting.module.ts apps/backend/src/modules/copilot/application/tools/get-cash-flow-snapshot.tool.spec.ts
git commit -m "test: cash flow snapshot tool RED and reporting exports" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Implement `GetCashFlowSnapshotTool`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/get-cash-flow-snapshot.tool.ts`

**Interfaces:**
- Consumes: the three reporting query services, `TenantContextService` (all from Task 1).
- Produces:
  - `export interface CashFlowSnapshot { dashboard: DashboardSummary; aging: AgingBucketCount[]; trend: { months: 6; items: ReportsTrendPoint[] } }`
  - `export class GetCashFlowSnapshotTool { static readonly NAME = 'getCashFlowSnapshot'; constructor(dashboard, aging, trend, tenantContext); execute(): Promise<CashFlowSnapshot> }`

- [ ] **Step 1: Write the implementation**

```typescript
// apps/backend/src/modules/copilot/application/tools/get-cash-flow-snapshot.tool.ts
import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { Role } from '../../../organizations/domain/membership';
import type { AgingBucketCount } from '../../../reporting/application/aging-report.repository.port';
import type {
  DashboardSummary,
} from '../../../reporting/application/dashboard-summary.repository.port';
import type { ReportsTrendPoint } from '../../../reporting/application/trend-report.repository.port';
import { AgingReportQueryService } from '../../../reporting/application/aging-report-query.service';
import { DashboardSummaryQueryService } from '../../../reporting/application/dashboard-summary-query.service';
import { TrendReportQueryService } from '../../../reporting/application/trend-report-query.service';

export interface CashFlowSnapshot {
  dashboard: DashboardSummary;
  aging: AgingBucketCount[];
  trend: { months: 6; items: ReportsTrendPoint[] };
}

@Injectable()
export class GetCashFlowSnapshotTool {
  static readonly NAME = 'getCashFlowSnapshot';

  constructor(
    private readonly dashboard: DashboardSummaryQueryService,
    private readonly aging: AgingReportQueryService,
    private readonly trend: TrendReportQueryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<CashFlowSnapshot> {
    const user = this.tenantContext.getCurrentUser();
    // ponytail: fixed 6-month window; narrower queries only if prompt cost
    // becomes measurable. Values are relayed, never recomputed here.
    const [dashboard, aging, trend] = await Promise.all([
      this.dashboard.getSummary(),
      user?.role === Role.SALES_REP
        ? this.aging.getAgingBuckets(user.userId)
        : this.aging.getAgingBuckets(),
      this.trend.getTrend(6),
    ]);

    return {
      dashboard,
      aging,
      trend: { months: 6, items: trend.items },
    };
  }
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns get-cash-flow-snapshot`
Expected: PASS (4 tests).

- [ ] **Step 3: Type check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/get-cash-flow-snapshot.tool.ts
git commit -m "feat: cash flow snapshot tool" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Registry allowlist + module wiring

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Interfaces:**
- Consumes: `GetCashFlowSnapshotTool` from Task 2.
- Produces: `getCashFlowSnapshot` appears in `getTools()` with `requiresReminderPermission: false`.

- [ ] **Step 1: Update registry spec (RED)**

In `copilot-tool-registry.spec.ts`, add `registry.register(fakeTool('getCashFlowSnapshot'));` to the first and third tests, and add `'getCashFlowSnapshot'` to both expected arrays. Leave the "rejects write-off..." test unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-tool-registry`
Expected: FAIL — names array lacks `getCashFlowSnapshot`.

- [ ] **Step 3: Add the allowlist entry**

In `copilot-tool-registry.ts`, change `SAFE_TOOL_NAMES` to:

```typescript
  static readonly SAFE_TOOL_NAMES = [
    'getReceivableSummary',
    'getCollectionActivityTimeline',
    'getPaymentHistory',
    'findOverdueReceivables',
    'rankReceivablesByRisk',
    'getCashFlowSnapshot',
    'draftReminderEmail',
    'sendReminderEmail',
  ] as const;
```

- [ ] **Step 4: Wire the module**

In `copilot.module.ts`:
- import `{ ReportingModule } from '../reporting/reporting.module';`
- import `{ GetCashFlowSnapshotTool } from './application/tools/get-cash-flow-snapshot.tool';`
- add `ReportingModule` to `imports: [...]`.
- add this registration in `copilotToolRegistryFactory()` after the `RankReceivablesByRiskTool` registration:

```typescript
  registry.register({
    name: GetCashFlowSnapshotTool.NAME,
    description:
      'Get a cash-flow snapshot: dashboard totals, overdue forecast, aging buckets and 6-month collection trend. Use for questions about cash flow, outstanding totals, aging, forecast or collection trend. Never recompute or invent numbers from this data.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
```

- add `GetCashFlowSnapshotTool,` to `providers: [...]` after `RankReceivablesByRiskTool`.

- [ ] **Step 5: Run registry spec + type check**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-tool-registry && npx tsc --noEmit`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-tool-registry.ts apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: register cash flow snapshot tool in copilot module" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Dispatch case + system prompt in `CopilotChatUseCase`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: `GetCashFlowSnapshotTool` from Task 2.
- Produces: tool call `getCashFlowSnapshot` routed to the tool; prompt guidance present; `PROMPT_VERSION` bumped to `copilot-v5`.

- [ ] **Step 1: Add failing tests**

Append inside the top-level `describe('CopilotChatUseCase', ...)` in `copilot-chat.usecase.spec.ts`:

```typescript
  it('guides the model to use the cash-flow snapshot for dashboard and aging questions', () => {
    expect(SYSTEM_PROMPT).toContain('getCashFlowSnapshot');
    expect(SYSTEM_PROMPT).toContain(' aging ');
  });

  it('routes getCashFlowSnapshot tool calls to the tool', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-cf',
            name: 'getCashFlowSnapshot',
            arguments: {},
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Tổng công nợ là 1.000.000 VNĐ.',
        toolCalls: [],
        inputTokens: 20,
        outputTokens: 10,
      });
    const deps = buildDeps();
    const cashFlowTool = { execute: jest.fn().mockResolvedValue({ dashboard: {}, aging: [], trend: { months: 6, items: [] } }) };
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.findOverdueReceivablesTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.invoiceRepo as any,
      undefined, // no rank tool in this test
      cashFlowTool as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Tổng công nợ và aging thế nào?',
    });

    expect(cashFlowTool.execute).toHaveBeenCalledTimes(1);
    expect(result.message.content).toContain('1.000.000');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-chat.usecase.spec`
Expected: FAIL — prompt assertions fail; dispatch throws `Tool Copilot không xác định`.

- [ ] **Step 3: Add optional constructor arg + dispatch case**

In `copilot-chat.usecase.ts`:
- import `GetCashFlowSnapshotTool` from `./tools/get-cash-flow-snapshot.tool`.
- append after `rankReceivablesByRiskTool` in the constructor:

```typescript
    private readonly getCashFlowSnapshotTool?: GetCashFlowSnapshotTool,
```

- add a dispatch case in `executeTool()` immediately after the `RankReceivablesByRiskTool.NAME` case:

```typescript
      case GetCashFlowSnapshotTool.NAME:
        if (!this.getCashFlowSnapshotTool) {
          throw new AppError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            'Công cụ snapshot dòng tiền không khả dụng.',
          );
        }
        return this.getCashFlowSnapshotTool.execute();
```

- [ ] **Step 4: Add the prompt line and bump version**

Change `const PROMPT_VERSION = 'copilot-v4';` to `copilot-v5`.

Insert one entry into the `SYSTEM_PROMPT` array, after the risk-ranking prompt line:

```typescript
  'For cash-flow, outstanding totals, aging buckets, overdue forecast or collection-trend questions, call getCashFlowSnapshot and report only the numbers it returns — never recompute a rate or invent an amount. Do not use it for questions about one specific receivable or customer; the receivable tools cover those. Never show customerId or bucket codes; use Vietnamese bucket names (Chưa đến hạn, Quá hạn 1-7 ngày, 8-30 ngày, 31-60 ngày, trên 60 ngày).',
```

- [ ] **Step 5: Run tests + type check**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-chat && npx tsc --noEmit`
Expected: PASS. The streaming spec keeps working because the new constructor argument is optional.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: route cash flow questions to snapshot tool" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Feature map + full verification

**Files:**
- Modify: `docs/wayfinder/feature-map.md` (ADDITIONAL PLANS section, after the risk-ranking entry)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: no code interface.

- [ ] **Step 1: Add the plan entry**

Append at the end of `### ADDITIONAL PLANS` (before `## Frontier`), after the risk-ranking entry:

```markdown
#### Plan: Copilot cash-flow snapshot tool (spec 2026-11-22)
- **Type**: task
- **Status**: in-progress
- **Spec**: `specs/2026-11-22-copilot-cash-flow-snapshot-design.md`
- **Plan**: `plans/2026-11-22-copilot-cash-flow-snapshot.md`
- **Blockers**: none
- **Key rules**: read-only tool that relays dashboard/aging/trend numbers from `reporting/` query services; no metric recomputation; no endpoint, migration, or ML.
- **Creates**: `getCashFlowSnapshot` tool, `ReportingModule` exports, one allowlist entry, one dispatch case, one system-prompt line.
```

Also update the Ticket Index counters near the top: `in-progress (1): Copilot risk ranking tool` → `in-progress (2): Copilot risk ranking tool, Copilot cash-flow snapshot tool`.

- [ ] **Step 2: Focused suites**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns 'get-cash-flow-snapshot|copilot-tool-registry|copilot-chat'`
Expected: PASS.

- [ ] **Step 3: Full verification**

Run: `pnpm verify`
Expected: PASS (lint, type-check, all unit suites).

- [ ] **Step 4: Domain check**

Run: `/domain-check`
Expected: no violations. Specifically: tool imports query services from `reporting/application/`, no infrastructure import, no HTTP exception, SALES_REP scope preserved, tenant context intact.

- [ ] **Step 5: Commit and report**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: track copilot cash flow snapshot plan" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Report with fresh evidence: focused Jest counts, `pnpm verify` result, `/domain-check` result, worktree path and branch. Do not merge or open a PR without user review.

---

## Self-review notes

- **Spec coverage:** §1–§2 contract implemented in Task 2; §3 data flow in Tasks 2/4; §4 wiring in Tasks 1/3/4; §5 SALES_REP scoping in Task 2 with tests; §6 errors in Task 2 (propagate) and Task 4 (`INTERNAL_SERVER_ERROR` guard); §7 tests in Tasks 1–4; §8 verification in Task 5; §9 ceilings in the `ponytail:` comment and spec.
- **No placeholder text:** every implementation step contains actual code. The only "missing module" is the intentional RED import in Task 1 Step 2.
- **Type consistency:** `CashFlowSnapshot`, `GetCashFlowSnapshotTool.NAME = 'getCashFlowSnapshot'`, `execute(): Promise<CashFlowSnapshot>`, `trend.months = 6`, and the constructor order `(dashboard, aging, trend, tenantContext)` are identical in Tasks 1–4. Task 4's direct construction passes 17 args: the 15 pre-risk-ranking args + `undefined` for the optional rank tool + `cashFlowTool` — matching the constructor tail (17 existing params before this change, 18 after).
