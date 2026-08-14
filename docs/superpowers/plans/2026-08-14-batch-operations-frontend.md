# Batch Operations (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Row-selection checkboxes and a bulk action bar on the Exceptions page (Skip / Ghi nhận công nợ / Khớp giao dịch được gợi ý) and the Receivables page (Xóa nợ / Hủy), driving the 5 batch endpoints from the backend plan.

**Architecture:** One generic `useBulkSelection(ids)` hook (`lib/`, shared by both features per the Rule of Two) tracks selection scoped to the currently rendered page of rows — selection is naturally cleared when the `ids` array changes (new page, new search/filter). One generic `<BulkConfirmDialog>` (`components/`, shared) is a controlled confirm-then-mutate dialog reused for every destructive/high-consequence bulk action. Each feature gets its own bulk action bar component that owns the batch mutations and renders `BulkConfirmDialog` instances for the actions that need confirmation.

**Tech Stack:** React 19, `@tanstack/react-query`, `radix-ui` (already a dependency — `Checkbox` primitive), `sonner` (toast), Vitest + Testing Library.

**Spec:** GitHub issue #134, `docs/superpowers/plans/2026-08-14-batch-operations-backend.md` (defines every request/response shape this plan consumes), `CONTEXT.md` §"Batch Operations". The confirm-dialog, select-all-scope, and result-feedback decisions below were made during grilling but are frontend UX choices, not domain vocabulary, so they live only in this plan (not in `CONTEXT.md`, which stays implementation-detail-free).

## Global Constraints

- RBAC: `hasPermission(role, permission)` hides the whole bulk action bar when the permission is missing — never disables it (AGENTS.md, `.claude/rules/frontend.md`).
- Money: `formatVND()` for any amount shown in a confirm dialog — never a raw number.
- No `any` in production code.
- Feature folder owns its own `api/`, `components/`; only `useBulkSelection` and `BulkConfirmDialog` are promoted to shared locations because both are used by 2+ features (Rule of Two, `.claude/rules/frontend.md`).
- Select-all scope (grilling decision): selection is **current page only** — `useBulkSelection` takes the current page's row ids and drops any previously-selected id no longer in that list, so paginating or re-searching naturally clears stale selections.
- Confirm dialog (grilling decision): required before **Ghi nhận công nợ hàng loạt**, **Khớp giao dịch được gợi ý**, **Xóa nợ**, and **Hủy** (all bulk). **Bỏ qua** (bulk skip) fires immediately, no dialog, matching the single-row `SplitMatchDialog`'s existing "Bỏ qua" button which also has no confirmation.
- Result feedback (grilling decision): after a batch mutation resolves, show one `sonner` toast summarizing `x/y thành công`, and keep the failed rows' ids selected (drop the succeeded ones from selection) so the user can see/retry them.
- `BULK_APPROVE_THRESHOLD = 80` (`CONTEXT.md` §Batch Operations) gates which Exceptions rows the "Khớp giao dịch được gợi ý" button can act on — a row needs `topCandidate.totalScore >= 80`.
- TDD RED → GREEN → REFACTOR for every task except Task 1 (shadcn primitive copy — config/scaffolding exception, AGENTS.md; this codebase has no `.spec.tsx` for any other `components/ui/*` primitive either).
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas.
- Test command: `pnpm --filter @casso-ledger/frontend test -- <pattern>` (Vitest). Type-check: `pnpm --filter @casso-ledger/frontend type-check`.

---

### Task 1: `Checkbox` UI primitive

**Files:**
- Create: `apps/frontend/src/components/ui/checkbox.tsx`

**Context:** `radix-ui` (unified package, version 1.1.1) is already a dependency — see `apps/frontend/src/components/ui/select.tsx` and `dialog.tsx` for the exact import style (`import { X as XPrimitive } from 'radix-ui'`). No new dependency needed. This file is a straight shadcn-CLI-style primitive copy; per `.claude/rules/frontend.md` ("shadcn/ui primitives (copy from CLI, don't modify)") and the fact that no other `components/ui/*.tsx` file in this repo has a matching `.spec.tsx`, this task has no test step.

- [x] **Step 1: Write the component**

```tsx
// apps/frontend/src/components/ui/checkbox.tsx
'use client';

import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

- [x] **Step 2: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [x] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ui/checkbox.tsx
git commit -m "feat: add Checkbox UI primitive"
```

---

### Task 2: Shared `useBulkSelection` hook

**Files:**
- Create: `apps/frontend/src/lib/use-bulk-selection.ts`
- Test: `apps/frontend/src/lib/use-bulk-selection.spec.ts`

**Interfaces:**
- Produces: `useBulkSelection(ids: string[]): { selectedIds: string[]; isSelected: (id: string) => boolean; allSelected: boolean; toggle: (id: string) => void; toggleAll: () => void; clear: () => void; drop: (ids: string[]) => void }` — every bulk action bar (Tasks 4, 8) and the pages that render checkboxes (Tasks 5, 8) consume this.

- [x] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/lib/use-bulk-selection.spec.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBulkSelection } from './use-bulk-selection';

