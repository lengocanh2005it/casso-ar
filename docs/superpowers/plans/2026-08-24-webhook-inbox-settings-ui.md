# Webhook Inbox Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an OWNER/FINANCE_MANAGER a Settings tab that lists an organization's inbound Casso Flow webhooks and lets them retry any `FAILED` one.

**Architecture:** New frontend-only feature folder `apps/frontend/src/features/webhook-inbox/` (types, labels, API functions, React Query hooks, filter/table/tab components), wired into the existing `features/settings/pages/settings-page.tsx` tab list. No backend changes — `GET /api/v1/webhooks/inbox` and `POST /api/v1/webhooks/inbox/:id/reprocess` already ship (PR #147).

**Tech Stack:** React 19, TanStack Query (`useQuery`/`useMutation`), React Router (`useSearchParams` via the existing `useUrlQueryParams` hook), shadcn/ui (`Table`, `Select`, `AlertDialog`, `Badge`), Vitest + Testing Library, `sonner` for toasts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-webhook-inbox-settings-ui-design.md`.
- No backend changes in this plan — both endpoints and the `WEBHOOK_INBOX_READ` permission already exist.
- Feature placed in Settings (not Casso Admin) — see spec's "Placement decision" section.
- RBAC: hide the tab entirely when the role lacks `Permission.WEBHOOK_INBOX_READ` — never render a disabled control (`.claude/rules/frontend.md`).
- No `any` in production code. `import type` for pure types; value imports for anything used in a constructor/decorator (not applicable here — pure React/hooks code).
- File naming: kebab-case files, PascalCase components/exported types, camelCase functions/variables.
- Money/tenant-isolation/transaction rules from `AGENTS.md` do not apply — this plan touches no backend or money field.
- TDD (RED → GREEN → REFACTOR) for every file with real branching behavior. Pure data files (`types.ts`, `labels.ts`) and presentational components with no independent branching logic are implemented directly without their own spec file, matching the codebase's existing convention (`features/audit-logs/components/audit-log-filters.tsx` and `audit-log-table.tsx` have no dedicated spec; their behavior is covered by `audit-log-tab.spec.tsx`). This plan follows the same split.
- Run each task's test with `cd apps/frontend && npx vitest run <path>` from the repo root.

---

### Task 1: Types, labels, and API functions

**Files:**
- Create: `apps/frontend/src/features/webhook-inbox/types.ts`
- Create: `apps/frontend/src/features/webhook-inbox/labels.ts`
- Create: `apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.ts`
- Test: `apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.spec.ts`

**Interfaces:**
- Consumes: `apiRequest`, `postWithIdempotency` from `@/lib/api-client` (existing).
- Produces:
  - `WEBHOOK_INBOX_STATUSES: readonly ['RECEIVED', 'PROCESSED', 'FAILED']`, `WebhookInboxStatus` type
  - `WebhookInboxItem { id, bankConnectionId, providerTransactionId, rawPayload, receivedAt, status, processedAt, errorMessage, retryCount }` (`types.ts`)
  - `WebhookInboxPage { items: WebhookInboxItem[]; total: number }` (`types.ts`)
  - `WebhookInboxFilters { status?: WebhookInboxStatus; providerTransactionId?: string }` (`types.ts`)
  - `WebhookInboxListQuery extends WebhookInboxFilters { page: number; limit: number }` (`types.ts`)
  - `WEBHOOK_INBOX_STATUS_LABELS: Record<WebhookInboxStatus, string>` (`labels.ts`)
  - `WEBHOOK_INBOX_STATUS_OPTIONS: { value: 'ALL' | WebhookInboxStatus; label: string }[]` (`labels.ts`)
  - `WEBHOOK_INBOX_STATUS_BADGE_VARIANT: Record<WebhookInboxStatus, 'outline' | 'secondary' | 'destructive'>` (`labels.ts`)
  - `fetchWebhookInbox(filters: WebhookInboxFilters, page: number, limit: number): Promise<WebhookInboxPage>` (`webhook-inbox-api.ts`)
  - `reprocessWebhookInbox(id: string): Promise<WebhookInboxItem>` (`webhook-inbox-api.ts`)

- [ ] **Step 1: Create the types file (no test — pure data shape, mirrors `features/audit-logs/types.ts`)**

```typescript
// apps/frontend/src/features/webhook-inbox/types.ts
export const WEBHOOK_INBOX_STATUSES = ['RECEIVED', 'PROCESSED', 'FAILED'] as const;

export type WebhookInboxStatus = (typeof WEBHOOK_INBOX_STATUSES)[number];

export interface WebhookInboxItem {
  id: string;
  bankConnectionId: string;
  providerTransactionId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
  status: WebhookInboxStatus;
  processedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface WebhookInboxPage {
  items: WebhookInboxItem[];
  total: number;
}

export interface WebhookInboxFilters {
  status?: WebhookInboxStatus;
  providerTransactionId?: string;
}

export interface WebhookInboxListQuery extends WebhookInboxFilters {
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Create the labels file (no test — pure data, mirrors `features/audit-logs/labels.ts`)**

```typescript
// apps/frontend/src/features/webhook-inbox/labels.ts
import type { WebhookInboxStatus } from './types';

export const WEBHOOK_INBOX_STATUS_LABELS: Record<WebhookInboxStatus, string> = {
  RECEIVED: 'Đã nhận',
  PROCESSED: 'Đã xử lý',
  FAILED: 'Thất bại',
};

export const WEBHOOK_INBOX_STATUS_OPTIONS: {
  value: 'ALL' | WebhookInboxStatus;
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'RECEIVED', label: WEBHOOK_INBOX_STATUS_LABELS.RECEIVED },
  { value: 'PROCESSED', label: WEBHOOK_INBOX_STATUS_LABELS.PROCESSED },
  { value: 'FAILED', label: WEBHOOK_INBOX_STATUS_LABELS.FAILED },
];

export const WEBHOOK_INBOX_STATUS_BADGE_VARIANT: Record<
  WebhookInboxStatus,
  'outline' | 'secondary' | 'destructive'
> = {
  RECEIVED: 'outline',
  PROCESSED: 'secondary',
  FAILED: 'destructive',
};
```

- [ ] **Step 3: Write the failing test for the API functions**

```typescript
// apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.spec.ts
import { describe, expect, it, vi } from 'vitest';

const { apiRequest, postWithIdempotency } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  postWithIdempotency: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

import { fetchWebhookInbox, reprocessWebhookInbox } from './webhook-inbox-api';

describe('fetchWebhookInbox', () => {
  it('requests the inbox page with pagination and the provided filters', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchWebhookInbox(
      { status: 'FAILED', providerTransactionId: 'TXN-001' },
      2,
      20,
    );

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/webhooks/inbox',
      method: 'GET',
      params: {
        page: 2,
        limit: 20,
        status: 'FAILED',
        providerTransactionId: 'TXN-001',
      },
    });
  });

  it('omits empty filters from the request params', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchWebhookInbox({}, 1, 20);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/webhooks/inbox',
      method: 'GET',
      params: { page: 1, limit: 20 },
    });
  });
});

describe('reprocessWebhookInbox', () => {
  it('posts to the reprocess endpoint via postWithIdempotency', async () => {
    postWithIdempotency.mockResolvedValueOnce({ id: 'wh-1', status: 'PROCESSED' });

    await reprocessWebhookInbox('wh-1');

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/webhooks/inbox/wh-1/reprocess',
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/api/webhook-inbox-api.spec.ts`
Expected: FAIL — `webhook-inbox-api.ts` does not exist yet (module not found).

- [ ] **Step 5: Implement the API functions**

```typescript
// apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.ts
import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  WebhookInboxFilters,
  WebhookInboxItem,
  WebhookInboxPage,
} from '../types';

export function fetchWebhookInbox(
  filters: WebhookInboxFilters,
  page: number,
  limit: number,
): Promise<WebhookInboxPage> {
  return apiRequest<WebhookInboxPage>({
    url: '/api/v1/webhooks/inbox',
    method: 'GET',
    params: { page, limit, ...filters },
  });
}

export function reprocessWebhookInbox(id: string): Promise<WebhookInboxItem> {
  return postWithIdempotency<WebhookInboxItem>(
    `/api/v1/webhooks/inbox/${id}/reprocess`,
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/api/webhook-inbox-api.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/webhook-inbox/types.ts apps/frontend/src/features/webhook-inbox/labels.ts apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.ts apps/frontend/src/features/webhook-inbox/api/webhook-inbox-api.spec.ts
git commit -m "feat: add webhook inbox types and API functions"
```

---

### Task 2: React Query hooks (list query + reprocess mutation)

**Files:**
- Create: `apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.ts`
- Test: `apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.spec.tsx`

**Interfaces:**
- Consumes: `fetchWebhookInbox`, `reprocessWebhookInbox` from `./webhook-inbox-api` (Task 1); `WebhookInboxListQuery` from `../types` (Task 1); `getResponseErrorMessage` from `@/features/settings/api/settings-api` (existing).
- Produces:
  - `useWebhookInbox(query: WebhookInboxListQuery)` — `useQuery` result with `data: WebhookInboxPage | undefined`, `isLoading`, `isError`.
  - `useReprocessWebhook()` — `useMutation` result whose `mutate`/`mutateAsync` accept a webhook inbox `id: string`.

The list hook (`useWebhookInbox`) is a thin passthrough with no branching logic — it gets no dedicated test, matching `features/audit-logs/api/use-audit-logs.ts` (untested passthrough, covered indirectly by the tab component test in Task 5). The mutation hook (`useReprocessWebhook`) has real success/error branching, so it gets a dedicated `renderHook` test, mirroring `features/settings/api/use-initiate-plan-upgrade.spec.tsx`.

- [ ] **Step 1: Write the failing test for `useReprocessWebhook`**

```typescript
// apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { useReprocessWebhook } from './use-webhook-inbox';

const { reprocessWebhookInbox } = vi.hoisted(() => ({
  reprocessWebhookInbox: vi.fn(),
}));

vi.mock('./webhook-inbox-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webhook-inbox-api')>()),
  reprocessWebhookInbox,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useReprocessWebhook(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  });
  return { queryClient, ...view };
}

describe('useReprocessWebhook', () => {
  it('shows a success toast and invalidates the webhook inbox query', async () => {
    reprocessWebhookInbox.mockResolvedValueOnce({
      id: 'wh-1',
      status: 'PROCESSED',
    });
    const { result, queryClient } = renderWithQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate('wh-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(reprocessWebhookInbox).toHaveBeenCalledWith('wh-1');
    expect(toast.success).toHaveBeenCalledWith('Đã xử lý lại webhook.');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['webhook-inbox'] });
  });

  it('shows an error toast on failure', async () => {
    reprocessWebhookInbox.mockRejectedValueOnce(new Error('conflict'));
    const { result } = renderWithQueryClient();

    result.current.mutate('wh-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith('Không thể xử lý lại webhook.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/api/use-webhook-inbox.spec.tsx`
Expected: FAIL — `use-webhook-inbox.ts` does not exist yet.

- [ ] **Step 3: Implement the hooks**

```typescript
// apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getResponseErrorMessage } from '@/features/settings/api/settings-api';
import type { WebhookInboxListQuery } from '../types';
import { fetchWebhookInbox, reprocessWebhookInbox } from './webhook-inbox-api';

export function useWebhookInbox(query: WebhookInboxListQuery) {
  const { page, limit, ...filters } = query;
  return useQuery({
    queryKey: ['webhook-inbox', filters, page, limit],
    queryFn: () => fetchWebhookInbox(filters, page, limit),
  });
}

export function useReprocessWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reprocessWebhookInbox(id),
    onSuccess: () => {
      toast.success('Đã xử lý lại webhook.');
      void queryClient.invalidateQueries({ queryKey: ['webhook-inbox'] });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(error, 'Không thể xử lý lại webhook.'),
      ),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/api/use-webhook-inbox.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.ts apps/frontend/src/features/webhook-inbox/api/use-webhook-inbox.spec.tsx
git commit -m "feat: add webhook inbox query and reprocess mutation hooks"
```

---

### Task 3: Filters bar component

**Files:**
- Create: `apps/frontend/src/features/webhook-inbox/components/webhook-inbox-filters.tsx`

**Interfaces:**
- Consumes: `WEBHOOK_INBOX_STATUS_OPTIONS` from `../labels` (Task 1); `WebhookInboxStatus` from `../types` (Task 1); `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` from `@/components/ui/select`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label` (all existing).
- Produces:
  - `WebhookInboxFilterValues { status: 'ALL' | WebhookInboxStatus; providerTransactionId: string }`
  - `WebhookInboxFiltersBar({ values: WebhookInboxFilterValues; onChange: (next: WebhookInboxFilterValues) => void })` component

No dedicated spec — a pure controlled-input component with no independent branching, matching `features/audit-logs/components/audit-log-filters.tsx` (also untested directly). Its behavior (status change → query change, page reset) is verified through `webhook-inbox-tab.spec.tsx` in Task 5.

- [ ] **Step 1: Implement the component**

```typescript
// apps/frontend/src/features/webhook-inbox/components/webhook-inbox-filters.tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WEBHOOK_INBOX_STATUS_OPTIONS } from '../labels';
import type { WebhookInboxStatus } from '../types';

export interface WebhookInboxFilterValues {
  status: 'ALL' | WebhookInboxStatus;
  providerTransactionId: string;
}

interface WebhookInboxFiltersBarProps {
  values: WebhookInboxFilterValues;
  onChange: (next: WebhookInboxFilterValues) => void;
}

export function WebhookInboxFiltersBar({
  values,
  onChange,
}: WebhookInboxFiltersBarProps) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="webhook-inbox-status">Trạng thái</Label>
        <Select
          value={values.status}
          onValueChange={(status) =>
            onChange({
              ...values,
              status: status as WebhookInboxFilterValues['status'],
            })
          }
        >
          <SelectTrigger
            id="webhook-inbox-status"
            aria-label="Trạng thái"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEBHOOK_INBOX_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="webhook-inbox-search">Mã giao dịch</Label>
        <Input
          id="webhook-inbox-search"
          name="providerTransactionId"
          type="search"
          autoComplete="off"
          placeholder="Tìm theo mã giao dịch…"
          value={values.providerTransactionId}
          onChange={(event) =>
            onChange({ ...values, providerTransactionId: event.target.value })
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new errors from this file (it isn't consumed anywhere yet, so nothing else can break).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/webhook-inbox/components/webhook-inbox-filters.tsx
git commit -m "feat: add webhook inbox filters bar"
```

---

### Task 4: Table component (list + expand detail + reprocess action)

**Files:**
- Create: `apps/frontend/src/features/webhook-inbox/components/webhook-inbox-table.tsx`

**Interfaces:**
- Consumes: `WebhookInboxItem` from `../types` (Task 1); `WEBHOOK_INBOX_STATUS_LABELS`, `WEBHOOK_INBOX_STATUS_BADGE_VARIANT` from `../labels` (Task 1); `useReprocessWebhook` from `../api/use-webhook-inbox` (Task 2); `useUrlQueryParams` from `@/lib/use-url-query-params`; `TruncatedCopyId` from `@/components/shared/truncated-copy-id`; `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table`; `Badge` from `@/components/ui/badge`; `Button` from `@/components/ui/button`; `AlertDialog` family from `@/components/ui/alert-dialog`; `EmptyState` from `@/components/layout/empty-state` (all existing).
- Produces:
  - `WebhookInboxTable({ items: WebhookInboxItem[] })` component
  - `WebhookInboxEmpty()` component

No dedicated spec — mirrors `features/audit-logs/components/audit-log-table.tsx`, which also has no direct spec; its expand/collapse and reprocess-action behavior is verified through `webhook-inbox-tab.spec.tsx` in Task 5.

- [ ] **Step 1: Implement the component**

```typescript
// apps/frontend/src/features/webhook-inbox/components/webhook-inbox-table.tsx
import { Webhook } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useReprocessWebhook } from '../api/use-webhook-inbox';
import {
  WEBHOOK_INBOX_STATUS_BADGE_VARIANT,
  WEBHOOK_INBOX_STATUS_LABELS,
} from '../labels';
import type { WebhookInboxItem } from '../types';

const RECEIVED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatReceivedAt(iso: string): string {
  return RECEIVED_AT_FORMATTER.format(new Date(iso));
}

function DetailRow({ item }: { item: WebhookInboxItem }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={6}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Lỗi</dt>
            <dd className="whitespace-pre-wrap break-words">
              {item.errorMessage ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dữ liệu gốc</dt>
            <dd className="whitespace-pre-wrap break-words font-mono text-xs">
              {JSON.stringify(item.rawPayload, null, 2)}
            </dd>
          </div>
        </dl>
      </TableCell>
    </TableRow>
  );
}

interface WebhookInboxTableProps {
  items: WebhookInboxItem[];
}

export function WebhookInboxTable({ items }: WebhookInboxTableProps) {
  const { searchParams, patch } = useUrlQueryParams();
  const expandedId = searchParams.get('expanded');
  const reprocess = useReprocessWebhook();

  function toggleExpanded(id: string) {
    patch((next) => {
      if (next.get('expanded') === id) {
        next.delete('expanded');
      } else {
        next.set('expanded', id);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thời điểm nhận</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Mã giao dịch</TableHead>
            <TableHead>Số lần thử lại</TableHead>
            <TableHead>
              <span className="sr-only">Chi tiết</span>
            </TableHead>
            <TableHead>
              <span className="sr-only">Hành động</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="align-middle">
                <TableCell>{formatReceivedAt(item.receivedAt)}</TableCell>
                <TableCell>
                  <Badge variant={WEBHOOK_INBOX_STATUS_BADGE_VARIANT[item.status]}>
                    {WEBHOOK_INBOX_STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TruncatedCopyId id={item.providerTransactionId} />
                </TableCell>
                <TableCell className="tabular-nums">{item.retryCount}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expandedId === item.id}
                    onClick={() => toggleExpanded(item.id)}
                  >
                    Chi tiết
                  </Button>
                </TableCell>
                <TableCell>
                  {item.status === 'FAILED' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reprocess.isPending}
                        >
                          Xử lý lại
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Xử lý lại webhook này?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Hệ thống sẽ thử xử lý lại webhook này với dữ liệu
                            đã nhận. Không xoá dữ liệu hiện có.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => reprocess.mutate(item.id)}
                          >
                            Xác nhận
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
              {expandedId === item.id && <DetailRow item={item} />}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function WebhookInboxEmpty() {
  return (
    <EmptyState
      density="compact"
      icon={Webhook}
      title="Chưa có webhook nào."
      description="Điều chỉnh bộ lọc hoặc chờ webhook mới từ Casso Flow."
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/webhook-inbox/components/webhook-inbox-table.tsx
git commit -m "feat: add webhook inbox table with reprocess action"
```

---

### Task 5: Tab composition component (TDD)

**Files:**
- Create: `apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.tsx`
- Test: `apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.spec.tsx`

**Interfaces:**
- Consumes: `useWebhookInbox` from `../api/use-webhook-inbox` (Task 2, mocked in the test); `WebhookInboxFiltersBar`, `WebhookInboxFilterValues` from `./webhook-inbox-filters` (Task 3); `WebhookInboxTable`, `WebhookInboxEmpty` from `./webhook-inbox-table` (Task 4); `WEBHOOK_INBOX_STATUSES`, `WebhookInboxStatus` from `../types` (Task 1); `hasPermission` from `@/lib/rbac`; `useAuth` from `@/contexts/auth-context`; `useUrlQueryParams` from `@/lib/use-url-query-params`; `useDebouncedValue` from `@/lib/use-debounced-value`; `SectionCard` from `@/components/layout/section-card`; `TableSkeleton` from `@/components/ui/skeleton`; `Button` from `@/components/ui/button` (all existing).
- Produces: `WebhookInboxTab()` component — the piece Task 6 mounts in Settings.

This is the composition root, so this task carries the real TDD component spec (mirrors `features/audit-logs/components/audit-log-tab.spec.tsx` for list/filter/permission behavior, and `features/receivables/components/cancel-dialog.spec.tsx` for the confirm-then-mutate flow).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { WebhookInboxTab } from './webhook-inbox-tab';

const { apiRequest, useWebhookInboxMock } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useWebhookInboxMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

vi.mock('../api/use-webhook-inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/use-webhook-inbox')>()),
  useWebhookInbox: (...args: unknown[]) => useWebhookInboxMock(...args),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

const failedItem = {
  id: 'wh-1',
  bankConnectionId: 'bc-1',
  providerTransactionId: 'TXN-001',
  rawPayload: { amount: 100000 },
  receivedAt: '2026-08-20T04:00:00.000Z',
  status: 'FAILED' as const,
  processedAt: null,
  errorMessage: 'Không tìm thấy khách hàng phù hợp',
  retryCount: 1,
};

const processedItem = {
  ...failedItem,
  id: 'wh-2',
  status: 'PROCESSED' as const,
  errorMessage: null,
  processedAt: '2026-08-20T04:05:00.000Z',
};

function renderTab(initialEntries: string[] = ['/settings']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <WebhookInboxTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WebhookInboxTab', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the user lacks WEBHOOK_INBOX_READ', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'ACCOUNTANT', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem], total: 1 },
      isLoading: false,
      isError: false,
    });

    const { container } = renderTab();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders webhook items from the query, and shows "Xử lý lại" only on FAILED rows', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem, processedItem], total: 2 },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(screen.getByText('Thất bại')).toBeInTheDocument();
    expect(screen.getByText('Đã xử lý')).toBeInTheDocument();
    expect(screen.getAllByText('TXN-001…')).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Xử lý lại' }),
    ).toHaveLength(1);
  });

  it('reprocesses a FAILED webhook on confirm', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [failedItem], total: 1 },
      isLoading: false,
      isError: false,
    });
    apiRequest.mockResolvedValueOnce({ ...failedItem, status: 'PROCESSED' });

    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Xử lý lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/webhooks/inbox/wh-1/reprocess',
          method: 'POST',
        }),
      ),
    );
  });

  it('maps the status filter from the URL into the query', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    renderTab(['/settings?tab=webhook-inbox&status=FAILED']);

    expect(useWebhookInboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', page: 1, limit: 20 }),
    );
  });

  it('resets the page to 1 when the status filter changes', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'OWNER', organizationId: 'org-1' },
    } as never);
    useWebhookInboxMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    renderTab(['/settings?tab=webhook-inbox&page=3']);

    const statusTrigger = screen.getByRole('combobox', { name: /trạng thái/i });
    fireEvent.click(statusTrigger);
    const failedOption = await screen.findByRole('option', {
      name: 'Thất bại',
    });
    fireEvent.click(failedOption);

    await waitFor(() =>
      expect(useWebhookInboxMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: 'FAILED' }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/components/webhook-inbox-tab.spec.tsx`
Expected: FAIL — `webhook-inbox-tab.tsx` does not exist yet.

- [ ] **Step 3: Implement the component**

```typescript
// apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.tsx
import { Permission } from '@casso-ledger/shared-types';
import { Webhook } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { useWebhookInbox } from '../api/use-webhook-inbox';
import { WEBHOOK_INBOX_STATUSES, type WebhookInboxStatus } from '../types';
import {
  WebhookInboxFiltersBar,
  type WebhookInboxFilterValues,
} from './webhook-inbox-filters';
import { WebhookInboxEmpty, WebhookInboxTable } from './webhook-inbox-table';

const DEFAULT_LIMIT = 20;

function isWebhookInboxStatus(value: string): value is WebhookInboxStatus {
  return (WEBHOOK_INBOX_STATUSES as readonly string[]).includes(value);
}

export function WebhookInboxTab() {
  const { user } = useAuth();
  const canRead = hasPermission(
    user?.role ?? null,
    Permission.WEBHOOK_INBOX_READ,
  );
  const { searchParams, setPage, patch } = useUrlQueryParams();

  const statusParam = searchParams.get('status') ?? 'ALL';
  const providerTransactionId = searchParams.get('search') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const debouncedProviderTransactionId = useDebouncedValue(
    providerTransactionId,
    250,
  );

  const values: WebhookInboxFilterValues = {
    status: isWebhookInboxStatus(statusParam) ? statusParam : 'ALL',
    providerTransactionId,
  };

  const filters = {
    ...(isWebhookInboxStatus(statusParam) ? { status: statusParam } : {}),
    ...(debouncedProviderTransactionId
      ? { providerTransactionId: debouncedProviderTransactionId }
      : {}),
  };

  const inboxQuery = useWebhookInbox({ ...filters, page, limit: DEFAULT_LIMIT });

  if (!canRead) return null;

  function updateFilterValues(next: WebhookInboxFilterValues) {
    patch(
      (params) => {
        if (next.status === 'ALL') params.delete('status');
        else params.set('status', next.status);
        if (next.providerTransactionId) {
          params.set('search', next.providerTransactionId);
        } else {
          params.delete('search');
        }
        params.set('page', '1');
      },
      { replace: true },
    );
  }

  const items = inboxQuery.data?.items ?? [];
  const total = inboxQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));

  return (
    <div className="space-y-4">
      <WebhookInboxFiltersBar values={values} onChange={updateFilterValues} />
      <SectionCard
        icon={Webhook}
        title="Webhook"
        description="Webhook nhận từ Casso Flow / Casso Balance Hook."
      >
        {inboxQuery.isLoading ? (
          <TableSkeleton rows={5} />
        ) : inboxQuery.isError ? (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải danh sách webhook.
          </p>
        ) : items.length === 0 ? (
          <WebhookInboxEmpty />
        ) : (
          <WebhookInboxTable items={items} />
        )}
      </SectionCard>
      <div className="flex items-center justify-between">
        <p className="tabular-nums text-sm text-muted-foreground">
          Trang {page} / {totalPages} • {total} webhook
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/webhook-inbox/components/webhook-inbox-tab.spec.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.tsx apps/frontend/src/features/webhook-inbox/components/webhook-inbox-tab.spec.tsx
git commit -m "feat: add webhook inbox tab composition"
```

---

### Task 6: Wire the tab into Settings

**Files:**
- Modify: `apps/frontend/src/features/settings/pages/settings-page.tsx`

**Interfaces:**
- Consumes: `WebhookInboxTab` from `@/features/webhook-inbox/components/webhook-inbox-tab` (Task 5, lazy-loaded); `Permission.WEBHOOK_INBOX_READ` from `@casso-ledger/shared-types` (already imported in this file); `Webhook` icon from `lucide-react`.

No dedicated test — `settings-page.tsx` has no existing spec file (verified: only `settings-page.tsx` itself lives in `features/settings/pages/`), so this task is pure wiring, matching how every other tab (`billing`, `users`, `templates`, `smtp`, `audit-log`) was added to this same file with no page-level test. Covered by the full frontend suite (Task 7) plus a manual walkthrough.

- [ ] **Step 1: Add the `Webhook` icon to the lucide-react import**

In `apps/frontend/src/features/settings/pages/settings-page.tsx`, change:

```typescript
import {
  CreditCard,
  Lock,
  Mail,
  Palette,
  ScrollText,
  Server,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react';
```

to:

```typescript
import {
  CreditCard,
  Lock,
  Mail,
  Palette,
  ScrollText,
  Server,
  Settings as SettingsIcon,
  Users,
  Webhook,
} from 'lucide-react';
```

- [ ] **Step 2: Add the lazy import for `WebhookInboxTab`**

Change:

```typescript
const AuditLogTab = lazy(() =>
  import('@/features/audit-logs/components/audit-log-tab').then((m) => ({
    default: m.AuditLogTab,
  })),
);
```

to:

```typescript
const AuditLogTab = lazy(() =>
  import('@/features/audit-logs/components/audit-log-tab').then((m) => ({
    default: m.AuditLogTab,
  })),
);
const WebhookInboxTab = lazy(() =>
  import('@/features/webhook-inbox/components/webhook-inbox-tab').then(
    (m) => ({ default: m.WebhookInboxTab }),
  ),
);
```

- [ ] **Step 3: Add the tab config entry**

Change the end of the `useSettingsTabs` array from:

```typescript
      {
        value: 'audit-log',
        label: 'Nhật ký',
        icon: ScrollText,
        locked: !hasPermission(role, Permission.AUDIT_LOG_READ),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <AuditLogTab />
          </Suspense>
        ),
      },
    ],
    [role],
  );
```

to:

```typescript
      {
        value: 'audit-log',
        label: 'Nhật ký',
        icon: ScrollText,
        locked: !hasPermission(role, Permission.AUDIT_LOG_READ),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <AuditLogTab />
          </Suspense>
        ),
      },
      {
        value: 'webhook-inbox',
        label: 'Webhook',
        icon: Webhook,
        locked: !hasPermission(role, Permission.WEBHOOK_INBOX_READ),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <WebhookInboxTab />
          </Suspense>
        ),
      },
    ],
    [role],
  );
```

- [ ] **Step 4: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/pages/settings-page.tsx
git commit -m "feat: add Webhook tab to Settings"
```

---

### Task 7: Full verification and manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd apps/frontend && npx vitest run`
Expected: all suites pass, including the 3 new files from Tasks 1, 2, and 5.

- [ ] **Step 2: Type-check the whole frontend package**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint and format**

Run: `npx biome check --write .` (repo root)
Expected: no remaining issues; if Biome reformats any of the new files, re-run the affected task's test to confirm it still passes.

- [ ] **Step 4: Manual walkthrough in the browser**

Run: `pnpm dev:backend` and `pnpm --filter @casso-ledger/frontend dev` (or the project's existing `run` skill), then as an `OWNER` or `FINANCE_MANAGER` user:
1. Open Settings → the new "Webhook" tab appears; open it.
2. Confirm the list loads (or the empty state shows, if the seed org has no webhook inbox rows yet).
3. If a `FAILED` row exists, click "Xử lý lại" → confirm in the dialog → row updates/reappears with a fresh status after the list refetches, and a success toast shows.
4. Filter by status "Thất bại" and confirm only `FAILED` rows show; clear back to "Tất cả".
5. Type in the "Mã giao dịch" search box and confirm the list narrows after the debounce.
6. Log in as a role without `WEBHOOK_INBOX_READ` (e.g. `ACCOUNTANT`) and confirm the "Webhook" tab does not appear at all.

- [ ] **Step 5: Update the feature map**

In `docs/wayfinder/feature-map.md`, replace the "In progress" line for #235 (added when the worktree was created) with a "Shipped" entry once the PR is up, following the existing format (see the other `**Shipped YYYY-MM-DD**: PR #XXX ...` entries in the Frontier section). This step happens after Task 7's PR is opened, per `AGENTS.md`'s worktree workflow — not before.

---

## Notes for the next step

This plan does not include creating the PR — per `AGENTS.md`'s worktree workflow and the skill routing in `CLAUDE.md`, that is `finishing-a-development-branch` → `requesting-code-review` → `verification-before-completion` territory, started once all 7 tasks above are green.
