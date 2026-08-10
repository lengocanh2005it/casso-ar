# FE Reminders, Copilot, Reports & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining 5 business pages of `apps/frontend` on top of FE plans 1–2: Reminders (reminder policies + executions), Copilot (chat + pending-action confirmation), Reports (aging + dashboard summary with recharts), Bank connections (Cas ID QR flow), Settings (Billing static + Users invite + Email templates CRUD/preview) — wired to the BE endpoints from the reminder-automation, collection-copilot, aging-dashboard-reporting, cas-id-bank-connection, email-template-management, authentication-onboarding, and billing-usage-metering plans.

**Architecture:** Page pattern from FE plan 2 (`Page + Table + Dialog`, TanStack Query hooks). Copilot chat UI follows the standard chat layout (message list + input) but with Casso's **pending-action confirmation card** (grill decision Q3: component test for this flow): the model never executes — `POST /api/v1/copilot/actions/:actionId/confirm|cancel` is a pure-code endpoint. Reports use `recharts` (already in the design-system plan deps). Settings is a tabbed page; Billing renders static plan info + handles the 402 upgrade prompt (no read endpoint exists in the BE billing plan — it is write-time gating only).

**Tech Stack:** React 19, TanStack Query, React Router 7, shadcn/ui (primitives from FE plan 2 Task 0: tabs, dialog, table, select, input, label, textarea, badge, alert-dialog), `recharts`, `qrcode.react`, vitest + testing-library.

## Revision Note (grilling session, 2026-08-10)

Plan was written 2026-08-03, before FE plan 1 (auth-app-shell) landed and before Plan #20 (FE Core AR Loop) established the `pages/` + barrel `index.ts` file-structure convention. A grilling session against the live codebase found real drift. Decisions, all confirmed with the user:

- **Task 1 removed entirely.** `apps/frontend/src/lib/plan-access.ts` already exists (shipped in FE plan 1) with `hasPlanAccess(currentPlan: PlanId, requiredPlan: PlanId): boolean`, using the shared `PlanId` enum — not the string-literal, nullable signature this plan originally specified. Every task below that references `hasPlanAccess` uses the real signature: `hasPlanAccess(user.subscriptionPlan, PlanId.STARTER)`, not `hasPlanAccess(user?.subscriptionPlan, 'STARTER')`.
- **`nav-items.ts` Copilot `minPlan` bug**: current code has `minPlan: PlanId.BUSINESS`, but the original design-system spec (`2026-08-03-frontend-design-system.md` section 2 / line 881) explicitly says `minPlan: 'STARTER'`. `BUSINESS` was an undocumented drift introduced during an unrelated Plan #19 code-review-remediation commit (`4efc9bd`), not a deliberate re-decision. Task 7 restores `PlanId.STARTER`.
- **`sidebar.tsx` hardcode bug**: `const currentPlan: PlanId = PlanId.FREE;` ignores the logged-in user's actual plan — every user currently sees Copilot as locked regardless of their real `subscriptionPlan`. Task 7 fixes this to read `useAuth().user.subscriptionPlan`.
- **RBAC bug in this plan's own Global Constraints** (same category as the two RBAC bugs Plan #20 caught): reminder-policy create/edit was gated on `RECEIVABLE_WRITE`, but the real backend guard on `POST/PATCH /reminder-policies` is `REMINDER_POLICY_WRITE`. ACCOUNTANT holds `RECEIVABLE_WRITE` but not `REMINDER_POLICY_WRITE` — gating on the wrong permission would show the button to a role that gets a 403 on click. Task 2 gates on `Permission.REMINDER_POLICY_WRITE`.
- **`PATCH /reminder-policies/:id` contract**: `UpdateReminderPolicyDto` requires the full body (`isActive`, `rules` — not optional —, `escalationThresholdDays?`), not the partial `{ isActive }` this plan assumed for the enable/disable Switch. Task 2's toggle now submits `{ ...policy, isActive: !policy.isActive }`.
- **`escalationThresholdDays` field added** to `ReminderPolicy`/`ReminderRule` types and to `policy-dialog.tsx` as an optional number input — a real backend field (`CreateReminderPolicyDto`/`UpdateReminderPolicyDto`) this plan omitted entirely.
- **Copilot confirm/cancel response shapes corrected.** This plan's `CopilotActionResponse { action: CopilotPendingAction; reminderExecutionId?: string }` (used for both endpoints, including the Task 3 test mock) does not match the real backend: `POST /copilot/actions/:id/confirm` returns bare `{ reminderExecutionId: string }` (no `action` field at all); `POST /copilot/actions/:id/cancel` returns a bare `CopilotPendingActionDto` (no wrapper, no `reminderExecutionId`). Task 3 uses two distinct return types and the test mock is corrected to match.
- **`DashboardSummary` gains `reminderEffectiveness: number | null`** — a real backend field (`paidWithin7dCount / sentCount`) this plan's type omitted. Task 4 adds a summary card for it alongside `autoMatchRate`/`manualHandlingRate`.
- **`EmailTemplate` gains `reminderStage: string | null` and `updatedAt: string`** in the type (real backend fields) — but per user decision, `reminderStage` gets no form input in `template-dialog.tsx` this round (nothing downstream consumes it yet — no template picker filters by stage — so exposing it in the UI would be premature).
- **File paths**: every `Create`/`Replace` path in this plan gets a `pages/` segment (e.g. `features/reminders/reminders-page.tsx` → `features/reminders/pages/reminders-page.tsx`) plus a barrel `index.ts` re-exporting the page component and public types, matching the convention Plan #20 established. `recharts`/`qrcode.react` are already installed (`package.json`) — no new dependency work needed.