describe('useBulkSelection', () => {
  it('toggles individual ids and reports allSelected only when every visible id is selected', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b']));

    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.toggle('a'));
    expect(result.current.selectedIds).toEqual(['a']);
    expect(result.current.allSelected).toBe(false);
    act(() => result.current.toggle('b'));
    expect(result.current.allSelected).toBe(true);
  });

  it('toggleAll selects everything then clears on the next call', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b']));

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.sort()).toEqual(['a', 'b']);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  it('drops a previously selected id once it leaves the current page (pagination/search change)', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useBulkSelection(ids),
      { initialProps: { ids: ['a', 'b'] } },
    );

    act(() => result.current.toggle('a'));
    expect(result.current.selectedIds).toEqual(['a']);

    rerender({ ids: ['c', 'd'] });
    expect(result.current.selectedIds).toEqual([]);
  });

  it('drop removes only the given ids, keeping the rest selected', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b', 'c']));

    act(() => result.current.toggleAll());
    act(() => result.current.drop(['b']));
    expect(result.current.selectedIds.sort()).toEqual(['a', 'c']);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- use-bulk-selection`
Expected: FAIL with "Cannot find module './use-bulk-selection'"

- [x] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/lib/use-bulk-selection.ts
import { useEffect, useState } from 'react';

export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.includes(id)));
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === ids.length ? new Set() : new Set(ids),
    );
  }

  function clear() {
    setSelected(new Set());
  }

  function drop(idsToDrop: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of idsToDrop) next.delete(id);
      return next;
    });
  }

  return {
    selectedIds: [...selected],
    isSelected: (id: string) => selected.has(id),
    allSelected: ids.length > 0 && selected.size === ids.length,
    toggle,
    toggleAll,
    clear,
    drop,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- use-bulk-selection`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/use-bulk-selection.ts apps/frontend/src/lib/use-bulk-selection.spec.ts
git commit -m "feat: add shared useBulkSelection hook"
```

---

### Task 3: Shared `BulkConfirmDialog` + `BatchItemResult` type

**Files:**
- Create: `apps/frontend/src/lib/batch-types.ts`
- Create: `apps/frontend/src/components/bulk-confirm-dialog.tsx`
- Test: `apps/frontend/src/components/bulk-confirm-dialog.spec.tsx`

**Context:** Mirrors the backend's `BatchItemResult<T>` (`common/batch/run-batch.ts`) so the two stay in lockstep. `BulkConfirmDialog` is a controlled `Dialog` (no built-in trigger — the caller's own bulk-action-bar button sets `open`) reusing the exact `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` primitives already used by `WriteOffDialog` (`features/receivables/components/write-off-dialog.tsx`) and `SplitMatchDialog` (`features/exceptions/components/split-match-dialog.tsx`, which is also a controlled dialog with external `open`/`onOpenChange` — the same pattern this component follows).

**Interfaces:**
- Produces: `BatchItemResult<T> { id: string; status: 'success' | 'error'; data?: T; errorCode?: string; message?: string }` (Tasks 4, 6, 7, 8 use this as the batch mutation return type) and `<BulkConfirmDialog open onOpenChange title description confirmLabel confirmVariant? isPending onConfirm />` (Tasks 5, 6, 7).

- [x] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/bulk-confirm-dialog.spec.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkConfirmDialog } from './bulk-confirm-dialog';

describe('BulkConfirmDialog', () => {
  it('calls onConfirm when the confirm button is clicked and shows the pending label while pending', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <BulkConfirmDialog
        open
        onOpenChange={() => {}}
        title="Xóa nợ 3 khoản phải thu"
        description="Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending={false}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Xóa nợ 3 khoản phải thu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa nợ' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <BulkConfirmDialog
        open
        onOpenChange={() => {}}
        title="Xóa nợ 3 khoản phải thu"
        description="Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('Đang xử lý…')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- bulk-confirm-dialog`
Expected: FAIL with "Cannot find module './bulk-confirm-dialog'"

- [x] **Step 3: Write the shared type**

```typescript
// apps/frontend/src/lib/batch-types.ts
export interface BatchItemResult<T> {
  id: string;
  status: 'success' | 'error';
  data?: T;
  errorCode?: string;
  message?: string;
}

export function summarizeBatchResults<T>(
  results: BatchItemResult<T>[],
): { succeeded: string[]; failed: string[] } {
  return {
    succeeded: results.filter((r) => r.status === 'success').map((r) => r.id),
    failed: results.filter((r) => r.status === 'error').map((r) => r.id),
  };
}
```

- [x] **Step 4: Write minimal implementation**

```tsx
// apps/frontend/src/components/bulk-confirm-dialog.tsx
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function BulkConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'default',
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <div className="flex justify-end gap-2">
          <Button
            variant={confirmVariant}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? 'Đang xử lý…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- bulk-confirm-dialog`
Expected: PASS (1 test)

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/batch-types.ts apps/frontend/src/components/bulk-confirm-dialog.tsx apps/frontend/src/components/bulk-confirm-dialog.spec.tsx
git commit -m "feat: add shared BulkConfirmDialog and BatchItemResult type"
```

---

### Task 4: Exceptions batch API + hooks (skip, mark-prepaid, approve-match)

**Files:**
- Create: `apps/frontend/src/features/exceptions/constants.ts`
- Modify: `apps/frontend/src/features/exceptions/api/exceptions-api.ts`
- Modify: `apps/frontend/src/features/exceptions/api/use-exceptions.ts`
- Test: `apps/frontend/src/features/exceptions/api/use-exceptions.spec.ts`

**Context:** `postWithIdempotency<T>(url, data?, headers?)` (`@/lib/api-client.ts`) already generates its own `Idempotency-Key` via `crypto.randomUUID()` — reused unchanged, matching every existing mutation in this file. Backend request/response shapes are defined in the backend plan (Tasks 3–5): `batch-skip` takes `{ ids }`, `batch-mark-prepaid` takes `{ bankTransactionIds, customerId }`, `batch-match` takes `{ items: [{ bankTransactionId, allocations, version }] }`, all three return `{ results: BatchItemResult<T>[] }`.

**Interfaces:**
- Consumes: `postWithIdempotency` (existing), `BatchItemResult` (Task 3), `BankTransaction` (existing, `../types.ts`).
- Produces: `BULK_APPROVE_THRESHOLD = 80`; `batchSkip`, `batchMarkPrepaid`, `batchApproveMatch` API functions; `useBatchSkip`, `useBatchMarkPrepaid`, `useBatchApproveMatch` hooks — Tasks 5 and 6 (the bulk action bar) call these hooks.

- [x] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/exceptions/api/use-exceptions.spec.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBatchMarkPrepaid, useBatchSkip } from './use-exceptions';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useBatchSkip', () => {
  it('posts the selected ids to batch-skip', async () => {
    apiRequest.mockResolvedValue({ results: [] });
    const { result } = renderHook(() => useBatchSkip(), { wrapper });

    result.current.mutate(['tx-1', 'tx-2']);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-skip',
          method: 'POST',
          data: { ids: ['tx-1', 'tx-2'] },
        }),
      ),
    );
  });
});

describe('useBatchMarkPrepaid', () => {
  it('posts bankTransactionIds and one shared customerId to batch-mark-prepaid', async () => {
    apiRequest.mockResolvedValue({ results: [] });
    const { result } = renderHook(() => useBatchMarkPrepaid(), { wrapper });

    result.current.mutate({ ids: ['tx-1'], customerId: 'cust-1' });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-mark-prepaid',
          method: 'POST',
          data: { bankTransactionIds: ['tx-1'], customerId: 'cust-1' },
        }),
      ),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- use-exceptions`
Expected: FAIL — `useBatchSkip`/`useBatchMarkPrepaid` not exported from `./use-exceptions`

- [x] **Step 3: Write the constants file**

```typescript
// apps/frontend/src/features/exceptions/constants.ts
export const BULK_APPROVE_THRESHOLD = 80;
```

- [x] **Step 4: Add the API functions**

Modify `apps/frontend/src/features/exceptions/api/exceptions-api.ts` — add at the end of the file:

```typescript
import type { BatchItemResult } from '@/lib/batch-types';

export function batchSkip(
  ids: string[],
): Promise<{ results: BatchItemResult<BankTransaction>[] }> {
  return postWithIdempotency('/api/v1/bank-transactions/batch-skip', { ids });
}

export function batchMarkPrepaid(
  bankTransactionIds: string[],
  customerId: string,
): Promise<{ results: BatchItemResult<{ transaction: BankTransaction }>[] }> {
  return postWithIdempotency('/api/v1/bank-transactions/batch-mark-prepaid', {
    bankTransactionIds,
    customerId,
  });
}

export interface BatchMatchItemInput {
  bankTransactionId: string;
  allocations: Array<{ receivableId: string; amount: number }>;
  version: number;
}

export function batchApproveMatch(
  items: BatchMatchItemInput[],
): Promise<{ results: BatchItemResult<BankTransaction>[] }> {
  return postWithIdempotency('/api/v1/bank-transactions/batch-match', {
    items,
  });
}
```

Note: `BankTransaction` is already imported at the top of this file via `import type { MatchingCandidate, PendingReviewItem } from '../types';` — extend that import to also bring in `BankTransaction`.

- [x] **Step 5: Widen `useExceptionMutation`'s generic to preserve the resolved type**

`useExceptionMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>, ...)` currently erases the mutation's resolved value to `unknown` — every existing caller (`useSkipTransaction`, `useMarkPrepaid`, `useSplitMatch`) only ever used `onSuccess: () => ...` at the call site and never read the resolved value, so this went unnoticed. The new batch hooks need `data.results` at the call site (Task 5), which will not type-check against `unknown`. Add a second generic parameter that defaults to `unknown` so every existing call site keeps compiling unchanged while new callers get their real type back.

Modify `apps/frontend/src/features/exceptions/api/use-exceptions.ts`:

```typescript
// before
function useExceptionMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  onError?: (error: unknown) => void,
) {

// after
function useExceptionMutation<TInput, TResult = unknown>(
  mutationFn: (input: TInput) => Promise<TResult>,
  onError?: (error: unknown) => void,
) {
```

- [x] **Step 6: Add the batch API-calling hooks**

Modify `apps/frontend/src/features/exceptions/api/use-exceptions.ts` — add to the imports and at the end of the file:

```typescript
// extend the existing import from './exceptions-api'
  batchApproveMatch,
  batchMarkPrepaid,
  batchSkip,
  type BatchMatchItemInput,

// add at the end of the file
export function useBatchSkip() {
  return useExceptionMutation<string[]>(batchSkip);
}

export function useBatchMarkPrepaid() {
  return useExceptionMutation<{ ids: string[]; customerId: string }>(
    ({ ids, customerId }) => batchMarkPrepaid(ids, customerId),
  );
}

export function useBatchApproveMatch() {
  return useExceptionMutation<BatchMatchItemInput[]>(batchApproveMatch);
}
```

- [x] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- use-exceptions`
Expected: PASS (2 tests)

- [x] **Step 8: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [x] **Step 9: Commit**

```bash
git add apps/frontend/src/features/exceptions/constants.ts apps/frontend/src/features/exceptions/api
git commit -m "feat: add exceptions batch API functions and hooks"
```

---

### Task 5: Exceptions bulk action bar — Skip + Ghi nhận công nợ

**Files:**
- Create: `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx`
- Test: `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx`

**Context:** "Ghi nhận công nợ" (mark prepaid) reuses the exact customer-search-then-`Select` pattern from `SplitMatchDialog` (`useCustomers(search, 1, enabled)`, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`). One shared customer applies to every selected transaction (grilling decision, `CONTEXT.md` §Batch Operations). "Bỏ qua" fires immediately (no confirm, per Global Constraints); "Ghi nhận công nợ" is itself the confirm step (the dialog's own submit button is the one required confirmation — no second nested dialog). "Khớp giao dịch được gợi ý" is built in Task 6, in the same file, to avoid a second near-identical component.

**Interfaces:**
- Consumes: `useBatchSkip`, `useBatchMarkPrepaid` (Task 4), `summarizeBatchResults` (Task 3), `useCustomers` (existing, `@/features/customers/api/use-customers`), `hasPermission` (existing, `@/lib/rbac`).
- Produces: `<ExceptionsBulkActionBar selectedIds onResult />` — Task 8's page wiring renders this.

- [x] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsBulkActionBar } from './exceptions-bulk-action-bar';
import type { PendingReviewItem } from '../types';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

