# Copilot Risk Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, read-only `rankReceivablesByRisk` tool to the Collection Copilot so the agent can rank receivables that are overdue or due within 7 days by a 0–100 risk score with explainable Vietnamese reasons, then reuse the existing draft/send pending-action flow.

**Architecture:** One new application-layer tool computes the score in pure code from batch port calls (no N+1, no infrastructure imports, no new table). The existing ReAct tool loop gains one whitelisted read tool and one dispatch case; the model only paraphrases code-produced scores and reasons. No HTTP endpoint, no migration, no ML.

**Tech Stack:** NestJS 11, TypeScript 6, Jest 30, `date-fns-tz` (already a dependency), existing repository ports via DI Symbols.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-22-copilot-risk-ranking-design.md` — read it before starting.
- Every money value stays an integer in VND. `riskScore` is a unitless integer 0–100.
- Application layer MUST NOT import infrastructure, throw `@nestjs/common` HTTP exceptions, or import concrete SDKs. Only `@Injectable()`/`@Inject()` from `@nestjs/common`.
- All repository access stays tenant-scoped. The tool reads `tenantContext.getOrganizationId()`; SALES_REP users get their own receivables only (same rule as `FindOverdueReceivablesTool`).
- Batch every signal: one dispute call, one reminder call, one customer/invoice name lookup, at most one payment-history call per distinct customer. Never query once per receivable inside a loop.
- No `any` in production code; `as any` allowed only in `*.spec.ts`.
- TDD: RED → GREEN → REFACTOR. Observe a failing test before writing production code.
- Before claiming completion: run focused Jest, full `pnpm verify`, and `/domain-check`; report fresh evidence.
- Work in a worktree per AGENTS.md: `git worktree add .worktrees/feat/copilot-risk-ranking -b feat/copilot-risk-ranking`, copy `apps/backend/.env` into it, run `pnpm install` there. Do not code on `main`.
- File naming: kebab-case; classes PascalCase; DI tokens are Symbols. Biome: single quotes, semicolons, 2-space indent, no trailing commas.

---

### Task 1: Pure scoring function (score, band, reasons)

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.ts` (scorer portion only)
- Test: `apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type RiskReasonCode = 'OVERDUE_DEPTH' | 'OPEN_DISPUTE' | 'REMINDER_FATIGUE' | 'LATE_PAYMENT_HISTORY' | 'LARGE_BALANCE'`
  - `export interface RiskSignals { daysOverdue: number; hasOpenDispute: boolean; hasPriorSentReminder: boolean; latePaymentRatio: number; remainingToMedianRatio: number }`
  - `export interface RiskReason { code: RiskReasonCode; message: string }`
  - `export function scoreRisk(signals: RiskSignals): { riskScore: number; riskBand: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: RiskReason[] }`

- [ ] **Step 1: Write the failing test file**