## Global Constraints

- Root scripts: `pnpm --filter @casso-ledger/frontend test`, `type-check`, `lint`.
- Money: integer VND via `formatVND` (FE plan 1). `hasPermission` gates all mutating buttons (FE plan 1). `ReceivableStatusBadge`/feature types from FE plan 2 Task 1 are reused — do not redefine.
- Plan gating uses the existing `hasPlanAccess(currentPlan: PlanId, requiredPlan: PlanId)` from `lib/plan-access.ts` (see Revision Note) — Task 1 in the original plan is dropped.
- Reminder policy create/edit is gated by `Permission.REMINDER_POLICY_WRITE` (see Revision Note), not `RECEIVABLE_WRITE`.
- **Read contracts:** `GET /api/v1/bank-connections` and `subscriptionPlan` in `GET /api/v1/me` come from `2026-08-03-read-apis-completion.md`; reminder policies/executions, reports, and email-template list shapes come from their owning BE plans. Empty states represent empty data, not an expected missing endpoint.
- Copilot: NO `GET /api/v1/copilot/conversations` exists (BE plan explicitly deferred it) — the chat starts a fresh conversation per session; `POST /api/v1/copilot/conversations/:id/messages` lazily creates the row (BE plan Task 2). The conversation id is generated client-side as `crypto.randomUUID()`.
- Every backend URL in this plan uses the canonical `/api/v1` prefix exactly once; `/health` and `/metrics` are the only process probes outside that prefix.
- 402 handling: any API error with status 402 → sonner toast "The current plan limit has been reached" + offer an upgrade prompt (static dialog, no payment flow — BE billing plan only gates, never charges).
- No new UI libraries (ponytail).

---

## File Structure

```
apps/frontend/src/
  lib/plan-access.ts                   -- ALREADY EXISTS (FE plan 1) — reuse, do not recreate
  features/reminders/
    types.ts                           -- ReminderPolicy, ReminderRule, ReminderExecution
    api/reminders-api.ts               -- GET/POST /api/v1/reminder-policies, PATCH /api/v1/reminder-policies/:id, GET /api/v1/reminder-executions
    api/use-reminders.ts               -- hooks
    pages/reminders-page.tsx           -- replace placeholder
    components/policy-table.tsx
    components/policy-dialog.tsx
    components/executions-table.tsx
    index.ts                           -- barrel: re-export RemindersPage + public types
  features/copilot/
    types.ts                           -- CopilotMessage, CopilotPendingAction
    api/copilot-api.ts                 -- POST /api/v1/copilot/conversations/:id/messages, POST /api/v1/copilot/actions/:actionId/confirm|cancel
    api/use-copilot.ts                 -- hooks
    pages/copilot-page.tsx             -- replace placeholder
    components/message-list.tsx
    components/pending-action-card.tsx
    index.ts
  features/reports/
    types.ts                           -- AgingReport, DashboardSummary
    api/reports-api.ts                 -- GET /api/v1/reports/aging, GET /api/v1/reports/dashboard-summary
    api/use-reports.ts                 -- hooks
    pages/reports-page.tsx             -- replace placeholder
    components/aging-table.tsx
    components/aging-chart.tsx
    components/dashboard-summary.tsx
    index.ts
  features/bank-connections/
    types.ts                           -- BankConnection
    api/bank-connections-api.ts        -- GET /api/v1/bank-connections, POST /api/v1/bank-connections/cas-id/initiate, POST /api/v1/bank-connections/cas-id/sessions/:id/exchange, POST /api/v1/bank-connections/:id/disconnect
    api/use-bank-connections.ts        -- hooks
    pages/bank-connections-page.tsx    -- replace placeholder
    components/connect-dialog.tsx      -- QR via qrcode.react
    components/connection-table.tsx
    index.ts
  features/settings/
    pages/settings-page.tsx            -- replace placeholder: Tabs (Billing / Users / Email templates)
    components/billing-tab.tsx
    components/users-tab.tsx
    components/email-templates-tab.tsx
    components/template-dialog.tsx
    components/template-preview-dialog.tsx
    components/upgrade-dialog.tsx      -- shared 402 upgrade prompt
    index.ts
```