function renderBar(items: PendingReviewItem[], onResult = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExceptionsBulkActionBar
        items={items}
        selectedIds={items.map((item) => item.transaction.id)}
        onResult={onResult}
      />
    </QueryClientProvider>,
  );
}

describe('ExceptionsBulkActionBar', () => {
  it('skips the selected transactions immediately with no confirmation dialog', async () => {
    apiRequest.mockResolvedValue({
      results: [{ id: 'tx-1', status: 'success' }],
    });
    renderBar([
      {
        transaction: {
          id: 'tx-1',
          providerTransactionId: 'TX-1',
          amount: 10_000,
          transactionDateTime: '2026-08-01',
          counterpartyAccountNumber: '001',
          counterpartyName: 'A',
          transferContent: 'note',
          status: 'PENDING_REVIEW',
          version: 1,
        },
        topCandidate: null,
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-skip',
          data: { ids: ['tx-1'] },
        }),
      ),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- exceptions-bulk-action-bar`
Expected: FAIL with "Cannot find module './exceptions-bulk-action-bar'"

- [x] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx
import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { useCustomers } from '@/features/customers/api/use-customers';
import type { BatchItemResult } from '@/lib/batch-types';
import { summarizeBatchResults } from '@/lib/batch-types';
import { hasPermission } from '@/lib/rbac';
import {
  useBatchMarkPrepaid,
  useBatchSkip,
} from '../api/use-exceptions';
import type { BankTransaction, PendingReviewItem } from '../types';

function reportResults(
  entity: string,
  results: BatchItemResult<unknown>[],
  onResult: (succeeded: string[], failed: string[]) => void,
) {
  const { succeeded, failed } = summarizeBatchResults(results);
  if (failed.length === 0) {
    toast.success(`Đã xử lý ${succeeded.length}/${results.length} ${entity}.`);
  } else {
    toast.error(
      `${succeeded.length}/${results.length} ${entity} thành công, ${failed.length} lỗi.`,
    );
  }
  onResult(succeeded, failed);
}

export function ExceptionsBulkActionBar({
  items,
  selectedIds,
  onResult,
}: {
  items: PendingReviewItem[];
  selectedIds: string[];
  onResult: (succeeded: string[], failed: string[]) => void;
}) {
  const { user } = useAuth();
  const skip = useBatchSkip();
  const markPrepaid = useBatchMarkPrepaid();
  const [prepaidOpen, setPrepaidOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const { data: customerPage } = useCustomers(
    customerSearch,
    1,
    prepaidOpen && customerSearch.trim().length > 0,
  );

  if (!hasPermission(user?.role ?? null, Permission.PAYMENT_ALLOCATE)) {
    return null;
  }
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="text-sm font-medium">Đã chọn {selectedIds.length}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={skip.isPending}
        onClick={() =>
          skip.mutate(selectedIds, {
            onSuccess: (data: { results: BatchItemResult<BankTransaction>[] }) =>
              reportResults('giao dịch', data.results, onResult),
          })
        }
      >
        Bỏ qua
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPrepaidOpen(true)}
      >
        Ghi nhận công nợ
      </Button>

      <Dialog open={prepaidOpen} onOpenChange={setPrepaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ghi nhận công nợ hàng loạt cho {selectedIds.length} giao dịch
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Chọn 1 khách hàng áp dụng cho tất cả giao dịch đã chọn.
          </DialogDescription>
          <label htmlFor="bulk-prepaid-customer-search" className="block text-sm">
            Tìm khách hàng
            <Input
              id="bulk-prepaid-customer-search"
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setCustomerId('');
              }}
              placeholder="Tên khách hàng, mã số thuế hoặc số điện thoại"
            />
          </label>
          {customerPage && customerPage.items.length > 0 && (
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger
                aria-label="Khách hàng để ghi nhận công nợ"
                className="w-full"
              >
                <SelectValue placeholder="Chọn khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customerPage.items.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={!customerId || markPrepaid.isPending}
              onClick={() =>
                markPrepaid.mutate(
                  { ids: selectedIds, customerId },
                  {
                    onSuccess: (data: {
                      results: BatchItemResult<unknown>[];
                    }) => {
                      reportResults('giao dịch', data.results, onResult);
                      setPrepaidOpen(false);
                      setCustomerSearch('');
                      setCustomerId('');
                    },
                  },
                )
              }
            >
              {markPrepaid.isPending
                ? 'Đang xử lý…'
                : 'Xác nhận ghi nhận công nợ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- exceptions-bulk-action-bar`
Expected: PASS (1 test)

- [x] **Step 5: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx
git commit -m "feat: add Skip and Ghi nhận công nợ to exceptions bulk action bar"
```

---

### Task 6: Exceptions bulk action bar — Khớp giao dịch được gợi ý (approve match)

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx`

**Context:** Grilling decisions (`CONTEXT.md` §Batch Operations): a row is eligible only when `topCandidate !== null && topCandidate.totalScore >= BULK_APPROVE_THRESHOLD` (80); the allocation sent is the **full transaction amount** against `topCandidate.receivableId` — the backend rejects the individual item with `ALLOCATION_EXCEEDS_REMAINING` if that's too much, it is not computed client-side. Uses the shared `BulkConfirmDialog` (Task 3) since this is a real payment allocation and needs the strongest confirmation of the four actions (grilling Q17).

**Interfaces:**
- Consumes: `useBatchApproveMatch` (Task 4), `BulkConfirmDialog` (Task 3), `BULK_APPROVE_THRESHOLD` (Task 4), `formatVND` (existing, `@/lib/format`).

- [x] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx`:

```tsx
it('only enables approve-match for rows at or above the confidence threshold, and confirms before sending', async () => {
  apiRequest.mockResolvedValue({
    results: [{ id: 'tx-high', status: 'success' }],
  });
  const highConfidence = {
    transaction: {
      id: 'tx-high',
      providerTransactionId: 'TX-HIGH',
      amount: 20_000,
      transactionDateTime: '2026-08-01',
      counterpartyAccountNumber: '001',
      counterpartyName: 'A',
      transferContent: 'note',
      status: 'PENDING_REVIEW',
      version: 1,
    },
    topCandidate: {
      id: 'cand-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      referenceCodeScore: 50,
      amountScore: 20,
      customerBankAccountScore: 10,
      payerNameScore: 0,
      timingScore: 0,
      totalScore: 80,
      createdAt: '2026-08-01',
    },
  };
  const lowConfidence = {
    transaction: {
      id: 'tx-low',
      providerTransactionId: 'TX-LOW',
      amount: 5_000,
      transactionDateTime: '2026-08-01',
      counterpartyAccountNumber: '002',
      counterpartyName: 'B',
      transferContent: 'note',
      status: 'PENDING_REVIEW',
      version: 1,
    },
    topCandidate: {
      id: 'cand-2',
      receivableId: 'rec-2',
      customerId: 'cust-2',
      referenceCodeScore: 30,
      amountScore: 10,
      customerBankAccountScore: 0,
      payerNameScore: 0,
      timingScore: 0,
      totalScore: 40,
      createdAt: '2026-08-01',
    },
  };
  renderBar([highConfidence, lowConfidence]);

  const approveButton = screen.getByRole('button', {
    name: /Khớp giao dịch được gợi ý \(1\)/,
  });
  fireEvent.click(approveButton);
  fireEvent.click(
    screen.getByRole('button', { name: 'Xác nhận khớp giao dịch' }),
  );

  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/bank-transactions/batch-match',
        data: {
          items: [
            {
              bankTransactionId: 'tx-high',
              allocations: [{ receivableId: 'rec-1', amount: 20_000 }],
              version: 1,
            },
          ],
        },
      }),
    ),
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- exceptions-bulk-action-bar`
Expected: FAIL — no button named "Khớp giao dịch được gợi ý (1)" exists yet

- [x] **Step 3: Extend the implementation**

Modify `apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx`:

```typescript
// add to imports
import { BulkConfirmDialog } from '@/components/bulk-confirm-dialog';
import { formatVND } from '@/lib/format';
import { useBatchApproveMatch } from '../api/use-exceptions';
import { BULK_APPROVE_THRESHOLD } from '../constants';

// inside ExceptionsBulkActionBar, alongside the other hooks/state
  const approveMatch = useBatchApproveMatch();
  const [approveOpen, setApproveOpen] = useState(false);

  const selectedItems = items.filter((item) =>
    selectedIds.includes(item.transaction.id),
  );
  const approvableItems = selectedItems.filter(
    (item) =>
      item.topCandidate &&
      item.topCandidate.totalScore >= BULK_APPROVE_THRESHOLD,
  );
  const approveTotal = approvableItems.reduce(
    (sum, item) => sum + item.transaction.amount,
    0,
  );

// add a new button, after the "Ghi nhận công nợ" button
      <Button
        variant="outline"
        size="sm"
        disabled={approvableItems.length === 0}
        onClick={() => setApproveOpen(true)}
      >
        Khớp giao dịch được gợi ý ({approvableItems.length})
      </Button>

// add after the closing </Dialog> for prepaid, still inside the wrapping <div>
      <BulkConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Khớp giao dịch được gợi ý cho ${approvableItems.length} giao dịch`}
        description={`Tổng số tiền sẽ được phân bổ: ${formatVND(approveTotal)}. Chỉ áp dụng cho giao dịch có gợi ý khớp với độ tin cậy ≥ ${BULK_APPROVE_THRESHOLD}/100.`}
        confirmLabel="Xác nhận khớp giao dịch"
        isPending={approveMatch.isPending}
        onConfirm={() =>
          approveMatch.mutate(
            approvableItems.map((item) => ({
              bankTransactionId: item.transaction.id,
              allocations: [
                {
                  receivableId: (
                    item.topCandidate as NonNullable<typeof item.topCandidate>
                  ).receivableId,
                  amount: item.transaction.amount,
                },
              ],
              version: item.transaction.version,
            })),
            {
              onSuccess: (data: {
                results: BatchItemResult<BankTransaction>[];
              }) => {
                reportResults('giao dịch', data.results, onResult);
                setApproveOpen(false);
              },
            },
          )
        }
      />
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- exceptions-bulk-action-bar`
Expected: PASS (2 tests)

- [x] **Step 5: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.tsx apps/frontend/src/features/exceptions/components/exceptions-bulk-action-bar.spec.tsx
git commit -m "feat: add Khớp giao dịch được gợi ý to exceptions bulk action bar"
```

---

### Task 7: Receivables batch API + hooks + bulk action bar

**Files:**
- Modify: `apps/frontend/src/features/receivables/api/receivables-api.ts`
- Modify: `apps/frontend/src/features/receivables/api/use-receivables.ts`
- Create: `apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.tsx`
- Test: `apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.spec.tsx`

**Context:** Mirrors Task 5's shape but simpler — both `batch-write-off` and `batch-cancel` take a plain `{ ids }`, matching Task 6/7 of the backend plan, and both need a `BulkConfirmDialog` (grilling decision — both are confirm-gated).

**Interfaces:**
- Consumes: `postWithIdempotency` (existing), `BatchItemResult`/`summarizeBatchResults` (Task 3), `BulkConfirmDialog` (Task 3), `hasPermission` (existing).
- Produces: `batchWriteOffReceivables`, `batchCancelReceivables` API functions; `useBatchWriteOffReceivables`, `useBatchCancelReceivables` hooks; `<ReceivablesBulkActionBar selectedIds onResult />` — Task 8's page wiring renders this.

- [x] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivablesBulkActionBar } from './receivables-bulk-action-bar';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

function renderBar(onResult = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReceivablesBulkActionBar
        selectedIds={['rec-1', 'rec-2']}
        onResult={onResult}
      />
    </QueryClientProvider>,
  );
}

describe('ReceivablesBulkActionBar', () => {
  it('confirms before sending a bulk write-off', async () => {
    apiRequest.mockResolvedValue({
      results: [
        { id: 'rec-1', status: 'success' },
        { id: 'rec-2', status: 'success' },
      ],
    });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa nợ' }));
    expect(
      screen.getByText('Xóa nợ 2 khoản phải thu'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Xác nhận xóa nợ' }),
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/batch-write-off',
          data: { ids: ['rec-1', 'rec-2'] },
        }),
      ),
    );
  });

  it('confirms before sending a bulk cancel', async () => {
    apiRequest.mockResolvedValue({
      results: [
        { id: 'rec-1', status: 'success' },
        { id: 'rec-2', status: 'success' },
      ],
    });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/batch-cancel',
          data: { ids: ['rec-1', 'rec-2'] },
        }),
      ),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- receivables-bulk-action-bar`
Expected: FAIL with "Cannot find module './receivables-bulk-action-bar'"

- [x] **Step 3: Add the API functions**

Modify `apps/frontend/src/features/receivables/api/receivables-api.ts` — add at the end of the file:

```typescript
import type { BatchItemResult } from '@/lib/batch-types';

export function batchWriteOffReceivables(
  ids: string[],
): Promise<{ results: BatchItemResult<Receivable>[] }> {
  return postWithIdempotency('/api/v1/receivables/batch-write-off', { ids });
}

export function batchCancelReceivables(
  ids: string[],
): Promise<{ results: BatchItemResult<Receivable>[] }> {
  return postWithIdempotency('/api/v1/receivables/batch-cancel', { ids });
}
```

- [x] **Step 4: Widen `useReceivableMutation`'s generic to preserve the resolved type**

Same issue as Task 4 Step 5 for `useExceptionMutation`: `useReceivableMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>)` currently erases the resolved value to `unknown`. `useCreateReceivable`/`useWriteOffReceivable`/`useCancelReceivable` never read the resolved value at their call sites, so this went unnoticed — the new batch hooks need `data.results`.

Modify `apps/frontend/src/features/receivables/api/use-receivables.ts`:

```typescript
// before
function useReceivableMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
) {

// after
function useReceivableMutation<TInput, TResult = unknown>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
```

- [x] **Step 5: Add the batch API-calling hooks**

Modify `apps/frontend/src/features/receivables/api/use-receivables.ts`:

```typescript
// extend the existing import from './receivables-api'
  batchCancelReceivables,
  batchWriteOffReceivables,

// add at the end of the file
export function useBatchWriteOffReceivables() {
  return useReceivableMutation<string[]>(batchWriteOffReceivables);
}

export function useBatchCancelReceivables() {
  return useReceivableMutation<string[]>(batchCancelReceivables);
}
```

Note: `useReceivableMutation`'s existing `onSuccess` does `if (typeof input === 'string')` to invalidate the single-receivable cache key — an array input skips that branch harmlessly and still invalidates the `['receivables']` list, which is all the bulk case needs.

- [x] **Step 6: Write the bulk action bar**

```tsx
// apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.tsx
import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { BulkConfirmDialog } from '@/components/bulk-confirm-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { summarizeBatchResults } from '@/lib/batch-types';
import type { BatchItemResult } from '@/lib/batch-types';
import { hasPermission } from '@/lib/rbac';
import {
  useBatchCancelReceivables,
  useBatchWriteOffReceivables,
} from '../api/use-receivables';
import type { Receivable } from '../types';

export function ReceivablesBulkActionBar({
  selectedIds,
  onResult,
}: {
  selectedIds: string[];
  onResult: (succeeded: string[], failed: string[]) => void;
}) {
  const { user } = useAuth();
  const writeOff = useBatchWriteOffReceivables();
  const cancel = useBatchCancelReceivables();
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE_OFF)) {
    return null;
  }
  if (selectedIds.length === 0) return null;

  function report(results: BatchItemResult<Receivable>[]) {
    const { succeeded, failed } = summarizeBatchResults(results);
    if (failed.length === 0) {
      toast.success(
        `Đã xử lý ${succeeded.length}/${results.length} khoản phải thu.`,
      );
    } else {
      toast.error(
        `${succeeded.length}/${results.length} thành công, ${failed.length} lỗi.`,
      );
    }
    onResult(succeeded, failed);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="text-sm font-medium">Đã chọn {selectedIds.length}</span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setWriteOffOpen(true)}
      >
        Xóa nợ
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
        Hủy
      </Button>

      <BulkConfirmDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        title={`Xóa nợ ${selectedIds.length} khoản phải thu`}
        description="Chấp nhận mất phần còn lại của các khoản phải thu đã chọn. Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending={writeOff.isPending}
        onConfirm={() =>
          writeOff.mutate(selectedIds, {
            onSuccess: (data: { results: BatchItemResult<Receivable>[] }) => {
              report(data.results);
              setWriteOffOpen(false);
            },
          })
        }
      />
      <BulkConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy ${selectedIds.length} khoản phải thu`}
        description="Chỉ áp dụng cho các khoản chưa có thanh toán nào."
        confirmLabel="Xác nhận hủy"
        confirmVariant="destructive"
        isPending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(selectedIds, {
            onSuccess: (data: { results: BatchItemResult<Receivable>[] }) => {
              report(data.results);
              setCancelOpen(false);
            },
          })
        }
      />
    </div>
  );
}
```

- [x] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- receivables-bulk-action-bar`
Expected: PASS (2 tests)

