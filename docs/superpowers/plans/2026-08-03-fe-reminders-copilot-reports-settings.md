# FE Reminders, Copilot, Reports & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining 5 business pages of `apps/frontend` on top of FE plans 1–2: Lịch nhắc (reminder policies + executions), Copilot (chat + pending-action confirmation), Báo cáo (aging + dashboard summary with recharts), Kết nối ngân hàng (Cas ID QR flow), Cài đặt (Billing static + Users invite + Email templates CRUD/preview) — wired to the BE endpoints from the reminder-automation, collection-copilot, aging-dashboard-reporting, cas-id-bank-connection, email-template-management, authentication-onboarding, and billing-usage-metering plans.

**Architecture:** Page pattern from FE plan 2 (`Page + Table + Dialog`, TanStack Query hooks). Copilot chat UI follows the standard chat layout (message list + input) but with Casso's **pending-action confirmation card** (grill decision Q3: component test for this flow): the model never executes — `POST /api/v1/copilot/actions/:actionId/confirm|cancel` is a pure-code endpoint. Reports use `recharts` (already in the design-system plan deps). Settings is a tabbed page; Billing renders static plan info + handles the 402 upgrade prompt (no read endpoint exists in the BE billing plan — it is write-time gating only).

**Tech Stack:** React 19, TanStack Query, React Router 7, shadcn/ui (primitives from FE plan 2 Task 0: tabs, dialog, table, select, input, label, textarea, badge, alert-dialog), `recharts`, `qrcode.react`, vitest + testing-library.

## Global Constraints

- Root scripts: `pnpm --filter @casso-ledger/frontend test`, `type-check`, `lint`.
- Money: integer đồng via `formatVND` (FE plan 1). `hasPermission` gates all mutating buttons (FE plan 1). `ReceivableStatusBadge`/feature types from FE plan 2 Task 1 are reused — do not redefine.
- **Read contracts:** `GET /api/v1/bank-connections` and `subscriptionPlan` in `GET /api/v1/me` come from `2026-08-03-read-apis-completion.md`; reminder policies/executions, reports, and email-template list shapes come from their owning BE plans. Empty states represent empty data, not an expected missing endpoint.
- Copilot: NO `GET /api/v1/copilot/conversations` exists (BE plan explicitly deferred it) — the chat starts a fresh conversation per session; `POST /api/v1/copilot/conversations/:id/messages` lazily creates the row (BE plan Task 2). The conversation id is generated client-side as `crypto.randomUUID()`.
- Every backend URL in this plan uses the canonical `/api/v1` prefix exactly once; `/health` and `/metrics` are the only process probes outside that prefix.
- 402 handling: any API error with status 402 → sonner toast "Đã hết hạn mức sử dụng gói hiện tại" + offer an upgrade prompt (static dialog, no payment flow — BE billing plan only gates, never charges).
- No new UI libraries (ponytail).

---

## File Structure

```
apps/frontend/src/
  lib/plan.ts                          -- CREATE: PLANS + hasPlanAccess (source: GET /api/v1/me.subscriptionPlan)
  features/reminders/
    types.ts                           -- ReminderPolicy, ReminderRule, ReminderExecution
    api/reminders-api.ts               -- GET/POST /api/v1/reminder-policies, PATCH /api/v1/reminder-policies/:id, GET /api/v1/reminder-executions
    api/use-reminders.ts               -- hooks
    reminders-page.tsx                 -- replace placeholder
    components/policy-table.tsx
    components/policy-dialog.tsx
    components/executions-table.tsx
  features/copilot/
    types.ts                           -- CopilotMessage, CopilotPendingAction
    api/copilot-api.ts                 -- POST /api/v1/copilot/conversations/:id/messages, POST /api/v1/copilot/actions/:actionId/confirm|cancel
    api/use-copilot.ts                 -- hooks
    copilot-page.tsx                   -- replace placeholder
    components/message-list.tsx
    components/pending-action-card.tsx
  features/reports/
    types.ts                           -- AgingReport, DashboardSummary
    api/reports-api.ts                 -- GET /api/v1/reports/aging, GET /api/v1/reports/dashboard-summary
    api/use-reports.ts                 -- hooks
    reports-page.tsx                   -- replace placeholder
    components/aging-table.tsx
    components/aging-chart.tsx
    components/dashboard-summary.tsx
  features/bank-connections/
    types.ts                           -- BankConnection
    api/bank-connections-api.ts        -- GET /api/v1/bank-connections, POST /api/v1/bank-connections/cas-id/initiate, POST /api/v1/bank-connections/cas-id/sessions/:id/exchange, POST /api/v1/bank-connections/:id/disconnect
    api/use-bank-connections.ts        -- hooks
    bank-connections-page.tsx          -- replace placeholder
    components/connect-dialog.tsx      -- QR via qrcode.react
    components/connection-table.tsx
  features/settings/
    settings-page.tsx                  -- replace placeholder: Tabs (Billing / Users / Email templates)
    components/billing-tab.tsx
    components/users-tab.tsx
    components/email-templates-tab.tsx
    components/template-dialog.tsx
    components/template-preview-dialog.tsx
    components/upgrade-dialog.tsx      -- shared 402 upgrade prompt
  test/copilot-flow.spec.tsx           -- pending action confirm/cancel
  test/reports.spec.tsx                -- aging bucket rendering
  test/email-templates.spec.tsx        -- template list + preview
```