> File-structure note: tests are colocated next to the file they cover (`*.spec.tsx` beside the component), per the convention Plan #20 used — not under a top-level `test/` directory as this plan originally specified. `test/copilot-flow.spec.tsx` → `features/copilot/pages/copilot-page.spec.tsx`; `test/reports.spec.tsx` → `features/reports/pages/reports-page.spec.tsx`; `test/email-templates.spec.tsx` → `features/settings/components/email-templates-tab.spec.tsx`.

---

### Task 1: REMOVED — plan gating helper already exists

`apps/frontend/src/lib/plan-access.ts` already ships `hasPlanAccess(currentPlan: PlanId, requiredPlan: PlanId): boolean` (`PlanId` from `@casso-ledger/shared-types`), with `plan-access.test.ts` covering it. See Revision Note. Every later task that needs plan gating imports this directly:

```typescript
import { PlanId } from '@casso-ledger/shared-types';
import { hasPlanAccess } from '@/lib/plan-access';

hasPlanAccess(user.subscriptionPlan, PlanId.STARTER);
```

No new file, no new test, no commit for this task — proceed to Task 2.

---

### Task 2: Reminders page (policies + executions)

**Files:**
- Create: `apps/frontend/src/features/reminders/types.ts`
- Create: `apps/frontend/src/features/reminders/api/reminders-api.ts`
- Create: `apps/frontend/src/features/reminders/api/use-reminders.ts`
- Create: `apps/frontend/src/features/reminders/components/policy-table.tsx`
- Create: `apps/frontend/src/features/reminders/components/policy-dialog.tsx`
- Create: `apps/frontend/src/features/reminders/components/executions-table.tsx`
- Replace: `apps/frontend/src/features/reminders/pages/reminders-page.tsx`
- Create: `apps/frontend/src/features/reminders/index.ts` (barrel)

**Interfaces:**
- Consumes: `apiRequest`, `formatVND`/`formatDate`, `hasPermission(Permission.REMINDER_POLICY_WRITE)` for policy create/edit (see Revision Note — not `RECEIVABLE_WRITE`)
- Produces:
  - Types: `ReminderRule { id; offsetDays: number; emailTemplateId: string; minIntervalDays: number }`, `ReminderPolicy { id; customerGroup: 'VIP' | 'REGULAR'; isActive: boolean; escalationThresholdDays: number | null; rules: ReminderRule[]; createdAt: string }`, `ReminderExecution { id; receivableId; reminderRuleId: string | null; status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'; sentAt: string | null; skipReason: string | null; providerMessageId: string | null }`
  - `useReminderPolicies()` — `GET /api/v1/reminder-policies` → `ReminderPolicy[]` (reminder-automation plan)
  - `useCreateReminderPolicy()`, `useUpdateReminderPolicy()` — `POST /api/v1/reminder-policies`, `PATCH /api/v1/reminder-policies/:id` — **the PATCH mutation takes a full `{ customerGroup?; isActive; escalationThresholdDays?; rules }` body, not a partial `{ isActive }`** (see Revision Note — `UpdateReminderPolicyDto.rules` is required)
  - `useReminderExecutions(filters)` — `GET /api/v1/reminder-executions?receivableId=&status=&page=&limit=` → `{ items: ReminderExecution[]; total: number }`
  - `RemindersPage`: two sections — Policies (table + "Create policy" dialog, enable/disable toggle via PATCH) and Executions (table with status badge + date).

- [ ] **Step 1: Create types + API + hooks files** — copy the shapes from the Interfaces block; follow the exact hook pattern from FE plan 2 Task 3 Step 4 (query keys `['reminder-policies']`, `['reminder-executions', filters]`; mutations toast + invalidate).

- [ ] **Step 2: Create `apps/frontend/src/features/reminders/components/policy-dialog.tsx`** — create/edit form: customer group select (`VIP`/`REGULAR`), active switch (`isActive`), escalation threshold number input (`escalationThresholdDays`, optional), rules list (`offsetDays`, `emailTemplateId`, `minIntervalDays` + add/remove row). Save calls the matching mutation. RBAC: dialog button hidden without `Permission.REMINDER_POLICY_WRITE`.

- [ ] **Step 3: Create `apps/frontend/src/features/reminders/components/policy-table.tsx`** — columns: Customer group, Enable/disable (Switch calling `useUpdateReminderPolicy` with `{ ...policy, isActive: !policy.isActive }` — the full policy, not a partial patch), Rule count, Created date.

