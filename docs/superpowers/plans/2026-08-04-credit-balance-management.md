# Credit Balance Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-scoped customer credit read API while keeping `Payment` rollups as the only source of truth and reusing the existing allocation/undo transaction core.

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
- All money amounts are positive/non-negative integers in đồng; no floating point.
- `mark-prepaid` must validate `customerId` through the tenant-scoped Customer repository before creating Payment.
- No FE screen, route removal, or change to existing FE API calls.
- Domain code has no NestJS/TypeORM imports; application code uses existing repository tokens and module boundaries.

---

## File Structure

```
apps/backend/src/
  common/tenancy/base.repository.ts                         -- MODIFY: scopedQueryBuilder helper
  common/tenancy/base.repository.spec.ts                   -- MODIFY: tenant query-builder test
  modules/payments/
    application/payment-repository.port.ts                  -- MODIFY: CustomerCreditRow + query method
    application/get-customer-credits.usecase.ts             -- NEW
    application/get-customer-credits.usecase.spec.ts        -- NEW
    infrastructure/typeorm-payment.repository.ts            -- MODIFY: unallocated customer query
    infrastructure/typeorm-payment.repository.spec.ts       -- NEW
    presentation/customer-credits.controller.ts             -- NEW: GET endpoint
    presentation/customer-credits.controller.spec.ts        -- NEW
    payments.module.ts                                       -- MODIFY: register use case/controller/imports
    application/allocate-payment.usecase.ts                 -- MODIFY only for missing credit guards
    application/allocate-payment.usecase.spec.ts            -- MODIFY: credit contract cases
    application/undo-payment-allocation.usecase.spec.ts     -- MODIFY: credit restoration case
  modules/exception-queue/
    application/mark-prepaid-bank-transaction.usecase.ts    -- MODIFY: validate customer tenant ownership
    application/mark-prepaid-bank-transaction.usecase.spec.ts -- MODIFY
    exception-queue.module.ts                               -- MODIFY: import CustomersModule if needed
  test/credit-balance-management.integration.spec.ts        -- NEW

OVERVIEW.md                                                   -- MODIFY: credit API ownership
docs/superpowers/IMPLEMENTATION-ORDER.md                      -- MODIFY: route/dependency row
docs/superpowers/specs/2026-08-03-domain-core-design.md       -- MODIFY: link credit management contract
docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md -- MODIFY: mark-prepaid validation ownership
docs/superpowers/plans/2026-08-03-exception-queue-audit-log.md -- MODIFY: credit read contract and validation
docs/superpowers/plans/2026-08-03-spec-plan-reconciliation.md -- MODIFY: new spec/plan coverage
```

The existing Payment entity, `Payment.customerId`, `Payment.unallocatedAmount`, `AllocatePaymentUseCase`, and `UndoPaymentAllocationUseCase` are reused. No database table or migration is added.

### Task 1: Add a tenant-scoped unallocated Payment query

**Files:**
- Modify: `apps/backend/src/common/tenancy/base.repository.ts`
- Modify: `apps/backend/src/common/tenancy/base.repository.spec.ts`
- Modify: `apps/backend/src/modules/payments/application/payment-repository.port.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`
- Create: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService`, `BaseRepository`, `Payment`, and the existing `PAYMENT_REPOSITORY` token.
- Produces: `CustomerCreditRow` and `IPaymentRepository.findUnallocatedByCustomerId(customerId)` for Task 2.

- [ ] **Step 1: Add the failing scoped query-builder test**

Extend `base.repository.spec.ts` with:

```typescript
it('injects the current organization into a scoped query builder', async () => {
  class TestRepo extends FakeRepo {
    query(alias: string) {
      return this.scopedQueryBuilder(alias);
    }
  }

  const tenantContext = new TenantContextService();
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
  };
  const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };
  const repo = new TestRepo(ormRepo as any, tenantContext);

  await tenantContext.run({ userId: 'u1', organizationId: 'org-1', role: Role.OWNER }, async () => {
    repo.query('payment');
  });

  expect(ormRepo.createQueryBuilder).toHaveBeenCalledWith('payment');
  expect(queryBuilder.where).toHaveBeenCalledWith(
    'payment.organizationId = :organizationId',
    { organizationId: 'org-1' },
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @casso-ledger/backend test -- base.repository.spec.ts --runInBand`

Expected: FAIL because `scopedQueryBuilder` is not defined.

- [ ] **Step 3: Add the minimal BaseRepository helper**

Add this protected method to `BaseRepository`:

```typescript
protected scopedQueryBuilder(alias: string) {
  const organizationId = this.tenantContext.getOrganizationId();
  return this.ormRepo
    .createQueryBuilder(alias)
    .where(`${alias}.organizationId = :organizationId`, { organizationId });
}
```

Do not expose `organizationId` to callers and do not add a separate credit repository base class.

- [ ] **Step 4: Run the BaseRepository tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Extend the Payment repository port**

Modify `payment-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Payment } from '../domain/payment';