---

### Task 1: `lib/plan.ts` — plan gating helper

**Files:**
- Create: `apps/frontend/src/lib/plan.ts`
- Test: `apps/frontend/test/plan.spec.ts`

**Interfaces:**
- Consumes: `useAuth().user.role` (FE plan 1 Task 3)
- Produces: `hasPlanAccess(plan: string | null | undefined, minPlan: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE'): boolean` + `PLAN_RANK: Record<string, number>` — used to lock the Copilot nav item and the Copilot page (grill: show lock icon, don't hide the nav item — FE design spec mục 2 `hasPlanAccess` pattern).

> **Read contract:** `GET /api/v1/me` returns `subscriptionPlan: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE'`; the FE still defaults a missing/unknown value to `FREE`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/plan.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { hasPlanAccess } from '@/lib/plan';

describe('hasPlanAccess', () => {
  it('STARTER+ can access a STARTER-gated feature', () => {
    expect(hasPlanAccess('STARTER', 'STARTER')).toBe(true);
    expect(hasPlanAccess('BUSINESS', 'STARTER')).toBe(true);
  });
  it('FREE cannot access STARTER-gated features', () => {
    expect(hasPlanAccess('FREE', 'STARTER')).toBe(false);
  });
  it('unknown/undefined plan is treated as FREE', () => {
    expect(hasPlanAccess(undefined, 'STARTER')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/plan.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/lib/plan.ts`**

```typescript
export type PlanName = 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';

const PLAN_RANK: Record<string, number> = { FREE: 0, STARTER: 1, BUSINESS: 2, ENTERPRISE: 3 };

export function hasPlanAccess(plan: string | null | undefined, minPlan: PlanName): boolean {
  return (PLAN_RANK[plan ?? 'FREE'] ?? 0) >= PLAN_RANK[minPlan];
}
```

- [ ] **Step 4: Run test + commit**

Run: `pnpm --filter @casso-ledger/frontend test test/plan.spec.ts && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS

```bash
git add apps/frontend/src/lib/plan.ts apps/frontend/test/plan.spec.ts
git commit -m "feat(frontend): plan gating helper"
```

---

### Task 2: Reminders page (policies + executions)

**Files:**
- Create: `apps/frontend/src/features/reminders/types.ts`
- Create: `apps/frontend/src/features/reminders/api/reminders-api.ts`
- Create: `apps/frontend/src/features/reminders/api/use-reminders.ts`
- Create: `apps/frontend/src/features/reminders/components/policy-table.tsx`
- Create: `apps/frontend/src/features/reminders/components/policy-dialog.tsx`
- Create: `apps/frontend/src/features/reminders/components/executions-table.tsx`
- Replace: `apps/frontend/src/features/reminders/reminders-page.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `formatVND`/`formatDate`, `hasPermission(RECEIVABLE_WRITE)` for policy create/edit
- Produces:
  - Types: `ReminderRule { id; offsetDays: number; emailTemplateId: string; minIntervalDays: number }`, `ReminderPolicy { id; customerGroup: 'VIP' | 'REGULAR'; isActive: boolean; rules: ReminderRule[]; createdAt: string }`, `ReminderExecution { id; receivableId; reminderRuleId: string | null; status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'; sentAt: string | null; skipReason: string | null; providerMessageId: string | null }`
  - `useReminderPolicies()` — `GET /api/v1/reminder-policies` → `ReminderPolicy[]` (reminder-automation plan)
  - `useCreateReminderPolicy()`, `useUpdateReminderPolicy()` — `POST /api/v1/reminder-policies`, `PATCH /api/v1/reminder-policies/:id`
  - `useReminderExecutions(filters)` — `GET /api/v1/reminder-executions?receivableId=&status=&page=&limit=` → `{ items: ReminderExecution[]; total: number }`
  - `RemindersPage`: two sections — Policies (table + "Tạo policy" dialog, enable/disable toggle via PATCH) and Executions (table with status badge + date).

- [ ] **Step 1: Create types + API + hooks files** — copy the shapes from the Interfaces block; follow the exact hook pattern from FE plan 2 Task 3 Step 4 (query keys `['reminder-policies']`, `['reminder-executions', filters]`; mutations toast + invalidate).

- [ ] **Step 2: Create `apps/frontend/src/features/reminders/components/policy-dialog.tsx`** — create/edit form: customer group select (`VIP`/`REGULAR`), active switch (`isActive`), rules list (`offsetDays`, `emailTemplateId`, `minIntervalDays` + add/remove row). Save calls the matching mutation. RBAC: dialog button hidden without `RECEIVABLE_WRITE`.

- [ ] **Step 3: Create `apps/frontend/src/features/reminders/components/policy-table.tsx`** — columns: Nhóm khách hàng, Bật/tắt (Switch calling `useUpdateReminderPolicy` PATCH `{ isActive }`), Số rule, Ngày tạo.

- [ ] **Step 4: Create `apps/frontend/src/features/reminders/components/executions-table.tsx`** — columns: Receivable ID, Kênh, Trạng thái (SENT green / FAILED red badge), Thời điểm gửi.

- [ ] **Step 5: Replace `apps/frontend/src/features/reminders/reminders-page.tsx`** — header + policy section (table + "Tạo policy" button) + executions section (receivableId filter input + table).

- [ ] **Step 6: Verify build**

Run: `pnpm --filter @casso-ledger/frontend test && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS (existing suite still green — no new test required for this CRUD page per grill Q3)

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/reminders apps/frontend/src/components/ui apps/frontend/package.json
git commit -m "feat(frontend): reminders policies + executions page"
```

---

### Task 3: Copilot chat page (pending-action confirmation)

**Files:**
- Create: `apps/frontend/src/features/copilot/types.ts`
- Create: `apps/frontend/src/features/copilot/api/copilot-api.ts`
- Create: `apps/frontend/src/features/copilot/api/use-copilot.ts`
- Create: `apps/frontend/src/features/copilot/components/message-list.tsx`
- Create: `apps/frontend/src/features/copilot/components/pending-action-card.tsx`
- Replace: `apps/frontend/src/features/copilot/copilot-page.tsx`
- Test: `apps/frontend/test/copilot-flow.spec.tsx`

**Interfaces:**
- Consumes: `hasPlanAccess` (Task 1) — page shows a lock notice when plan < STARTER; `hasPermission(REMINDER_SEND_MANUAL)` — pending-action card is only rendered for users who can send manual reminders (copilot spec mục 4)
- Produces:
  - Types: `CopilotMessage { id; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string }`, `CopilotPendingAction { id; actionType: 'SEND_REMINDER_EMAIL'; status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'; payload: { draftId: string; receivableId: string }; createdAt: string; resolvedAt: string | null }`; these are copied from the canonical BE DTOs, not ad-hoc FE shapes.
  - `sendCopilotMessage(conversationId, content)` → `POST /api/v1/copilot/conversations/:id/messages` body `{ content }` → `{ message: CopilotMessage; pendingAction: CopilotPendingAction | null }` (the BE runs the tool loop synchronously, ≤15s timeout; when the model proposes `sendReminderEmail` the response carries a pending action instead of sending)
  - `confirmCopilotAction(actionId)` / `cancelCopilotAction(actionId)` → `POST /api/v1/copilot/actions/:actionId/confirm|cancel`; both return `CopilotActionResponse { action: CopilotPendingAction; reminderExecutionId?: string }`
  - `CopilotActionResponse { action: CopilotPendingAction; reminderExecutionId?: string }`; `CopilotPage`: message list + input + "Gửi" (disabled while pending); when `pendingAction` arrives, render `PendingActionCard` (Xác nhận / Hủy) — confirm/cancel never re-enter the LLM loop.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/copilot-flow.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CopilotPage } from '@/features/copilot/copilot-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' } }) }));

