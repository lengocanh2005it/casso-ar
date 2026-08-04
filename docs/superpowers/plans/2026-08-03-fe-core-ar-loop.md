# FE Core AR Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 core business pages of `apps/frontend` on top of FE plan 1 (`2026-08-03-fe-auth-app-shell.md`): Khách hàng (list + detail route), Công nợ (list + detail route + import + write-off/cancel/dispute actions), Giao dịch/Đối soát (matching workspace), Exception Queue (review + split match) — wired to the BE endpoints from the domain-core, webhook-matching, exception-queue, dispute-management, internal-task-escalation, collection-activity-timeline, and invoice-import plans.

**Architecture:** Page pattern: `Page + Table/CardList + Filters + DetailSheet + ActionDialog`, all data via TanStack Query hooks. Receivable/Customer detail are **routes** (`/receivables/:id`, `/customers/:id` — grill decision Q7); BankTransaction detail is a **sheet**. Money formatting via `lib/format.ts` from FE plan 1; RBAC via `hasPermission` (hide, never disable — grill decision Q4).

**Tech Stack:** React 19, TanStack Query, React Router 7, shadcn/ui (add `dialog`, `select`, `table`, `badge`, `tabs`, `textarea`, `input` primitives via shadcn CLI in Task 0), vitest + testing-library, `qrcode.react` not needed here (Cas ID flow is in FE plan 3).

## Global Constraints

- Root scripts: `pnpm --filter @casso-ledger/frontend test`, `type-check`, `lint` (Biome).
- All page components live under `src/features/<name>/`; only components used by 2+ features move to `src/components/` (scaffolding spec mục 3 — rule of two).
- Money: integer đồng; format via `formatVND` (FE plan 1). Never format with raw `toLocaleString` in pages.
- Rollup/derived financial fields (`paidAmount`, `remainingAmount`, `isOverdue`, `isDisputed`) come from the BE response — FE never recomputes them (domain-core spec mục 3).
- `hasPermission(role, permission)` from `lib/rbac.ts` (FE plan 1) gates every mutating button; missing permission → button not rendered.
- Read contracts are owned by `2026-08-03-read-apis-completion.md`: `GET /customers` and `GET /customers/:id/timeline`. Exception Queue uses `GET /bank-transactions/unmatched` and `GET /bank-transactions/pending-review-count`; do not add a query-string alias.
- API types shared via `@casso-ledger/shared-types` where they exist (`ReceivableStatus`); feature-local DTO types live in `src/features/<name>/types.ts` until shared-types grows.
- No new UI libraries beyond shadcn primitives (ponytail).
- `apiRequest` receives backend URLs with `/api/v1` exactly once; the unprefixed paths shown in React Router routes and feature labels are frontend routes only.

---

## File Structure

```
apps/frontend/src/
  components/ui/                       -- shadcn CLI primitives (Task 0): dialog, select, table, badge, tabs, textarea, input, label, alert-dialog, separator
  components/receivable-status-badge.tsx   -- CREATE: status → badge (shared by list, detail, sheets)
  features/customers/
    types.ts                           -- Customer, CustomerTimelineItem
    api/customers-api.ts               -- GET /customers, GET /customers/:id/timeline (Read APIs plan)
    api/use-customers.ts               -- hooks
    customers-page.tsx                 -- list (replace placeholder)
    customer-detail-page.tsx           -- route /customers/:id
    components/customer-table.tsx
    components/customer-timeline.tsx
  features/receivables/
    types.ts                           -- Receivable, ReceivableTimelineItem, ReceivableActivityInput
    api/receivables-api.ts             -- GET /receivables, GET /receivables/:id, POST /receivables, POST /receivables/:id/write-off, POST /receivables/:id/cancel, GET /receivables/:id/timeline, POST /receivables/:id/activities, POST /receivables/:id/disputes, POST /disputes/:id/resolve, POST /invoices/import
    api/use-receivables.ts             -- hooks (list, detail, mutations)
    receivables-page.tsx               -- route /receivables (replace placeholder)
    receivable-detail-page.tsx         -- route /receivables/:id
    components/receivable-table.tsx
    components/receivable-filters.tsx
    components/create-receivable-dialog.tsx
    components/write-off-dialog.tsx
    components/cancel-dialog.tsx
    components/dispute-dialog.tsx
    components/import-invoices-dialog.tsx
    components/receivable-timeline.tsx
    components/receivable-payments.tsx
    components/receivable-tasks.tsx
  features/transactions/
    types.ts                           -- BankTransaction, MatchingCandidate
    api/transactions-api.ts            -- GET /bank-transactions/unmatched, GET /bank-transactions/:id/candidates, POST /bank-transactions/:id/match
    api/use-transactions.ts            -- hooks
    transactions-page.tsx              -- route /transactions (replace placeholder)
    components/transaction-table.tsx
    components/transaction-detail-sheet.tsx
    components/match-dialog.tsx
  features/exceptions/
    types.ts                           -- PendingReviewItem ({ transaction, topCandidate })
    api/exceptions-api.ts              -- GET /bank-transactions/unmatched, GET /bank-transactions/:id/candidates, POST /bank-transactions/:id/match, POST /bank-transactions/:id/skip, POST /bank-transactions/:id/mark-prepaid
    api/use-exceptions.ts              -- hooks (reuses use-review-count from design-system plan for the badge)
    exceptions-page.tsx                -- route /exceptions (replace placeholder)
    components/split-match-dialog.tsx  -- multi-receivable allocation with optimistic-lock version
  test/receivables-page.spec.tsx       -- list renders + write-off hidden for VIEWER
  test/split-match-dialog.spec.tsx     -- split math + version conflict
  test/transactions-sheet.spec.tsx     -- score display + match action
```

---

### Task 0: Add shadcn/ui primitives

**Files:**
- Create: `apps/frontend/src/components/ui/{dialog,select,table,badge,tabs,textarea,input,label,alert-dialog,separator}.tsx` via the shadcn CLI (same pattern the design-system plan used for `button`/`sheet`)

**Interfaces:**
- Consumes: shadcn config from design-system plan (`components.json`, style "new-york", neutral)
- Produces: primitives used by every dialog/sheet/table in this plan — components are copied verbatim from the CLI, never hand-edited.

- [ ] **Step 1: Add primitives via CLI**

