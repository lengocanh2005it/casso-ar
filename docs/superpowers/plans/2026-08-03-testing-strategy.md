# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between `2026-08-03-testing-strategy-design.md`'s 5 mandatory integration test cases and what other plans already build. Cases 1 (duplicate webhook idempotency) and 2 (partial payment allocation) are already covered elsewhere — this plan only confirms and references them. Case 4 (concurrent optimistic-lock conflict) is owned by `2026-08-03-exception-queue-audit-log.md` — also referenced, not duplicated. This plan adds the two genuinely missing pieces: case 3 (overpayment leftover stays unallocated, no auto-apply) and case 5 (a PARTIALLY_PAID receivable rejects CANCEL), plus the `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel` endpoint that case 5 needs but doesn't yet exist, plus a GitHub Actions CI workflow that runs lint/type-check/unit tests and explicitly runs `test:e2e` against the real Postgres + Redis testcontainers suites.

**Architecture:** New integration tests are standalone files under `apps/backend/test/`, built against the FULL, RBAC-migrated `AppModule` — `JwtAuthGuard`/`PermissionGuard` applied, `organizationId` read from the JWT via `TenantContextService`, never from the request body (matching `2026-08-03-multi-tenancy-rbac.md`'s final controller shape, not the pre-migration one). `CancelReceivableUseCase` mirrors `WriteOffReceivableUseCase` exactly (`2026-08-03-multi-tenancy-rbac.md` Task 7) — `findById()` with no `organizationId` argument (resolved internally via `TenantContextService`) → domain transition → `save()` — added as a standalone new file, so it does not conflict with that plan's own `receivable-repository.port.ts`/`write-off-receivable.usecase.ts` edits. This plan adds one small, additive modification to `receivables.controller.ts` (a `@Post(':id/cancel')` route using the SAME `@UseGuards(JwtAuthGuard, PermissionGuard)`/`@RequirePermission` pattern the `write-off` route already uses) and `receivables.module.ts` (registering the new use case) — it does not introduce a second, incompatible version of the controller.

**Tech Stack:** Jest + `@testcontainers/postgresql` + `testcontainers` (`postgres:16` + `redis:7`) + supertest (same as Domain Core plan Task 14 and Webhook Matching Engine plan Task 10), NestJS `BadRequestException`/`NotFoundException` for HTTP error mapping, GitHub Actions (`ubuntu-latest` runner, no Docker-in-Docker needed).

## Global Constraints

- Do not modify `apps/backend/test/payment-allocation.integration.spec.ts` (Domain Core plan) or `apps/backend/test/webhook-idempotency.integration.spec.ts` (Webhook Matching Engine plan) — cases 1 and 2 are already covered there; this plan only references them.
- Do not modify `2026-08-03-exception-queue-audit-log.md` — case 4 (optimistic lock conflict on `BankTransaction.version`) is out of scope here.
- New test files only add to `apps/backend/test/`; the only production code touched is the new `cancel-receivable.usecase.ts` file plus additive edits to `receivables.controller.ts`/`receivables.module.ts` (no DTO needed — the cancel route takes no request body, matching `write-off`).
- Money fields stay integer (VND), no `float` (still binding from scaffolding spec).
- Every integration suite starts and stops a real PostgreSQL container and a real Redis container; DB/Redis mocks and shared service containers are not acceptable for these cases because BullMQ and transaction/constraint behavior are part of the contract.
- CI must run `pnpm turbo run test:e2e` explicitly; `pnpm turbo run test` alone is not sufficient because it can omit the testcontainers suites.
- Domain errors (`Receivable.cancel()`'s thrown `Error`) are translated to HTTP status codes in the use case layer (`BadRequestException`/`NotFoundException`), not left to bubble up as generic 500s — `domain/` still does not import NestJS.

---

## File Structure

```
apps/backend/
  src/modules/receivables/
    application/
      cancel-receivable.usecase.ts                    -- NEW
      cancel-receivable.usecase.spec.ts                -- NEW
    presentation/
      receivables.controller.ts                        -- MODIFY: add POST :id/cancel route
    receivables.module.ts                               -- MODIFY: register CancelReceivableUseCase
  test/
    overpayment.integration.spec.ts                     -- NEW (case 3)
    cancel-partially-paid-rejected.integration.spec.ts  -- NEW (case 5)
.github/workflows/ci.yml                                -- NEW
```

---

### Task 1: Confirm case 1 and case 2 are already covered — no new code

**Files:**
- None (read-only verification)

**Interfaces:**
- Consumes: `2026-08-03-project-scaffolding-and-domain-core.md` Task 14, `2026-08-03-webhook-matching-engine.md` Task 10
- Produces: nothing — this task exists only to record the cross-reference so a future reader doesn't duplicate work

- [ ] **Step 1: Confirm case 2 (partial payment allocation) coverage**

Read `2026-08-03-project-scaffolding-and-domain-core.md` Task 14, file `apps/backend/test/payment-allocation.integration.spec.ts`. It spins up real Postgres + Redis via testcontainers, seeds a `Customer`, creates a `Receivable` via `POST /api/v1/receivables`, creates a `Payment` row directly, then calls `POST /api/v1/payments/:id/allocate` with `amount: 30_000_000` against a `50_000_000` receivable and asserts `status === 'PARTIALLY_PAID'` and `paidAmount === 30_000_000` by querying the `receivables` table directly. This is testing-strategy-design.md section 1 case 2 verbatim (its own docstring says so: "matches testing-strategy-design.md section 1, case 2"). No new test needed for case 2.

- [ ] **Step 2: Confirm case 1 (duplicate webhook idempotency) coverage**

Read `2026-08-03-webhook-matching-engine.md` Task 10, file `apps/backend/test/webhook-idempotency.integration.spec.ts`. It POSTs the same `transactionId` to `/webhooks/casso-balance-hook` twice with valid auth headers, asserts the first call enqueues a job and inserts a `WebhookInbox`/`BankTransaction` row, and the second call returns `200 { received: true, duplicate: true }` with no second row created (relying on the `providerTransactionId` unique constraint from Task 2). This is testing-strategy-design.md section 1 case 1 verbatim. No new test needed for case 1.

- [ ] **Step 3: Record the cross-reference**

No commit — this task produces no files. The Self-Review Notes section at the end of this plan documents the mapping for all 5 cases in one place.

---

### Task 2: `CancelReceivableUseCase` (unit test first)

**Files:**
- Create: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`
- Create: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`

**Interfaces:**
- Consumes: `IReceivableRepository` (Domain Core plan Task 10, migrated to the no-`organizationId`-parameter shape by `2026-08-03-multi-tenancy-rbac.md` Task 6), `Receivable.cancel()` (Domain Core plan Task 9, already throws `'Cannot cancel a receivable that has received payment'` when `paidAmount > 0`)
- Produces: `CancelReceivableUseCase.execute(receivableId): Promise<Receivable>`, used by Task 3 (controller wiring) and Task 5's integration test

- [ ] **Step 1: Write failing unit tests**

Create `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

describe('CancelReceivableUseCase', () => {
  function buildReceivable(paidAmount: number): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount,
      dueDate: new Date('2026-08-20'),
      status: paidAmount > 0 ? ReceivableStatus.PARTIALLY_PAID : ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
    });
  }

  it('cancels an OPEN receivable that has never received payment', async () => {
    const receivable = buildReceivable(0);
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };

    const useCase = new CancelReceivableUseCase(receivableRepo as any);
    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.CANCELLED);
    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.CANCELLED }),
    );
  });

  it('rejects cancelling a PARTIALLY_PAID receivable and does not save', async () => {
    const receivable = buildReceivable(20_000_000);
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };

    const useCase = new CancelReceivableUseCase(receivableRepo as any);

    await expect(useCase.execute('rec-1')).rejects.toThrow(
      'Cannot cancel a receivable that has received payment',
    );
    expect(receivableRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if the receivable does not exist', async () => {
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };

    const useCase = new CancelReceivableUseCase(receivableRepo as any);

    await expect(useCase.execute('missing')).rejects.toThrow('Receivable not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test cancel-receivable.usecase.spec.ts`
Expected: FAIL — Cannot find module './cancel-receivable.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`**

```typescript
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const receivable = await this.receivableRepo.findById(receivableId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    let updated: Receivable;
    try {
      updated = receivable.cancel();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Cannot cancel receivable',
      );
    }

    await this.receivableRepo.save(updated);
    return updated;
  }
}
```

`Receivable.cancel()` (Domain Core plan Task 9) already throws `'Cannot cancel a receivable that has received payment'` when `paidAmount > 0`, and `'Cannot cancel a receivable in status ${status}'` for closed statuses — this use case is the HTTP-facing translation layer, mapping both into `400 Bad Request` so the integration test in Task 5 gets a real HTTP status to assert on instead of an unhandled 500.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test cancel-receivable.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts
git commit -m "feat: add CancelReceivableUseCase mapping domain cancel rejection to 400"
```

---

### Task 3: Expose `POST /api/v1/receivables/:id/cancel`

**Files:**
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`

**Interfaces:**
- Consumes: `CancelReceivableUseCase` (Task 2), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`/`Permission` (`2026-08-03-multi-tenancy-rbac.md`)
- Produces: `POST /api/v1/receivables/:id/cancel` HTTP endpoint, used by Task 5's integration test

No DTO needed — like `write-off`, `cancel` takes no request body; `id` (route param) and the caller's identity (JWT → `TenantContextService`) are the only inputs `CancelReceivableUseCase` needs.

- [ ] **Step 1: Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`**

Add the cancel route to the ALREADY RBAC-migrated controller (`2026-08-03-multi-tenancy-rbac.md` Task 8, class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`, `create`/`write-off` already present) — this is an additive diff on top of that file, not a replacement of an earlier, guard-less version:

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CancelReceivableUseCase } from '../application/cancel-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
    private readonly cancelReceivableUseCase: CancelReceivableUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId,
    });
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async writeOff(@Param('id') id: string) {
    return this.writeOffReceivableUseCase.execute(id);
  }

  @Post(':id/cancel')
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async cancel(@Param('id') id: string) {
    return this.cancelReceivableUseCase.execute(id);
  }
}
```

`Permission.RECEIVABLE_WRITE` is reused for cancel (no dedicated `RECEIVABLE_CANCEL` permission exists in the RBAC spec's table) — same permission `create` already requires, which is the closest match for "create/modify a receivable's basic lifecycle" as opposed to `RECEIVABLE_WRITE_OFF`'s narrower, Finance-Manager-oriented scope.

- [ ] **Step 2: Modify `apps/backend/src/modules/receivables/receivables.module.ts`**

Add `CancelReceivableUseCase` to the `providers` array alongside `CreateReceivableUseCase`/`WriteOffReceivableUseCase` (already registered by the Domain Core and Multi-tenancy/RBAC plans).

- [ ] **Step 3: Run full test suite and verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/receivables/presentation apps/backend/src/modules/receivables/receivables.module.ts
git commit -m "feat: expose POST /api/v1/receivables/:id/cancel endpoint"
```

---

### Task 4: Integration test — overpayment leftover stays unallocated (case 3)

**Files:**
- Create: `apps/backend/test/overpayment.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule`, real Postgres + Redis via testcontainers, `AllocatePaymentUseCase`/`Payment.withAdditionalAllocation` (Domain Core plan Task 11-12), `JwtService` for signing a test bearer token (Multi-tenancy/RBAC plan)
- Produces: verified end-to-end proof that allocating less than a `Payment`'s `totalAmount` leaves `unallocatedAmount > 0` and that the leftover is never auto-applied to another `Receivable` of the same `Customer` — matches testing-strategy-design.md section 1, case 3

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/overpayment.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';

describe('Overpayment allocation (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000001';
  let token: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
    token = jwtService.sign({ userId: 'user-1', organizationId, role: Role.OWNER });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await redis.stop();
    await container.stop();
  });

  it('allocating only remainingAmount from a larger payment leaves the rest unallocated and never auto-applies to another receivable', async () => {
    const customerId = '00000000-0000-0000-0000-000000000002';
    const userId = '00000000-0000-0000-0000-000000000003';

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    // Receivable A: the one we intentionally allocate against.
    const receivableARes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableAId = receivableARes.body.id;

    // Receivable B: a second OPEN receivable for the SAME customer — proves the
    // leftover payment amount is never auto-applied elsewhere.
    const receivableBRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        originalAmount: 100_000_000,
        dueDate: '2026-09-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableBId = receivableBRes.body.id;

    const paymentId = '00000000-0000-0000-0000-000000000004';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      bankTransactionId: null,
      totalAmount: 80_000_000, // larger than receivableA.remainingAmount (50_000_000)
      allocatedAmount: 0,
      payerName: 'Company B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    // Only receivable A's remainingAmount is allocated — 50_000_000 of the 80_000_000 payment.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        receivableId: receivableAId,
        amount: 50_000_000,
        allocatedByUserId: userId,
      })
      .expect(201);

    const receivableARow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableAId],
    );
    expect(receivableARow[0].status).toBe('PAID');
    expect(Number(receivableARow[0].paidAmount)).toBe(50_000_000);

    const paymentRow = await dataSource.query(
      'SELECT "totalAmount", "allocatedAmount" FROM payments WHERE id = $1',
      [paymentId],
    );
    const unallocatedAmount = Number(paymentRow[0].totalAmount) - Number(paymentRow[0].allocatedAmount);
    expect(unallocatedAmount).toBe(30_000_000);

    // Receivable B was never touched by the allocation above.
    const receivableBRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableBId],
    );
    expect(receivableBRow[0].status).toBe('OPEN');
    expect(Number(receivableBRow[0].paidAmount)).toBe(0);

    const allocationRows = await dataSource.query(
      'SELECT "receivableId" FROM payment_allocations WHERE "paymentId" = $1',
      [paymentId],
    );
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0].receivableId).toBe(receivableAId);

    // Applying the 30_000_000 leftover to receivable B requires its own deliberate
    // call — it is never automatic. Confirms the leftover just sits on the Payment
    // until someone explicitly allocates it.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        receivableId: receivableBId,
        amount: 30_000_000,
        allocatedByUserId: userId,
      })
      .expect(201);

    const receivableBRowAfter = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableBId],
    );
    expect(receivableBRowAfter[0].status).toBe('PARTIALLY_PAID');
    expect(Number(receivableBRowAfter[0].paidAmount)).toBe(30_000_000);
  });
});
```

Uses `JwtService.sign(...)` + `Authorization: Bearer` header (the pattern established by `2026-08-03-multi-tenancy-rbac.md` Task 9's own integration test) instead of passing `organizationId` in the request body — the RBAC-migrated `ReceivablesController`/`PaymentsController` (both guarded by `JwtAuthGuard`) reject/ignore a body-supplied `organizationId` since it now comes from the token via `TenantContextService`.

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- overpayment.integration.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/overpayment.integration.spec.ts
git commit -m "test: add integration test for overpayment leftover not auto-applied (case 3)"
```

---

### Task 5: Integration test — CANCEL rejected on PARTIALLY_PAID (case 5)

**Files:**
- Create: `apps/backend/test/cancel-partially-paid-rejected.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule`, real Postgres + Redis via testcontainers, `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel` (Task 2-3), `JwtService` for signing a test bearer token (Multi-tenancy/RBAC plan)
- Produces: verified end-to-end proof that a `PARTIALLY_PAID` receivable's CANCEL call is rejected with 400, and that an untouched `OPEN` receivable can still be cancelled — matches testing-strategy-design.md section 1, case 5

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/cancel-partially-paid-rejected.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';

describe('Cancel a PARTIALLY_PAID receivable (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await redis.stop();
    await container.stop();
  });

  it('rejects POST /api/v1/receivables/:id/cancel once the receivable has received a payment', async () => {
    const organizationId = '00000000-0000-0000-0000-000000000101';
    const customerId = '00000000-0000-0000-0000-000000000102';
    const userId = '00000000-0000-0000-0000-000000000103';
    const token = jwtService.sign({ userId: 'user-1', organizationId, role: Role.OWNER });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company C',
      taxCode: '0398765432',
      email: 'ap@congtyc.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const receivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = receivableRes.body.id;

    const paymentId = '00000000-0000-0000-0000-000000000104';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      bankTransactionId: null,
      totalAmount: 20_000_000,
      allocatedAmount: 0,
      payerName: 'Company C',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        receivableId,
        amount: 20_000_000,
        allocatedByUserId: userId,
      })
      .expect(201);

    const beforeCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(beforeCancelRow[0].status).toBe('PARTIALLY_PAID');

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(cancelRes.body.message).toContain('Cannot cancel a receivable that has received payment');

    const afterCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(afterCancelRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(afterCancelRow[0].paidAmount)).toBe(20_000_000);
  });

  it('allows cancelling an OPEN receivable that has never received a payment', async () => {
    const organizationId = '00000000-0000-0000-0000-000000000201';
    const customerId = '00000000-0000-0000-0000-000000000202';
    const userId = '00000000-0000-0000-0000-000000000203';
    const token = jwtService.sign({ userId: 'user-1', organizationId, role: Role.OWNER });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company D',
      taxCode: '0387654321',
      email: 'ap@congtyd.vn',
      phone: '0922222222',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });

    const receivableRes = await request(app.getHttpServer())
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = receivableRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const row = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(row[0].status).toBe('CANCELLED');
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- cancel-partially-paid-rejected.integration.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/cancel-partially-paid-rejected.integration.spec.ts
git commit -m "test: add integration test rejecting CANCEL on a PARTIALLY_PAID receivable (case 5)"
```

---

### Task 6: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm-workspace.yaml`/`turbo.json` (scaffolding plan Task 1), all `test:e2e` integration tests across every plan (this plan's Task 4-5, Domain Core Task 14, Webhook Matching Engine Task 10)
- Produces: a CI pipeline that runs on every push/PR, answering testing-strategy-design.md section 5's open question ("does GitHub Actions support Docker-in-Docker for testcontainers?") — it does, without any dind setup: `ubuntu-latest` GitHub-hosted runners come with a Docker Engine already running natively on the host (not itself inside a container), and `testcontainers-node` auto-detects `/var/run/docker.sock` and talks to it directly. Docker-in-Docker (`docker:dind` as a `services:` entry) is only needed when the *job itself* runs inside a container (`container: image: ...`); this workflow does not do that, so no dind is needed.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.11.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Confirm Docker daemon is reachable (required by testcontainers)
        run: docker info

      - name: Lint, type-check, and unit/integration test
        run: pnpm turbo run lint type-check test

      - name: Run testcontainers e2e suites
        run: pnpm turbo run test:e2e
```

- [ ] **Step 2: Verify locally that the commands the workflow runs actually succeed**

Run: `pnpm install --frozen-lockfile && pnpm turbo run lint type-check test && pnpm turbo run test:e2e`
Expected: all PASS; the explicit `test:e2e` command starts the real Postgres + Redis testcontainers suites and cannot be replaced by `pnpm turbo run test`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow running lint, type-check, and testcontainers-based tests"
```

---

## Self-Review Notes

**Mapping of all 5 mandatory testing-strategy-design.md section 1 cases:**

1. **Duplicate webhook idempotency** — covered by `2026-08-03-webhook-matching-engine.md` Task 10, `apps/backend/test/webhook-idempotency.integration.spec.ts`. Confirmed in this plan's Task 1, Step 2. Not duplicated here.
2. **Partial payment allocation** — covered by `2026-08-03-project-scaffolding-and-domain-core.md` Task 14, `apps/backend/test/payment-allocation.integration.spec.ts`. Confirmed in this plan's Task 1, Step 1. Not duplicated here.
3. **Overpayment leftover stays unallocated, no auto-apply** — NOT previously covered. Added in this plan's Task 4, `apps/backend/test/overpayment.integration.spec.ts`.
4. **Concurrent optimistic-lock conflict on `BankTransaction.version`** — owned by `2026-08-03-exception-queue-audit-log.md` section 1 (that plan explicitly names `BankTransaction.version`, already scaffolded with `@VersionColumn()` in `2026-08-03-webhook-matching-engine.md` Task 3, as the field the conflict test exercises). Not duplicated here — this plan takes no action on case 4 beyond this note.
5. **CANCEL rejected on PARTIALLY_PAID** — NOT previously covered (the domain method `Receivable.cancel()` already existed and already threw the right error per Domain Core plan Task 9, but no HTTP endpoint exposed it). Added in this plan's Task 2 (`CancelReceivableUseCase`), Task 3 (`POST /api/v1/receivables/:id/cancel` route), and Task 5 (`apps/backend/test/cancel-partially-paid-rejected.integration.spec.ts`).

**Design decisions worth flagging:**

- **Reconciled with the RBAC-migrated controller (2026-08-04 pass):** an earlier version of this plan built `POST /api/v1/receivables/:id/cancel` against the Domain Core plan's PRE-`2026-08-03-multi-tenancy-rbac.md` `ReceivablesController` shape (no guards, `organizationId` in the request body) on the theory that this kept the diff independent of that plan's parallel edits. In the actual implementation order, `multi-tenancy-rbac.md` runs before this plan and already replaces `ReceivablesController` with the guarded, `TenantContextService`-based version (`create` + `write-off`, `@RequirePermission` per route) — building against the older shape would have produced a controller state that never actually exists once both plans are applied in order. Fixed: `CancelReceivableUseCase.execute(receivableId)` now takes no `organizationId` parameter (matches `WriteOffReceivableUseCase` exactly), the controller diff in Task 3 is additive on top of the RBAC-migrated file, gated by `@RequirePermission(Permission.RECEIVABLE_WRITE)` (reusing the existing permission, no new one added), and Tasks 4-5's integration tests now sign a JWT (`JwtService.sign(...)`) and send it as a `Bearer` token instead of putting `organizationId` in request bodies the guarded controllers no longer read from there.
- `CancelReceivableUseCase` translates the domain's plain `Error` into `BadRequestException`/`NotFoundException` at the use case layer (not in `domain/`, keeping the "domain never imports NestJS" constraint intact) — this is a new, small, deliberate design choice not present in `WriteOffReceivableUseCase` (which lets the plain `Error` bubble up), added specifically because case 5 needs a real HTTP status code to assert against in the integration test.
- The overpayment test (Task 4) demonstrates "no auto-apply" by allocating the leftover to a second receivable in a **separate, explicit** API call and asserting it only happens because that call was made — proving the system has no background/automatic reallocation logic, not merely that a single call didn't reallocate by accident.
- CI workflow (Task 6) needs no Docker-in-Docker service: GitHub's `ubuntu-latest` hosted runners ship a native Docker Engine already reachable at `/var/run/docker.sock`, which `testcontainers-node` uses automatically — dind is only relevant when the job itself runs inside a container (`jobs.<id>.container:`), which this workflow does not use. The workflow nevertheless runs `pnpm turbo run test:e2e` explicitly, so the real Postgres + Redis suites cannot be skipped by a generic `test` task. This resolves the open question in testing-strategy-design.md section 5.


