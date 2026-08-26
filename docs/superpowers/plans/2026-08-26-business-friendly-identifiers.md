# Business-Friendly Identifier Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution status (2026-08-26):** Tasks 1–7 completed inline on the existing PR worktree; no subagents were dispatched per request. The step checklists below are historical implementation notes.

**Goal:** Replace raw UUIDs and internal enum labels with business-readable identifiers in the tenant-facing receivable, payment allocation, exception, reminder, and Copilot workflows.

**Architecture:** Add read-only presentation metadata at existing application/query seams, preserving domain payload IDs for commands. The frontend renders business metadata first and keeps technical IDs only in existing copyable secondary controls. No new dependency or separate design-system abstraction is introduced.

**Tech Stack:** NestJS, TypeORM, React, Vitest, Jest, existing `useCustomers`, `TruncatedCopyId`, and formatting helpers.

## Global Constraints

- Money remains integer VND; no decimal/float changes.
- Every backend read remains organization-scoped through existing repositories and tenant context.
- Domain layers do not import NestJS or TypeORM.
- Writes and Copilot action authorization semantics remain unchanged.
- Immutable audit payloads and raw webhook payloads are not rewritten.
- Existing components/helpers are reused; no new package is added.

---

### Task 1: Add batched read metadata for receivable details and allocations ✅

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/get-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/dto/receivable-response.dto.ts`
- Modify: `apps/backend/src/modules/payments/application/payment-repository.port.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`
- Test: `apps/backend/src/modules/receivables/application/get-receivable.usecase.spec.ts`
- Test: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.spec.ts`

**Interfaces:**
- `IPaymentRepository.findByIds(ids: string[]): Promise<Map<string, Payment>>` is a read-only, tenant-scoped batch lookup.
- `ReceivableWithDisputeStatus` gains `customerName: string | null` and a payment metadata map used by the presentation mapper.
- `PaymentAllocationResponseDto` gains nullable `payerName`, `bankTransactionId`, and `receivedAt`; `ReceivableDetailResponseDto` gains nullable `customerName`.

- [ ] **Step 1: Write failing tests** for customer-name resolution, one batched payment lookup, and null metadata when a referenced payment/customer is missing.
- [ ] **Step 2: Run focused tests** with `pnpm --filter @casso-ar/backend exec jest src/modules/receivables/application/get-receivable.usecase.spec.ts src/modules/payments/infrastructure/typeorm-payment.repository.spec.ts --runInBand`; confirm the new assertions fail.
- [ ] **Step 3: Implement the smallest read-side change**: inject existing customer/payment ports, add `findByIds` to the payment port/repository using the existing tenant-scoped repository pattern, and map metadata without changing domain entities or writes.
- [ ] **Step 4: Run the same focused tests** and confirm they pass.
- [ ] **Step 5: Commit** with `feat: add receivable display metadata`.

### Task 2: Add display metadata to exception candidates and reminder executions ✅

**Depends on:** Task 1 (the batched receivable repository lookup seam).

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Modify: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`
- Modify: `apps/backend/src/modules/reminders/application/list-reminder-executions.usecase.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/dto/reminder-execution-response.dto.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/reminders.controller.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Test: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.spec.ts`
- Test: `apps/backend/src/modules/reminders/application/list-reminder-executions.usecase.spec.ts`

**Interfaces:**
- `IReceivableRepository.findByIds(ids: string[]): Promise<Map<string, Receivable>>` is organization-scoped and read-only.
- Matching candidates expose `invoiceNumber`, `customerName`, `remainingAmount`, and `dueDate` as nullable/read-only presentation fields.
- Reminder execution list items expose `invoiceNumber` and `customerName` as nullable/read-only presentation fields.

- [ ] **Step 1: Write failing application tests** asserting batched candidate/execution enrichment and stable null fallbacks.
- [ ] **Step 2: Run only those specs** and confirm the new assertions fail.
- [ ] **Step 3: Implement batch projection lookups** with `findByIds` plus existing customer/invoice `findByIds`; keep the original domain objects and command IDs unchanged.
- [ ] **Step 4: Update controller mappers and Swagger DTOs**, then rerun the focused specs.
- [ ] **Step 5: Commit** with `feat: expose business labels for review queues`.

### Task 3: Preserve a human Copilot pending-action label ✅

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/pending-action-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`
- Test: `apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.spec.ts`
- Test: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.spec.ts`

**Interfaces:**
- `SendReminderEmailPayload` retains required `draftId`/`receivableId` and may carry nullable presentation fields (`customerName`, `invoiceNumber`).
- `CopilotPendingActionDto` exposes a nullable `receivableLabel`; command execution continues to use the original IDs.

- [ ] **Step 1: Write failing tests** asserting an action response contains a human label when receivable/customer metadata exists and null when it does not.
- [ ] **Step 2: Run the focused Copilot specs** and confirm failure.
- [ ] **Step 3: Add the minimal tenant-scoped read enrichment at action creation/reopen**, persist only presentation metadata in the existing JSON payload, and map it in every response path including SSE.
- [ ] **Step 4: Run focused Copilot specs** and confirm pass.
- [ ] **Step 5: Commit** with `feat: add business label to Copilot actions`.

### Task 4: Make receivable/customer screens business-readable ✅

**Depends on:** Task 1.

**Files:**
- Modify: `apps/frontend/src/features/receivables/components/create-receivable-dialog.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-payments.tsx`
- Modify: `apps/frontend/src/features/receivables/types.ts`
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.tsx`
- Test: matching component specs alongside each changed component

