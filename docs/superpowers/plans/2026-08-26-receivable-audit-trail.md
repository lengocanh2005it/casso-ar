# Receivable Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual "Nhật ký kiểm toán" (Audit trail) tab to the receivable detail page, backed by a new `receivableId` filter on `GET /audit-logs`, so finance users can see who did what to a receivable without leaving its page.

**Architecture:** Backend: add a `receivableId` query param to the existing `GET /audit-logs` endpoint that filters on the `relatedReceivableId` column #369 already populates (`WHERE organizationId = X AND relatedReceivableId = Y`, no other query change). Frontend: reuse the existing `AuditLogTable`/`useAuditLogs` machinery from the Settings → Audit Log feature — first upgrading its detail-row rendering from raw JSON to a readable field-diff table (benefits both the Settings page and the new tab), then adding a new receivable-scoped consumer component, then wiring a 4th tab into `receivable-detail-page.tsx`.

**Tech Stack:** NestJS 11, TypeORM 1.1, React 19, TanStack Query, Vitest, Jest 30.

## Global Constraints

- No changes to #369's work (migration, `AuditInterceptor`, `relatedReceivableId` population) — this plan only *consumes* the column.
- Keep the existing `AUDIT_LOG_READ` permission gate — no RBAC changes (per issue #360's explicit scope decision).
- No "filter by receivable" control on the general Settings → Audit Log page — `relatedReceivableId` stays an internal correlation mechanism for this tab only.
- No backfill of historical `audit_logs` rows.
- Money fields render via the existing `formatVND()` (`apps/frontend/src/lib/format.ts`) — never a raw number or a hand-rolled format.
- RBAC FE convention: hide the tab entirely for a role without `AUDIT_LOG_READ` (`hasPermission(role, permission)` from `@casso-ar/shared-types`), never show it disabled.

---

### Task 1: Backend — `receivableId` filter on `GET /audit-logs`

**Files:**
- Modify: `apps/backend/src/common/audit/audit-log-repository.port.ts`
- Modify: `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`
- Modify: `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.ts`
- Modify: `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.spec.ts`
- Modify: `apps/backend/src/modules/audit-logs/presentation/dto/list-audit-logs-query.dto.ts`
- Modify: `apps/backend/src/modules/audit-logs/presentation/audit-logs.controller.ts`
- Modify: `apps/backend/test/ops-apis.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuditLogOrmEntity.relatedReceivableId` (already exists, populated by #369).
- Produces: `GET /api/v1/audit-logs?receivableId=<uuid>` — paginated, organization-scoped, `AUDIT_LOG_READ`-gated, filtered on `relatedReceivableId`. Task 3 (frontend) calls this via the existing `fetchAuditLogs`/`useAuditLogs` with a `receivableId` filter key.

- [ ] **Step 1: Write the failing unit test**

Edit `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.spec.ts` — add a new test after the existing `'passes every filter through to the repository'` test:

```typescript
  it('passes receivableId through to the repository as relatedReceivableId', async () => {
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
    );

    await useCase.execute({ page: 1, limit: 20, receivableId: 'rec-1' });

    expect(repo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      relatedReceivableId: 'rec-1',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns list-audit-logs.usecase.spec`
Expected: FAIL with a TypeScript error ("Object literal may only specify known properties, and 'receivableId' does not exist in type 'ListAuditLogsInput'") or, if TS lets it through loosely, a mismatch in the `findPage` call args (no `relatedReceivableId` key)

- [ ] **Step 3: Add `relatedReceivableId` to the repository query and where clause**

Edit `apps/backend/src/common/audit/audit-log-repository.port.ts`:

```typescript
export interface AuditLogPageQuery {
  organizationId: string;
  entityType?: AuditEntityType;
  actionType?: AuditActionType;
  actorUserId?: string;
  relatedReceivableId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}
```

Edit `apps/backend/src/common/audit/typeorm-audit-log.repository.ts`'s `findPage` — add one line to the `where` object:

```typescript
    const where: FindOptionsWhere<AuditLogOrmEntity> = {
      organizationId: query.organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.actorUserId ? { userId: query.actorUserId } : {}),
      ...(query.relatedReceivableId
        ? { relatedReceivableId: query.relatedReceivableId }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: Between(query.from ?? MIN_DATE, query.to ?? MAX_DATE),
          }
        : {}),
    };
```

- [ ] **Step 4: Map `receivableId` to `relatedReceivableId` in the use case**

Edit `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.ts`:

```typescript
export interface ListAuditLogsInput {
  page: number;
  limit: number;
  entityType?: AuditEntityType;
  actionType?: AuditActionType;
  actorUserId?: string;
  receivableId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ListAuditLogsInput,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const query: AuditLogPageQuery = {
      organizationId: this.tenantContext.getOrganizationId(),
      page: input.page,
      limit: input.limit,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.actionType ? { actionType: input.actionType } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.receivableId
        ? { relatedReceivableId: input.receivableId }
        : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
    };
    return this.repo.findPage(query);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns list-audit-logs.usecase.spec`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing e2e test**

Edit `apps/backend/test/ops-apis.e2e-spec.ts` — add a `relatedReceivableId` row to the existing `AuditLogOrmEntity` fixture save in `beforeAll` (right after the existing 2-row array, still inside the same `.save([...])` call — add a 3rd element):

```typescript
    await dataSource.getRepository(AuditLogOrmEntity).save([
      {
        id: logId,
        organizationId: orgA,
        userId: ownerA,
        actionType: AuditActionType.PAYMENT_ALLOCATE,
        entityType: AuditEntityType.PAYMENT,
        entityId: 'payment-1',
        beforeState: null,
        afterState: { amount: 1000 },
        ipAddress: '203.0.113.5',
        createdAt: new Date('2026-08-12'),
      },
      {
        id: randomUUID(),
        organizationId: orgB,
        userId: ownerB,
        actionType: AuditActionType.AUTH_LOGIN,
        entityType: AuditEntityType.AUTH,
        entityId: 'auth-1',
        beforeState: null,
        afterState: null,
        ipAddress: '203.0.113.6',
        createdAt: new Date('2026-08-12'),
      },
      {
        id: randomUUID(),
        organizationId: orgA,
        userId: ownerA,
        actionType: AuditActionType.PAYMENT_ALLOCATE,
        entityType: AuditEntityType.PAYMENT_ALLOCATION,
        entityId: 'alloc-1',
        relatedReceivableId: receivableForFilterTest,
        beforeState: null,
        afterState: { receivableId: receivableForFilterTest, allocatedAmount: 500000 },
        ipAddress: null,
        createdAt: new Date('2026-08-13'),
      },
    ]);
```

Add the new fixture id near the other id constants at the top of the `describe` block (next to `const logId = ...`):

```typescript
  const receivableForFilterTest = '00000000-0000-0000-0000-0000000000e1';
```

Add a new test after the existing `'GET /audit-logs filters by actionType'` test:

```typescript
  it('GET /audit-logs filters by receivableId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?receivableId=${receivableForFilterTest}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      entityId: 'alloc-1',
      entityType: 'PaymentAllocation',
    });
  });
```

- [ ] **Step 7: Run the e2e test to verify it fails**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns ops-apis.e2e-spec`
Expected: FAIL — `receivableId` is stripped by the global `whitelist: true` `ValidationPipe` (not yet a field on the query DTO), so the filter has no effect and `response.body.total` is 3, not 1

- [ ] **Step 8: Wire the query param into the DTO and controller**

Edit `apps/backend/src/modules/audit-logs/presentation/dto/list-audit-logs-query.dto.ts`:

```typescript
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../../common/audit/audit.enums';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class ListAuditLogsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: AuditActionType;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsUUID()
  receivableId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

Edit `apps/backend/src/modules/audit-logs/presentation/audit-logs.controller.ts`'s `findMany`:

```typescript
  async findMany(@Query() query: ListAuditLogsQueryDto) {
    const result = await this.listAuditLogsUseCase.execute({
      page: query.page,
      limit: query.limit,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.receivableId ? { receivableId: query.receivableId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
    return {
      items: result.items.map(toAuditLogItemResponse),
      total: result.total,
    };
  }
```

- [ ] **Step 9: Run the e2e test to verify it passes**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns ops-apis.e2e-spec`
Expected: PASS (all tests in this file)

- [ ] **Step 10: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/common/audit/audit-log-repository.port.ts apps/backend/src/common/audit/typeorm-audit-log.repository.ts apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.ts apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.spec.ts apps/backend/src/modules/audit-logs/presentation/dto/list-audit-logs-query.dto.ts apps/backend/src/modules/audit-logs/presentation/audit-logs.controller.ts apps/backend/test/ops-apis.e2e-spec.ts
git commit -m "feat: add receivableId filter to GET /audit-logs"
```

---

### Task 2: Frontend — readable field-diff detail row (shared `AuditLogTable`)

Replaces the raw-JSON `beforeState`/`afterState` dump in the shared audit-log table's expand row with a generic field-diff table. This upgrades both the existing Settings → Audit Log page and (via reuse in Task 3) the new receivable tab in one change.

**Files:**
- Modify: `apps/frontend/src/features/audit-logs/components/audit-log-table.tsx`
- Modify: `apps/frontend/src/features/audit-logs/components/audit-log-tab.spec.tsx`

**Interfaces:**
- Consumes: `AuditLogItem.beforeState`/`afterState` (`Record<string, unknown> | null`, unchanged type).
- Produces: no exported API change — `AuditLogTable`'s props stay identical. Task 3 reuses `AuditLogTable` as-is and gets this rendering for free.

- [ ] **Step 1: Write the failing test**

Edit `apps/frontend/src/features/audit-logs/components/audit-log-tab.spec.tsx` — replace the two raw-JSON assertions in the existing `'shows before/after state and ip only after expanding the row'` test:

```typescript
  it('shows before/after state and ip only after expanding the row', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    mockLoadedData();

    renderTab();

    expect(screen.queryByText('203.0.113.7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText('203.0.113.7')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('WRITTEN_OFF')).toBeInTheDocument();
    expect(screen.queryByText(/"status"/)).not.toBeInTheDocument();
  });
```

Add a new test right after it, in the same `describe` block, proving money-field formatting:

```typescript
  it('formats a known money field as VND in the expanded detail', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useAuditLogsMock.mockReturnValue({
      data: {
        items: [
          {
            ...logItem,
            id: 'log-2',
            beforeState: null,
            afterState: { allocatedAmount: 500000 },
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    useOrganizationMembersMock.mockReturnValue({
      data: { items: [knownMember], total: 1, page: 1, limit: 100 },
      isLoading: false,
      isError: false,
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));

    expect(screen.getByText(formatVND(500000))).toBeInTheDocument();
  });
```

Add the import at the top of the file:

```typescript
import { formatVND } from '@/lib/format';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/audit-logs/components/audit-log-tab.spec.tsx`
Expected: FAIL — the current `DetailRow` renders `JSON.stringify(...)`, so `getByText('status')` / `getByText('OPEN')` / `getByText(formatVND(500000))` find nothing, and `queryByText(/"status"/)` still matches the raw JSON

- [ ] **Step 3: Implement the field-diff renderer**

Edit `apps/frontend/src/features/audit-logs/components/audit-log-table.tsx` — replace the `DetailRow` function and add two helpers above it:

```typescript
import { ScrollText } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrganizationMember } from '@/features/settings/types';
import { actorLabel } from '@/lib/actor-label';
import { formatDateTime, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { ACTION_TYPE_LABELS, ENTITY_TYPE_LABELS } from '../labels';
import type { AuditLogItem } from '../types';

const MONEY_FIELD_NAMES = new Set([
  'amount',
  'allocatedAmount',
  'originalAmount',
  'paidAmount',
  'totalAmount',
  'unallocatedAmount',
  'remainingAmount',
]);

function formatFieldValue(field: string, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number' && MONEY_FIELD_NAMES.has(field)) {
    return formatVND(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface FieldDiffRow {
  field: string;
  before: unknown;
  after: unknown;
}

function fieldDiffRows(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldDiffRow[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .sort()
    .map((field) => ({ field, before: before?.[field], after: after?.[field] }));
}

function DetailRow({ item }: { item: AuditLogItem }) {
  const rows = fieldDiffRows(item.beforeState, item.afterState);
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={5}>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Địa chỉ IP: </span>
            <span>{item.ipAddress ?? '—'}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">Không có thay đổi.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-4 py-1 font-normal">Trường</th>
                  <th className="pr-4 py-1 font-normal">Trước</th>
                  <th className="py-1 font-normal">Sau</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td className="pr-4 py-1 font-mono">{row.field}</td>
                    <td className="pr-4 py-1">
                      {formatFieldValue(row.field, row.before)}
                    </td>
                    <td className="py-1">
                      {formatFieldValue(row.field, row.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
```

(The rest of the file — `AuditLogTableProps`, `AuditLogTable`, `AuditLogEmpty` — stays unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/audit-logs/components/audit-log-tab.spec.tsx`
Expected: PASS (all tests, including the 2 above)

- [ ] **Step 5: Type-check and lint**

Run: `cd apps/frontend && npx tsc --noEmit && npx biome check src/features/audit-logs`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/audit-logs/components/audit-log-table.tsx apps/frontend/src/features/audit-logs/components/audit-log-tab.spec.tsx
git commit -m "feat: render audit log before/after as a readable field-diff table"
```

---

### Task 3: Frontend — `ReceivableAuditTrail` component

**Files:**
- Create: `apps/frontend/src/features/receivables/components/receivable-audit-trail.tsx`
- Create: `apps/frontend/src/features/receivables/components/receivable-audit-trail.spec.tsx`
- Modify: `apps/frontend/src/features/audit-logs/types.ts`

**Interfaces:**
- Consumes: `useAuditLogs` (`@/features/audit-logs/api/use-audit-logs`), `AuditLogTable`/`AuditLogEmpty` (`@/features/audit-logs/components/audit-log-table`), `useOrganizationMembers` (`@/features/settings/api/use-settings`), `useAuth` (`@/contexts/auth-context`). All exist unchanged; only `AuditLogFilters` gains one new optional field.
- Produces: `ReceivableAuditTrail({ receivableId: string })` — a self-contained, paginated (local `useState`, not URL-synced — this is a sub-tab, not its own page) audit trail view. Task 4 renders it inside the new "audit" `TabsContent`.

- [ ] **Step 1: Add `receivableId` to the shared filters type**

Edit `apps/frontend/src/features/audit-logs/types.ts`:

```typescript
export interface AuditLogFilters {
  actorUserId?: string;
  entityType?: string;
  actionType?: string;
  receivableId?: string;
  from?: string;
  to?: string;
}
```

(`fetchAuditLogs`/`useAuditLogs` already spread `AuditLogFilters` generically into the request params — no other change needed for `receivableId` to reach the API.)

- [ ] **Step 2: Write the failing test**

```typescript
// apps/frontend/src/features/receivables/components/receivable-audit-trail.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableAuditTrail } from './receivable-audit-trail';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));

function renderTrail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceivableAuditTrail receivableId="rec-1" />
    </QueryClientProvider>,
  );
}

describe('ReceivableAuditTrail', () => {
  it('requests audit logs scoped to the receivable and renders them', async () => {
    apiRequest.mockImplementation(
      ({ url, params }: { url: string; params?: Record<string, unknown> }) => {
        if (url.includes('/members')) {
          return Promise.resolve({
            items: [{ userId: 'user-1', name: 'Nguyễn Minh Anh', role: 'OWNER' }],
          });
        }
        expect(params).toMatchObject({
          receivableId: 'rec-1',
          page: 1,
          limit: 20,
        });
        return Promise.resolve({
          items: [
            {
              id: 'log-1',
              userId: 'user-1',
              actionType: 'PAYMENT_ALLOCATE',
              entityType: 'PaymentAllocation',
              entityId: 'alloc-1',
              beforeState: null,
              afterState: { receivableId: 'rec-1', allocatedAmount: 500000 },
              ipAddress: null,
              createdAt: '2026-08-26T00:00:00.000Z',
            },
          ],
          total: 1,
        });
      },
    );

    renderTrail();

    expect(await screen.findByText('Nguyễn Minh Anh')).toBeInTheDocument();
  });

  it('shows an empty state when there are no audit rows for this receivable', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/members')) return Promise.resolve({ items: [] });
      return Promise.resolve({ items: [], total: 0 });
    });

    renderTrail();

    expect(
      await screen.findByText(/chưa có nhật ký/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/receivables/components/receivable-audit-trail.spec.tsx`
Expected: FAIL with "Cannot find module './receivable-audit-trail'"

- [ ] **Step 4: Implement the component**

```typescript
// apps/frontend/src/features/receivables/components/receivable-audit-trail.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { useAuditLogs } from '@/features/audit-logs/api/use-audit-logs';
import {
  AuditLogEmpty,
  AuditLogTable,
} from '@/features/audit-logs/components/audit-log-table';
import { useOrganizationMembers } from '@/features/settings/api/use-settings';

const LIMIT = 20;

export function ReceivableAuditTrail({
  receivableId,
}: {
  receivableId: string;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const membersQuery = useOrganizationMembers(user?.organizationId);
  const logsQuery = useAuditLogs({ receivableId, page, limit: LIMIT });

  if (logsQuery.isLoading) return <TableSkeleton rows={5} />;
  if (logsQuery.isError) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không thể tải nhật ký kiểm toán.
      </p>
    );
  }

  const items = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const members = membersQuery.data?.items ?? [];

  if (items.length === 0) return <AuditLogEmpty />;

  return (
    <div className="space-y-4">
      <AuditLogTable items={items} members={members} />
      <div className="flex items-center justify-between">
        <p className="tabular-nums text-sm text-muted-foreground">
          Trang {page} / {totalPages} • {total} nhật ký
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/receivables/components/receivable-audit-trail.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Type-check and lint**

Run: `cd apps/frontend && npx tsc --noEmit && npx biome check src/features/receivables/components/receivable-audit-trail.tsx src/features/audit-logs/types.ts`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/receivables/components/receivable-audit-trail.tsx apps/frontend/src/features/receivables/components/receivable-audit-trail.spec.tsx apps/frontend/src/features/audit-logs/types.ts
git commit -m "feat: add ReceivableAuditTrail component"
```

---

### Task 4: Frontend — wire the "Nhật ký kiểm toán" tab into the receivable detail page

**Files:**
- Modify: `apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivable-detail-page.spec.tsx`

**Interfaces:**
- Consumes: `ReceivableAuditTrail` (Task 3).
- Produces: a 4th tab, `value="audit"`, on the receivable detail page — hidden when the current user lacks `Permission.AUDIT_LOG_READ`.

- [ ] **Step 1: Write the failing test**

`receivable-detail-page.spec.tsx` currently mocks `useAuth` as a fixed-return module mock (`useAuth: () => ({ user: { role: 'FINANCE_MANAGER' } })`), which can't vary per test. Switch it to a `vi.fn()`-based mock (same pattern already used in `audit-log-tab.spec.tsx`) so the two new tests can set a different role, and add `useAuthMock.mockReturnValue(...)` to the top of the two existing tests so they keep passing under `FINANCE_MANAGER` (which already has `AUDIT_LOG_READ` — see `packages/shared-types/src/role-permissions.ts`).

Replace the top of the file:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { ReceivableDetailPage } from './receivable-detail-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

function renderDetailPage(id = 'r1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/receivables/${id}`]}>
        <Routes>
          <Route path="/receivables/:id" element={<ReceivableDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

In the existing `'shows remaining amount and allocations'` test, add as its first line (before `apiRequest.mockResolvedValue(...)`):

```typescript
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
```

and replace its inline `render(...)` block (the `const queryClient = ...` through the closing `);`) with `renderDetailPage();`.

Do the same in the existing `'shows the invoice number as heading...'` test: add the same `useAuthMock.mockReturnValue(...)` as its first line, and replace its inline `render(...)` block with `renderDetailPage('a1b2c3d4-e5f6-47a8-9abc-1234567890ab');`.

Then add two new tests at the end of the `describe` block:

```typescript
  it('shows the audit trail tab for a role with AUDIT_LOG_READ', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      remainingAmount: 50_000_000,
      dueDate: '2026-08-20',
      status: 'OPEN',
      isDisputed: false,
      disputeId: null,
      isOverdue: false,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage();

    expect(
      await screen.findByRole('tab', { name: 'Nhật ký kiểm toán' }),
    ).toBeInTheDocument();
  });

  it('hides the audit trail tab for a role without AUDIT_LOG_READ', async () => {
    // ACCOUNTANT has neither AUDIT_LOG_READ nor RECEIVABLE_AUDIT_READ — see
    // packages/shared-types/src/role-permissions.ts.
    useAuthMock.mockReturnValue({
      user: { role: 'ACCOUNTANT' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      remainingAmount: 50_000_000,
      dueDate: '2026-08-20',
      status: 'OPEN',
      isDisputed: false,
      disputeId: null,
      isOverdue: false,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage();

    await screen.findByRole('heading', { name: 'Khoản phải thu' });
    expect(
      screen.queryByRole('tab', { name: 'Nhật ký kiểm toán' }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/receivables/pages/receivable-detail-page.spec.tsx`
Expected: FAIL — no tab named "Nhật ký kiểm toán" exists yet, so the first new test fails to find it

- [ ] **Step 3: Implement**

Edit `apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx` — add imports:

```typescript
import { Permission } from '@casso-ar/shared-types';
import { CalendarClock, CreditCard, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { formatDate, formatDateTime, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useReceivable } from '../api/use-receivables';
import { CancelDialog } from '../components/cancel-dialog';
import { DisputeDialog } from '../components/dispute-dialog';
import { ReceivableAuditTrail } from '../components/receivable-audit-trail';
import { ReceivablePayments } from '../components/receivable-payments';
import { ReceivableTasks } from '../components/receivable-tasks';
import { ReceivableTimeline } from '../components/receivable-timeline';
import { WriteOffDialog } from '../components/write-off-dialog';
import { getReceivableDisplayName } from '../receivable-label';
```

Update the component body — add the permission check and widen `activeTab`:

```typescript
export function ReceivableDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { searchParams, setParam } = useUrlQueryParams();
  const { user } = useAuth();
  const canReadAudit = hasPermission(
    user?.role ?? null,
    Permission.AUDIT_LOG_READ,
  );
  const { data: receivable, isPending, isError } = useReceivable(id);
  const allowedTabs = canReadAudit
    ? ['payments', 'activity', 'tasks', 'audit']
    : ['payments', 'activity', 'tasks'];
  const activeTab = allowedTabs.includes(searchParams.get('tab') ?? '')
    ? (searchParams.get('tab') as 'payments' | 'activity' | 'tasks' | 'audit')
    : 'payments';
```

(The rest of the function body before the `<Tabs>` block is unchanged.)

Update the `<TabsList>`/`<TabsContent>` block:

```typescript
      <Tabs
        className="gap-3"
        value={activeTab}
        onValueChange={(value) => setParam('tab', value)}
      >
        <TabsList>
          <TabsTrigger value="payments">Thanh toán</TabsTrigger>
          <TabsTrigger value="activity">Hoạt động</TabsTrigger>
          <TabsTrigger value="tasks">Công việc</TabsTrigger>
          {canReadAudit && (
            <TabsTrigger value="audit">Nhật ký kiểm toán</TabsTrigger>
          )}
        </TabsList>
        <TabsContent
          value="payments"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          {receivable.allocations?.length ? (
            <ReceivablePayments receivableId={receivable.id} />
          ) : (
            <div className="flex min-h-20 flex-col items-center justify-center gap-2 text-center">
              <CreditCard
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
              <p className="text-sm font-medium">Chưa có khoản thanh toán</p>
              <p className="text-sm text-muted-foreground">
                Các khoản thu được khớp vào công nợ sẽ hiển thị tại đây.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="activity"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          <ReceivableTimeline receivableId={receivable.id} />
        </TabsContent>
        <TabsContent
          value="tasks"
          className="min-h-32 rounded-xl border bg-card p-5"
        >
          <ReceivableTasks receivableId={receivable.id} />
        </TabsContent>
        {canReadAudit && (
          <TabsContent
            value="audit"
            className="min-h-32 rounded-xl border bg-card p-5"
          >
            <ReceivableAuditTrail receivableId={receivable.id} />
          </TabsContent>
        )}
      </Tabs>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/receivables/pages/receivable-detail-page.spec.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Type-check and lint**

Run: `cd apps/frontend && npx tsc --noEmit && npx biome check src/features/receivables/pages/receivable-detail-page.tsx`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx apps/frontend/src/features/receivables/pages/receivable-detail-page.spec.tsx
git commit -m "feat: add Audit trail tab to receivable detail page"
```

---

## Final Verification

- [ ] **Backend unit suite:** `cd apps/backend && npx jest`
- [ ] **Backend e2e suite (needs Docker):** `pnpm --filter @casso-ar/backend test:e2e`
- [ ] **Backend type-check:** `cd apps/backend && npx tsc --noEmit`
- [ ] **Frontend suite:** `cd apps/frontend && npx vitest run`
- [ ] **Frontend type-check:** `cd apps/frontend && npx tsc --noEmit`
- [ ] **Run `domain-check`** per AGENTS.md (backend changes touch a query path, not money/tenant/transaction logic, but run it anyway)
- [ ] **Run `pnpm verify`** at the repo root
- [ ] **Manual browser walkthrough** (this plan only proves unit/e2e correctness; AGENTS.md requires exercising new UI in a real browser before claiming done): open a receivable with at least one payment allocation as an OWNER, confirm the "Nhật ký kiểm toán" tab appears, shows the allocation with a readable field-diff (not JSON) on expand, and that money fields render as VND; confirm the tab is absent for an ACCOUNTANT session.
- [ ] **Update `docs/wayfinder/feature-map.md`** — move #360 from "Blocked tickets waiting" to a shipped entry once merged, and close issue #360, referencing the PR
