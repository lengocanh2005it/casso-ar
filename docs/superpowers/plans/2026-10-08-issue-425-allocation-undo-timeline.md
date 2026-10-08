# Allocation Undo Timeline Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Record a distinct, best-effort `ALLOCATION_UNDONE` timeline activity after a payment allocation undo commits.

**Architecture:** `UndoPaymentAllocationUseCase` publishes `payment.allocation-undone` after its financial transaction commits. `CollectionActivityListener` writes the immutable timeline entry using the existing failure-contained pattern; the existing timeline API and frontend label map expose it. A migration adds the PostgreSQL enum value for production.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, EventEmitter2 through `IEventPublisher`, Jest, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md` §6; GitHub issue #425.

## Global Constraints

- Money remains integer VND; the event amount is the positive amount undone.
- All financial writes remain inside the existing transaction and locks.
- Emit the timeline event only after that transaction commits; listener failures are logged and swallowed.
- Scope the activity with the allocation's explicit `organizationId`, receivable, and customer.
- Preserve the original `PAYMENT_RECEIVED` row; `CollectionActivity` stays append-only and is not a financial source of truth.
- No new dependency, outbox, or ADR; keep current Idempotency-Key behavior.

## Review Focus

1. A failed transaction must not emit the event or create an undo activity — covered at the use-case seam.
2. A repeated undo with the same Idempotency-Key returns the stored result; a new key returns `ALLOCATION_ALREADY_UNDONE`; both leave one undo activity — covered through the HTTP timeline integration test.
3. Large integer VND amounts and Vietnamese undo reasons must survive metadata and description without conversion — covered by listener and integration assertions.
4. The activity must carry the correct organization, receivable, customer, payment, allocation, and acting user — covered by the listener and integration assertions.
5. A listener insert failure must not fail the successful financial undo — covered by the listener's public handler.

---

### Task 0: Commit the approved design notes

**Files:**
- Modify: `GLOSSARY.md`
- Modify: `docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md`
- Modify: `docs/wayfinder/feature-map.md`
- Create: `docs/superpowers/plans/2026-10-08-issue-425-allocation-undo-timeline.md`

- [ ] **Step 1: Review the four-file diff** against the decisions agreed in the grilling session; keep the worktree path, `origin/main` base, and #425 status as recorded.
- [ ] **Step 2: Run `git diff --check`** and confirm it exits 0.
- [ ] **Step 3: Commit** as `docs: specify allocation undo timeline activity`.

### Task 1: Publish the undo event after commit

**Files:**
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.ts`

**Interfaces:**
- Consumes: `EVENT_PUBLISHER` / `IEventPublisher.emit(eventName, payload)`.
- Produces: `payment.allocation-undone` with `allocationId`, `paymentId`, `receivableId`, `customerId`, `organizationId`, `amount`, `undoneByUserId`, and `undoReason`.

- [ ] **Step 1: Write failing use-case tests** that record transaction completion and assert `execute()` emits the payload only after completion; reject the mocked transaction and assert no event is emitted; extend the existing duplicate test to assert a second attempt does not emit again.

```typescript
expect(eventPublisher.emit).toHaveBeenCalledWith('payment.allocation-undone', {
  allocationId: 'alloc-1',
  paymentId: 'pay-1',
  receivableId: 'rec-1',
  customerId: 'cust-1',
  organizationId: 'org-1',
  amount: 30_000_000,
  undoneByUserId: 'user-2',
  undoReason: 'Correction',
});
```

- [ ] **Step 2: Run the focused test and observe it fail.**

Run from `apps/backend`: `pnpm exec jest --runInBand src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`

Expected: the event publisher is not called because undo currently emits no event.

- [ ] **Step 3: Implement the smallest change.** Inject the existing publisher, capture the event fields from the locked allocation/receivable and input inside the transaction, then call `emit()` after `await dataSource.transaction(...)` resolves.

- [ ] **Step 4: Run the focused test and observe it pass**, including the previously written rejected-transaction assertion that `emit()` was not called.

- [ ] **Step 5: Commit** as `feat: publish payment allocation undo event`.

### Task 2: Write the immutable undo activity

**Files:**
- Modify: `apps/backend/src/modules/collection-activity/common/collection-activity-types.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/collection-activity.listener.spec.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/collection-activity.listener.ts`