describe('CopilotPage', () => {
  it('shows a pending action card and confirms it via the pure-code endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      message: { id: 'm1', role: 'ASSISTANT', content: 'Tôi có thể gửi email nhắc cho công nợ r1.', createdAt: '2026-08-03T00:00:00Z' },
      pendingAction: { id: 'pa1', actionType: 'SEND_REMINDER_EMAIL', status: 'PENDING', payload: { draftId: 'd1', receivableId: 'r1' }, createdAt: '2026-08-03T00:00:00Z', resolvedAt: null },
    });
    apiRequest.mockResolvedValueOnce({ action: { id: 'pa1', actionType: 'SEND_REMINDER_EMAIL', status: 'CONFIRMED', payload: { draftId: 'd1', receivableId: 'r1' }, createdAt: '2026-08-03T00:00:00Z', resolvedAt: '2026-08-03T00:01:00Z' }, reminderExecutionId: 'ex1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CopilotPage /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText(/nhập câu hỏi/i), { target: { value: 'Gửi email nhắc r1' } });
    fireEvent.click(screen.getByRole('button', { name: /gửi/i }));

    await waitFor(() => expect(screen.getByText(/xác nhận gửi email nhắc/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/copilot/actions/pa1/confirm', method: 'POST' })));
    // Toast của sonner không render nếu test không mount <Toaster> — assert thẻ xác nhận đã biến mất
    await waitFor(() => expect(screen.queryByText(/xác nhận gửi email nhắc/i)).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/copilot-flow.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/copilot/api/copilot-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { CopilotMessage, CopilotPendingAction, CopilotActionResponse } from '@/features/copilot/types';

export interface CopilotTurnResult { message: CopilotMessage; pendingAction: CopilotPendingAction | null }

export function sendCopilotMessage(conversationId: string, content: string) {
  return apiRequest<CopilotTurnResult>({ url: `/api/v1/copilot/conversations/${conversationId}/messages`, method: 'POST', data: { content } });
}

export function confirmCopilotAction(actionId: string) {
  return apiRequest<CopilotActionResponse>({ url: `/api/v1/copilot/actions/${actionId}/confirm`, method: 'POST' });
}

export function cancelCopilotAction(actionId: string) {
  return apiRequest<CopilotActionResponse>({ url: `/api/v1/copilot/actions/${actionId}/cancel`, method: 'POST' });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/copilot/api/use-copilot.ts`** — `useCopilotChat()` returning `{ messages, pendingAction, send(content), isSending }`; internal state: `messages: CopilotMessage[]`, one conversation id per page mount (`crypto.randomUUID()`), `send` appends the user message optimistically, calls `sendCopilotMessage`, appends assistant message, sets `pendingAction`; confirm/cancel call the action endpoints and clear `pendingAction` (confirm → toast "Email nhắc đã được gửi").

- [ ] **Step 5: Create `apps/frontend/src/features/copilot/components/pending-action-card.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatVND } from '@/lib/format';

export function PendingActionCard({ action, onConfirm, onCancel, busy }: {
  action: { id: string; payload: { receivableId: string; draftId: string } };
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-amber-300">
      <CardHeader><CardTitle className="text-sm">Xác nhận gửi email nhắc</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Công nợ: {action.payload.receivableId}</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onConfirm}>Xác nhận</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Hủy</Button>
        </div>
        <p className="text-xs text-muted-foreground">Hành động sẽ hết hạn sau 10 phút nếu không xác nhận.</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Create `apps/frontend/src/features/copilot/components/message-list.tsx`** — plain scrollable list; user messages right-aligned (`bg-primary text-primary-foreground` bubble), assistant messages left-aligned; empty state "Hỏi về công nợ, lịch sử thanh toán…".

- [ ] **Step 7: Replace `apps/frontend/src/features/copilot/copilot-page.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan';
import { useCopilotChat } from './api/use-copilot';
import { MessageList } from './components/message-list';
import { PendingActionCard } from './components/pending-action-card';

export function CopilotPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const { messages, pendingAction, isSending, send, confirm, cancel, busy } = useCopilotChat();

  if (!hasPlanAccess(user?.subscriptionPlan, 'STARTER')) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Copilot yêu cầu gói Starter trở lên.</p>
      </div>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;
    setDraft('');
    void send(content);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col p-6">
      <h1 className="mb-4 text-2xl font-semibold">Copilot</h1>
      <div className="flex-1 overflow-y-auto space-y-3 rounded-lg border p-4">
        <MessageList messages={messages} />
        {pendingAction && (
          <PendingActionCard action={pendingAction} busy={busy} onConfirm={confirm} onCancel={cancel} />
        )}
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input aria-label="Nhập câu hỏi" placeholder="Hỏi về công nợ…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={isSending} />
        <Button type="submit" disabled={isSending || !draft.trim()}>{isSending ? 'Đang suy nghĩ…' : 'Gửi'}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/copilot-flow.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/copilot apps/frontend/test/copilot-flow.spec.tsx
git commit -m "feat(frontend): copilot chat with pending-action confirmation"
```

---

### Task 4: Reports page (aging + dashboard summary)

**Files:**
- Create: `apps/frontend/src/features/reports/types.ts`
- Create: `apps/frontend/src/features/reports/api/reports-api.ts`
- Create: `apps/frontend/src/features/reports/api/use-reports.ts`
- Create: `apps/frontend/src/features/reports/components/dashboard-summary.tsx`
- Create: `apps/frontend/src/features/reports/components/aging-table.tsx`
- Create: `apps/frontend/src/features/reports/components/aging-chart.tsx`
- Replace: `apps/frontend/src/features/reports/reports-page.tsx`
- Test: `apps/frontend/test/reports.spec.tsx`

**Interfaces:**
- Consumes: `formatVND`, `recharts` (installed in design-system plan)
- Produces:
  - `AgingBucket = 'NOT_DUE' | 'OVERDUE_1_7' | 'OVERDUE_8_30' | 'OVERDUE_31_60' | 'OVERDUE_60_PLUS'`; `AgingReport { buckets: { bucket: AgingBucket; count: number; totalRemaining: number }[] }` — `GET /api/v1/reports/aging` (aging-dashboard-reporting plan)
  - `DashboardSummary { totalOutstanding: number; totalOverdue: number; overdueRate: number; cashForecast: { forecast7d: number; forecast14d: number; forecast30d: number }; topOverdueCustomers: { customerId: string; customerName: string; totalOverdue: number }[]; autoMatchRate: number | null; manualHandlingRate: number | null }` — `GET /api/v1/reports/dashboard-summary` (aging-dashboard-reporting plan)
  - `ReportsPage`: summary cards for the backend fields + aging table (bucket, count, totalRemaining, % of outstanding) + bar chart (`BarChart` from recharts).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/reports.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from '@/features/reports/reports-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' } }) }));

describe('ReportsPage', () => {
  it('renders aging buckets with formatted amounts and a total row', async () => {
    apiRequest
      .mockResolvedValueOnce({ totalOutstanding: 100_000_000, totalOverdue: 30_000_000, overdueRate: 0.3, cashForecast: { forecast7d: 10_000_000, forecast14d: 20_000_000, forecast30d: 30_000_000 }, topOverdueCustomers: [], autoMatchRate: 0.8, manualHandlingRate: 0.2 })
      .mockResolvedValueOnce({ buckets: [{ bucket: 'NOT_DUE', count: 3, totalRemaining: 70_000_000 }, { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 30_000_000 }, { bucket: 'OVERDUE_1_7', count: 0, totalRemaining: 0 }, { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 }, { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 }] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ReportsPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('70.000.000 ₫')).toBeTruthy());
    // 100M xuất hiện 2 nơi (card totalOutstanding + dòng tổng aging) → getAllByText
    await waitFor(() => expect(screen.getAllByText(/100.000.000 ₫/).length).toBeGreaterThanOrEqual(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/reports.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create types + API + hooks** (`reports-api.ts`: `fetchAging()` → `GET /api/v1/reports/aging`, `fetchDashboardSummary()` → `GET /api/v1/reports/dashboard-summary`; hooks `useAgingReport`, `useDashboardSummary` with query keys `['reports','aging']` / `['reports','dashboard']`).

- [ ] **Step 4: Create the three components**

- `dashboard-summary.tsx`: cards for `totalOutstanding`, `totalOverdue`, `overdueRate`, `cashForecast.forecast7d/14d/30d`, `autoMatchRate`, `manualHandlingRate`, and the top overdue customer list — `Card` + `formatVND`.
- `aging-table.tsx`: `Table` with all five backend bucket values (bucket, count, totalRemaining, % of total outstanding) + footer row "Tổng".
- `aging-chart.tsx`: `ResponsiveContainer` + `BarChart` with `Bar dataKey="totalRemaining"` (fill `var(--chart-1)`), XAxis `bucket`, YAxis tick formatter `(v) => formatVND(v).replace(' ₫', '')`.

- [ ] **Step 5: Replace `apps/frontend/src/features/reports/reports-page.tsx`** — layout: `<DashboardSummary />` on top, then a 2-col grid (aging table + aging chart).

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/reports.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/reports apps/frontend/test/reports.spec.tsx
git commit -m "feat(frontend): aging report + dashboard summary with recharts"
```

---

### Task 5: Bank connections page (Cas ID QR flow)

**Files:**
- Create: `apps/frontend/src/features/bank-connections/types.ts`
- Create: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`
- Create: `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`
- Create: `apps/frontend/src/features/bank-connections/components/connect-dialog.tsx`
- Create: `apps/frontend/src/features/bank-connections/components/connection-table.tsx`
- Replace: `apps/frontend/src/features/bank-connections/bank-connections-page.tsx`

**Interfaces:**
- Consumes: `qrcode.react` (installed in design-system plan), `useMutation` + polling pattern
- Produces:
  - `BankConnection { id; accountNumber: string; bankName: string; status: 'PENDING_AUTHORIZATION' | 'ACTIVE' | 'REQUIRES_REAUTHORIZATION' | 'REVOKED' | 'DISCONNECTED' | 'ERROR'; connectedAt: string | null; lastSyncAt: string | null; createdAt: string }`; `GET /api/v1/bank-connections` returns `{ items: BankConnection[]; total: number; page: number; limit: number }` from the Read APIs plan
  - `connectCasId()` — `POST /api/v1/bank-connections/cas-id/initiate` → `{ sessionId: string; casLink: string }` (cas-id plan Task: initiate)
  - `exchangeCasId(sessionId)` — `POST /api/v1/bank-connections/cas-id/sessions/:id/exchange` (call after QR scan + Cas redirect; BE stores the token)
  - `disconnectConnection(id)` — `POST /api/v1/bank-connections/:id/disconnect`
  - `ConnectDialog`: "Kết nối ngân hàng" → initiate → show `QRCode` from `casLink` → poll `GET /api/v1/bank-connections` every 5s until an `ACTIVE` row appears (or 5 min timeout) → close with success toast; "Ngắt kết nối" button per row with confirm dialog.

- [ ] **Step 1: Create types + API + hooks** — per Interfaces block; `usePollConnections()` hook: TanStack Query with `refetchInterval: 5000` while dialog is open, disabled otherwise.

- [ ] **Step 2: Create `apps/frontend/src/features/bank-connections/components/connect-dialog.tsx`**

```tsx
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { connectCasId, exchangeCasId } from '../api/bank-connections-api';

export function ConnectDialog() {
  const [open, setOpen] = useState(false);
  const [casLink, setCasLink] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function onConnect() {
    const res = await connectCasId();
    if (!res) { toast.error('Không tạo được link kết nối'); return; }
    setSessionId(res.sessionId);
    setCasLink(res.casLink);
    // QR hiện ra — người dùng quét; sau khi redirect, FE gọi exchange để hoàn tất
  }

  async function onDone() {
    if (!sessionId) return;
    await exchangeCasId(sessionId);
    toast.success('Đã kết nối ngân hàng');
    setOpen(false);
    setCasLink(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCasLink(null); setSessionId(null); } }}>
      <DialogTrigger asChild><Button>Kết nối ngân hàng</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Kết nối qua Cas ID</DialogTitle></DialogHeader>
        <DialogDescription>Quét mã QR để ủy quyền truy cập tài khoản.</DialogDescription>
        {casLink ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border p-4">
              <QRCodeSVG value={casLink} size={200} />
            </div>
            <Button onClick={onDone}>Tôi đã quét xong</Button>
          </div>
        ) : (
          <Button onClick={onConnect}>Tạo link kết nối</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

> Note: the real Cas redirect flow navigates the user to `casLink` after scanning; the QR → redirect → exchange sequence varies by device. `onDone` is the MVP manual step (ponytail: single confirm button; the auto-detect exchange after redirect can be added when the Cas portal flow is verified with a real account).

- [ ] **Step 3: Create `connection-table.tsx`** — columns: Ngân hàng, Số tài khoản, Trạng thái (badge), Đồng bộ gần nhất (`lastSyncAt`), Hành động ("Ngắt kết nối" with `AlertDialog` confirm — `alert-dialog` already added in FE plan 2 Task 0, only for `ACTIVE`).

- [ ] **Step 4: Replace `apps/frontend/src/features/bank-connections/bank-connections-page.tsx`** — header + `ConnectDialog` + `usePollConnections()` table; empty `items` → "Chưa có kết nối nào"; API errors use the shared error state.

- [ ] **Step 5: Verify build**

Run: `pnpm --filter @casso-ledger/frontend test && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections apps/frontend/src/components/ui apps/frontend/package.json
git commit -m "feat(frontend): bank connections with Cas ID QR flow"
```

---

### Task 6: Settings page (Billing / Users / Email templates)

**Files:**
- Create: `apps/frontend/src/features/settings/settings-page.tsx` (replace placeholder)
- Create: `apps/frontend/src/features/settings/components/billing-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/email-templates-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/template-dialog.tsx`
- Create: `apps/frontend/src/features/settings/components/template-preview-dialog.tsx`
- Create: `apps/frontend/src/features/settings/components/upgrade-dialog.tsx`
- Test: `apps/frontend/test/email-templates.spec.tsx`

**Interfaces:**
- Consumes: `hasPermission(Permission.REMINDER_POLICY_WRITE)` (RBAC gate per template mutation), `hasPlanAccess` (Task 1)
- Produces:
  - `SettingsPage` — `Tabs`: Billing, Users, Email templates
  - `EmailTemplate { id; name: string; subject: string; bodyHtml: string; isDefault: boolean; createdAt: string }` — `GET /api/v1/email-templates` (email-template-management plan)
  - `useEmailTemplates()` — `GET /api/v1/email-templates`; `useCreateTemplate()`/`useUpdateTemplate()`/`useDeleteTemplate()` — `POST /api/v1/email-templates`, `PATCH /api/v1/email-templates/:id`, `DELETE /api/v1/email-templates/:id`; `usePreviewTemplate(template)` — `POST /api/v1/email-templates/:id/preview` body `{ sampleData }` → `{ subject: string; bodyHtml: string }`
  - `BillingTab` — static plan cards (FREE/STARTER/BUSINESS/ENTERPRISE with limits: receivables/month, bank connections — values from billing spec mục 1), highlights current plan from `user.subscriptionPlan ?? 'FREE'`; no payment flow.
  - `UsersTab` — invite form (`POST /api/v1/organizations/:id/invites` body `{ email, role }`, role select from the 5 roles) + members table from `GET /api/v1/organizations/:id/members` (Read APIs plan).
  - `UpgradeDialog` — shared 402 handler: API error status 402 → dialog "Đã đạt giới hạn gói hiện tại" + static "Liên hệ bộ phận sales".

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/email-templates.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailTemplatesTab } from '@/features/settings/components/email-templates-tab';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' } }) }));

const tpl = { id: 't1', name: 'Nhắc trước hạn', subject: 'Nhắc thanh toán {{invoiceNumber}}', bodyHtml: '<p>Kính gửi {{customerName}}…</p>', isDefault: true, createdAt: '2026-08-01' };

describe('EmailTemplatesTab', () => {
  it('lists templates and renders a preview', async () => {
    apiRequest
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce({ subject: 'Nhắc thanh toán INV-1', bodyHtml: '<p>Kính gửi Công ty B…</p>' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><EmailTemplatesTab /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Nhắc trước hạn')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /xem trước/i }));
    await waitFor(() => expect(screen.getByText('Nhắc thanh toán INV-1')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/email-templates.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `email-templates-tab.tsx` + `template-dialog.tsx` + `template-preview-dialog.tsx`** — list table (Tên, Tiêu đề, Mặc định badge, actions: Xem trước / Sửa / Xóa); create/edit dialog (name, subject, `bodyHtml` textarea; delete uses `AlertDialog` confirm); preview dialog opens `usePreviewTemplate` and renders `subject` + `bodyHtml`. RBAC: create/edit/delete/preview hidden unless `hasPermission(Permission.REMINDER_POLICY_WRITE)` (the exact email-template BE permission; do not substitute `RECEIVABLE_WRITE`).

- [ ] **Step 4: Create `users-tab.tsx`** — invite form (email + role select: OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER) + tenant-scoped members table from `GET /api/v1/organizations/:id/members`. RBAC: whole tab hidden unless role is OWNER or FINANCE_MANAGER.

- [ ] **Step 5: Create `billing-tab.tsx` + `upgrade-dialog.tsx`** — static plan cards with highlight for current plan; `UpgradeDialog` exported for reuse: `<UpgradeDialog open onOpenChange />`.

- [ ] **Step 6: Replace `settings-page.tsx`** — `Tabs` with 3 triggers; each tab renders its component; Users/Billing tabs additionally check role gate.

- [ ] **Step 7: Wire 402 handling in `api-client.ts` (one-time)** — `apiRequest` (FE plan 1 Task 1) throws on HTTP errors; extend it: wrap the `apiClient.request` call in try/catch, and when `(e as AxiosError).response?.status === 402` dispatch `window.dispatchEvent(new CustomEvent('casso:plan-limit'))`, then rethrow the error (callers keep their existing try/catch). Add a `usePlanLimitDialog()` hook (listens for the event, returns open state) and mount `UpgradeDialog` from it in `App.tsx`. (One small modify to FE plan 1's file — allowed: it is a forward hook, FE plan 1 has no 402 usage.)

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/email-templates.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/settings apps/frontend/src/lib/api-client.ts apps/frontend/src/App.tsx apps/frontend/test/email-templates.spec.tsx
git commit -m "feat(frontend): settings tabs + 402 upgrade prompt"
```

---

### Task 7: Nav lock integration + full verification

**Files:**
- Modify: `apps/frontend/src/components/layout/nav-items.ts` (add `minPlan: 'STARTER'` to the Copilot item)
- Modify: `apps/frontend/src/components/layout/sidebar.tsx` (render a lock icon on nav items whose `minPlan` the current user lacks — pattern `plan-gated lock icon` theo FE design spec mục 2; item stays visible, click navigates to a locked page state)

**Interfaces:**
- Consumes: `hasPlanAccess` (Task 1), `useAuth().user.subscriptionPlan`
- Produces: locked-state nav items consistent with the Copilot page lock (Task 3 Step 7).

- [ ] **Step 1: Modify `nav-items.ts`** — add `minPlan?: PlanName` field; set `{ to: '/copilot', minPlan: 'STARTER' }`.

- [ ] **Step 2: Modify `sidebar.tsx`** — for items with `minPlan`, compute `locked = !hasPlanAccess(user?.subscriptionPlan, item.minPlan)`; render `Lock` icon (lucide) next to the label when locked. Mobile sidebar mirrors the same markup (shared `NavItem` component if the design-system plan already extracted one — otherwise duplicate the 3-line conditional per the rule of two).

- [ ] **Step 3: Run the full FE suite**

Run from repo root: `pnpm turbo run lint type-check test --filter=@casso-ledger/frontend`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout
git commit -m "feat(frontend): plan-locked nav item for copilot"
```

---

## Self-Review Notes

- **Spec coverage:** reminders page → Task 2 (reminder-automation plan: policies CRUD + executions read); copilot → Task 3 (canonical read tools plus pending action confirm/cancel through non-LLM endpoints, timeout ≤15s, `REMINDER_SEND_MANUAL` gating); reports → Task 4 (canonical aging buckets and dashboard summary, no precompute); bank connections → Task 5 (Cas ID initiate → QR → exchange → disconnect per cas-id plan); settings → Task 6 (billing static + 402 prompt, users list from Read APIs, and email templates using `bodyHtml` with preview `{ subject, bodyHtml }`).
- **Placeholder scan:** every task has concrete code; empty states are for empty data and all endpoint contracts point to an owning BE plan.
- **Type consistency:** `hasPlanAccess(plan, minPlan)` signature consistent across Task 1/3/7; `CopilotPendingAction` matches the BE plan's `actionType: 'SEND_REMINDER_EMAIL'`; conversation id is client-generated `crypto.randomUUID()` matching the BE's lazy `findOrCreate` (collection-copilot plan Task 2).
- **RBAC decisions (grill Q4):** email template create/edit/delete/preview gated by the exact `REMINDER_POLICY_WRITE`; Users tab gated by OWNER/FINANCE_MANAGER role; Copilot action card only for `REMINDER_SEND_MANUAL` (documented in Task 3; actual check uses the same `hasPermission` with the enum value once shared-types ships it).
- **Contract ownership:** bank connections, `subscriptionPlan` from `GET /api/v1/me`, and members list come from the Read APIs plan; policies, reports, and templates come from their owning BE plans. All FE request URLs retain the `/api/v1` prefix.
- **Deferred:** real Cas redirect → auto-exchange after QR scan (Task 5 ponytail note); copilot conversation history (no BE endpoint by design).