```typescript
// apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.spec.ts
import {
  type RiskSignals,
  scoreRisk,
} from './rank-receivables-by-risk.tool';

const base: RiskSignals = {
  daysOverdue: 0,
  hasOpenDispute: false,
  hasPriorSentReminder: false,
  latePaymentRatio: 0,
  remainingToMedianRatio: 0,
};

describe('scoreRisk', () => {
  it('returns LOW with no reasons for a clean, on-time receivable', () => {
    expect(scoreRisk(base)).toEqual({
      riskScore: 0,
      riskBand: 'LOW',
      reasons: [],
    });
  });

  it('is deterministic for identical signals', () => {
    const signals: RiskSignals = {
      daysOverdue: 12,
      hasOpenDispute: true,
      hasPriorSentReminder: false,
      latePaymentRatio: 0.25,
      remainingToMedianRatio: 2,
    };
    expect(scoreRisk(signals)).toEqual(scoreRisk(signals));
  });

  it('adds exactly the documented points for each fired signal', () => {
    const result = scoreRisk({
      daysOverdue: 9,          // floor(9/3) = 3
      hasOpenDispute: true,    // 20
      hasPriorSentReminder: true, // 5 (port exposes 0/1 only)
      latePaymentRatio: 0.5,   // floor(0.5*20) = 10
      remainingToMedianRatio: 4, // floor(4*5) = 20, capped 15
    });
    expect(result.riskScore).toBe(3 + 20 + 5 + 10 + 15); // 53
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'OVERDUE_DEPTH',
      'OPEN_DISPUTE',
      'REMINDER_FATIGUE',
      'LATE_PAYMENT_HISTORY',
      'LARGE_BALANCE',
    ]);
    expect(result.reasons.every((reason) => reason.message.length > 0)).toBe(true);
  });

  it('caps each signal at its documented maximum', () => {
    const result = scoreRisk({
      daysOverdue: 365,             // capped at 30
      hasOpenDispute: true,         // 20
      hasPriorSentReminder: true,   // 5
      latePaymentRatio: 1,          // 20
      remainingToMedianRatio: 20,   // capped at 15
    });
    expect(result.riskScore).toBe(30 + 20 + 5 + 20 + 15); // 90 = practical max
    expect(result.riskBand).toBe('HIGH');
  });

  it('uses inclusive band boundaries 30 and 60', () => {
    const atThirty = scoreRisk({ ...base, daysOverdue: 90 }); // 90/3 = 30
    expect(atThirty.riskScore).toBe(30);
    expect(atThirty.riskBand).toBe('MEDIUM');

    const atFiftyNine = scoreRisk({
      ...base,
      daysOverdue: 87,          // 29
      hasOpenDispute: true,     // 20
      latePaymentRatio: 0.5,    // 10
    });
    expect(atFiftyNine.riskScore).toBe(59);
    expect(atFiftyNine.riskBand).toBe('MEDIUM');

    const atSixty = scoreRisk({
      ...base,
      daysOverdue: 90,          // 30
      hasOpenDispute: true,     // 20
      latePaymentRatio: 0.5,    // 10
    });
    expect(atSixty.riskScore).toBe(60);
    expect(atSixty.riskBand).toBe('HIGH');
  });

  it('never emits a reason for a signal below one point', () => {
    const result = scoreRisk({ ...base, daysOverdue: 1 });
    expect(result.riskScore).toBe(0); // floor(1/3) === 0
    expect(result.reasons).toEqual([]);
    expect(result.riskBand).toBe('LOW');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns rank-receivables-by-risk`
Expected: FAIL — `Cannot find module './rank-receivables-by-risk.tool'`.

- [ ] **Step 3: Write minimal implementation (scorer only)**

```typescript
// apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.ts
export type RiskReasonCode =
  | 'OVERDUE_DEPTH'
  | 'OPEN_DISPUTE'
  | 'REMINDER_FATIGUE'
  | 'LATE_PAYMENT_HISTORY'
  | 'LARGE_BALANCE';

export type RiskBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RiskReason {
  code: RiskReasonCode;
  message: string;
}

export interface RiskSignals {
  daysOverdue: number;
  hasOpenDispute: boolean;
  hasPriorSentReminder: boolean;
  latePaymentRatio: number;
  remainingToMedianRatio: number;
}

export interface RiskScore {
  riskScore: number;
  riskBand: RiskBand;
  reasons: RiskReason[];
}

function boundedPoints(ratio: number, perUnit: number, cap: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.min(cap, Math.floor(ratio * perUnit));
}

export function scoreRisk(signals: RiskSignals): RiskScore {
  const overduePoints = boundedPoints(signals.daysOverdue, 1 / 3, 30);
  const disputePoints = signals.hasOpenDispute ? 20 : 0;
  // The batch reminder port exposes only the latest SENT execution, so the
  // observable sentCount is 0 or 1 (5 points). Upgrade to a count query if
  // fatigue needs more granularity.
  const reminderPoints = signals.hasPriorSentReminder ? 5 : 0;
  const latePoints = boundedPoints(signals.latePaymentRatio, 20, 20);
  const largePoints = boundedPoints(signals.remainingToMedianRatio, 5, 15);

  const riskScore = Math.min(
    100,
    overduePoints + disputePoints + reminderPoints + latePoints + largePoints,
  );
  const riskBand: RiskBand =
    riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

  const reasons: RiskReason[] = [];
  if (overduePoints > 0) {
    reasons.push({
      code: 'OVERDUE_DEPTH',
      message: `Quá hạn ${Math.floor(signals.daysOverdue)} ngày`,
    });
  }
  if (disputePoints > 0) {
    reasons.push({
      code: 'OPEN_DISPUTE',
      message: 'Khoản phải thu đang có tranh chấp mở',
    });
  }
  if (reminderPoints > 0) {
    reasons.push({
      code: 'REMINDER_FATIGUE',
      message: 'Đã gửi email nhắc trước đây nhưng khoản vẫn chưa thu',
    });
  }
  if (latePoints > 0) {
    reasons.push({
      code: 'LATE_PAYMENT_HISTORY',
      message: 'Khách hàng có lịch sử thanh toán trễ',
    });
  }
  if (largePoints > 0) {
    reasons.push({
      code: 'LARGE_BALANCE',
      message: 'Số dư lớn hơn trung vị các khoản cùng khách hàng',
    });
  }

  return { riskScore, riskBand, reasons };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns rank-receivables-by-risk`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.ts apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.spec.ts