- [ ] **Step 4: Create `apps/frontend/src/features/reminders/components/executions-table.tsx`** — columns: Receivable ID, Channel, Status (SENT green / FAILED red badge), Sent at.

- [ ] **Step 5: Replace `apps/frontend/src/features/reminders/pages/reminders-page.tsx`** — header + policy section (table + "Create policy" button) + executions section (receivableId filter input + table). Create `apps/frontend/src/features/reminders/index.ts` re-exporting `RemindersPage` and the public types.

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
- Replace: `apps/frontend/src/features/copilot/pages/copilot-page.tsx`
- Create: `apps/frontend/src/features/copilot/index.ts` (barrel)
- Test: `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx` (colocated — see File Structure note)

**Interfaces:**
- Consumes: `hasPlanAccess` from `lib/plan-access.ts` (Task 1 removed — see Revision Note) — page shows a lock notice when plan < STARTER; `hasPermission(Permission.REMINDER_SEND_MANUAL)` — pending-action card is only rendered for users who can send manual reminders (copilot spec section 4)
- Produces:
  - Types: `CopilotMessage { id; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string }`, `CopilotPendingAction { id; actionType: 'SEND_REMINDER_EMAIL'; status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'; payload: { draftId: string; receivableId: string }; createdAt: string; resolvedAt: string | null }`; these are copied from the canonical BE DTOs, not ad-hoc FE shapes.
  - `sendCopilotMessage(conversationId, content)` → `POST /api/v1/copilot/conversations/:id/messages` body `{ content }` → `{ message: CopilotMessage; pendingAction: CopilotPendingAction | null }` (the BE runs the tool loop synchronously, ≤15s timeout; when the model proposes `sendReminderEmail` the response carries a pending action instead of sending)
  - **`confirmCopilotAction(actionId)` → `POST /api/v1/copilot/actions/:actionId/confirm` → bare `{ reminderExecutionId: string }`. `cancelCopilotAction(actionId)` → `POST /api/v1/copilot/actions/:actionId/cancel` → bare `CopilotPendingAction` (no wrapper). These are two distinct return types, not a shared `CopilotActionResponse` — see Revision Note; the real backend confirm response has no `action` field and the cancel response has no `reminderExecutionId` field.**
  - `CopilotPage`: message list + input + "Send" (disabled while pending); when `pendingAction` arrives, render `PendingActionCard` (Confirm / Cancel) — confirm/cancel never re-enter the LLM loop.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CopilotPage } from './copilot-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'FINANCE_MANAGER', subscriptionPlan: 'STARTER' } }) }));

