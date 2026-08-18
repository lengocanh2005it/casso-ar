# Manual Payment Allocation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let accountants allocate an unapplied customer payment to a same-customer receivable from the customer detail page, with clear inline allocation errors and consistent error handling in the existing exception queue.

**Architecture:** Reuse the existing `POST /api/v1/payments/:id/allocate` endpoint and the existing customer credit and receivable queries. Add a small frontend payment-allocation API hook, a focused credit allocation dialog, and a shared error-code-to-Vietnamese-message mapper; do not add backend endpoints or new dependencies.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library, existing shadcn/ui primitives, Axios wrapper.

**Spec:** GitHub issue #233 plus the approved design in the conversation.

## Global Constraints

- Money values remain integer VND amounts; use `Number.isInteger`, positive validation, and `formatVND`.
- The frontend must call the existing allocation endpoint with `postWithIdempotency` and `{ receivableId, amount }`.
- Only receivables with `remainingAmount > 0` are selectable; backend error codes remain authoritative.
- Error handling must expose `ALLOCATION_EXCEEDS_REMAINING`, `ALLOCATION_EXCEEDS_UNALLOCATED`, `CUSTOMER_MISMATCH`, and `PAYMENT_CUSTOMER_UNRESOLVED` inline in the allocation form.
- Every behavior change follows RED → GREEN → REFACTOR, with the focused test run after each cycle.
- Do not add a package or change backend code for this frontend-only ticket.

---

### Task 1: Add shared allocation transport and error mapping

**Files:**
- Create: `apps/frontend/src/features/customers/api/customers-api.spec.ts`
- Modify: `apps/frontend/src/features/customers/api/customers-api.ts`
- Modify: `apps/frontend/src/features/customers/api/use-customers.ts`
- Modify: `apps/frontend/src/lib/api-client.ts`
- Modify: `apps/frontend/src/lib/api-client.spec.ts`
- Create: `apps/frontend/src/features/payments/allocation-errors.ts`
- Create: `apps/frontend/src/features/payments/allocation-errors.spec.ts`

**Interfaces:**
- Produce `allocatePayment(paymentId: string, input: { receivableId: string; amount: number }): Promise<{ id: string }>`.
- Produce `useAllocatePayment()` with a mutation accepting `{ paymentId, receivableId, amount }` and invalidating `['customer-credits']`, `['receivables']`, and `['receivable', receivableId]` after success.
- Produce `getApiErrorCode(error: unknown): string | undefined` from `lib/api-client.ts`.
- Produce `getAllocationErrorMessage(error: unknown): string`, mapping the four issue error codes to Vietnamese inline messages and returning a safe fallback for unknown errors.

- [ ] **Step 1: Write the failing API, error-mapper, and query-invalidation tests.**
  - Assert the allocation API posts to `/api/v1/payments/payment-1/allocate` with `{ receivableId: 'receivable-1', amount: 500000 }` through `postWithIdempotency`.
  - Assert `getApiErrorCode` extracts `errorCode` from an Axios-shaped `{ response: { data: { errorCode } } }` error and returns `undefined` for unrelated values.
  - Assert each of the four allocation error codes renders the intended Vietnamese message and an unknown code returns the generic message.
- [ ] **Step 2: Run the focused tests and verify they fail for missing exports/behavior.**
  - Run: `pnpm --filter frontend exec vitest run src/features/customers/api/customers-api.spec.ts src/features/payments/allocation-errors.spec.ts src/lib/api-client.spec.ts`
  - Expected: FAIL because the new allocation API, error-code export, and mapper do not exist.
- [ ] **Step 3: Implement the smallest transport and error-mapping code.**
  - Add `allocatePayment` using `postWithIdempotency`.
  - Add `useAllocatePayment` using the existing TanStack Query mutation pattern.
  - Export the existing error-code extraction logic without duplicating Axios narrowing.
  - Add the four stable Vietnamese messages and generic fallback.
- [ ] **Step 4: Run the focused tests and verify they pass.**
  - Run: `pnpm --filter frontend exec vitest run src/features/customers/api/customers-api.spec.ts src/features/payments/allocation-errors.spec.ts src/lib/api-client.spec.ts`
  - Expected: PASS.
- [ ] **Step 5: Commit the task.**
  ```bash
  git add apps/frontend/src/features/customers/api apps/frontend/src/features/payments apps/frontend/src/lib/api-client.ts apps/frontend/src/lib/api-client.spec.ts
  git commit -m "feat: add payment allocation frontend transport"
  ```

### Task 2: Build the credit allocation dialog and customer-detail flow

**Files:**
- Create: `apps/frontend/src/features/customers/components/allocate-credit-dialog.tsx`
- Create: `apps/frontend/src/features/customers/components/allocate-credit-dialog.spec.tsx`
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.tsx`
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.spec.tsx`
- Modify: `apps/frontend/src/features/receivables/api/receivables-api.ts`
- Modify: `apps/frontend/src/features/receivables/api/use-receivables.ts`

