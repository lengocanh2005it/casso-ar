# Credit Balance Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-scoped customer credit read API while keeping `Payment` rollups as the only source of truth and reusing the existing allocation/undo transaction core.

> **2026-08-11 rescoping note (pre-implementation review):** this plan was drafted 2026-08-04, the same day as its spec. Ground-truth review of the current codebase found most of its premises already shipped by other work — this is smaller than the two most recently shipped tickets' rescopings, not bigger:
>
> 1. **Task 3 (validate customer in `mark-prepaid`) is a complete no-op.** `mark-prepaid-bank-transaction.usecase.ts` already injects `ICustomerRepository`, already throws `AppError(ErrorCode.NOT_FOUND, ...)` for a missing/cross-tenant customer, and `mark-prepaid-bank-transaction.usecase.spec.ts` already has `it('rejects a customer outside the current tenant', ...)`. `ExceptionQueueModule` already imports `CustomersModule`. **Task 3 is dropped entirely** — nothing to build.
> 2. **Task 4's production guards already exist; only the test coverage was missing.** `allocate-payment.usecase.ts` already throws `AppError(ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED, ...)` for a null `payment.customerId` and `AppError(ErrorCode.CUSTOMER_MISMATCH, ...)` for a customerId mismatch — but `allocate-payment.usecase.spec.ts` has no test exercising either path. **Task 4 is narrowed to just adding the 2 missing unit tests** — no production code changes.
> 3. **Task 1's `scopedQueryBuilder` addition to `BaseRepository` is unnecessary.** The `totalAmount > allocatedAmount` column-to-column comparison this needs can be expressed with TypeORM's `Raw()` FindOperator inside the existing `scopedFindMany(where, options)` — no new `BaseRepository` surface needed. See Task 1's rewritten Step 3.
> 4. **`IPaymentRepository`'s real current shape** is `findByIdForUpdate(id, manager)` (not the plan's assumed `findById(id)`) + `save(payment, manager?)`, with an existing `toOrm`/`fromOrm` explicit-mapper pair already in `typeorm-payment.repository.ts` (added by an unrelated Postgres-bigint-coercion fix — still present, not reverted). `findUnallocatedByCustomerId` is added alongside these, not replacing them.
> 5. **Guard pattern correction (Task 2):** `JwtAuthGuard` is registered globally (`APP_GUARD` in `app.module.ts`) — the existing `PaymentsController` only declares `@UseGuards(PermissionGuard)`, never re-declaring `JwtAuthGuard`. The plan's controller sample (`@UseGuards(JwtAuthGuard, PermissionGuard)`) is stale; follow the established single-guard pattern.
> 6. **Error handling correction (Task 2):** every use case in `payments/application/` and `exception-queue/application/` already throws `AppError(ErrorCode.X, message)` — never NestJS's `NotFoundException`/`BadRequestException` directly, per AGENTS.md's Error Handling section (the exact same mistake a prior ticket's plan made, caught before implementation here instead of after). `GetCustomerCreditsUseCase`'s samples are rewritten below to match.
> 7. **Test naming (Task 5):** repo convention is dominantly `*.e2e-spec.ts` (19 of 23 files in `apps/backend/test/`) — the plan's `credit-balance-management.e2e-spec.ts` is renamed to `credit-balance-management.e2e-spec.ts`.
> 8. **Task 6's documentation-sync scope is pruned**, matching how the two most recently shipped tickets closed — down from 6 other files (`docs/overview.md`, Domain Core spec, Exception Queue spec/plan, Spec-Plan Reconciliation plan) to just `docs/wayfinder/feature-map.md`.
>
> **What's actually left to build**, post-rescoping: Task 1 (repository query, using `Raw()` not a new `BaseRepository` method), Task 2 (the read use case + controller + `CustomersModule` import into `PaymentsModule` — this part is genuinely new), Task 4 narrowed to 2 missing unit tests, Task 5 (e2e test), Task 6 narrowed to `feature-map.md`. Task 3 is gone.

**Architecture:** Extend the Payments module with `GetCustomerCreditsUseCase` and `GET /customers/:customerId/credits`. Extend the existing Payment repository with an active unallocated query; do not create a credit entity or repository. Harden the existing `mark-prepaid` and allocation paths so every credit Payment has a valid tenant customer and can only be allocated to that customer's Receivable.

**Tech Stack:** NestJS 10, TypeORM, existing `BaseRepository`/`TenantContextService`, JWT/RBAC, existing AuditLog, Jest, Supertest, and the existing Postgres testcontainer setup. No new npm dependency.

## Global Constraints

- `Payment.totalAmount` and persisted `Payment.allocatedAmount` are the source rollups; `unallocatedAmount` is `totalAmount - allocatedAmount`.
- Never create `CustomerCreditBalance`, `CreditBalance`, a credit snapshot, or a second payment-allocation use case.
- `findUnallocatedByCustomerId` queries persisted Payment rollups (`totalAmount > allocatedAmount`); it never sums `PaymentAllocation` rows at read time.
- All Payment, Customer, Receivable, and BankTransaction queries use the current tenant context. No request body contains `organizationId`.
- `GET /customers/:customerId/credits` uses `RECEIVABLE_READ`; existing allocation/undo permissions remain `PAYMENT_ALLOCATE` and `PAYMENT_ALLOCATE_UNDO`.
- Existing `POST /payments/:id/allocate` remains the only credit write path. Existing `POST /payments/allocations/:allocationId/undo` remains the only undo path.
- Allocation and undo must use the existing transaction/row-lock core and update Payment/Receivable rollups atomically.
- All money amounts are positive/non-negative integers in VND; no floating point.
- `mark-prepaid` must validate `customerId` through the tenant-scoped Customer repository before creating Payment.
- No FE screen, route removal, or change to existing FE API calls.
- Domain code has no NestJS/TypeORM imports; application code uses existing repository tokens and module boundaries.

---

## File Structure

**(2026-08-11: file list corrected — see rescoping note above. `base.repository.ts` is untouched, Task 3's files are dropped, Task 4 only touches its spec file, doc sprawl pruned to `feature-map.md`.)**

```
apps/backend/src/
  modules/payments/
    application/payment-repository.port.ts                  -- MODIFY: CustomerCreditRow + findUnallocatedByCustomerId
    application/get-customer-credits.usecase.ts             -- NEW
    application/get-customer-credits.usecase.spec.ts        -- NEW
    infrastructure/typeorm-payment.repository.ts            -- MODIFY: unallocated customer query (Raw() operator)
    infrastructure/typeorm-payment.repository.spec.ts       -- NEW
    presentation/customer-credits.controller.ts             -- NEW: GET endpoint
    presentation/customer-credits.controller.spec.ts        -- NEW
    payments.module.ts                                       -- MODIFY: register use case/controller, import CustomersModule
    application/allocate-payment.usecase.spec.ts             -- MODIFY: add 2 missing guard-coverage tests (no production code change)
  test/credit-balance-management.e2e-spec.ts                 -- NEW

docs/wayfinder/feature-map.md                                -- MODIFY: mark this ticket done
```

The existing Payment entity, `Payment.customerId`, `Payment.unallocatedAmount`, `AllocatePaymentUseCase`, and `UndoPaymentAllocationUseCase` are reused. No database table or migration is added.

### Task 1: Add a tenant-scoped unallocated Payment query

**(2026-08-11: rewritten — no `BaseRepository` changes. `totalAmount > allocatedAmount` is a column-to-column comparison, which TypeORM's `Raw()` FindOperator expresses inside the existing `scopedFindMany(where, options)` helper, so no new query-builder surface is needed on the shared base class.)**

**Files:**
- Modify: `apps/backend/src/modules/payments/application/payment-repository.port.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService`, `BaseRepository.scopedFindMany`, `Payment`, `fromOrm` (the mapper already in this file), and the existing `PAYMENT_REPOSITORY` token.
- Produces: `CustomerCreditRow` and `IPaymentRepository.findUnallocatedByCustomerId(customerId)` for Task 2.

- [ ] **Step 1: Extend the Payment repository port**

Modify `payment-repository.port.ts` — add to the existing interface, do not replace `findByIdForUpdate`/`save`:

```typescript
export interface CustomerCreditRow {
  payment: Payment;
  unallocatedAmount: number;
}

export interface IPaymentRepository {
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Payment | null>;
  findUnallocatedByCustomerId(customerId: string): Promise<CustomerCreditRow[]>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}
```

- [ ] **Step 2: Write the failing Payment query test**

Create `typeorm-payment.repository.spec.ts`:

```typescript
it('returns only the current tenant customer payments with a positive unallocated rollup', async () => {
  const tenantContext = new TenantContextService();
  const ormRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'pay-1',
        organizationId: 'org-1',
        customerId: 'cust-1',
        bankTransactionId: null,
        totalAmount: 25_000_000,
        allocatedAmount: 20_000_000,
        payerName: 'Công ty B',
        receivedAt: new Date('2026-08-01'),
        createdAt: new Date('2026-08-01'),
      },
    ]),
  };
  const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

  const rows = await tenantContext.run(
    { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
    () => repo.findUnallocatedByCustomerId('cust-1'),
  );

  expect(ormRepo.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1', customerId: 'cust-1' }),
      order: { receivedAt: 'ASC', id: 'ASC' },
    }),
  );
  expect(rows[0].unallocatedAmount).toBe(5_000_000);
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pnpm --filter @casso-ledger/backend test -- typeorm-payment.repository.spec.ts --runInBand`

Expected: FAIL because `findUnallocatedByCustomerId` is not implemented.

- [ ] **Step 4: Implement the tenant-scoped query using `Raw()`**

In `TypeOrmPaymentRepository`, add (reusing the existing `fromOrm` mapper already in this file):

```typescript
async findUnallocatedByCustomerId(customerId: string): Promise<CustomerCreditRow[]> {
  const rows = await this.scopedFindMany(
    {
      customerId,
      totalAmount: Raw((alias) => `${alias} > "allocatedAmount"`),
    },
    { order: { receivedAt: 'ASC', id: 'ASC' } },
  );

  return rows.map((row) => {
    const payment = fromOrm(row);
    return { payment, unallocatedAmount: payment.unallocatedAmount };
  });
}
```

This uses persisted Payment rollups (never sums `PaymentAllocation`) and `scopedFindMany`'s existing tenant predicate — no new `BaseRepository` method, no `organizationId` parameter on the port method.

- [ ] **Step 5: Run focused repository tests and commit**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- typeorm-payment.repository.spec.ts --runInBand
```

Expected: PASS.

```bash
git add apps/backend/src/modules/payments/application/payment-repository.port.ts apps/backend/src/modules/payments/infrastructure
git commit -m "feat: query tenant-scoped unallocated customer payments"
```

### Task 2: Add `GET /customers/:customerId/credits`

**Files:**
- Create: `apps/backend/src/modules/payments/application/get-customer-credits.usecase.ts`
- Create: `apps/backend/src/modules/payments/application/get-customer-credits.usecase.spec.ts`
- Create: `apps/backend/src/modules/payments/presentation/customer-credits.controller.ts`
- Create: `apps/backend/src/modules/payments/presentation/customer-credits.controller.spec.ts`
- Modify: `apps/backend/src/modules/payments/payments.module.ts`

**Interfaces:**
- Consumes: `ICustomerRepository.findById`, `IPaymentRepository.findUnallocatedByCustomerId`, `PermissionGuard`, and `@RequirePermission`.
- Produces: `GET /customers/:customerId/credits`, publicly `/api/v1/customers/:customerId/credits`.

- [ ] **Step 1: Write failing use-case tests**

Create `get-customer-credits.usecase.spec.ts`:

```typescript
it('aggregates credit rows without changing Payment state', async () => {
  const customerRepo = { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
  const paymentRepo = {
    findUnallocatedByCustomerId: jest.fn().mockResolvedValue([
      { payment: buildPayment('pay-1', 20_000_000, 15_000_000), unallocatedAmount: 5_000_000 },
      { payment: buildPayment('pay-2', 10_000_000, 8_000_000), unallocatedAmount: 2_000_000 },
    ]),
  };
  const useCase = new GetCustomerCreditsUseCase(customerRepo as any, paymentRepo as any);

  await expect(useCase.execute({ customerId: 'cust-1' })).resolves.toEqual({
    customerId: 'cust-1',
    totalAvailableAmount: 7_000_000,
    items: expect.arrayContaining([
      expect.objectContaining({ paymentId: 'pay-1', unallocatedAmount: 5_000_000 }),
      expect.objectContaining({ paymentId: 'pay-2', unallocatedAmount: 2_000_000 }),
    ]),
  });
  expect(paymentRepo.findUnallocatedByCustomerId).toHaveBeenCalledWith('cust-1');
});

it('returns an empty balance for a customer with no unallocated payments', async () => {
  const useCase = buildUseCase({ findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) }, {
    findUnallocatedByCustomerId: jest.fn().mockResolvedValue([]),
  });

  await expect(useCase.execute({ customerId: 'cust-1' })).resolves.toEqual({
    customerId: 'cust-1', totalAvailableAmount: 0, items: [],
  });
});
```

Also assert missing customer throws `AppError` with `errorCode: ErrorCode.NOT_FOUND` (**2026-08-11: corrected from `NotFoundException`** — every use case in `payments/application/` and `exception-queue/application/` throws `AppError(ErrorCode.X, message)`, never a NestJS exception directly, per AGENTS.md's Error Handling section; see the rescoping note at the top of this plan) and the use case input contains only `customerId`.

- [ ] **Step 2: Run the use-case tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- get-customer-credits.usecase.spec.ts --runInBand`

Expected: FAIL because `GetCustomerCreditsUseCase` is absent.

- [ ] **Step 3: Implement the read use case**

Create `GetCustomerCreditsUseCase` with:

```typescript
export interface GetCustomerCreditsInput {
  customerId: string;
}

export interface CustomerCreditsResult {
  customerId: string;
  totalAvailableAmount: number;
  items: Array<{
    paymentId: string;
    bankTransactionId: string | null;
    totalAmount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    payerName: string;
    receivedAt: Date;
    createdAt: Date;
  }>;
}
```

Algorithm:

1. Call `customerRepo.findById(input.customerId)`; throw `new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.')` when null (Vietnamese message, matching every other use case's user-facing text).
2. Call `paymentRepo.findUnallocatedByCustomerId(input.customerId)`.
3. Sum the integer `unallocatedAmount` values.
4. Map only the response fields above; do not return the Payment domain object directly.

- [ ] **Step 4: Run the use-case tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write the controller contract test**

Create `customer-credits.controller.spec.ts`:

```typescript
it('delegates the tenant-scoped customer id and returns the read contract', async () => {
  const useCase = { execute: jest.fn().mockResolvedValue({
    customerId: 'cust-1', totalAvailableAmount: 5_000_000, items: [],
  }) };
  const controller = new CustomerCreditsController(useCase as any);

  await expect(controller.list('cust-1')).resolves.toEqual({
    customerId: 'cust-1', totalAvailableAmount: 5_000_000, items: [],
  });
  expect(useCase.execute).toHaveBeenCalledWith({ customerId: 'cust-1' });
});
```

- [ ] **Step 6: Run the controller test and verify it fails**

Run: `pnpm --filter @casso-ledger/backend test -- customer-credits.controller.spec.ts --runInBand`

Expected: FAIL because the controller is absent.

- [ ] **Step 7: Implement and register the controller**

Create `customer-credits.controller.ts`:

**(2026-08-11: corrected — `JwtAuthGuard` is registered globally via `APP_GUARD` in `app.module.ts`; the existing `PaymentsController` in this same module never re-declares it, only `@UseGuards(PermissionGuard)`. Also added `ParseUUIDPipe` on the route param, matching the convention every other tenant-scoped controller in this codebase uses.)**

```typescript
@Controller('customers/:customerId/credits')
@UseGuards(PermissionGuard)
export class CustomerCreditsController {
  constructor(private readonly getCustomerCreditsUseCase: GetCustomerCreditsUseCase) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerCreditsResult> {
    return this.getCustomerCreditsUseCase.execute({ customerId });
  }
}
```

Modify `PaymentsModule` to import `CustomersModule` (genuinely new wiring — confirmed not already imported), provide `GetCustomerCreditsUseCase`, and register `CustomerCreditsController`. Preserve the existing Payments controller, allocation use case, and exports.

- [ ] **Step 8: Run focused API tests and commit**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- get-customer-credits.usecase.spec.ts customer-credits.controller.spec.ts --runInBand
```

Expected: PASS.

```bash
git add apps/backend/src/modules/payments
git commit -m "feat: expose customer credit balance read API"
```

### Task 3: Harden `mark-prepaid` customer attribution — DROPPED, already shipped

**Do not implement this task.** `mark-prepaid-bank-transaction.usecase.ts` already injects `ICustomerRepository`/`CUSTOMER_REPOSITORY` and already throws `AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng trong tổ chức hiện tại.')` for a missing/cross-tenant customer before creating the credit Payment. `mark-prepaid-bank-transaction.usecase.spec.ts` already has `it('rejects a customer outside the current tenant', ...)`. `ExceptionQueueModule` already imports `CustomersModule`. This entire task — production code, tests, and module wiring — was shipped by earlier work. Nothing to build here.

### Task 4: Add missing test coverage for existing allocation credit guards

**(2026-08-11: narrowed — the production guards this task originally set out to add already exist in `allocate-payment.usecase.ts`. Only the test coverage is missing. No production code changes in this task.)**

**Files:**
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`

**Interfaces:**
- Consumes: existing `AllocatePaymentUseCase` (already throws `AppError(ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED, ...)` for a null `payment.customerId`, and `AppError(ErrorCode.CUSTOMER_MISMATCH, ...)` for a `payment.customerId !== receivable.customerId` mismatch).
- Produces: 2 new unit tests proving these already-shipped guards, closing a real coverage gap (confirmed via `grep` — no existing test in this spec file exercises either path).

- [ ] **Step 1: Add the 2 missing tests**

```typescript
it('rejects allocation when the payment has no resolved customer', async () => {
  const payment = buildPayment({ customerId: null, totalAmount: 10_000_000, allocatedAmount: 0 });
  const receivable = buildReceivable({ customerId: 'cust-1' });

  await expect(
    useCase.execute({ paymentId: payment.id, receivableId: receivable.id, amount: 1_000_000, allocatedByUserId: 'u1' }),
  ).rejects.toMatchObject({ errorCode: ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED });
});

it('rejects allocation when the payment and receivable belong to different customers', async () => {
  const payment = buildPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 0 });
  const receivable = buildReceivable({ customerId: 'cust-2' });

  await expect(
    useCase.execute({ paymentId: payment.id, receivableId: receivable.id, amount: 1_000_000, allocatedByUserId: 'u1' }),
  ).rejects.toMatchObject({ errorCode: ErrorCode.CUSTOMER_MISMATCH });
});
```

Adapt to whatever fixture/mock-building helpers (`buildPayment`, `buildReceivable`, `useCase`) already exist at the top of this spec file — do not invent new ones if equivalents are already there.

- [ ] **Step 2: Run and verify both pass immediately (proving the guards already work)**

Run: `pnpm --filter @casso-ledger/backend test -- allocate-payment.usecase.spec.ts --runInBand`

Expected: PASS on the first run — these tests exercise pre-existing code, so there is no RED step here (the standard TDD exception for "adding regression/coverage tests for already-correct behavior," not a new-behavior change).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts
git commit -m "test: cover existing credit allocation customer guards"
```

### Task 5: Add end-to-end credit lifecycle tests

**Files:**
- Create: `apps/backend/test/credit-balance-management.e2e-spec.ts`

**Interfaces:**
- Consumes: the new credits GET route, existing mark-prepaid route, existing allocate/undo routes, and Postgres testcontainer setup.
- Produces: integration evidence for tenant isolation, aggregate read behavior, allocation decrease, undo restoration, and concurrency.

- [ ] **Step 1: Write the failing integration scenarios**

Create the suite with these requests:

```typescript
it('lists marked-prepaid credit and aggregates partial credits', async () => {
  await markPrepaid('bt-1', 'cust-1');
  await seedPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 3_000_000 });

  await request(app.getHttpServer())
    .get('/api/v1/customers/cust-1/credits')
    .set('Authorization', `Bearer ${accountantToken}`)
    .expect(200)
    .expect(({ body }) => {
      expect(body.customerId).toBe('cust-1');
      expect(body.totalAvailableAmount).toBe(creditFromBt1 + 7_000_000);
      expect(body.items.every((item: any) => item.unallocatedAmount > 0)).toBe(true);
    });
});

it('reduces credit after allocation and restores it after undo', async () => {
  const payment = await seedPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 0 });

  await allocate(payment.id, 'rec-cust-1', 4_000_000);
  await expectCreditTotal('cust-1', 6_000_000);

  const allocationId = await findActiveAllocation(payment.id);
  await undo(allocationId, 'wrong invoice');
  await expectCreditTotal('cust-1', 10_000_000);
});
```

Also cover empty result, fully allocated exclusion, invalid role (`403`), cross-tenant customer (`404`), cross-customer allocation (`400`), over-allocation (`400`), and two concurrent allocations that together cannot exceed one Payment's starting unallocated amount.

- [ ] **Step 2: Run the integration suite and verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- credit-balance-management.e2e-spec.ts --runInBand`

Expected: FAIL until the route and contract wiring are complete.

- [ ] **Step 3: Run the integration suite after Tasks 1–4**

Run the command from Step 2. Expected: PASS, including the concurrency assertion.

- [ ] **Step 4: Run backend verification**

Run:

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e -- credit-balance-management.e2e-spec.ts --runInBand
pnpm --filter @casso-ledger/backend type-check
```

Expected: all relevant unit tests, integration tests, and type-check pass.

```bash
git add apps/backend/test
git commit -m "test: verify customer credit balance lifecycle"
```

### Task 6: Update `feature-map.md`

**(2026-08-11: scope pruned — the original draft proposed editing 5 other already-shipped plans' spec/plan docs plus `docs/overview.md`. Matching how the three most recently shipped tickets closed (Plan #22, Plan #23, Customer Bank Account Management), this ticket only updates `feature-map.md`.)**

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

**Interfaces:**
- Consumes: the completed implementation from Tasks 1, 2, 4, 5.
- Produces: an accurate `feature-map.md` entry for this ticket (currently in the "ADDITIONAL PLANS" section as open).

- [ ] **Step 1: Update this ticket's `feature-map.md` entry**

Mark status `done ✅` with a `Shipped:` date + PR reference, following the same entry shape every other completed ticket uses (Type/Status/Owner/Spec/Blockers/Shipped/Key rules/Creates/Implementation note). Note in the implementation note that Task 3 was found already-shipped and dropped, and Task 4 was narrowed to test-only. Update the "Ticket Index" snapshot count and the "Frontier" section.

- [ ] **Step 2: Commit**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: mark Credit Balance Management done"
```

## Execution order and verification gate

Execute Tasks 1, 2, 4, 5, 6 in order (Task 3 is dropped). Before claiming completion: run the focused unit tests, the e2e suite standalone against real Postgres (`test:e2e` stays local-only per Plan #22's CI-contract decision — not wired into `.github/workflows/ci.yml`), `pnpm verify` (lint/type-check/test/arch-check), and the `domain-check` skill (AGENTS.md requires this after every backend change).

## Self-review checklist

- Every requirement in `2026-08-04-credit-balance-management-design.md` maps to Tasks 1, 2, 4, 5 (Task 3 dropped, already shipped).
- No task creates a CreditBalance entity, table, snapshot, or parallel allocation implementation.
- `Payment.totalAmount`/`allocatedAmount` and the existing transaction core remain the only balance/write sources.
- The read route, repository method, permission, tenant behavior, and response fields are consistent across all tasks.
- `mark-prepaid` already validates customer ownership before creating Payment (confirmed shipped, not re-implemented).
- Allocation and undo change the visible balance through existing persisted rollups; the customer-mismatch/unresolved-customer guards already exist and are now test-covered (Task 4).
- FE remains untouched and existing payment allocation/undo calls remain canonical.
- Every error path uses `AppError(ErrorCode.X, message)`, never a NestJS exception directly (Task 2).
- No new `BaseRepository` method — `findUnallocatedByCustomerId` uses the existing `scopedFindMany` + TypeORM `Raw()` operator (Task 1).