describe('CopilotPage', () => {
  it('shows a pending action card and confirms it via the pure-code endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      message: { id: 'm1', role: 'ASSISTANT', content: 'I can send a reminder email for receivable r1.', createdAt: '2026-08-03T00:00:00Z' },
      pendingAction: { id: 'pa1', actionType: 'SEND_REMINDER_EMAIL', status: 'PENDING', payload: { draftId: 'd1', receivableId: 'r1' }, createdAt: '2026-08-03T00:00:00Z', resolvedAt: null },
    });
    // Real confirm response: bare { reminderExecutionId }, no `action` field (see Revision Note)
    apiRequest.mockResolvedValueOnce({ reminderExecutionId: 'ex1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CopilotPage /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText(/enter question/i), { target: { value: 'Send reminder email for r1' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/confirm reminder email send/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/copilot/actions/pa1/confirm', method: 'POST' })));
    // Sonner's toast does not render when the test does not mount <Toaster> — assert the confirmation card disappeared
    await waitFor(() => expect(screen.queryByText(/confirm reminder email send/i)).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/copilot/pages/copilot-page.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/features/copilot/api/copilot-api.ts`**

```typescript
import { apiRequest } from '@/lib/api-client';
import type { CopilotMessage, CopilotPendingAction } from '@/features/copilot/types';

export interface CopilotTurnResult { message: CopilotMessage; pendingAction: CopilotPendingAction | null }

export function sendCopilotMessage(conversationId: string, content: string) {
  return apiRequest<CopilotTurnResult>({ url: `/api/v1/copilot/conversations/${conversationId}/messages`, method: 'POST', data: { content } });
}

export function confirmCopilotAction(actionId: string) {
  return apiRequest<{ reminderExecutionId: string }>({ url: `/api/v1/copilot/actions/${actionId}/confirm`, method: 'POST' });
}

export function cancelCopilotAction(actionId: string) {
  return apiRequest<CopilotPendingAction>({ url: `/api/v1/copilot/actions/${actionId}/cancel`, method: 'POST' });
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/copilot/api/use-copilot.ts`** — `useCopilotChat()` returning `{ messages, pendingAction, send(content), isSending }`; internal state: `messages: CopilotMessage[]`, one conversation id per page mount (`crypto.randomUUID()`), `send` appends the user message optimistically, calls `sendCopilotMessage`, appends assistant message, sets `pendingAction`; confirm/cancel call the action endpoints and clear `pendingAction` (confirm → toast "Reminder email sent"; neither response needs to be read into local state beyond clearing `pendingAction`, since neither carries a fresh `CopilotPendingAction` the UI actually needs — cancel's bare response can update `pendingAction` to `null` directly).

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
      <CardHeader><CardTitle className="text-sm">Confirm reminder email send</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Receivable: {action.payload.receivableId}</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onConfirm}>Confirm</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
        <p className="text-xs text-muted-foreground">The action expires after 10 minutes if not confirmed.</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Create `apps/frontend/src/features/copilot/components/message-list.tsx`** — plain scrollable list; user messages right-aligned (`bg-primary text-primary-foreground` bubble), assistant messages left-aligned; empty state "Ask about receivables and payment history…".

- [ ] **Step 7: Replace `apps/frontend/src/features/copilot/pages/copilot-page.tsx`**

```tsx
import { PlanId } from '@casso-ledger/shared-types';
import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan-access';
import { useCopilotChat } from '../api/use-copilot';
import { MessageList } from '../components/message-list';
import { PendingActionCard } from '../components/pending-action-card';

export function CopilotPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const { messages, pendingAction, isSending, send, confirm, cancel, busy } = useCopilotChat();

  if (!user || !hasPlanAccess(user.subscriptionPlan, PlanId.STARTER)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Copilot requires the Starter plan or higher.</p>
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
        <Input aria-label="Enter question" placeholder="Ask about receivables…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={isSending} />
        <Button type="submit" disabled={isSending || !draft.trim()}>{isSending ? 'Thinking…' : 'Send'}</Button>
      </form>
    </div>
  );
}
```

Also create `apps/frontend/src/features/copilot/index.ts` re-exporting `CopilotPage` and the public types.

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test src/features/copilot/pages/copilot-page.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/copilot
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
- Replace: `apps/frontend/src/features/reports/pages/reports-page.tsx`
- Create: `apps/frontend/src/features/reports/index.ts` (barrel)
- Test: `apps/frontend/src/features/reports/pages/reports-page.spec.tsx` (colocated — see File Structure note)

**Interfaces:**
- Consumes: `formatVND`, `recharts` (installed in design-system plan)
- Produces:
  - `AgingBucket = 'NOT_DUE' | 'OVERDUE_1_7' | 'OVERDUE_8_30' | 'OVERDUE_31_60' | 'OVERDUE_60_PLUS'`; `AgingReport { buckets: { bucket: AgingBucket; count: number; totalRemaining: number }[] }` — `GET /api/v1/reports/aging` (aging-dashboard-reporting plan)
  - `DashboardSummary { totalOutstanding: number; totalOverdue: number; overdueRate: number; cashForecast: { forecast7d: number; forecast14d: number; forecast30d: number }; topOverdueCustomers: { customerId: string; customerName: string; totalOverdue: number }[]; autoMatchRate: number | null; manualHandlingRate: number | null; reminderEffectiveness: number | null }` — `GET /api/v1/reports/dashboard-summary` (aging-dashboard-reporting plan); `reminderEffectiveness` added per Revision Note (real backend field the original plan omitted).
  - `ReportsPage`: summary cards for the backend fields + aging table (bucket, count, totalRemaining, % of outstanding) + bar chart (`BarChart` from recharts).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from './reports-page';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' } }) }));

describe('ReportsPage', () => {
  it('renders aging buckets with formatted amounts and a total row', async () => {
    apiRequest
      .mockResolvedValueOnce({ totalOutstanding: 100_000_000, totalOverdue: 30_000_000, overdueRate: 0.3, cashForecast: { forecast7d: 10_000_000, forecast14d: 20_000_000, forecast30d: 30_000_000 }, topOverdueCustomers: [], autoMatchRate: 0.8, manualHandlingRate: 0.2, reminderEffectiveness: 0.5 })
      .mockResolvedValueOnce({ buckets: [{ bucket: 'NOT_DUE', count: 3, totalRemaining: 70_000_000 }, { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 30_000_000 }, { bucket: 'OVERDUE_1_7', count: 0, totalRemaining: 0 }, { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 }, { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 }] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ReportsPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('70.000.000 ₫')).toBeTruthy());
    // 100M appears in 2 places (totalOutstanding card + aging total row) → getAllByText
    await waitFor(() => expect(screen.getAllByText(/100.000.000 ₫/).length).toBeGreaterThanOrEqual(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/reports/pages/reports-page.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create types + API + hooks** (`reports-api.ts`: `fetchAging()` → `GET /api/v1/reports/aging`, `fetchDashboardSummary()` → `GET /api/v1/reports/dashboard-summary`; hooks `useAgingReport`, `useDashboardSummary` with query keys `['reports','aging']` / `['reports','dashboard']`).

- [ ] **Step 4: Create the three components**

- `dashboard-summary.tsx`: cards for `totalOutstanding`, `totalOverdue`, `overdueRate`, `cashForecast.forecast7d/14d/30d`, `autoMatchRate`, `manualHandlingRate`, `reminderEffectiveness`, and the top overdue customer list — `Card` + `formatVND`.
- `aging-table.tsx`: `Table` with all five backend bucket values (bucket, count, totalRemaining, % of total outstanding) + footer row "Total".
- `aging-chart.tsx`: `ResponsiveContainer` + `BarChart` with `Bar dataKey="totalRemaining"` (fill `var(--chart-1)`), XAxis `bucket`, YAxis tick formatter `(v) => formatVND(v).replace(' ₫', '')`.

- [ ] **Step 5: Replace `apps/frontend/src/features/reports/pages/reports-page.tsx`** — layout: `<DashboardSummary />` on top, then a 2-col grid (aging table + aging chart). Create `apps/frontend/src/features/reports/index.ts` re-exporting `ReportsPage` and the public types.

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test src/features/reports/pages/reports-page.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/reports
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
- Replace: `apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`
- Create: `apps/frontend/src/features/bank-connections/index.ts` (barrel)

**Interfaces:**
- Consumes: `qrcode.react` (installed in design-system plan), `useMutation` + polling pattern
- Produces:
  - `BankConnection { id; accountNumber: string; bankName: string; status: 'PENDING_AUTHORIZATION' | 'ACTIVE' | 'REQUIRES_REAUTHORIZATION' | 'REVOKED' | 'DISCONNECTED' | 'ERROR'; connectedAt: string | null; lastSyncAt: string | null; createdAt: string }`; `GET /api/v1/bank-connections` returns `{ items: BankConnection[]; total: number; page: number; limit: number }` from the Read APIs plan
  - `connectCasId()` — `POST /api/v1/bank-connections/cas-id/initiate` → `{ sessionId: string; casLink: string }` (cas-id plan Task: initiate)
  - `exchangeCasId(sessionId)` — `POST /api/v1/bank-connections/cas-id/sessions/:id/exchange` (call after QR scan + Cas redirect; BE stores the token)
  - `disconnectConnection(id)` — `POST /api/v1/bank-connections/:id/disconnect`
  - `ConnectDialog`: "Connect bank" → initiate → show `QRCode` from `casLink` → poll `GET /api/v1/bank-connections` every 5s until an `ACTIVE` row appears (or 5 min timeout) → close with success toast; "Disconnect" button per row with confirm dialog.

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
    if (!res) { toast.error('Could not create connection link'); return; }
    setSessionId(res.sessionId);
    setCasLink(res.casLink);
    // QR appears — the user scans it; after redirect, FE calls exchange to complete the flow
  }

  async function onDone() {
    if (!sessionId) return;
    await exchangeCasId(sessionId);
    toast.success('Bank connected');
    setOpen(false);
    setCasLink(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCasLink(null); setSessionId(null); } }}>
      <DialogTrigger asChild><Button>Connect bank</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect via Cas ID</DialogTitle></DialogHeader>
        <DialogDescription>Scan the QR code to authorize account access.</DialogDescription>
        {casLink ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border p-4">
              <QRCodeSVG value={casLink} size={200} />
            </div>
            <Button onClick={onDone}>I finished scanning</Button>
          </div>
        ) : (
          <Button onClick={onConnect}>Create connection link</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

> Note: the real Cas redirect flow navigates the user to `casLink` after scanning; the QR → redirect → exchange sequence varies by device. `onDone` is the MVP manual step (ponytail: single confirm button; the auto-detect exchange after redirect can be added when the Cas portal flow is verified with a real account).

- [ ] **Step 3: Create `connection-table.tsx`** — columns: Bank, Account number, Status (badge), Last synced (`lastSyncAt`), Actions ("Disconnect" with `AlertDialog` confirm — `alert-dialog` already added in FE plan 2 Task 0, only for `ACTIVE`).

- [ ] **Step 4: Replace `apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`** — header + `ConnectDialog` + `usePollConnections()` table; empty `items` → "No connections yet"; API errors use the shared error state. Create `apps/frontend/src/features/bank-connections/index.ts` re-exporting `BankConnectionsPage` and the public types.

- [ ] **Step 5: Verify build**

Run: `pnpm --filter @casso-ledger/frontend test && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections
git commit -m "feat(frontend): bank connections with Cas ID QR flow"
```

---

### Task 6: Settings page (Billing / Users / Email templates)

**Files:**
- Create: `apps/frontend/src/features/settings/pages/settings-page.tsx` (replace placeholder)
- Create: `apps/frontend/src/features/settings/components/billing-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/email-templates-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/template-dialog.tsx`
- Create: `apps/frontend/src/features/settings/components/template-preview-dialog.tsx`
- Create: `apps/frontend/src/features/settings/components/upgrade-dialog.tsx`
- Create: `apps/frontend/src/features/settings/index.ts` (barrel)
- Test: `apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx` (colocated — see File Structure note)

**Interfaces:**
- Consumes: `hasPermission(Permission.REMINDER_POLICY_WRITE)` (RBAC gate per template mutation), `hasPlanAccess` from `lib/plan-access.ts` (Task 1 removed — see Revision Note)
- Produces:
  - `SettingsPage` — `Tabs`: Billing, Users, Email templates
  - `EmailTemplate { id; name: string; subject: string; bodyHtml: string; reminderStage: string | null; isDefault: boolean; createdAt: string; updatedAt: string }` — `GET /api/v1/email-templates` (email-template-management plan); `reminderStage`/`updatedAt` added per Revision Note (real backend fields) — `reminderStage` gets no form input in `template-dialog.tsx` this round (nothing downstream consumes it yet).
  - `useEmailTemplates()` — `GET /api/v1/email-templates`; `useCreateTemplate()`/`useUpdateTemplate()`/`useDeleteTemplate()` — `POST /api/v1/email-templates`, `PATCH /api/v1/email-templates/:id`, `DELETE /api/v1/email-templates/:id`; `usePreviewTemplate(template)` — `POST /api/v1/email-templates/:id/preview` body `{ sampleData }` → `{ subject: string; bodyHtml: string }`
  - `BillingTab` — static plan cards (FREE/STARTER/BUSINESS/ENTERPRISE with limits: receivables/month, bank connections — values from billing spec section 1), highlights current plan from `user.subscriptionPlan ?? PlanId.FREE`; no payment flow.
  - `UsersTab` — invite form (`POST /api/v1/organizations/:id/invites` body `{ email, role }`, role select from the 5 roles) + members table from `GET /api/v1/organizations/:id/members` (Read APIs plan).
  - `UpgradeDialog` — shared 402 handler: API error status 402 → dialog "The current plan limit has been reached" + static "Contact sales".

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailTemplatesTab } from './email-templates-tab';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a), authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') } }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role: 'OWNER' } }) }));

const tpl = { id: 't1', name: 'Due date reminder', subject: 'Payment reminder {{invoiceNumber}}', bodyHtml: '<p>Dear {{customerName}}…</p>', reminderStage: null, isDefault: true, createdAt: '2026-08-01', updatedAt: '2026-08-01' };

describe('EmailTemplatesTab', () => {
  it('lists templates and renders a preview', async () => {
    apiRequest
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce({ subject: 'Payment reminder INV-1', bodyHtml: '<p>Dear Company B…</p>' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><EmailTemplatesTab /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Due date reminder')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => expect(screen.getByText('Payment reminder INV-1')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/email-templates-tab.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `email-templates-tab.tsx` + `template-dialog.tsx` + `template-preview-dialog.tsx`** — list table (Name, Subject, Default badge, actions: Preview / Edit / Delete); create/edit dialog (name, subject, `bodyHtml` textarea — no `reminderStage` input, see Revision Note; delete uses `AlertDialog` confirm); preview dialog opens `usePreviewTemplate` and renders `subject` + `bodyHtml`. RBAC: create/edit/delete/preview hidden unless `hasPermission(Permission.REMINDER_POLICY_WRITE)` (the exact email-template BE permission; do not substitute `RECEIVABLE_WRITE`).

- [ ] **Step 4: Create `users-tab.tsx`** — invite form (email + role select: OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER) + tenant-scoped members table from `GET /api/v1/organizations/:id/members`. RBAC: whole tab hidden unless role is OWNER or FINANCE_MANAGER.

- [ ] **Step 5: Create `billing-tab.tsx` + `upgrade-dialog.tsx`** — static plan cards with highlight for current plan; `UpgradeDialog` exported for reuse: `<UpgradeDialog open onOpenChange />`.

- [ ] **Step 6: Replace `pages/settings-page.tsx`** — `Tabs` with 3 triggers; each tab renders its component; Users/Billing tabs additionally check role gate. Create `apps/frontend/src/features/settings/index.ts` re-exporting `SettingsPage` and the public types.

- [ ] **Step 7: Wire 402 handling in `api-client.ts` (one-time)** — `apiRequest` (FE plan 1 Task 1) throws on HTTP errors; extend it: wrap the `apiClient.request` call in try/catch, and when `(e as AxiosError).response?.status === 402` dispatch `window.dispatchEvent(new CustomEvent('casso:plan-limit'))`, then rethrow the error (callers keep their existing try/catch). Add a `usePlanLimitDialog()` hook (listens for the event, returns open state) and mount `UpgradeDialog` from it in `App.tsx`. (One small modify to FE plan 1's file — allowed: it is a forward hook, FE plan 1 has no 402 usage.)

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/email-templates-tab.spec.tsx && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/settings apps/frontend/src/lib/api-client.ts apps/frontend/src/App.tsx
git commit -m "feat(frontend): settings tabs + 402 upgrade prompt"
```

---

### Task 7: Nav lock fixes + full verification

The `minPlan?: PlanId` field and the lock-icon rendering already exist (shipped in FE plan 1 / Plan #19 code-review remediation) — this task is now two targeted bug fixes, not new scaffolding. See Revision Note.

**Files:**
- Modify: `apps/frontend/src/components/layout/nav-items.ts` (Copilot's `minPlan: PlanId.BUSINESS` → `PlanId.STARTER`, restoring the original design-system spec decision)
- Modify: `apps/frontend/src/components/layout/sidebar.tsx` (fix the hardcoded `const currentPlan: PlanId = PlanId.FREE;` to read the real logged-in user's plan)

**Interfaces:**
- Consumes: `hasPlanAccess` from `lib/plan-access.ts`, `useAuth().user.subscriptionPlan`
- Produces: locked-state nav items consistent with the Copilot page lock (Task 3 Step 7), now driven by the actual user plan instead of a hardcoded `FREE`.

- [ ] **Step 1: Modify `nav-items.ts`** — change `{ to: '/copilot', label: 'Copilot', icon: Bot, minPlan: PlanId.BUSINESS }` to `minPlan: PlanId.STARTER`.

- [ ] **Step 2: Modify `sidebar.tsx`** — replace `const currentPlan: PlanId = PlanId.FREE;` with `const { user } = useAuth(); const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;`. Check `mobile-sidebar.tsx` for the same hardcode and fix it there too if present (rule of two — check first, don't assume).

- [ ] **Step 3: Run the full FE suite**

Run from repo root: `pnpm turbo run lint type-check test --filter=@casso-ledger/frontend`
Expected: all pass. Existing `sidebar.spec.tsx` may need its mocked `useAuth()` to include a `subscriptionPlan` if it doesn't already, to keep asserting the Copilot lock state correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout
git commit -m "feat(frontend): plan-locked nav item for copilot"
```

---

## Self-Review Notes

- **Spec coverage:** reminders page → Task 2 (reminder-automation plan: policies CRUD + executions read); copilot → Task 3 (canonical read tools plus pending action confirm/cancel through non-LLM endpoints, timeout ≤15s, `REMINDER_SEND_MANUAL` gating); reports → Task 4 (canonical aging buckets and dashboard summary, no precompute); bank connections → Task 5 (Cas ID initiate → QR → exchange → disconnect per cas-id plan); settings → Task 6 (billing static + 402 prompt, users list from Read APIs, and email templates using `bodyHtml` with preview `{ subject, bodyHtml }`).
- **Placeholder scan:** every task has concrete code; empty states are for empty data and all endpoint contracts point to an owning BE plan.
- **Type consistency:** `hasPlanAccess(currentPlan: PlanId, requiredPlan: PlanId)` signature (from the existing `lib/plan-access.ts`, not a new Task 1) consistent across Task 3/7; `CopilotPendingAction` matches the BE plan's `actionType: 'SEND_REMINDER_EMAIL'`; conversation id is client-generated `crypto.randomUUID()` matching the BE's lazy `findOrCreate` (collection-copilot plan Task 2).
- **RBAC decisions (grill Q4, re-confirmed 2026-08-10):** reminder-policy create/edit and email template create/edit/delete/preview both gated by the exact `Permission.REMINDER_POLICY_WRITE` — not `RECEIVABLE_WRITE` (2026-08-10 revision fixed this in Task 2; Task 6 already had it right); Users tab gated by OWNER/FINANCE_MANAGER role; Copilot action card only for `Permission.REMINDER_SEND_MANUAL` (documented in Task 3; the enum value already ships in `@casso-ledger/shared-types`, confirmed 2026-08-10).
- **Contract ownership:** bank connections, `subscriptionPlan` from `GET /api/v1/me`, and members list come from the Read APIs plan; policies, reports, and templates come from their owning BE plans. All FE request URLs retain the `/api/v1` prefix. `DashboardSummary.reminderEffectiveness` and `EmailTemplate.reminderStage`/`updatedAt` added 2026-08-10 — real backend fields the original plan omitted (see Revision Note).
- **Deferred:** real Cas redirect → auto-exchange after QR scan (Task 5 ponytail note); copilot conversation history (no BE endpoint by design); `EmailTemplate.reminderStage` form input (no downstream consumer yet, see Revision Note).