**Interfaces:**
- `AllocateCreditDialog` accepts `open`, `onOpenChange`, `payment`, and `receivables` props; it owns selected receivable, amount, and inline error state.
- The dialog renders only receivables whose `remainingAmount > 0`, shows the payment's available unallocated amount, and disables submit until a same-customer receivable and positive integer amount are selected.
- `useReceivables` gains an optional `limit = 20` argument, preserving existing callers while allowing customer detail to request up to the API maximum of 100 receivables for allocation.

- [ ] **Step 1: Write failing dialog and page tests.**
  - Assert the customer detail credit card lists an unapplied payment and exposes a `Phân bổ` button.
  - Assert opening the dialog shows only receivables with positive `remainingAmount`, displays the payment balance, and submits `{ paymentId, receivableId, amount }`.
  - Assert a non-integer, zero, or amount above the payment balance cannot submit.
  - Assert a successful allocation closes the dialog and invalidates the credit/receivable queries through the hook.
- [ ] **Step 2: Run the focused tests and verify they fail for the missing dialog/action.**
  - Run: `pnpm --filter frontend exec vitest run src/features/customers/components/allocate-credit-dialog.spec.tsx src/features/customers/pages/customer-detail-page.spec.tsx`
  - Expected: FAIL because the dialog and credit action are not implemented.
- [ ] **Step 3: Implement the dialog and page integration.**
  - Add the dialog using existing `Dialog`, `Select`, `Input`, `Button`, and `Alert`/text primitives.
  - Use `useAllocatePayment`; on success close the dialog and rely on query invalidation to refresh both cards.
  - Show the selected receivable's remaining amount beside the amount field and use `Math.min(payment.unallocatedAmount, receivable.remainingAmount)` as the client-side maximum.
  - Render all credit items with a compact payment summary and action button in the customer detail card.
  - Request up to 100 customer receivables while preserving the existing five-item preview and “Xem tất cả” link.
- [ ] **Step 4: Run the focused tests and verify they pass.**
  - Run: `pnpm --filter frontend exec vitest run src/features/customers/components/allocate-credit-dialog.spec.tsx src/features/customers/pages/customer-detail-page.spec.tsx`
  - Expected: PASS.
- [ ] **Step 5: Commit the task.**
  ```bash
  git add apps/frontend/src/features/customers apps/frontend/src/features/receivables/api
  git commit -m "feat: add customer credit allocation dialog"
  ```

### Task 3: Surface allocation errors inline in the exception queue

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

**Interfaces:**
- Reuse `getAllocationErrorMessage` from Task 1.
- Keep the existing optimistic-lock conflict toast, but also render a `role="alert"` message in the dialog for allocation error codes and local total validation.

- [ ] **Step 1: Write the failing regression test.**
  - Make the match API reject with `ALLOCATION_EXCEEDS_REMAINING` and assert the Vietnamese inline message appears in the dialog.
  - Assert the local total-over-transaction validation appears inline rather than only as a toast.
- [ ] **Step 2: Run the focused regression test and verify it fails.**
  - Run: `pnpm --filter frontend exec vitest run src/features/exceptions/components/split-match-dialog.spec.tsx`
  - Expected: FAIL because the dialog currently only emits a generic toast and has no inline error region.
- [ ] **Step 3: Implement the inline error state.**
  - Add a nullable error message state, clear it when the user edits an amount, and set it from `getAllocationErrorMessage` in the mutation `onError` callback.
  - Render the message next to the running total with `role="alert"` and `aria-live="polite"`.
- [ ] **Step 4: Run the focused regression test and verify it passes.**
  - Run: `pnpm --filter frontend exec vitest run src/features/exceptions/components/split-match-dialog.spec.tsx`
  - Expected: PASS.
- [ ] **Step 5: Commit the task.**
  ```bash
  git add apps/frontend/src/features/exceptions/components/split-match-dialog.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx
  git commit -m "fix: show payment allocation errors inline"
  ```

### Task 4: Update tracker and run branch verification

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

- [ ] **Step 1: Add the shipped entry after implementation is verified.**
  - Move issue #233 from in-progress to done, record the shipped date and PR reference, and add the feature to the Frontier history.
- [ ] **Step 2: Run focused frontend tests for every changed behavior.**
  - Run: `pnpm --filter frontend exec vitest run src/features/customers/api/customers-api.spec.ts src/features/payments/allocation-errors.spec.ts src/features/customers/components/allocate-credit-dialog.spec.tsx src/features/customers/pages/customer-detail-page.spec.tsx src/features/exceptions/components/split-match-dialog.spec.tsx src/lib/api-client.spec.ts`
  - Expected: PASS with zero failed tests.
- [ ] **Step 3: Run frontend type-check and repository verification.**
  - Run: `pnpm --filter frontend exec tsc --noEmit`
  - Run: `pnpm verify`
  - Expected: both commands exit 0; report any unrelated baseline failures explicitly rather than hiding them.
- [ ] **Step 4: Review the final diff and commit the tracker update.**
  ```bash
  git diff --check
  git status --short
  git add docs/wayfinder/feature-map.md
  git commit -m "docs: mark manual payment allocation UI shipped"
  ```