export interface CustomerCreditRow {
  payment: Payment;
  unallocatedAmount: number;
}

export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findUnallocatedByCustomerId(customerId: string): Promise<CustomerCreditRow[]>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
```

Keep every existing Payment repository method already required by Domain Core and Exception Queue; add only `findUnallocatedByCustomerId`.

- [ ] **Step 6: Write the failing Payment query tests**

Create `typeorm-payment.repository.spec.ts` and assert the query builder receives all conditions:

```typescript
it('returns only the current tenant customer payments with positive unallocated rollup', async () => {
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      { id: 'pay-1', customerId: 'cust-1', totalAmount: 25_000_000, allocatedAmount: 20_000_000 },
    ]),
  };
  const repo = buildPaymentRepository(query);

  const rows = await repo.findUnallocatedByCustomerId('cust-1');

  expect(query.andWhere).toHaveBeenCalledWith('payment.customerId = :customerId', { customerId: 'cust-1' });
  expect(query.andWhere).toHaveBeenCalledWith('payment.totalAmount > payment.allocatedAmount');
  expect(query.orderBy).toHaveBeenCalledWith('payment.receivedAt', 'ASC');
  expect(rows[0].unallocatedAmount).toBe(5_000_000);
});
```

- [ ] **Step 7: Run the query tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- typeorm-payment.repository.spec.ts --runInBand`

Expected: FAIL because `findUnallocatedByCustomerId` is not implemented.

- [ ] **Step 8: Implement the tenant-scoped query**

In `TypeOrmPaymentRepository`, extend the existing `BaseRepository<PaymentOrmEntity>` and implement:

```typescript
async findUnallocatedByCustomerId(customerId: string): Promise<CustomerCreditRow[]> {
  const rows = await this.scopedQueryBuilder('payment')
    .andWhere('payment.customerId = :customerId', { customerId })
    .andWhere('payment.totalAmount > payment.allocatedAmount')
    .orderBy('payment.receivedAt', 'ASC')
    .addOrderBy('payment.id', 'ASC')
    .getMany();

  return rows.map((row) => {
    const payment = new Payment(row);
    return { payment, unallocatedAmount: payment.unallocatedAmount };
  });
}
```

This uses persisted Payment rollups and the BaseRepository tenant predicate. Do not query `PaymentAllocation` or add `organizationId` to the method signature.

- [ ] **Step 9: Run focused repository tests and commit**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- base.repository.spec.ts typeorm-payment.repository.spec.ts --runInBand
```

Expected: PASS.

```bash
git add apps/backend/src/common/tenancy/base.repository.ts apps/backend/src/common/tenancy/base.repository.spec.ts apps/backend/src/modules/payments
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

Also assert missing customer throws `NotFoundException` and the use case input contains only `customerId`.

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

1. Call `customerRepo.findById(input.customerId)`; throw `NotFoundException('Customer not found')` when null.
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

```typescript
@Controller('customers/:customerId/credits')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CustomerCreditsController {
  constructor(private readonly getCustomerCreditsUseCase: GetCustomerCreditsUseCase) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('customerId') customerId: string): Promise<CustomerCreditsResult> {
    return this.getCustomerCreditsUseCase.execute({ customerId });
  }
}
```

Modify `PaymentsModule` to import `CustomersModule`, provide `GetCustomerCreditsUseCase`, and register `CustomerCreditsController`. Preserve the existing Payments controller, allocation use case, and exports.

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

### Task 3: Harden `mark-prepaid` customer attribution

**Files:**
- Modify: `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.ts`
- Modify: `apps/backend/src/modules/exception-queue/application/mark-prepaid-bank-transaction.usecase.spec.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`

**Interfaces:**
- Consumes: `ICustomerRepository.findById`, existing `IBankTransactionRepository`, `IPaymentRepository`, `TenantContextService`, and `AuditContextService`.
- Produces: a `mark-prepaid` path that cannot create a Payment attributed to a missing or cross-tenant customer.

- [ ] **Step 1: Add failing tenant-validation tests**

Extend the existing mark-prepaid spec:

```typescript
it('rejects a customer that is missing in the current tenant', async () => {
  const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
  const useCase = buildMarkPrepaidUseCase({ customerRepo });

  await expect(useCase.execute({ bankTransactionId: 'bt-1', customerId: 'cust-other' }))
    .rejects.toThrow('Customer not found');
});

it('persists the validated customer id on the credit Payment', async () => {
  const paymentRepo = { save: jest.fn() };
  const useCase = buildMarkPrepaidUseCase({
    customerRepo: { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
    paymentRepo,
  });

  await useCase.execute({ bankTransactionId: 'bt-1', customerId: 'cust-1' });

  expect(paymentRepo.save).toHaveBeenCalledWith(expect.objectContaining({
    customerId: 'cust-1', allocatedAmount: 0,
  }));
});
```