git commit -m "feat: deterministic risk score for copilot ranking" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Tool `execute()` — candidate gathering, batch signals, ranked output

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.spec.ts`

**Interfaces:**
- Consumes: `scoreRisk` from Task 1; `IReceivableRepository`, `ICustomerRepository`, `IInvoiceRepository`, `IDisputeRepository`, `IReminderExecutionRepository`, `IPaymentAllocationRepository`, `TenantContextService`.
- Produces:
  - `export const RANK_RECEIVABLES_BY_RISK_SCHEMA: CopilotJsonSchema`
  - `export interface RankedReceivable { receivableId: string; customerId: string; customerName: string; invoiceNumber: string | null; remainingAmount: number; dueDate: string; riskScore: number; riskBand: RiskBand; reasons: RiskReason[] }`
  - `export interface RankResult { items: RankedReceivable[] }`
  - `export class RankReceivablesByRiskTool { static readonly NAME = 'rankReceivablesByRisk'; constructor(...7 ports...); execute(input: { limit?: number; search?: string }, now?: Date): Promise<RankResult> }`

- [ ] **Step 1: Write failing tests for candidate scope, batching, and output**

Append to the spec file (imports at top updated to include `ReceivableStatus`, `Receivable`, `RankReceivablesByRiskTool`, `TenantContextService`):

```typescript
import { ReceivableStatus } from '@casso-ar/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import { RankReceivablesByRiskTool } from './rank-receivables-by-risk.tool';

function receivable(overrides: {
  id: string;
  customerId?: string;
  originalAmount: number;
  paidAmount?: number;
  dueDate: string;
}): Receivable {
  return new Receivable({
    id: overrides.id,
    organizationId: 'org-1',
    customerId: overrides.customerId ?? 'cust-1',
    invoiceId: `inv-${overrides.id}`,
    originalAmount: overrides.originalAmount,
    paidAmount: overrides.paidAmount ?? 0,
    dueDate: new Date(overrides.dueDate),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    version: 1,
  });
}