- [x] **Step 8: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [x] **Step 9: Commit**

```bash
git add apps/frontend/src/features/receivables/api apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.tsx apps/frontend/src/features/receivables/components/receivables-bulk-action-bar.spec.tsx
git commit -m "feat: add receivables batch API, hooks, and bulk action bar"
```

---

### Task 8: Wire checkboxes and bulk action bars into both pages

**Files:**
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivables-page.tsx`
- Test: `apps/frontend/src/features/receivables/components/receivable-table.spec.tsx`

**Context:** Only `OPEN`/`PARTIALLY_PAID` receivables are write-off/cancel-eligible per the state machine (`CONTEXT.md` §Receivable State Machine — `PAID`/`WRITTEN_OFF`/`CANCELLED` are terminal, `DRAFT` has no write-off/cancel use case). `ReceivableTable` gets a checkbox column gated on that status check; `ExceptionsPage`'s inline table (it has no separate table component) gets the same treatment directly. Both pages' `useBulkSelection` is driven by the *eligible* ids on the current page, not every rendered row, so `toggleAll`/`allSelected` never silently includes a row that has no valid bulk action.

- [ ] **Step 1: Write the failing test for `ReceivableTable`**

```tsx
// apps/frontend/src/features/receivables/components/receivable-table.spec.tsx
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ReceivableTable } from './receivable-table';
import type { Receivable } from '../types';