- [ ] **Step 2: Run the mark-prepaid tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- mark-prepaid-bank-transaction.usecase.spec.ts --runInBand`

Expected: FAIL because the use case does not inject or call `ICustomerRepository`.

- [ ] **Step 3: Validate customer before creating Payment**

Inject `ICustomerRepository` using `CUSTOMER_REPOSITORY`, then add this check before `paymentRepo.save()`:

```typescript
const customer = await this.customerRepo.findById(input.customerId);
if (!customer) {
  throw new NotFoundException('Customer not found');
}
```

Keep the existing tenant context for `organizationId`, the existing Payment fields, `transaction.markMatched()`, and the existing `BANK_TRANSACTION_MARK_PREPAID` audit behavior. Do not add a credit-specific audit action.

- [ ] **Step 4: Wire `CustomersModule` and run tests**

Import `CustomersModule` into `ExceptionQueueModule`, preserve its existing Webhooks/Payments/Audit imports, and provide the existing repository token through the module export.

Run the command from Step 2. Expected: PASS.

```bash
git add apps/backend/src/modules/exception-queue
git commit -m "fix: validate prepaid credit customer within tenant"
```

### Task 4: Prove existing allocation and undo paths handle credits

**Files:**
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`
- Modify: `apps/backend/src/modules/payments/application/undo-payment-allocation.usecase.spec.ts`

**Interfaces:**
- Consumes: existing `AllocatePaymentUseCase`, `UndoPaymentAllocationUseCase`, Payment/Receivable repositories, row-lock transaction, and audit context.
- Produces: no new API or use case; the existing allocation core explicitly handles a customer-attributed Payment with positive `unallocatedAmount`.

- [ ] **Step 1: Add failing credit invariant tests**

Add to the existing allocation unit tests:

```typescript
it('allocates a customer credit only to a receivable of the same customer', async () => {
  const payment = buildPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 0 });
  const receivable = buildReceivable({ customerId: 'cust-1', originalAmount: 6_000_000, paidAmount: 0 });

  await useCase.execute({ paymentId: payment.id, receivableId: receivable.id, amount: 6_000_000, allocatedByUserId: 'u1' });

  expect(paymentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ allocatedAmount: 6_000_000 }), expect.anything());
});

it('rejects a credit applied to another customer or beyond unallocated amount', async () => {
  const payment = buildPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 8_000_000 });
  const otherCustomerReceivable = buildReceivable({ customerId: 'cust-2' });

  await expect(useCase.execute({ paymentId: payment.id, receivableId: otherCustomerReceivable.id, amount: 1_000_000, allocatedByUserId: 'u1' }))
    .rejects.toThrow();
  await expect(useCase.execute({ paymentId: payment.id, receivableId: buildReceivable({ customerId: 'cust-1' }).id, amount: 3_000_000, allocatedByUserId: 'u1' }))
    .rejects.toThrow();
});
```

Add to the existing undo test:

```typescript
it('restores an undone credit allocation to Payment.unallocatedAmount', async () => {
  const payment = buildPayment({ customerId: 'cust-1', totalAmount: 10_000_000, allocatedAmount: 6_000_000 });
  // Existing undo fixture has one active allocation for 6,000,000.
  await useCase.execute({ allocationId: 'alloc-1', undoReason: 'wrong invoice', deletedByUserId: 'u1' });

  expect(paymentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ allocatedAmount: 0 }), expect.anything());
});
```

- [ ] **Step 2: Run the tests and verify any missing guard fails**

Run: `pnpm --filter @casso-ledger/backend test -- allocate-payment.usecase.spec.ts undo-payment-allocation.usecase.spec.ts --runInBand`

Expected: the tests identify a missing guard or pass if the existing Domain Core implementation already satisfies the contract. Do not add a parallel implementation when the existing guards already pass.

- [ ] **Step 3: Keep or add the guards in the shared allocation core**

Ensure the existing `AllocatePaymentUseCase.allocateWithinTransaction(manager, input)` performs these checks before creating `PaymentAllocation`:

```typescript
if (!payment.customerId) throw new BadRequestException('Payment customer is required');
if (payment.customerId !== receivable.customerId) {
  throw new BadRequestException('Payment and receivable belong to different customers');
}
if (!Number.isInteger(input.amount) || input.amount <= 0) {
  throw new BadRequestException('Allocation amount must be a positive integer');
}
if (input.amount > payment.unallocatedAmount) {
  throw new BadRequestException('Allocation amount exceeds unallocated payment amount');
}
```