**Interfaces:**
- Consumes: the `payment.allocation-undone` payload from Task 1.
- Produces: an `ALLOCATION_UNDONE` activity with `createdByUserId = undoneByUserId`; metadata contains the allocation/payment IDs, positive amount, and undo reason.

- [ ] **Step 1: Write a failing listener test** for the public event handler. Assert the activity links the same organization, receivable, and customer, uses type `ALLOCATION_UNDONE`, records the actor, and stores the agreed metadata and Vietnamese description. Add a failure case proving a repository error is swallowed by the existing listener pattern.

- [ ] **Step 2: Run the focused test and observe it fail.**

Run from `apps/backend`: `pnpm exec jest --runInBand src/modules/collection-activity/infrastructure/collection-activity.listener.spec.ts`

Expected: `ALLOCATION_UNDONE` and the handler do not exist yet.

- [ ] **Step 3: Implement the event type, payload interface, and one `@OnEvent('payment.allocation-undone')` handler that delegates to `safely()` and `write()`.

- [ ] **Step 4: Run the focused test and observe it pass.**

- [ ] **Step 5: Commit** as `feat: record allocation undo in collection activity`.

### Task 3: Add the production enum migration and frontend label

**Files:**
- Create: `apps/backend/src/database/migrations/20261008000000-add-allocation-undone-activity.ts`
- Create: `apps/backend/src/database/migrations/20261008000000-add-allocation-undone-activity.spec.ts`
- Modify: `apps/frontend/src/lib/collection-activity-labels.spec.ts`
- Modify: `apps/frontend/src/lib/collection-activity-labels.ts`

**Interfaces:**
- Database enum: add `ALLOCATION_UNDONE` to `collection_activities_activityType_enum` with `ADD VALUE IF NOT EXISTS`.
- Frontend label: `ALLOCATION_UNDONE` renders `Hoàn tác phân bổ`.

- [ ] **Step 1: Write a failing migration test** asserting the migration is transactional and executes the enum addition; write a failing label test asserting `formatActivityType('ALLOCATION_UNDONE') === 'Hoàn tác phân bổ'`.

- [ ] **Step 2: Run both focused tests and observe them fail.**

Run from `apps/backend`: `pnpm exec jest --runInBand src/database/migrations/20261008000000-add-allocation-undone-activity.spec.ts`

Run from `apps/frontend`: `pnpm exec vitest run src/lib/collection-activity-labels.spec.ts`

Expected: migration/label behavior is absent.

- [ ] **Step 3: Implement the minimal migration and label.** Keep `down()` non-destructive because removing an enum value could invalidate stored activity rows.

- [ ] **Step 4: Run both focused tests and observe them pass.**

- [ ] **Step 5: Commit** as `feat: expose allocation undo activity type`.

### Task 4: Prove the full timeline behavior

**Files:**
- Modify: `apps/backend/test/collection-activity-timeline.integration.spec.ts`

- [ ] **Step 1: Extend the HTTP integration flow** to allocate a payment, undo that allocation with a reason, and poll the receivable timeline until it contains both `PAYMENT_RECEIVED` and `ALLOCATION_UNDONE`. Assert the undo activity carries its actor, reason, amount, and allocation/payment references, and appears in the customer timeline too. In the same test, replay the same idempotency key and then send a new key for the undone allocation; assert the replay succeeds, the new key returns HTTP 409, and the timeline still has one undo row.

- [ ] **Step 2: Run the integration test and observe the new undo assertions fail.**

Run from `apps/backend`: `pnpm exec jest --config ./test/jest-e2e.json --runInBand test/collection-activity-timeline.integration.spec.ts`

Expected: the timeline contains no `ALLOCATION_UNDONE` row.

- [ ] **Step 3: Run the integration test again and observe all assertions pass.**

- [ ] **Step 4: Commit** as `test: cover allocation undo activity timeline`.

## Final Verification

- Run `pnpm --filter @casso-ar/backend type-check` and `pnpm --filter @casso-ar/frontend type-check` from the repository root.
- Run the focused backend use-case/listener/migration specs, the frontend collection-activity label spec, and the collection-activity timeline e2e command from their task steps.
- Run `pnpm --filter @casso-ar/backend test` and `pnpm --filter @casso-ar/frontend test` once, then `pnpm verify` from the repository root.
- Run `/domain-check` after backend changes and resolve any violations.
- Run `/code-review` against `origin/main`; fix findings and repeat relevant checks.
- Commit any review fixes, push the issue branch, and open a PR closing #425. Leave the PR unmerged for user review.