Run from `apps/frontend`:
```bash
pnpm dlx shadcn@latest add dialog select table badge tabs textarea input label alert-dialog separator card
```
Expected: new files under `src/components/ui/` matching the design-system plan's `button.tsx`/`sheet.tsx` style.

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ui apps/frontend/package.json
git commit -m "feat(frontend): add shadcn ui primitives (dialog, table, select, ...)"
```

---

### Task 1: Shared status badge + feature types

**Files:**
- Create: `apps/frontend/src/components/receivable-status-badge.tsx`
- Create: `apps/frontend/src/features/receivables/types.ts`
- Create: `apps/frontend/src/features/customers/types.ts`
- Create: `apps/frontend/src/features/transactions/types.ts`
- Create: `apps/frontend/src/features/exceptions/types.ts`
- Test: `apps/frontend/test/receivable-status-badge.spec.tsx`

**Interfaces:**
- Produces (exact types consumed by all later tasks):
  - `ReceivableStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'WRITTEN_OFF' | 'CANCELLED'` (alias of `ReceivableStatus` from shared-types)
  - `PaymentAllocation { id; paymentId; allocatedAmount: number; allocatedAt: string; allocatedByUserId: string | null }`
  - `Receivable { id; customerId; invoiceId: string | null; invoiceNumber?: string; originalAmount: number; paidAmount: number; remainingAmount: number; dueDate: string; status: ReceivableStatus; isDisputed: boolean; disputeId: string | null; isOverdue: boolean; salesRepresentativeId: string | null; createdAt: string; allocations?: PaymentAllocation[] }` (`allocations` chỉ có trong response `GET /receivables/:id`, không có ở list; `isDisputed`/`disputeId` do Read APIs trả về)
  - `Customer { id; name; taxCode: string | null; email: string | null; phone: string | null; defaultPaymentTermDays: number; creditLimit: number | null; priority: 'HIGH' | 'MEDIUM' | 'LOW' | null; createdAt: string }`
  - `BankTransaction { id; bankConnectionId: string; providerTransactionId: string; amount: number; transactionDateTime: string; counterpartyAccountNumber: string | null; counterpartyName: string | null; transferContent: string | null; status: 'UNMATCHED' | 'PENDING_REVIEW' | 'MATCHED' | 'IGNORED'; version: number }`
  - `MatchingCandidate { id; bankTransactionId; receivableId; customerId: string; referenceCodeScore: number; amountScore: number; customerBankAccountScore: number; payerNameScore: number; timingScore: number; totalScore: number }`
  - `PendingReviewItem = { transaction: BankTransaction; topCandidate: MatchingCandidate | null }`
  - `<ReceivableStatusBadge status>` — renders colored badge: DRAFT gray, OPEN blue, PARTIALLY_PAID amber, PAID green, WRITTEN_OFF red, CANCELLED muted.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/receivable-status-badge.spec.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';

describe('ReceivableStatusBadge', () => {
  it('labels each status in Vietnamese', () => {
    render(<ReceivableStatusBadge status="PARTIALLY_PAID" />);
    expect(screen.getByText('Đã trả một phần')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-status-badge.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/components/receivable-status-badge.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import type { ReceivableStatus } from '@/features/receivables/types';

const LABELS: Record<ReceivableStatus, string> = {
  DRAFT: 'Nháp', OPEN: 'Công nợ', PARTIALLY_PAID: 'Đã trả một phần', PAID: 'Đã trả đủ',
  WRITTEN_OFF: 'Xóa nợ', CANCELLED: 'Hủy',
};
const STYLES: Record<ReceivableStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground', OPEN: 'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700', PAID: 'bg-green-100 text-green-700',
  WRITTEN_OFF: 'bg-red-100 text-red-700', CANCELLED: 'bg-muted text-muted-foreground',
};

export function ReceivableStatusBadge({ status }: { status: ReceivableStatus }) {
  return <Badge className={STYLES[status]}>{LABELS[status]}</Badge>;
}
```

- [ ] **Step 4: Create the four types files** — copy the shapes from the "Interfaces" block above into `features/{receivables,customers,transactions,exceptions}/types.ts`. For `ReceivableStatus`, re-export the shared-types value if present (`import type { ReceivableStatus } from '@casso-ledger/shared-types'`) plus the DTO fields; otherwise define the union locally.

- [ ] **Step 5: Run test + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-status-badge.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/receivable-status-badge.tsx apps/frontend/src/features apps/frontend/test/receivable-status-badge.spec.tsx
git commit -m "feat(frontend): status badge + core feature types"
```

---

### Task 2: Customers list + detail route

**Files:**
- Create: `apps/frontend/src/features/customers/api/customers-api.ts`
- Create: `apps/frontend/src/features/customers/api/use-customers.ts`
- Create: `apps/frontend/src/features/customers/components/customer-table.tsx`
- Create: `apps/frontend/src/features/customers/components/customer-timeline.tsx`
- Replace: `apps/frontend/src/features/customers/customers-page.tsx`
- Create: `apps/frontend/src/features/customers/customer-detail-page.tsx`
- Modify: `apps/frontend/src/routes/index.tsx` (add `/customers/:id`)
- Test: `apps/frontend/test/customers-page.spec.tsx`

**Interfaces:**
- Consumes: `apiRequest` (FE plan 1 Task 1), TanStack Query, `formatVND`/`formatDate`
- Produces:
  - `useCustomers(search: string, page: number)` → `{ items: Customer[]; total: number; page: number; limit: number }`
  - `useCustomerTimeline(customerId)` → `CustomerTimelineItem[]` where `CustomerTimelineItem { id; receivableId; activityType; description; metadata; createdByUserId; createdAt }`
  - `CustomersPage` (route `/customers`), `CustomerDetailPage` (route `/customers/:id`)

> **Read contract:** `GET /customers?search=&page=&limit=` → `{ items: Customer[], total: number, page: number, limit: number }`, paginated, `search` matches name/taxCode/phone. The endpoint and customer timeline contract are owned by `2026-08-03-read-apis-completion.md`; a 404 is an actual error, not an expected placeholder state.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/customers-page.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CustomersPage } from '@/features/customers/customers-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' }, isLoading: false, isAuthenticated: true }) }));

const customers = [{ id: 'c1', name: 'Công ty B', taxCode: '0100', email: null, phone: null, defaultPaymentTermDays: 30, creditLimit: null, priority: 'HIGH', createdAt: '2026-08-01' }];

describe('CustomersPage', () => {
  it('renders a customer row with outstanding-amount placeholder and link to detail', async () => {
    apiRequest.mockResolvedValue({ items: customers, total: 1, page: 1, limit: 20 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Công ty B')).toBeTruthy());
    expect(screen.getByRole('link', { name: /công ty b/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/customers-page.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/customers/api/customers-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { Customer, CustomerTimelineItem } from '@/features/customers/types';

export interface CustomerPage { items: Customer[]; total: number; page: number; limit: number }

export function fetchCustomers(search: string, page: number): Promise<CustomerPage | null> {
  return apiRequest<CustomerPage>({ url: '/api/v1/customers', method: 'GET', params: { search, page, limit: 20 } });
}

export function fetchCustomerTimeline(customerId: string): Promise<CustomerTimelineItem[] | null> {
  return apiRequest<CustomerTimelineItem[]>({ url: `/api/v1/customers/${customerId}/timeline`, method: 'GET' });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/customers/api/use-customers.ts`**

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCustomers, fetchCustomerTimeline } from './customers-api';

export function useCustomers(search = '', page = 1) {
  return useQuery({ queryKey: ['customers', search, page], queryFn: () => fetchCustomers(search, page) });
}

export function useCustomerTimeline(customerId: string) {
  return useQuery({ queryKey: ['customer-timeline', customerId], queryFn: () => fetchCustomerTimeline(customerId) });
}