function buildReceivable(overrides: Partial<Receivable>): Receivable {
  return {
    id: 'rec-1',
    customerId: 'cust-1',
    customerName: 'Customer',
    invoiceId: null,
    invoiceNumber: 'INV-1',
    originalAmount: 100_000,
    paidAmount: 0,
    remainingAmount: 100_000,
    dueDate: '2026-09-01',
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    isOverdue: false,
    isDisputed: false,
    createdAt: '2026-08-01',
    closedAt: null,
    ...overrides,
  } as Receivable;
}

describe('ReceivableTable', () => {
  it('enables the checkbox only for OPEN/PARTIALLY_PAID rows', () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <ReceivableTable
          receivables={[
            buildReceivable({ id: 'rec-open', status: ReceivableStatus.OPEN }),
            buildReceivable({ id: 'rec-paid', status: ReceivableStatus.PAID }),
          ]}
          selectedIds={[]}
          onToggle={onToggle}
          onToggleAll={vi.fn()}
          allSelected={false}
        />
      </MemoryRouter>,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // first checkbox is "select all" in the header; row checkboxes follow
    expect(checkboxes[1]).not.toBeDisabled();
    expect(checkboxes[2]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- receivable-table`
Expected: FAIL — `ReceivableTable` does not accept `selectedIds`/`onToggle`/`onToggleAll`/`allSelected` yet, no checkboxes rendered

- [ ] **Step 3: Add checkboxes to `ReceivableTable`**

Modify `apps/frontend/src/features/receivables/components/receivable-table.tsx`:

```tsx
// add to imports
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Checkbox } from '@/components/ui/checkbox';

// change the export signature
export function ReceivableTable({
  receivables,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
}: {
  receivables: Receivable[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}) {
  function isBulkEligible(status: Receivable['status']): boolean {
    return (
      status === ReceivableStatus.OPEN ||
      status === ReceivableStatus.PARTIALLY_PAID
    );
  }

  // ...(keep the existing empty-state early return unchanged)

  // in the <TableHeader><TableRow>, add as the first <TableHead>:
          <TableHead className="w-10">
            <Checkbox
              aria-label="Chọn tất cả"
              checked={allSelected}
              onCheckedChange={onToggleAll}
            />
          </TableHead>

  // in the <TableBody> map, add as the first <TableCell> of each row:
            <TableCell>
              <Checkbox
                aria-label={`Chọn ${receivable.invoiceNumber ?? receivable.id}`}
                checked={selectedIds.includes(receivable.id)}
                disabled={!isBulkEligible(receivable.status)}
                onCheckedChange={() => onToggle(receivable.id)}
              />
            </TableCell>
```

- [ ] **Step 4: Run the `ReceivableTable` test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- receivable-table`
Expected: PASS (1 test)

- [ ] **Step 5: Wire `receivables-page.tsx`**

Modify `apps/frontend/src/features/receivables/pages/receivables-page.tsx`:

```typescript
// add to imports
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { useBulkSelection } from '@/lib/use-bulk-selection';
import { ReceivablesBulkActionBar } from '../components/receivables-bulk-action-bar';

// inside ReceivablesPage, after `const { data, isPending, isError } = useReceivables(...)`
  const eligibleIds = (data?.items ?? [])
    .filter(
      (r) =>
        r.status === ReceivableStatus.OPEN ||
        r.status === ReceivableStatus.PARTIALLY_PAID,
    )
    .map((r) => r.id);
  const bulkSelection = useBulkSelection(eligibleIds);

// replace `{data && <ReceivableTable receivables={data.items} />}` with:
      {data && (
        <ReceivableTable
          receivables={data.items}
          selectedIds={bulkSelection.selectedIds}
          onToggle={bulkSelection.toggle}
          onToggleAll={bulkSelection.toggleAll}
          allSelected={bulkSelection.allSelected}
        />
      )}
      <ReceivablesBulkActionBar
        selectedIds={bulkSelection.selectedIds}
        onResult={(succeeded) => bulkSelection.drop(succeeded)}
      />
```

- [ ] **Step 6: Write the failing test for `ExceptionsPage`**

Add to `apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx`:

```tsx
it('renders a checkbox per row and shows the bulk action bar once a row is selected', async () => {
  apiRequest.mockResolvedValue({
    items: [
      {
        transaction: {
          id: 'tx-1',
          providerTransactionId: 'TX-1',
          amount: 10_000,
          transactionDateTime: '2026-08-01',
          counterpartyAccountNumber: '001',
          counterpartyName: 'A',
          transferContent: 'note',
          status: 'PENDING_REVIEW',
          version: 1,
        },
        topCandidate: null,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ExceptionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const rowCheckbox = (await screen.findAllByRole('checkbox'))[1];
  fireEvent.click(rowCheckbox);

  expect(await screen.findByText('Đã chọn 1')).toBeInTheDocument();
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- exceptions-page`
Expected: FAIL — no checkboxes rendered, "Đã chọn 1" never appears

- [ ] **Step 8: Wire `exceptions-page.tsx`**

Modify `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`:

```typescript
// add to imports
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkSelection } from '@/lib/use-bulk-selection';
import { ExceptionsBulkActionBar } from '../components/exceptions-bulk-action-bar';

// inside ExceptionsPage, after `const { data, isPending, isError } = usePendingReview(...)`
  const bulkSelection = useBulkSelection(
    (data?.items ?? []).map((item) => item.transaction.id),
  );

// in the <TableHeader><TableRow>, add as the first <TableHead>:
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Chọn tất cả"
                  checked={bulkSelection.allSelected}
                  onCheckedChange={bulkSelection.toggleAll}
                />
              </TableHead>

// in the row map, add as the first <TableCell> — stop the row's own onClick from
// also firing when the checkbox is clicked, since the row opens SplitMatchDialog:
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`Chọn giao dịch ${row.transaction.providerTransactionId}`}
                    checked={bulkSelection.isSelected(row.transaction.id)}
                    onCheckedChange={() =>
                      bulkSelection.toggle(row.transaction.id)
                    }
                  />
                </TableCell>

// after the closing </Table>, before the pagination controls
      {data && (
        <ExceptionsBulkActionBar
          items={data.items}
          selectedIds={bulkSelection.selectedIds}
          onResult={(succeeded) => bulkSelection.drop(succeeded)}
        />
      )}
```

- [ ] **Step 9: Run all frontend tests to verify they pass**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS, full suite green

- [ ] **Step 10: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no type errors

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/features/exceptions/pages apps/frontend/src/features/receivables/components/receivable-table.tsx apps/frontend/src/features/receivables/components/receivable-table.spec.tsx apps/frontend/src/features/receivables/pages/receivables-page.tsx
git commit -m "feat: wire bulk selection checkboxes and action bars into Exceptions and Receivables pages"
```

---

## Self-Review Notes

- **Spec coverage:** Row selection + bulk action bar on both pages (Task 8). Skip/Ghi nhận công nợ/Khớp giao dịch được gợi ý on Exceptions (Tasks 5–6). Xóa nợ/Hủy on Receivables (Task 7). Confidence gate `BULK_APPROVE_THRESHOLD = 80` (Task 4, enforced in Task 6). Select-all scoped to current page (Task 2, `useBulkSelection` keyed off the page's own id list). Confirm dialogs for every action except Skip (Tasks 5–7). Toast summary + failed-rows-stay-selected (Task 3's `summarizeBatchResults` + every bulk action bar's `report`/`reportResults` + `onResult` → `bulkSelection.drop(succeeded)` in Task 8).
- **Not in this plan:** the backend endpoints themselves (separate plan, `docs/superpowers/plans/2026-08-14-batch-operations-backend.md` — this plan assumes those 5 endpoints exist and match the request/response shapes documented there).
- **Sequencing:** this plan depends on the backend plan being implemented first (or in parallel, if the mock-based unit tests are enough to develop against) — the batch-match/batch-skip/etc. endpoints must exist for Task 8's real usage (not its unit tests, which mock `@/lib/api-client`) to work end-to-end.