function buildTool(overrides: Record<string, unknown> = {}) {
  const deps = {
    receivableRepo: {
      findOverdueCandidates: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    customerRepo: {
      findIdsBySearch: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    invoiceRepo: {
      findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue(new Map()),
    },
    disputeRepo: {
      findOpenDisputesByReceivableIds: jest.fn().mockResolvedValue(new Map()),
    },
    reminderRepo: {
      findLatestSentByReceivableIds: jest.fn().mockResolvedValue(new Map()),
    },
    allocationRepo: { findByCustomerId: jest.fn().mockResolvedValue([]) },
    tenantContext: {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
      getCurrentUser: jest.fn().mockReturnValue({ role: 'FINANCE_MANAGER', userId: 'user-1' }),
    },
    ...overrides,
  };
  const tool = new RankReceivablesByRiskTool(
    deps.receivableRepo as any,
    deps.customerRepo as any,
    deps.invoiceRepo as any,
    deps.disputeRepo as any,
    deps.reminderRepo as any,
    deps.allocationRepo as any,
    deps.tenantContext as any,
  );
  return { tool, deps };
}

describe('RankReceivablesByRiskTool', () => {
  it('queries open receivables due before the 7-day horizon and returns empty on no candidates', async () => {
    const { tool, deps } = buildTool();
    const now = new Date('2026-11-22T00:00:00.000Z');

    await expect(tool.execute({}, now)).resolves.toEqual({ items: [] });
    expect(deps.receivableRepo.findOverdueCandidates).toHaveBeenCalledTimes(1);
    const filters = deps.receivableRepo.findOverdueCandidates.mock.calls[0][0];
    expect(filters.organizationId).toBe('org-1');
    expect(filters.referenceDate).toEqual(new Date('2026-11-29T00:00:00.000Z'));
    expect(deps.disputeRepo.findOpenDisputesByReceivableIds).not.toHaveBeenCalled();
  });

  it('sorts by riskScore desc then dueDate asc and emits explained items', async () => {
    const older = receivable({ id: 'rec-old', originalAmount: 10_000_000, dueDate: '2026-10-01T00:00:00.000Z' });
    const newer = receivable({ id: 'rec-new', originalAmount: 5_000_000, dueDate: '2026-11-20T00:00:00.000Z' });
    const { tool, deps } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([newer, older]),
        findByIds: jest.fn().mockResolvedValue(new Map([
          ['rec-old', older],
          ['rec-new', newer],
        ])),
      },
      disputeRepo: {
        findOpenDisputesByReceivableIds: jest.fn().mockResolvedValue(new Map([['rec-new', 'disp-1']])),
      },
      customerRepo: {
        findIdsBySearch: jest.fn().mockResolvedValue([]),
        findByIds: jest.fn().mockResolvedValue(new Map([['cust-1', { name: 'Alpha Corp' }]])),
      },
      invoiceRepo: {
        findIdsByInvoiceNumberSearch: jest.fn().mockResolvedValue([]),
        findByIds: jest.fn().mockResolvedValue(new Map([
          ['inv-rec-new', { invoiceNumber: 'INV-2' }],
          ['inv-rec-old', { invoiceNumber: 'INV-1' }],
        ])),
      },
    });

    const result = await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));

    expect(result.items.map((item) => item.receivableId)).toEqual(['rec-new', 'rec-old']);
    expect(result.items[0]).toMatchObject({
      customerId: 'cust-1',
      customerName: 'Alpha Corp',
      invoiceNumber: 'INV-2',
      remainingAmount: 5_000_000,
      riskBand: 'HIGH',
    });
    expect(result.items[0].reasons.map((reason) => reason.code)).toContain('OPEN_DISPUTE');
    expect(deps.reminderRepo.findLatestSentByReceivableIds).toHaveBeenCalledTimes(1);
    expect(deps.allocationRepo.findByCustomerId).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-integer or out-of-range limit', async () => {
    const { tool } = buildTool();
    await expect(tool.execute({ limit: 11 })).rejects.toThrow('1 và 10');
    await expect(tool.execute({ limit: 1.5 })).rejects.toThrow('1 và 10');
  });

  it('scopes SALES_REP users to their own receivables', async () => {
    const { tool, deps } = buildTool({
      tenantContext: {
        getOrganizationId: jest.fn().mockReturnValue('org-1'),
        getCurrentUser: jest.fn().mockReturnValue({ role: 'SALES_REP', userId: 'sales-1' }),
      },
    });
    await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));
    expect(
      deps.receivableRepo.findOverdueCandidates.mock.calls[0][0].salesRepresentativeId,
    ).toBe('sales-1');
  });

  it('computes late-payment ratio from allocations matched to receivable due dates', async () => {
    const target = receivable({ id: 'rec-1', originalAmount: 10_000_000, dueDate: '2026-10-01T00:00:00.000Z' });
    const { tool } = buildTool({
      receivableRepo: {
        findOverdueCandidates: jest.fn().mockResolvedValue([target]),
        findByIds: jest.fn().mockResolvedValue(new Map([['rec-1', target]])),
      },
      allocationRepo: {
        findByCustomerId: jest.fn().mockResolvedValue([
          {
            receivableId: 'rec-1',
            allocatedAmount: 1_000_000,
            allocatedAt: new Date('2026-10-20T00:00:00.000Z'),
            deletedAt: null,
            isActive: () => true,
          },
        ]),
      },
    });
    const result = await tool.execute({}, new Date('2026-11-22T00:00:00.000Z'));
    expect(result.items[0].reasons.map((reason) => reason.code)).toContain('LATE_PAYMENT_HISTORY');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns rank-receivables-by-risk`
Expected: FAIL — `RankReceivablesByRiskTool is not a constructor` / missing export.

- [ ] **Step 3: Implement the tool**

Append to the tool file (after `scoreRisk`):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../../common/tokens/reminder-execution.token';
import type { CopilotJsonSchema } from '../copilot-tool-registry';
import type { ICustomerRepository } from '../../../customers/application/customer-repository.port';
import { CUSTOMER_REPOSITORY } from '../../../customers/application/customer-repository.port';
import type { IDisputeRepository } from '../../../disputes/application/dispute-repository.port';
import { DISPUTE_REPOSITORY } from '../../../disputes/application/dispute-repository.port';
import type { IInvoiceRepository } from '../../../invoices/application/invoice-repository.port';
import { INVOICE_REPOSITORY } from '../../../invoices/application/invoice-repository.port';
import { Role } from '../../../organizations/domain/membership';
import type { IPaymentAllocationRepository } from '../../../payments/application/payment-allocation-repository.port';
import { PAYMENT_ALLOCATION_REPOSITORY } from '../../../payments/application/payment-allocation-repository.port';
import type { Receivable } from '../../../receivables/domain/receivable';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import type { IReminderExecutionRepository } from '../../../reminders/application/reminder-execution-repository.port';

export const RANK_RECEIVABLES_BY_RISK_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'Maximum number of ranked receivables to return (default 10, max 10).',
    },
    search: {
      type: 'string',
      description: 'Optional case-insensitive customer name or invoice number filter.',
    },
  },
  required: [],
};

export interface RankedReceivable {
  receivableId: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: number;
  dueDate: string;
  riskScore: number;
  riskBand: RiskBand;
  reasons: RiskReason[];
}

export interface RankResult {
  items: RankedReceivable[];
}

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const HORIZON_DAYS = 7;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;
const MS_PER_DAY = 86_400_000;

function horizonEnd(now: Date): Date {
  const localDate = formatInTimeZone(now, REPORTING_TIMEZONE, 'yyyy-MM-dd');
  const midnight = fromZonedTime(`${localDate}T00:00:00`, REPORTING_TIMEZONE);
  return new Date(midnight.getTime() + (HORIZON_DAYS + 1) * MS_PER_DAY);
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

@Injectable()
export class RankReceivablesByRiskTool {
  static readonly NAME = 'rankReceivablesByRisk';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderRepo: IReminderExecutionRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: { limit?: number; search?: string },
    now = new Date(),
  ): Promise<RankResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_LIMIT
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Tham số limit phải là số nguyên từ 1 đến 10.',
      );
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const currentUser = this.tenantContext.getCurrentUser();
    const salesRepresentativeId =
      currentUser?.role === Role.SALES_REP ? currentUser.userId : undefined;

    let customerIdIn: string[] | undefined;
    let invoiceIdIn: string[] | undefined;
    const normalizedSearch = input.search?.trim();
    if (normalizedSearch) {
      const [customers, invoices] = await Promise.all([
        this.customerRepo.findIdsBySearch(organizationId, normalizedSearch),
        this.invoiceRepo.findIdsByInvoiceNumberSearch(organizationId, normalizedSearch),
      ]);
      if (customers.length === 0 && invoices.length === 0) return { items: [] };
      customerIdIn = customers;
      invoiceIdIn = invoices;
    }

    // ponytail: hard ceiling on candidates loaded for scoring; every eligible
    // row must reach the scorer before top-N selection, or a higher-risk item
    // due a day later is silently dropped. OVERDUE_CANDIDATE_LIMIT = 1000.
    const candidates = await this.receivableRepo.findOverdueCandidates({
      organizationId,
      referenceDate: horizonEnd(now),
      salesRepresentativeId,
      customerIdIn,
      invoiceIdIn,
      sortBy: 'due_date_asc',
      limit: OVERDUE_CANDIDATE_LIMIT,
    });
    if (candidates.length === 0) return { items: [] };

    const ids = candidates.map((receivable) => receivable.id);
    const customerIds = [...new Set(candidates.map((receivable) => receivable.customerId))];
    const [disputes, reminders, customersMap, invoicesMap] = await Promise.all([
      this.disputeRepo.findOpenDisputesByReceivableIds(ids),
      this.reminderRepo.findLatestSentByReceivableIds(ids),
      this.customerRepo.findByIds(customerIds),
      this.invoiceRepo.findByIds(
        candidates
          .map((receivable) => receivable.invoiceId)
          .filter((id): id is string => id !== null),
      ),
    ]);

    const medianByCustomer = new Map<string, number>();
    for (const customerId of customerIds) {
      medianByCustomer.set(
        customerId,
        median(
          candidates
            .filter((receivable) => receivable.customerId === customerId)
            .map((receivable) => receivable.remainingAmount),
        ),
      );
    }

    const lateRatioByCustomer = new Map<string, number>();
    await Promise.all(
      customerIds.map(async (customerId) => {
        const allocations = (
          await this.allocationRepo.findByCustomerId(customerId, 50)
        ).filter((allocation) => allocation.isActive());
        const allocatedReceivables = await this.receivableRepo.findByIds(
          allocations.map((allocation) => allocation.receivableId),
        );
        let comparable = 0;
        let late = 0;
        for (const allocation of allocations) {
          const target = allocatedReceivables.get(allocation.receivableId);
          if (!target) continue;
          comparable += 1;
          if (allocation.allocatedAt.getTime() > target.dueDate.getTime()) late += 1;
        }
        lateRatioByCustomer.set(customerId, comparable === 0 ? 0 : late / comparable);
      }),
    );

    const ranked = candidates.map((receivable: Receivable) => {
      const customerMedian = medianByCustomer.get(receivable.customerId) ?? 0;
      const score = scoreRisk({
        daysOverdue: daysSince(receivable.dueDate, now),
        hasOpenDispute: disputes.has(receivable.id),
        hasPriorSentReminder: reminders.has(receivable.id),
        latePaymentRatio: lateRatioByCustomer.get(receivable.customerId) ?? 0,
        remainingToMedianRatio:
          customerMedian === 0 ? 0 : receivable.remainingAmount / customerMedian,
      });
      return {
        receivableId: receivable.id,
        customerId: receivable.customerId,
        customerName: customersMap.get(receivable.customerId)?.name ?? 'Khách hàng không xác định',
        invoiceNumber: receivable.invoiceId
          ? (invoicesMap.get(receivable.invoiceId)?.invoiceNumber ?? null)
          : null,
        remainingAmount: receivable.remainingAmount,
        dueDate: receivable.dueDate.toISOString(),
        ...score,
      };
    });

    ranked.sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        left.dueDate.localeCompare(right.dueDate),
    );

    return { items: ranked.slice(0, limit) };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns rank-receivables-by-risk`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.ts apps/backend/src/modules/copilot/application/tools/rank-receivables-by-risk.tool.spec.ts
git commit -m "feat: rank copilot receivables by deterministic risk score" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Registry allowlist + module wiring

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts:24-31`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts:17-60`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Interfaces:**
- Consumes: `RankReceivablesByRiskTool` from Task 2.
- Produces: `rankReceivablesByRisk` appears in `getTools()` with `requiresReminderPermission: false`.

- [ ] **Step 1: Update registry spec to expect the new tool (RED)**

In `copilot-tool-registry.spec.ts`, add `registry.register(fakeTool('rankReceivablesByRisk'));` to the first and third tests, and add `'rankReceivablesByRisk'` to both expected arrays. Leave the second test (`rejects write-off...`) unchanged — it must keep rejecting unknown names.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-tool-registry`
Expected: FAIL — actual names array lacks `rankReceivablesByRisk`.

- [ ] **Step 3: Add the tool name to the allowlist**

In `copilot-tool-registry.ts`, change `SAFE_TOOL_NAMES` to:

```typescript
  static readonly SAFE_TOOL_NAMES = [
    'getReceivableSummary',
    'getCollectionActivityTimeline',
    'getPaymentHistory',
    'findOverdueReceivables',
    'rankReceivablesByRisk',
    'draftReminderEmail',
    'sendReminderEmail',
  ] as const;
```

- [ ] **Step 4: Wire the module**

In `copilot.module.ts`:
- import `{ DisputesModule } from '../disputes/disputes.module';`
- import `{ RANK_RECEIVABLES_BY_RISK_SCHEMA, RankReceivablesByRiskTool } from './application/tools/rank-receivables-by-risk.tool';`
- add `DisputesModule` to `imports: [...]`.
- add this registry registration immediately after the `FindOverdueReceivablesTool` registration:

```typescript
  registry.register({
    name: RankReceivablesByRiskTool.NAME,
    description:
      'Rank overdue and soon-due receivables by risk. Use for questions about which receivables are about to become overdue, which are risky, or which to chase first. Returns riskScore (0-100), riskBand and Vietnamese reasons per item.',
    inputSchema: RANK_RECEIVABLES_BY_RISK_SCHEMA,
    requiresReminderPermission: false,
  });
```

- add `RankReceivablesByRiskTool,` to `providers: [...]` after `FindOverdueReceivablesTool`.

- [ ] **Step 5: Run the registry spec and type check**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-tool-registry && npx tsc --noEmit`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-tool-registry.ts apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: register risk ranking tool in copilot module" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Dispatch + system prompt in `CopilotChatUseCase`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: `RankReceivablesByRiskTool` from Task 2.
- Produces: tool call named `rankReceivablesByRisk` routed to the tool; prompt guidance present; `PROMPT_VERSION` bumped to `copilot-v4`.

- [ ] **Step 1: Add failing tests to `copilot-chat.usecase.spec.ts`**

Append inside the top-level `describe('CopilotChatUseCase', ...)`. Reuse the existing `buildDeps()` helper and the same construction pattern as the `dispatches findOverdueReceivables ...` test (23 existing constructions stay untouched because the new constructor argument is optional).

```typescript
  it('guides the model to use risk ranking for priority and soon-overdue questions', () => {
    expect(SYSTEM_PROMPT).toContain('rankReceivablesByRisk');
    expect(SYSTEM_PROMPT).toContain('sắp trễ nợ');
  });

  it('dispatches rankReceivablesByRisk with a bounded limit', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-risk',
            name: 'rankReceivablesByRisk',
            arguments: { limit: 3, search: 'Alpha' },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Có 3 khoản cần ưu tiên.',
        toolCalls: [],
        inputTokens: 20,
        outputTokens: 10,
      });
    const deps = buildDeps();
    const rankTool = { execute: jest.fn().mockResolvedValue({ items: [] }) };
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
      rankTool as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Khoản nào sắp trễ nợ, nhắc trước cái nào?',
    });

    expect(rankTool.execute).toHaveBeenCalledWith({ limit: 3, search: 'Alpha' });
    expect(result.message.content).toContain('3 khoản');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-chat.usecase.spec`
Expected: FAIL — prompt assertions fail; dispatch throws `Tool Copilot không xác định`.

- [ ] **Step 3: Add the optional constructor dependency and dispatch case**

In `copilot-chat.usecase.ts`:
- import `RankReceivablesByRiskTool` from `./tools/rank-receivables-by-risk.tool`.
- append to the constructor parameter list (after `customerRepo`/`invoiceRepo`):

```typescript
    private readonly rankReceivablesByRiskTool?: RankReceivablesByRiskTool,
```

- add a dispatch case inside `executeTool`'s `switch (name)`, immediately after the `FindOverdueReceivablesTool.NAME` case:

```typescript
      case RankReceivablesByRiskTool.NAME: {
        if (!this.rankReceivablesByRiskTool) {
          throw new AppError(
            ErrorCode.INTERNAL_SERVER_ERROR,
            'Công cụ xếp hạng rủi ro không khả dụng.',
          );
        }
        const search = input.search;
        if (search !== undefined && typeof search !== 'string') {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tham số search phải là chuỗi ký tự.',
          );
        }
        const limit = input.limit;
        if (
          limit !== undefined &&
          (typeof limit !== 'number' ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 10)
        ) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tham số limit phải là số nguyên từ 1 đến 10.',
          );
        }
        return this.rankReceivablesByRiskTool.execute({
          search: search !== undefined ? search : undefined,
          limit: limit !== undefined ? limit : undefined,
        });
      }
```

- [ ] **Step 4: Add prompt guidance and bump version**

Change `const PROMPT_VERSION = 'copilot-v3';` to `'copilot-v4';`.

Insert one entry into the `SYSTEM_PROMPT` array, immediately after the existing `findOverdueReceivables returns customerId on every item...` line:

```typescript
  'For questions about which receivables are risky, about to become overdue ("sắp trễ nợ"), or should be chased first, call rankReceivablesByRisk. Report only the riskScore, riskBand and reasons the tool returns; never compute a score yourself or invent a reason. Explain HIGH as rủi ro cao, MEDIUM as rủi ro trung bình, and LOW as rủi ro thấp — in Vietnamese without the English band names.',
```

- [ ] **Step 5: Run tests and type check**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns copilot-chat && npx tsc --noEmit`
Expected: PASS. The streaming spec keeps working because the new constructor argument is optional.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: route copilot risk ranking questions to new tool" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Feature map entry + full verification

**Files:**
- Modify: `docs/wayfinder/feature-map.md` (ADDITIONAL PLANS section, after the #321 entry at line ~791)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: no code interface.

- [ ] **Step 1: Add the plan entry**

Append at the end of the `### ADDITIONAL PLANS` section (before `## Frontier`):

```markdown
#### Plan: Copilot risk ranking tool (spec 2026-11-22)
- **Type**: task
- **Status**: in-progress
- **Spec**: `specs/2026-11-22-copilot-risk-ranking-design.md`
- **Plan**: `plans/2026-11-22-copilot-risk-ranking.md`
- **Blockers**: none
- **Key rules**: deterministic rule-based score (no ML — ML forecasting stays out of scope); read-only tool; never auto-sends; batch port access; no migration or new endpoint.
- **Creates**: `rankReceivablesByRisk` copilot tool, one registry allowlist entry, one dispatch case, one system-prompt line.
```

- [ ] **Step 2: Run focused suites**

Run: `cd apps/backend && npx jest --runInBand --testPathPatterns 'rank-receivables-by-risk|copilot-tool-registry|copilot-chat'`
Expected: PASS.

- [ ] **Step 3: Run full verification**

Run: `pnpm verify`
Expected: PASS (lint, type-check, all unit suites).

- [ ] **Step 4: Run domain check**

Run: `/domain-check`
Expected: no violations. Specifically confirm: application-layer tool imports only ports; no HTTP exceptions; no infrastructure imports; all reads tenant-scoped.

- [ ] **Step 5: Commit docs and report**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: track copilot risk ranking plan" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Report with fresh evidence: focused Jest counts, `pnpm verify` result, `/domain-check` result, and the worktree/branch name. Do not merge or open a PR without user review.

---

## Self-review notes

- **Spec coverage:** §0–§1 covered by Tasks 1–4; §2 tool contract by Task 2; §3 scoring model by Tasks 1–2 (the batch reminder port exposes only latest SENT → 0/1 → 5 points, matching `min(15, sentCount*5)` with `sentCount<=1`); §4 data flow by Task 4; §5 wiring by Tasks 3–4; §6 errors by Task 2 (`VALIDATION_ERROR`, empty items, existing error path); §7 tests by Tasks 1–4; §8 verification by Task 5; §9 ceilings reflected in `ponytail:` comments.
- **No placeholder text remains** in the plan: every implementation step contains actual code; no "TBD"/"similar to"/"fix later" steps.
- **Type consistency:** `RiskSignals`, `RiskScore`, `RiskBand`, `RiskReason`, `RankedReceivable`, `RankResult`, `scoreRisk`, `RankReceivablesByRiskTool.NAME` are spelled identically in Tasks 1, 2, 3, and 4.