export function useInvalidateCustomers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['customers'] });
}
```

- [ ] **Step 5: Create `apps/frontend/src/features/customers/components/customer-table.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { Customer } from '@/features/customers/types';

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên khách hàng</TableHead><TableHead>MST</TableHead>
          <TableHead>Hạn thanh toán (ngày)</TableHead><TableHead>Ngày tạo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => (
          <TableRow key={c.id}>
            <TableCell><Link to={`/customers/${c.id}`} className="text-primary hover:underline">{c.name}</Link></TableCell>
            <TableCell>{c.taxCode ?? '—'}</TableCell>
            <TableCell>{c.defaultPaymentTermDays}</TableCell>
            <TableCell>{formatDate(c.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Replace `apps/frontend/src/features/customers/customers-page.tsx`**

```tsx
import { useState } from 'react';
import { useCustomers } from './api/use-customers';
import { CustomerTable } from './components/customer-table';
import { Input } from '@/components/ui/input';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data, isPending, isError } = useCustomers(search);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Khách hàng</h1>
      <Input placeholder="Tìm theo tên, MST, số điện thoại…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {isPending && <p>Đang tải…</p>}
      {isError && <p className="text-destructive">Không tải được danh sách khách hàng.</p>}
      {data && <CustomerTable customers={data.items} />}
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/frontend/src/features/customers/customer-detail-page.tsx`**

```tsx
import { useParams, Link } from 'react-router-dom';
import { useCustomerTimeline } from './api/use-customers';
import { CustomerTimeline } from './components/customer-timeline';
import { formatDate } from '@/lib/format';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: timeline } = useCustomerTimeline(id ?? '');
  return (
    <div className="space-y-6 p-6">
      <Link to="/customers" className="text-sm text-primary">← Khách hàng</Link>
      <h1 className="text-2xl font-semibold">Chi tiết khách hàng</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Danh sách công nợ</h2>
          <p className="text-sm text-muted-foreground">Chuyển hướng từ trang Công nợ với filter customerId (task 3).</p>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Hoạt động</h2>
          {timeline && <CustomerTimeline items={timeline} />}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create `apps/frontend/src/features/customers/components/customer-timeline.tsx`**

```tsx
import { formatDate } from '@/lib/format';
import type { CustomerTimelineItem } from '@/features/customers/types';

export function CustomerTimeline({ items }: { items: CustomerTimelineItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id} className="text-sm">
          <span className="text-muted-foreground">{formatDate(i.createdAt)}</span> — {i.description}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: Register `/customers/:id` in `routes/index.tsx`**

Add: `<Route path="customers/:id" element={<CustomerDetailPage />} />` inside the `AppLayout` parent route block (import from `@/features/customers/customer-detail-page`).

- [ ] **Step 10: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/customers-page.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/features/customers apps/frontend/src/routes/index.tsx apps/frontend/test/customers-page.spec.tsx
git commit -m "feat(frontend): customers list + detail route"
```

---

### Task 3: Receivables list page

**Files:**
- Create: `apps/frontend/src/features/receivables/api/receivables-api.ts`
- Create: `apps/frontend/src/features/receivables/api/use-receivables.ts`
- Create: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Create: `apps/frontend/src/features/receivables/components/receivable-filters.tsx`
- Replace: `apps/frontend/src/features/receivables/receivables-page.tsx`
- Test: `apps/frontend/test/receivables-page.spec.tsx`

**Interfaces:**
- Consumes: `ReceivableStatusBadge`, `formatVND`/`formatDate`, `hasPermission`, `Permission`
- Produces:
  - `useReceivables(filters: ReceivableFilters, page: number)` → `{ items: Receivable[]; total: number }`; `ReceivableFilters { status?: ReceivableStatus | 'OVERDUE'; customerId?: string; search?: string }`
  - `useCreateReceivable()`, `useWriteOffReceivable()`, `useCancelReceivable()`, `useImportInvoices()` (mutations, used by dialogs in Tasks 4–6)
  - `ReceivablesPage` (route `/receivables`) with: filters row, "Tạo công nợ" button (needs `RECEIVABLE_WRITE`), "Import hóa đơn" button (needs `RECEIVABLE_WRITE`), table, pagination.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/receivables-page.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReceivablesPage } from '@/features/receivables/receivables-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'VIEWER' }, isLoading: false, isAuthenticated: true }) }));

const rec = { id: 'r1', customerId: 'c1', invoiceId: null, originalAmount: 50_000_000, paidAmount: 30_000_000, remainingAmount: 20_000_000, dueDate: '2026-08-20', status: 'PARTIALLY_PAID', isDisputed: false, disputeId: null, isOverdue: true, salesRepresentativeId: null, createdAt: '2026-07-01' };

describe('ReceivablesPage', () => {
  it('renders rows with formatted amounts and hides mutating buttons for VIEWER', async () => {
    apiRequest.mockResolvedValue({ items: [rec], total: 1 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><ReceivablesPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('20.000.000 ₫')).toBeTruthy());
    expect(screen.queryByText(/tạo công nợ/i)).toBeNull();
    expect(screen.queryByText(/import hóa đơn/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/receivables-page.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/receivables/api/receivables-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { Receivable } from '@/features/receivables/types';

export interface ReceivableFilters { status?: string; customerId?: string; search?: string }
export interface ReceivablePage { items: Receivable[]; total: number }

export function fetchReceivables(filters: ReceivableFilters, page: number) {
  return apiRequest<ReceivablePage>({ url: '/api/v1/receivables', method: 'GET', params: { ...filters, page, limit: 20 } });
}

export function fetchReceivable(id: string) {
  return apiRequest<Receivable>({ url: `/api/v1/receivables/${id}`, method: 'GET' });
}

export function createReceivable(input: { customerId: string; invoiceId?: string; originalAmount: number; dueDate: string; salesRepresentativeId?: string | null }) {
  return apiRequest<Receivable>({ url: '/api/v1/receivables', method: 'POST', data: input });
}

export function writeOffReceivable(id: string) {
  return apiRequest<Receivable>({ url: `/api/v1/receivables/${id}/write-off`, method: 'POST' });
}

export function cancelReceivable(id: string) {
  return apiRequest<Receivable>({ url: `/api/v1/receivables/${id}/cancel`, method: 'POST' });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/receivables/api/use-receivables.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cancelReceivable, createReceivable, fetchReceivable, fetchReceivables, writeOffReceivable, type ReceivableFilters } from './receivables-api';

export function useReceivables(filters: ReceivableFilters, page = 1) {
  return useQuery({ queryKey: ['receivables', filters, page], queryFn: () => fetchReceivables(filters, page) });
}

export function useReceivable(id: string) {
  return useQuery({ queryKey: ['receivable', id], queryFn: () => fetchReceivable(id), enabled: id.length > 0 });
}

export function useCreateReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createReceivable,
    onSuccess: () => { toast.success('Đã tạo công nợ'); qc.invalidateQueries({ queryKey: ['receivables'] }); },
    onError: (e: unknown) => toast.error((e as Error).message ?? 'Tạo công nợ thất bại'),
  });
}

export function useWriteOffReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: writeOffReceivable,
    onSuccess: () => { toast.success('Đã xóa nợ'); qc.invalidateQueries({ queryKey: ['receivables'] }); },
  });
}

export function useCancelReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelReceivable,
    onSuccess: () => { toast.success('Đã hủy công nợ'); qc.invalidateQueries({ queryKey: ['receivables'] }); },
  });
}
```

- [ ] **Step 5: Create `apps/frontend/src/features/receivables/components/receivable-table.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { formatVND, formatDate } from '@/lib/format';
import type { Receivable } from '@/features/receivables/types';

export function ReceivableTable({ items }: { items: Receivable[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã</TableHead><TableHead>Còn lại</TableHead><TableHead>Trạng thái</TableHead>
          <TableHead>Đến hạn</TableHead><TableHead>Tranh chấp</TableHead><TableHead>Quá hạn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((r) => (
          <TableRow key={r.id}>
            <TableCell><Link to={`/receivables/${r.id}`} className="text-primary hover:underline">{r.id}</Link></TableCell>
            <TableCell className="tabular-nums">{formatVND(r.remainingAmount)}</TableCell>
            <TableCell><ReceivableStatusBadge status={r.status} /></TableCell>
            <TableCell>{formatDate(r.dueDate)}</TableCell>
            <TableCell>{r.isDisputed && <Badge variant="destructive">Tranh chấp</Badge>}</TableCell>
            <TableCell>{r.isOverdue && <Badge className="bg-red-100 text-red-700">Quá hạn</Badge>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Replace `apps/frontend/src/features/receivables/receivables-page.tsx`**

```tsx
import { useState } from 'react';
import { Permission } from '@casso-ledger/shared-types';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useReceivables } from './api/use-receivables';
import { ReceivableTable } from './components/receivable-table';
import { ReceivableFilters, type ReceivableFilterValues } from './components/receivable-filters';
import { CreateReceivableDialog } from './components/create-receivable-dialog';
import { ImportInvoicesDialog } from './components/import-invoices-dialog';

export function ReceivablesPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<ReceivableFilterValues>({});
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useReceivables(filters, page);
  const canWrite = hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Công nợ</h1>
        <div className="flex gap-2">
          {canWrite && <ImportInvoicesDialog />}
          {canWrite && <CreateReceivableDialog />}
        </div>
      </div>
      <ReceivableFilters value={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
      {isPending && <p>Đang tải…</p>}
      {isError && <p className="text-destructive">Không tải được danh sách.</p>}
      {data && <ReceivableTable items={data.items} />}
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/frontend/src/features/receivables/components/receivable-filters.tsx`**

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ReceivableFilterValues { status?: string; overdueOnly?: boolean }

export function ReceivableFilters({ value, onChange }: { value: ReceivableFilterValues; onChange: (v: ReceivableFilterValues) => void }) {
  return (
    <div className="flex gap-2">
      <Select value={value.status ?? 'ALL'} onValueChange={(v) => onChange({ ...value, status: v === 'ALL' ? undefined : v })}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
          <SelectItem value="OPEN">OPEN</SelectItem>
          <SelectItem value="PARTIALLY_PAID">PARTIALLY_PAID</SelectItem>
          <SelectItem value="PAID">PAID</SelectItem>
          <SelectItem value="WRITTEN_OFF">WRITTEN_OFF</SelectItem>
          <SelectItem value="CANCELLED">CANCELLED</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/receivables-page.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/receivables apps/frontend/test/receivables-page.spec.tsx
git commit -m "feat(frontend): receivables list page with filters and RBAC-gated actions"
```

---

### Task 4: Create / write-off / cancel dialogs

**Files:**
- Create: `apps/frontend/src/features/receivables/components/create-receivable-dialog.tsx`
- Create: `apps/frontend/src/features/receivables/components/write-off-dialog.tsx`
- Create: `apps/frontend/src/features/receivables/components/cancel-dialog.tsx`
- Test: `apps/frontend/test/receivable-actions.spec.tsx`

**Interfaces:**
- Consumes: `useCreateReceivable`/`useWriteOffReceivable`/`useCancelReceivable` (Task 3)
- Produces: `<CreateReceivableDialog>` (renders the "Tạo công nợ" button + dialog; props: none, opens via internal state), `<WriteOffDialog receivableId>` (button "Xóa nợ" — only rendered when `hasPermission(RECEIVABLE_WRITE_OFF)`), `<CancelDialog receivableId>` (button "Hủy" — `RECEIVABLE_WRITE`; shows warning "chỉ hợp lệ khi chưa có thanh toán nào").

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/receivable-actions.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WriteOffDialog } from '@/features/receivables/components/write-off-dialog';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' } }) }));

describe('WriteOffDialog', () => {
  it('confirms before calling the write-off endpoint', async () => {
    apiRequest.mockResolvedValue({ id: 'r1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><WriteOffDialog receivableId="r1" /></QueryClientProvider>);
    fireEvent.click(screen.getByText('Xóa nợ'));
    await waitFor(() => expect(screen.getByText(/chấp nhận mất phần còn lại/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /xác nhận xóa nợ/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/receivables/r1/write-off', method: 'POST' })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-actions.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/receivables/components/create-receivable-dialog.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateReceivable } from '../api/use-receivables';

export function CreateReceivableDialog() {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const mutation = useCreateReceivable();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Tạo công nợ</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo công nợ</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ customerId, originalAmount: Number(originalAmount), dueDate }, { onSuccess: () => setOpen(false) });
        }}>
          <Label className="block space-y-1">
            <span className="text-sm">ID khách hàng</span>
            <Input required value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="c-123" />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Số tiền (đồng)</span>
            <Input required type="number" min={1} value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} />
          </Label>
          <Label className="block space-y-1">
            <span className="text-sm">Ngày đến hạn</span>
            <Input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Label>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Tạo'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/receivables/components/write-off-dialog.tsx`**

```tsx
import { useState } from 'react';
import { Permission } from '@casso-ledger/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useWriteOffReceivable } from '../api/use-receivables';

export function WriteOffDialog({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const mutation = useWriteOffReceivable();
  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE_OFF)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="destructive">Xóa nợ</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Xóa nợ {receivableId}</DialogTitle></DialogHeader>
        <DialogDescription>Chấp nhận mất phần còn lại của công nợ này. Hành động không thể hoàn tác.</DialogDescription>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate(receivableId, { onSuccess: () => setOpen(false) })}>
          {mutation.isPending ? 'Đang xử lý…' : 'Xác nhận xóa nợ'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `apps/frontend/src/features/receivables/components/cancel-dialog.tsx`**

```tsx
import { useState } from 'react';
import { Permission } from '@casso-ledger/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useCancelReceivable } from '../api/use-receivables';

export function CancelDialog({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const mutation = useCancelReceivable();
  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Hủy</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Hủy công nợ {receivableId}</DialogTitle></DialogHeader>
        <DialogDescription>Chỉ hợp lệ khi chưa có bất kỳ thanh toán nào (paidAmount = 0). Nếu đã có tiền, hãy dùng "Xóa nợ".</DialogDescription>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate(receivableId, { onSuccess: () => setOpen(false) })}>
          {mutation.isPending ? 'Đang xử lý…' : 'Xác nhận hủy'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-actions.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/receivables/components apps/frontend/test/receivable-actions.spec.tsx
git commit -m "feat(frontend): create/write-off/cancel receivable dialogs"
```

---

### Task 5: Receivable detail route (info + payments + timeline + tasks + dispute)

**Files:**
- Create: `apps/frontend/src/features/receivables/receivable-detail-page.tsx`
- Create: `apps/frontend/src/features/receivables/components/receivable-timeline.tsx`
- Create: `apps/frontend/src/features/receivables/components/receivable-payments.tsx`
- Create: `apps/frontend/src/features/receivables/components/receivable-tasks.tsx`
- Create: `apps/frontend/src/features/receivables/components/dispute-dialog.tsx`
- Modify: `apps/frontend/src/features/receivables/api/receivables-api.ts` (add `fetchReceivableTimeline`, `addActivity`, `openDispute`, `resolveDispute`, `fetchTasks`, `createTask`, `resolveTask`)
- Modify: `apps/frontend/src/routes/index.tsx` (add `/receivables/:id`)

**Interfaces:**
- Consumes: `useReceivable(id)` (Task 3), `WriteOffDialog`/`CancelDialog` (Task 4), `ReceivableStatusBadge`
- Produces:
  - `ReceivableDetailPage` at `/receivables/:id` — header (id, badge, isOverdue/isDisputed badges, write-off/cancel buttons), summary cards (`originalAmount`/`paidAmount`/`remainingAmount`), tabs: Thanh toán (`PaymentAllocation` rows), Hoạt động (timeline), Nhiệm vụ (InternalTask), plus `DisputeDialog` in the header.
  - `PaymentAllocation` — defined in Task 1; the tab reads it from `useReceivable(id).data.allocations` (detail response includes it, list response does not)
  - `ReceivableTimelineItem { id; receivableId; activityType; description; metadata; createdByUserId; createdAt }` (from `GET /receivables/:id/timeline`)
  - `InternalTask { id; title; description: string | null; status: 'OPEN' | 'DONE' | 'DISMISSED'; dueDate: string | null; assignedToUserId: string }` (from `GET /receivables/:id/tasks` — internal-task-escalation plan)

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/receivable-detail.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceivableDetailPage } from '@/features/receivables/receivable-detail-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'FINANCE_MANAGER' } }) }));

describe('ReceivableDetailPage', () => {
  it('shows remaining amount and allocations', async () => {
    apiRequest
      .mockResolvedValueOnce({ id: 'r1', customerId: 'c1', invoiceId: null, originalAmount: 50_000_000, paidAmount: 30_000_000, remainingAmount: 20_000_000, dueDate: '2026-08-20', status: 'PARTIALLY_PAID', isDisputed: false, disputeId: null, isOverdue: true, salesRepresentativeId: null, createdAt: '2026-07-01', allocations: [{ id: 'pa1', paymentId: 'p1', allocatedAmount: 30_000_000, allocatedAt: '2026-08-01', allocatedByUserId: null }] })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/receivables/r1']}>
          <Routes><Route path="/receivables/:id" element={<ReceivableDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('20.000.000 ₫')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-detail.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Extend `apps/frontend/src/features/receivables/api/receivables-api.ts`**

```typescript
export function fetchReceivableTimeline(id: string) {
  return apiRequest<ReceivableTimelineItem[]>({ url: `/api/v1/receivables/${id}/timeline`, method: 'GET' });
}
export function addActivity(id: string, input: { activityType: string; description: string }) {
  return apiRequest<{ id: string }>({ url: `/api/v1/receivables/${id}/activities`, method: 'POST', data: input });
}
export function openDispute(id: string, input: { reason: string }) {
  return apiRequest<{ id: string }>({ url: `/api/v1/receivables/${id}/disputes`, method: 'POST', data: input });
}
export function resolveDispute(disputeId: string) {
  return apiRequest<{ id: string }>({ url: `/api/v1/disputes/${disputeId}/resolve`, method: 'POST' });
}
export function fetchTasks(id: string) {
  return apiRequest<InternalTask[]>({ url: `/api/v1/receivables/${id}/tasks`, method: 'GET' });
}
export function createTask(id: string, input: { title: string; description?: string; dueDate?: string; assignedToUserId?: string }) {
  return apiRequest<InternalTask>({ url: `/api/v1/receivables/${id}/tasks`, method: 'POST', data: input });
}
export function resolveTask(taskId: string) {
  return apiRequest<InternalTask>({ url: `/api/v1/tasks/${taskId}/resolve`, method: 'POST' });
}
```

(Add `ReceivableTimelineItem`, `PaymentAllocation`, `InternalTask` types to `features/receivables/types.ts` per the Interfaces block.)

- [ ] **Step 4: Create `apps/frontend/src/features/receivables/receivable-detail-page.tsx`**

```tsx
import { useParams, Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { formatVND, formatDate } from '@/lib/format';
import { useReceivable } from './api/use-receivables';
import { WriteOffDialog } from './components/write-off-dialog';
import { CancelDialog } from './components/cancel-dialog';
import { DisputeDialog } from './components/dispute-dialog';
import { ReceivablePayments } from './components/receivable-payments';
import { ReceivableTimeline } from './components/receivable-timeline';
import { ReceivableTasks } from './components/receivable-tasks';

export function ReceivableDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: r, isPending } = useReceivable(id);

  if (isPending || !r) return <div className="p-6">Đang tải…</div>;
  const terminal = r.status === 'PAID' || r.status === 'WRITTEN_OFF' || r.status === 'CANCELLED';

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/receivables" className="text-sm text-primary">← Công nợ</Link>
          <h1 className="text-2xl font-semibold">{r.id}</h1>
          <ReceivableStatusBadge status={r.status} />
          {r.isDisputed && <Badge variant="destructive">Tranh chấp</Badge>}
          {r.isOverdue && <Badge className="bg-red-100 text-red-700">Quá hạn</Badge>}
        </div>
        {!terminal && (
          <div className="flex gap-2">
            <DisputeDialog receivableId={r.id} isDisputed={r.isDisputed} disputeId={r.disputeId} />
            <CancelDialog receivableId={r.id} />
            <WriteOffDialog receivableId={r.id} />
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Gốc</CardTitle></CardHeader><CardContent className="tabular-nums">{formatVND(r.originalAmount)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Đã trả</CardTitle></CardHeader><CardContent className="tabular-nums">{formatVND(r.paidAmount)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Còn lại</CardTitle></CardHeader><CardContent className="tabular-nums">{formatVND(r.remainingAmount)}</CardContent></Card>
      </div>
      <p className="text-sm text-muted-foreground">Đến hạn: {formatDate(r.dueDate)}</p>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Thanh toán</TabsTrigger>
          <TabsTrigger value="activity">Hoạt động</TabsTrigger>
          <TabsTrigger value="tasks">Nhiệm vụ</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><ReceivablePayments receivableId={r.id} /></TabsContent>
        <TabsContent value="activity"><ReceivableTimeline receivableId={r.id} /></TabsContent>
        <TabsContent value="tasks"><ReceivableTasks receivableId={r.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Create the three tab components** (`receivable-payments.tsx`, `receivable-timeline.tsx`, `receivable-tasks.tsx`) — same pattern as `customer-timeline.tsx` in Task 2. `ReceivablePayments` reads `useReceivable(id).data.allocations ?? []` (NO separate endpoint — allocations come inside `GET /receivables/:id`); rows show `formatVND(allocatedAmount)` + `formatDate(allocatedAt)` + "Tự động khớp" when `allocatedByUserId === null`. `ReceivableTimeline` uses `useQuery(['receivable-timeline', id], () => fetchReceivableTimeline(id))`; `ReceivableTasks` uses `fetchTasks`/`createTask`/`resolveTask` (title + status + "Hoàn thành" button calling `resolveTask`); each list shows a "Chưa có dữ liệu." empty state.

- [ ] **Step 6: Create `apps/frontend/src/features/receivables/components/dispute-dialog.tsx`**

```tsx
import { useState } from 'react';
import { Permission } from '@casso-ledger/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { openDispute, resolveDispute } from '../api/receivables-api';

export function DisputeDialog({ receivableId, isDisputed, disputeId }: { receivableId: string; isDisputed: boolean; disputeId: string | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_DISPUTE)) return null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['receivable', receivableId] });

  const openM = useMutation({
    mutationFn: () => openDispute(receivableId, { reason }),
    onSuccess: () => { toast.success('Đã mở tranh chấp — reminder tạm dừng'); setOpen(false); invalidate(); },
  });
  const resolveM = useMutation({
    mutationFn: () => resolveDispute(disputeId!),
    onSuccess: () => { toast.success('Đã đóng tranh chấp'); invalidate(); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{isDisputed ? 'Đóng tranh chấp' : 'Mở tranh chấp'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isDisputed ? 'Đóng tranh chấp' : 'Mở tranh chấp'}</DialogTitle></DialogHeader>
        {isDisputed ? (
          <Button variant="destructive" onClick={() => resolveM.mutate()}>Xác nhận đóng tranh chấp</Button>
        ) : (
          <div className="space-y-3">
            <Textarea required placeholder="Lý do tranh chấp…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button disabled={!reason || openM.isPending} onClick={() => openM.mutate()}>Xác nhận mở tranh chấp</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

> `resolveDispute` receives `disputeId` from the receivable detail response and calls the BE contract `POST /disputes/:disputeId/resolve`.

- [ ] **Step 7: Register `/receivables/:id` in `routes/index.tsx`** — same pattern as Task 2 Step 9.

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/receivable-detail.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/receivables apps/frontend/src/routes/index.tsx apps/frontend/test/receivable-detail.spec.tsx
git commit -m "feat(frontend): receivable detail route with payments/timeline/tasks/dispute"
```

---

### Task 6: Invoice import dialog (multipart upload + row-level result)

**Files:**
- Create: `apps/frontend/src/features/receivables/components/import-invoices-dialog.tsx`
- Create: `apps/frontend/src/features/receivables/api/import-api.ts`
- Test: `apps/frontend/test/import-invoices-dialog.spec.tsx`

**Interfaces:**
- Consumes: `apiRequest` (with `headers: { 'Content-Type': 'multipart/form-data' }`), `POST /api/v1/invoices/import` (invoice-import plan — accepts `FormData` with field `file`, returns `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }`)
- Produces: `<ImportInvoicesDialog>` — file input (`.xlsx, .csv`), upload button, result view: "Nhập thành công N dòng" + table of failed rows (row number + reason). Only rendered when `hasPermission(RECEIVABLE_WRITE)` (wired in Task 3's page).

- [ ] **Step 1: Create `apps/frontend/src/features/receivables/api/import-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';

export interface ImportRowFailure { rowNumber: number; data: Record<string, unknown>; errors: string[] }
export interface ImportResult { totalRows: number; successCount: number; failedRows: ImportRowFailure[] }

export function importInvoices(file: File): Promise<ImportResult | null> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<ImportResult>({ url: '/api/v1/invoices/import', method: 'POST', data: form });
}
```

- [ ] **Step 2: Create `apps/frontend/src/features/receivables/components/import-invoices-dialog.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { importInvoices, type ImportResult } from '../api/import-api';

export function ImportInvoicesDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const res = await importInvoices(file);
      if (!res) throw new Error('UPLOAD_FAILED');
      setResult(res);
      toast.success(`Nhập ${res.successCount} dòng thành công`);
    } catch {
      toast.error('Nhập file thất bại');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResult(null); setFile(null); } }}>
      <DialogTrigger asChild><Button variant="outline">Import hóa đơn</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Import hóa đơn</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-3">
            <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button onClick={onUpload} disabled={!file || uploading}>{uploading ? 'Đang tải…' : 'Tải lên'}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p>Đã nhập {result.successCount} dòng, {result.failedRows.length} dòng lỗi (bỏ qua, không ảnh hưởng số còn lại).</p>
            {result.failedRows.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Dòng</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader>
                <TableBody>
                  {result.failedRows.map((f) => (
                    <TableRow key={f.rowNumber}><TableCell>{f.rowNumber}</TableCell><TableCell>{f.errors.join('; ')}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write a small component test** (`test/import-invoices-dialog.spec.tsx`) — mock `importInvoices` returning `{ totalRows: 3, successCount: 2, failedRows: [{ rowNumber: 3, data: { customerName: 'Công ty C' }, errors: ['MST trùng'] }] }`, assert the failed-row table renders after clicking upload. Follow the mock pattern of Task 3's test.

- [ ] **Step 4: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/import-invoices-dialog.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/receivables/components/import-invoices-dialog.tsx apps/frontend/src/features/receivables/api/import-api.ts apps/frontend/test/import-invoices-dialog.spec.tsx
git commit -m "feat(frontend): invoice import dialog with row-level error report"
```

---

### Task 7: Transactions / Matching workspace page

**Files:**
- Create: `apps/frontend/src/features/transactions/api/transactions-api.ts`
- Create: `apps/frontend/src/features/transactions/api/use-transactions.ts`
- Create: `apps/frontend/src/features/transactions/components/transaction-table.tsx`
- Create: `apps/frontend/src/features/transactions/components/transaction-detail-sheet.tsx`
- Create: `apps/frontend/src/features/transactions/components/match-dialog.tsx`
- Replace: `apps/frontend/src/features/transactions/transactions-page.tsx`
- Test: `apps/frontend/test/transactions-sheet.spec.tsx`

**Interfaces:**
- Consumes: `formatVND`/`formatDate`, `ReceivableStatusBadge` (candidate display), `hasPermission(PAYMENT_ALLOCATE)` for match actions
- Produces:
  - `useUnmatchedTransactions(page)` → `{ items: { transaction: BankTransaction; topCandidate: MatchingCandidate | null }[]; total: number; page: number; limit: number }` (status `UNMATCHED`)
  - `useCandidates(bankTransactionId)` → `MatchingCandidate[]`
  - `useMatchTransaction()` — `POST /bank-transactions/:id/match` body `{ allocations: [{ receivableId, amount }], version }` (single-receivable here; the split shape is shared with the Exception Queue split dialog in Task 8), gated by `PAYMENT_ALLOCATE`
  - `TransactionsPage`: table of unmatched transactions (amount, counterparty name, time, transfer content snippet) → click row opens `TransactionDetailSheet`
  - `TransactionDetailSheet`: full transfer content, score breakdown (5 rows: referenceCode 0–60, amount 0–20, bank account 0–10, payer name 0–5, timing 0–5, total /100 from `GET /bank-transactions/:id/candidates`), primary candidate highlighted, "Khớp công nợ" button (opens `MatchDialog`).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/transactions-sheet.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TransactionDetailSheet } from '@/features/transactions/components/transaction-detail-sheet';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'ACCOUNTANT' } }) }));

const tx = { id: 'bt1', bankConnectionId: 'bc1', providerTransactionId: 'p1', amount: 30_000_000, transactionDateTime: '2026-08-01T09:00:00Z', counterpartyAccountNumber: '12345', counterpartyName: 'Công ty B', transferContent: 'TT thanh toán INV-2026-0012', status: 'UNMATCHED', version: 1 };
const candidates = [{ id: 'mc1', bankTransactionId: 'bt1', receivableId: 'r1', customerId: 'c1', referenceCodeScore: 60, amountScore: 20, customerBankAccountScore: 10, payerNameScore: 5, timingScore: 5, totalScore: 100 }];

describe('TransactionDetailSheet', () => {
  it('shows the score breakdown and auto-match suggestion', async () => {
    apiRequest.mockResolvedValue(candidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><TransactionDetailSheet tx={tx} open onOpenChange={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('100/100')).toBeTruthy());
    expect(screen.getByText(/đề xuất/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/transactions-sheet.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/transactions/api/transactions-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { BankTransaction, MatchingCandidate } from '@/features/transactions/types';

type UnmatchedTransactionView = { transaction: BankTransaction; topCandidate: MatchingCandidate | null };

export function fetchUnmatchedTransactions(page: number) {
  return apiRequest<{ items: UnmatchedTransactionView[]; total: number; page: number; limit: number }>({ url: '/api/v1/bank-transactions/unmatched', method: 'GET', params: { page, limit: 20 } });
}

export function fetchCandidates(bankTransactionId: string) {
  return apiRequest<MatchingCandidate[]>({ url: `/api/v1/bank-transactions/${bankTransactionId}/candidates`, method: 'GET' });
}

export function matchTransaction(bankTransactionId: string, allocations: { receivableId: string; amount: number }[], version: number) {
  return apiRequest<{ id: string }>({ url: `/api/v1/bank-transactions/${bankTransactionId}/match`, method: 'POST', data: { allocations, version } });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/transactions/api/use-transactions.ts`** — `useUnmatchedTransactions`, `useCandidates`, `useMatchTransaction` following the hook pattern from Task 3 Step 4 (invalidate `['bank-transactions']` after match).

- [ ] **Step 5: Create `apps/frontend/src/features/transactions/components/transaction-table.tsx`** — plain `Table` with columns: Ngày giờ, Đối tác, Nội dung (truncated `transferContent`), Số tiền (right-aligned `formatVND`); row click opens the sheet via callback prop `onSelect(tx)`.

- [ ] **Step 6: Create `apps/frontend/src/features/transactions/components/transaction-detail-sheet.tsx`**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatVND } from '@/lib/format';
import { useCandidates } from '../api/use-transactions';
import { MatchDialog } from './match-dialog';
import type { BankTransaction } from '@/features/transactions/types';

const SCORE_ROWS = [
  ['Mã tham chiếu', 'referenceCodeScore', '/60'],
  ['Số tiền', 'amountScore', '/20'],
  ['Tài khoản ngân hàng', 'customerBankAccountScore', '/10'],
  ['Tên người trả', 'payerNameScore', '/5'],
  ['Thời điểm', 'timingScore', '/5'],
] as const;

export function TransactionDetailSheet({ tx, open, onOpenChange }: { tx: BankTransaction; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: candidates } = useCandidates(open ? tx.id : '');
  const best = candidates?.[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader><SheetTitle>Giao dịch {tx.providerTransactionId}</SheetTitle></SheetHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-3">
            <p className="text-lg font-semibold tabular-nums">{formatVND(tx.amount)}</p>
            <p className="text-sm text-muted-foreground">{tx.counterpartyName ?? '—'} · {tx.counterpartyAccountNumber ?? '—'}</p>
          </div>
          <p className="text-sm"><span className="text-muted-foreground">Nội dung:</span> {tx.transferContent ?? '—'}</p>
          {best && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">Điểm khớp</p>
              {SCORE_ROWS.map(([label, key, max]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums">{best[key]}{max}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Tổng</span><span className="tabular-nums">{best.totalScore}/100</span>
              </div>
              {best.totalScore >= 90 && <p className="mt-2 text-xs text-green-700">Tự động khớp (≥ 90)</p>}
              {best.totalScore >= 60 && best.totalScore < 90 && <p className="mt-2 text-xs text-amber-700">Chờ duyệt (60–89)</p>}
            </div>
          )}
          <MatchDialog tx={tx} candidate={best ?? null} onMatched={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 7: Create `apps/frontend/src/features/transactions/components/match-dialog.tsx`** — "Khớp công nợ" button (hidden unless `hasPermission(PAYMENT_ALLOCATE)`); dialog lists the selected receivable with a visible `DialogDescription` starting **"Đề xuất khớp với công nợ {receivableId}…"** (the Task 1 test asserts the text `đề xuất`), editable amount defaulting to `min(amount, remaining)`; confirm calls `useMatchTransaction().mutate({ id: tx.id, allocations: [{ receivableId, amount }], version: tx.version })`.

- [ ] **Step 8: Replace `apps/frontend/src/features/transactions/transactions-page.tsx`**

```tsx
import { useState } from 'react';
import { useUnmatchedTransactions } from './api/use-transactions';
import { TransactionTable } from './components/transaction-table';
import { TransactionDetailSheet } from './components/transaction-detail-sheet';
import type { BankTransaction } from './types';

export function TransactionsPage() {
  const { data, isPending } = useUnmatchedTransactions(1);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Giao dịch / Đối soát</h1>
      {isPending && <p>Đang tải…</p>}
      {data && <TransactionTable transactions={data.items.map((row) => row.transaction)} onSelect={setSelected} />}
      {selected && <TransactionDetailSheet tx={selected} open onOpenChange={(v) => !v && setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 9: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/transactions-sheet.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/transactions apps/frontend/test/transactions-sheet.spec.tsx
git commit -m "feat(frontend): transactions matching workspace with score sheet"
```

---

### Task 8: Exception Queue page + split match dialog

**Files:**
- Create: `apps/frontend/src/features/exceptions/api/exceptions-api.ts`
- Create: `apps/frontend/src/features/exceptions/api/use-exceptions.ts`
- Create: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Replace: `apps/frontend/src/features/exceptions/exceptions-page.tsx`
- Test: `apps/frontend/test/split-match-dialog.spec.tsx`

**Interfaces:**
- Consumes: `use-review-count` (design-system plan — sidebar badge, unchanged), `formatVND`, `hasPermission(PAYMENT_ALLOCATE)`
- Produces:
  - `usePendingReview(page)` → `{ items: PendingReviewItem[]; total: number; page: number; limit: number }` from `GET /bank-transactions/unmatched?page=&limit=` — the Exception Queue plan owns this tenant-scoped list route.
  - `useSplitMatch()` — `POST /bank-transactions/:id/match` with `{ allocations: [{ receivableId, amount }], version }` (multiple rows; `version` = `BankTransaction.version` for optimistic locking — exception-queue plan)
  - `useSkipTransaction()` — `POST /bank-transactions/:id/skip`
  - `useMarkPrepaid()` — `POST /bank-transactions/:id/mark-prepaid` body `{ customerId }` (unapplied customer prepayment / credit balance)
  - `ExceptionsPage`: table (ngày giờ, đối tác, số tiền, top candidate totalScore, actions), row click opens `SplitMatchDialog`
  - `SplitMatchDialog`: candidate list (desc by totalScore, top = 60–89 suggested), amount inputs per selected receivable with running total vs transaction amount, version conflict handling (409 → refresh + toast "Giao dịch đã bị xử lý bởi người khác"), "Bỏ qua" and "Tạm giữ (credit balance)" actions.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/split-match-dialog.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SplitMatchDialog } from '@/features/exceptions/components/split-match-dialog';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'ACCOUNTANT' } }) }));

const tx = { id: 'bt9', bankConnectionId: 'bc1', providerTransactionId: 'p9', amount: 50_000_000, transactionDateTime: '2026-08-02T10:00:00Z', counterpartyAccountNumber: '999', counterpartyName: 'Công ty C', transferContent: 'TT INV-001', status: 'PENDING_REVIEW', version: 1 };
const candidates = [
  { id: 'mc1', bankTransactionId: 'bt9', receivableId: 'r1', customerId: 'c1', referenceCodeScore: 60, amountScore: 10, customerBankAccountScore: 10, payerNameScore: 0, timingScore: 0, totalScore: 80 },
  { id: 'mc2', bankTransactionId: 'bt9', receivableId: 'r2', customerId: 'c1', referenceCodeScore: 30, amountScore: 10, customerBankAccountScore: 10, payerNameScore: 0, timingScore: 0, totalScore: 50 },
];

describe('SplitMatchDialog', () => {
  it('keeps allocation total within the transaction amount and submits both rows', async () => {
    apiRequest.mockResolvedValue(candidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><SplitMatchDialog tx={tx} open onOpenChange={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('80/100')).toBeTruthy());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '30000000' } });
    fireEvent.change(inputs[1], { target: { value: '20000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/v1/bank-transactions/bt9/match',
      method: 'POST',
      data: expect.objectContaining({
        allocations: expect.arrayContaining([
          expect.objectContaining({ receivableId: 'r1', amount: 30_000_000 }),
          expect.objectContaining({ receivableId: 'r2', amount: 20_000_000 }),
        ]),
      }),
    })));
  });

  it('blocks submit when allocation total exceeds the amount', async () => {
    apiRequest.mockResolvedValue(candidates);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><SplitMatchDialog tx={tx} open onOpenChange={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('80/100')).toBeTruthy());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '60000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));
    expect(apiRequest).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/bank-transactions/bt9/match' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/split-match-dialog.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/exceptions/api/exceptions-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { PendingReviewItem } from '@/features/exceptions/types';

export function fetchPendingReview(page: number) {
  return apiRequest<{ items: PendingReviewItem[]; total: number; page: number; limit: number }>({ url: '/api/v1/bank-transactions/unmatched', method: 'GET', params: { page, limit: 20 } });
}

export function splitMatch(bankTransactionId: string, allocations: { receivableId: string; amount: number }[], version: number) {
  return apiRequest<{ id: string }>({ url: `/api/v1/bank-transactions/${bankTransactionId}/match`, method: 'POST', data: { allocations, version } });
}

export function skipTransaction(bankTransactionId: string) {
  return apiRequest<{ id: string }>({ url: `/api/v1/bank-transactions/${bankTransactionId}/skip`, method: 'POST' });
}

export function markPrepaid(bankTransactionId: string, customerId: string) {
  return apiRequest<{ id: string }>({ url: `/api/v1/bank-transactions/${bankTransactionId}/mark-prepaid`, method: 'POST', data: { customerId } });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/exceptions/api/use-exceptions.ts`** — exact mutation signatures (the dialog in Step 5 calls them with these shapes):
  - `useSplitMatch()` — `mutationFn: ({ id, allocations, version }: { id: string; allocations: { receivableId: string; amount: number }[]; version: number }) => splitMatch(id, allocations, version)`; onError: if `(e as { status?: number }).status === 409` → toast "Giao dịch đã bị xử lý bởi người khác, tải lại danh sách"
  - `useSkipTransaction()` — `mutationFn: (id: string) => skipTransaction(id)`
  - `useMarkPrepaid()` — `mutationFn: ({ id, customerId }: { id: string; customerId: string }) => markPrepaid(id, customerId)`
  - All invalidate `['bank-transactions']` + `['review-count']` on success (the review-count hook key is `['review-count']` from the design-system plan).

- [ ] **Step 5: Create `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatVND } from '@/lib/format';
import { useCandidates } from '@/features/transactions/api/use-transactions';
import { useMarkPrepaid, useSkipTransaction, useSplitMatch } from '../api/use-exceptions';
import type { BankTransaction } from '@/features/transactions/types';

export function SplitMatchDialog({ tx, open, onOpenChange }: { tx: BankTransaction; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: candidates = [] } = useCandidates(open ? tx.id : '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [prepaidCustomerId, setPrepaidCustomerId] = useState('');
  const splitMatch = useSplitMatch();
  const skip = useSkipTransaction();
  const prepaid = useMarkPrepaid();

  useEffect(() => { if (open) { setAmounts({}); setPrepaidCustomerId(''); } }, [open]);

  const total = useMemo(
    () => Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [amounts],
  );
  const valid = total > 0 && total <= tx.amount;

  const allocations = candidates
    .filter((c) => Number(amounts[c.receivableId]) > 0)
    .map((c) => ({ receivableId: c.receivableId, amount: Number(amounts[c.receivableId]) }));

  function onMatch() {
    if (!valid) {
      toast.error(`Tổng phân bổ ${formatVND(total)} vượt số tiền giao dịch ${formatVND(tx.amount)}`);
      return;
    }
    // ponytail: version=0 mặc định; BE trả 409 nếu lệch → toast + tải lại (use-exceptions xử lý)
    splitMatch.mutate(
      { id: tx.id, allocations, version: (tx as BankTransaction & { version?: number }).version ?? 0 },
      { onSuccess: () => { toast.success('Đã khớp giao dịch'); onOpenChange(false); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Xử lý giao dịch {tx.providerTransactionId} — {formatVND(tx.amount)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{tx.transferContent}</p>
          {candidates.map((c) => (
            <div key={c.receivableId} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="w-16 text-sm font-medium tabular-nums">{c.totalScore}/100</span>
              <span className="flex-1 text-sm">{c.receivableId}</span>
              <Label className="flex items-center gap-2 text-sm">
                Số tiền phân bổ
                <Input type="number" min={0} className="w-40" value={amounts[c.receivableId] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [c.receivableId]: e.target.value }))} />
              </Label>
            </div>
          ))}
          <p className="text-sm">Đã phân bổ: <span className="tabular-nums">{formatVND(total)}</span> / {formatVND(tx.amount)}</p>
          <Label className="block text-sm">Mã khách hàng nhận credit balance<Input value={prepaidCustomerId} onChange={(e) => setPrepaidCustomerId(e.target.value)} placeholder="customerId" /></Label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!prepaidCustomerId} onClick={() => prepaid.mutate({ id: tx.id, customerId: prepaidCustomerId }, { onSuccess: () => { toast.success('Đã giữ làm credit balance'); onOpenChange(false); } })}>Tạm giữ (credit balance)</Button>
            <Button variant="outline" onClick={() => skip.mutate(tx.id, { onSuccess: () => { toast.success('Đã bỏ qua'); onOpenChange(false); } })}>Bỏ qua</Button>
            <Button onClick={onMatch} disabled={!valid || splitMatch.isPending}>Khớp giao dịch</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Replace `apps/frontend/src/features/exceptions/exceptions-page.tsx`**

```tsx
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatVND, formatDate } from '@/lib/format';
import { usePendingReview } from './api/use-exceptions';
import { SplitMatchDialog } from './components/split-match-dialog';
import type { BankTransaction } from '@/features/transactions/types';

export function ExceptionsPage() {
  const { data, isPending, isError } = usePendingReview(1);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Exception Queue</h1>
      {isPending && <p>Đang tải…</p>}
      {isError && <p className="text-destructive">Không tải được danh sách giao dịch cần xử lý.</p>}
      {data && (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Ngày giờ</TableHead><TableHead>Đối tác</TableHead><TableHead>Số tiền</TableHead><TableHead>Điểm cao nhất</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.transaction.id} className="cursor-pointer" onClick={() => setSelected(row.transaction)}>
                <TableCell>{formatDate(row.transaction.transactionDateTime)}</TableCell>
                <TableCell>{row.transaction.counterpartyName ?? '—'}</TableCell>
                <TableCell className="tabular-nums">{formatVND(row.transaction.amount)}</TableCell>
                <TableCell>{row.topCandidate ? <Badge variant="outline">{row.topCandidate.totalScore}/100</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selected && <SplitMatchDialog tx={selected} open onOpenChange={(v) => !v && setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 7: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/split-match-dialog.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/exceptions apps/frontend/test/split-match-dialog.spec.tsx
git commit -m "feat(frontend): exception queue with split multi-receivable match"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire FE suite**

Run from repo root: `pnpm turbo run lint type-check test --filter=@casso-ledger/frontend`
Expected: all tasks pass, no type errors.

- [ ] **Step 2: Manual smoke (optional, requires running BE)** — start BE per its plans, then `pnpm --filter @casso-ledger/frontend dev`, verify: login → dashboard → customers → receivables → create → transactions → exceptions. Document any contract mismatch as a comment on the owning BE plan, not in this plan.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore(frontend): final verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** customers list/detail → Task 2 (FE design spec nav item 2); receivables list/detail + write-off/cancel/dispute/import → Tasks 3–6 (domain-core spec mục 3 transitions: WRITTEN_OFF/CANCELLED gated by `RECEIVABLE_WRITE_OFF`/`RECEIVABLE_WRITE`, terminal-state guard in detail page; dispute → badge + dialog per grill Q5); matching workspace + exception queue → Tasks 7–8 (webhook-matching thresholds 90/60/89 displayed in sheet; exception-queue split + optimistic lock + skip + credit balance; sidebar badge `use-review-count` already exists from design-system plan).
- **Placeholder scan:** all tasks contain concrete code; customer and exception read routes are backed by the Read APIs and Exception Queue plans.
- **Type consistency:** `Receivable`/`BankTransaction`/`MatchingCandidate`/`PendingReviewItem` defined once in Task 1 and used verbatim by later tasks; `allocations: { receivableId, amount }[]` shape shared between `matchTransaction` (Task 7) and `splitMatch` (Task 8); `version` is required because the BE DTO uses optimistic locking.
- **RBAC decisions (grill Q4):** mutating buttons hidden via `hasPermission` — create/import (`RECEIVABLE_WRITE`), write-off (`RECEIVABLE_WRITE_OFF`), dispute (`RECEIVABLE_DISPUTE`), match/exception actions (`PAYMENT_ALLOCATE`). Route-level guard for business routes is `ProtectedRoute` only (no per-route role checks except `/settings` handled in FE plan 3).
- **Read ownership:** `GET /customers` and customer timeline come from Read APIs; Exception Queue owns `/bank-transactions/unmatched` and `/bank-transactions/pending-review-count`. Dispute-id lookup is part of the Read APIs receivable-detail contract.
- **Owned by FE plan 3:** reminders, copilot, reports, settings (billing/users/email templates/bank connections), plan-gated nav.