Keep the existing row locks, rollup updates, allocation insert, audit, and event emission in the same transaction. Do not sum allocations to calculate the available credit.

- [ ] **Step 4: Run tests and commit**

Run the command from Step 2. Expected: PASS.

```bash
git add apps/backend/src/modules/payments/application
git commit -m "test: prove credit allocation and undo invariants"
```

### Task 5: Add end-to-end credit lifecycle tests

**Files:**
- Create: `apps/backend/test/credit-balance-management.integration.spec.ts`

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

Run: `pnpm --filter @casso-ledger/backend test:e2e -- credit-balance-management.integration.spec.ts --runInBand`

Expected: FAIL until the route and contract wiring are complete.

- [ ] **Step 3: Run the integration suite after Tasks 1–4**

Run the command from Step 2. Expected: PASS, including the concurrency assertion.

- [ ] **Step 4: Run backend verification**

Run:

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e -- credit-balance-management.integration.spec.ts --runInBand
pnpm --filter @casso-ledger/backend type-check
```

Expected: all relevant unit tests, integration tests, and type-check pass.

```bash
git add apps/backend/test
git commit -m "test: verify customer credit balance lifecycle"
```

### Task 6: Synchronize specs, plans, and route ownership

**Files:**
- Modify: `OVERVIEW.md`
- Modify: `docs/superpowers/IMPLEMENTATION-ORDER.md`
- Modify: `docs/superpowers/specs/2026-08-03-domain-core-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-exception-queue-audit-log.md`
- Modify: `docs/superpowers/plans/2026-08-03-spec-plan-reconciliation.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-04-credit-balance-management-design.md` and the implementation contracts from Tasks 1–5.
- Produces: one canonical statement that Payment rollups are the source of truth and credit lifecycle uses the existing allocation/undo APIs.

- [ ] **Step 1: Update Overview and route ownership**

Add `GET /customers/:customerId/credits` to the backend route ownership table, owned by this plan. Add the read permission `RECEIVABLE_READ`, and explicitly state that no credit table exists. Keep the existing allocation/undo route owner unchanged.

- [ ] **Step 2: Link Domain Core credit behavior to this spec**

In `2026-08-03-domain-core-design.md`, keep the existing overpayment invariant and add a link to this Credit Balance spec for the customer credit read/apply lifecycle. Do not change the persisted rollup decision or PaymentAllocation source-of-truth decision.

- [ ] **Step 3: Reconcile Exception Queue mark-prepaid**

In the Exception Queue spec/plan, document that `mark-prepaid` validates the customer through `CUSTOMER_REPOSITORY` before creating Payment and that `GET /customers/:customerId/credits` reads the resulting Payment. State that no new audit action or credit write endpoint is introduced.

- [ ] **Step 4: Update implementation order and reconciliation checklist**

Add this plan after Domain Core, Multi-tenancy, and Exception Queue/Audit dependencies and before any future FE credit UI. Add the new spec/plan pair to the reconciliation checklist. Do not remove or rename existing FE payment allocation/undo routes.

- [ ] **Step 5: Run documentation consistency checks and commit**

Run:

```bash
rg -n "CreditBalance|CustomerCreditBalance|GET /customers/:customerId/credits|findUnallocatedByCustomerId|unallocatedAmount|mark-prepaid" OVERVIEW.md docs/superpowers/specs docs/superpowers/plans docs/superpowers/IMPLEMENTATION-ORDER.md
rg -n "credit.*table|separate.*ledger|new.*allocation.*endpoint" docs/superpowers/specs/2026-08-04-credit-balance-management-design.md docs/superpowers/plans/2026-08-04-credit-balance-management.md
```

Expected: all current references point to Payment rollups and the new read contract; no current spec/plan introduces a second balance source or credit-specific write API. Commit:

```bash
git add OVERVIEW.md docs/superpowers
git commit -m "docs: reconcile credit balance management contracts"
```

## Execution order and verification gate

Execute Tasks 1–6 in order. Before claiming completion, run the focused unit tests, credit integration suite, type-check, and documentation searches from Task 6. In the current workspace only documentation exists, so runtime commands are expected to remain unavailable until the scaffold/backend plans have been implemented; do not claim runtime tests pass in this docs-only workspace.

## Self-review checklist

- Every requirement in `2026-08-04-credit-balance-management-design.md` maps to Tasks 1–6.
- No task creates a CreditBalance entity, table, snapshot, or parallel allocation implementation.
- `Payment.totalAmount`/`allocatedAmount` and the existing transaction core remain the only balance/write sources.
- The read route, repository method, permission, tenant behavior, and response fields are consistent across all tasks.
- `mark-prepaid` validates customer ownership before creating Payment.
- Allocation and undo change the visible balance through existing persisted rollups.
- FE remains untouched and existing payment allocation/undo calls remain canonical.