- [ ] **Step 1: Write failing component tests** for searchable customer selection, non-UUID customer fallback, detail customer label, payment payer display, and identifiable customer receivable rows.
- [ ] **Step 2: Run the affected Vitest files** and confirm failure.
- [ ] **Step 3: Reuse the exception queue's `useCustomers` search/select pattern; render `customerName`, `invoiceNumber`, payer metadata, and stable Vietnamese fallbacks while keeping IDs only in secondary copy controls.
- [ ] **Step 4: Run the affected Vitest files** and confirm pass.
- [ ] **Step 5: Commit** with `feat: improve receivable business labels`.

### Task 5: Make exception/reminder workflows business-readable ✅

**Depends on:** Task 2.

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Modify: `apps/frontend/src/features/exceptions/types.ts`
- Modify: `apps/frontend/src/features/reminders/components/executions-table.tsx`
- Modify: `apps/frontend/src/features/reminders/pages/reminders-page.tsx`
- Modify: `apps/frontend/src/features/reminders/components/policy-table.tsx`
- Modify: `apps/frontend/src/features/reminders/components/email-template-select.tsx`
- Test: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`
- Test: `apps/frontend/src/features/reminders/components/executions-table.spec.tsx`
- Test: `apps/frontend/src/features/reminders/components/policy-table.spec.tsx`
- Test: `apps/frontend/src/features/reminders/components/email-template-select.spec.tsx`

- [ ] **Step 1: Write failing tests** for candidate invoice/customer labels, execution invoice/customer labels, Vietnamese `REGULAR`, and the orphan-template fallback.
- [ ] **Step 2: Run those Vitest files** and confirm failure.
- [ ] **Step 3: Render the new metadata first, change reminder filtering copy to invoice/customer language, and keep raw IDs only as secondary technical context.
- [ ] **Step 4: Run those Vitest files** and confirm pass.
- [ ] **Step 5: Commit** with `feat: label exception and reminder records`.

### Task 6: Make Copilot and balance-history technical labels secondary ✅

**Depends on:** Task 3.

**Files:**
- Modify: `apps/frontend/src/features/copilot/types.ts`
- Modify: `apps/frontend/src/features/copilot/components/pending-action-card.tsx`
- Modify: `apps/frontend/src/features/copilot/components/drafts-list.tsx`
- Modify: `apps/frontend/src/features/copilot/components/email-draft-preview.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-filters.tsx`
- Modify: `apps/frontend/src/features/receivable-balance-history/components/receivable-balance-history-table.tsx`
- Modify: `apps/frontend/src/lib/collection-activity-labels.ts`
- Test: Copilot and balance-history component specs alongside each changed component

- [ ] **Step 1: Write failing tests** for Vietnamese pending-action copy, label fallback without UUID, technical-ID secondary treatment, and safe unknown activity labels.
- [ ] **Step 2: Run the affected Vitest files** and confirm failure.
- [ ] **Step 3: Implement the copy and fallback changes with existing formatting/copy controls; do not change command payloads.
- [ ] **Step 4: Run the affected Vitest files** and confirm pass.
- [ ] **Step 5: Commit** with `feat: localize Copilot and audit labels`.

### Task 7: Final verification and review ✅

**Files:**
- No new production files; update tests/docs only if verification finds a real gap.

- [ ] **Step 1: Run frontend focused tests, backend focused tests, and both package type checks.**
- [ ] **Step 2: Run the full test suite and record any pre-existing timeout separately from failures introduced by this branch.**
- [ ] **Step 3: Run `domain-check` and `pnpm verify`; fix every actionable violation.
- [x] **Step 4: Perform a manual two-axis review against `main...HEAD`; the automatic subagent review was intentionally skipped per the request to work inline, and the real bank-reference display gap was fixed in a follow-up commit.**
- [x] **Step 5: Run final verification again and push the branch with fresh evidence.**
