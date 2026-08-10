# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-08-10 rescoping note (grilling session):** This plan was written before `CancelReceivableUseCase`, its controller route, and `.github/workflows/ci.yml` existed. All three now exist, shipped by other plans in the meantime, and are **more robust** than this plan's original sample code (real DB transaction + pessimistic lock + `AppError`/`ErrorCode` + domain event + `@Audited` + idempotency-key handling, vs. the plan's untransacted `HttpException`-throwing sketch). Tasks 2, 3, and 6 below are kept for historical record but are **superseded — do not implement them as written**; see each task's "SUPERSEDED" note. Test file naming has also moved from `*.integration.spec.ts` to `*.e2e-spec.ts` repo-wide (`.claude/rules/testing.md`) since this plan was drafted — Tasks 4/5 below are rewritten against that convention plus the real `AppError` HTTP shape (`{ statusCode, errorCode, message }`) and the real permission the shipped `cancel` route actually requires (`RECEIVABLE_WRITE_OFF`, not `RECEIVABLE_WRITE` as originally guessed). A CI-contract decision was also made this session: `test:e2e` stays local-only (not wired into `.github/workflows/ci.yml`), to avoid the added time/cost of testcontainers on every push — see `2026-08-03-testing-strategy-design.md` §5 for the updated CI contract and reasoning.
>
> **What's actually left to build**, post-rescoping: the two genuinely missing integration tests (case 3: overpayment leftover stays unallocated; case 5: CANCEL rejected on a PARTIALLY_PAID receivable) plus a `test:e2e` task in `turbo.json` so it's runnable uniformly via `pnpm turbo run test:e2e` locally. That's it — Tasks 4, 5, and the new Task 7 (turbo task) below are the only tasks with real work remaining.

**Original goal (kept for context):** Close the gap between `2026-08-03-testing-strategy-design.md`'s 5 mandatory integration test cases and what other plans already build. Cases 1 (duplicate webhook idempotency) and 2 (partial payment allocation) are already covered elsewhere — this plan only confirms and references them. Case 4 (concurrent optimistic-lock conflict) is owned by `2026-08-03-exception-queue-audit-log.md` — also referenced, not duplicated. This plan adds the two genuinely missing pieces: case 3 (overpayment leftover stays unallocated, no auto-apply) and case 5 (a PARTIALLY_PAID receivable rejects CANCEL), plus the `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel` endpoint that case 5 needs but doesn't yet exist, plus a GitHub Actions CI workflow that runs lint/type-check/unit tests and explicitly runs `test:e2e` against the real Postgres + Redis testcontainers suites.

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

## File Structure (post-rescoping — what's actually left)

```
apps/backend/
  test/
    overpayment.e2e-spec.ts                             -- NEW (case 3)
    cancel-partially-paid-rejected.e2e-spec.ts           -- NEW (case 5)
turbo.json                                               -- MODIFY: add test:e2e task
docs/superpowers/specs/2026-08-03-testing-strategy-design.md -- MODIFY: §5 CI contract (done, see spec file)
```

Everything under `src/modules/receivables/` and `.github/workflows/ci.yml` already exists — see the rescoping note above.

---

### Task 1: Confirm case 1 and case 2 are already covered — no new code

**Files:**
- None (read-only verification)

**Interfaces:**
- Consumes: `2026-08-03-project-scaffolding-and-domain-core.md` Task 14, `2026-08-03-webhook-matching-engine.md` Task 10
- Produces: nothing — this task exists only to record the cross-reference so a future reader doesn't duplicate work

- [x] **Step 1: Confirm case 2 (partial payment allocation) coverage**

**(2026-08-10: filename corrected)** Covered by `apps/backend/test/payment-allocation.e2e-spec.ts` (renamed from the `.integration.spec.ts` this task originally pointed at — see the repo-wide `*.e2e-spec.ts` convention note at the top of this plan). It spins up a real Postgres testcontainer, seeds a `Customer` + `Membership`, creates a `Receivable` via `POST /api/v1/receivables`, creates a `Payment` row directly, then calls `POST /api/v1/payments/:id/allocate` with `amount: 30_000_000` against a `50_000_000` receivable and asserts `status === 'PARTIALLY_PAID'` and `paidAmount === 30_000_000` by querying the `receivables` table directly. This is testing-strategy-design.md section 1 case 2 verbatim. No new test needed for case 2.

- [x] **Step 2: Confirm case 1 (duplicate webhook idempotency) coverage**

**(2026-08-10: filename corrected)** Covered inside `apps/backend/test/webhook-matching.e2e-spec.ts` (the standalone `webhook-idempotency.integration.spec.ts` this task originally pointed at was merged into the matching-engine e2e file at some point after this plan was drafted). It POSTs the same `transactionId` to `/webhooks/casso-balance-hook` twice with valid auth headers, asserts the first call enqueues a job and inserts a `WebhookInbox`/`BankTransaction` row, and the second call returns `200 { received: true, duplicate: true }` with no second row created (relying on the `providerTransactionId` unique constraint). This is testing-strategy-design.md section 1 case 1 verbatim. No new test needed for case 1.

- [ ] **Step 3: Record the cross-reference**

No commit — this task produces no files. The Self-Review Notes section at the end of this plan documents the mapping for all 5 cases in one place.

---

### Task 2: `CancelReceivableUseCase` (unit test first) — SUPERSEDED, already shipped

**Do not implement this task as written.** `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts` and its `.spec.ts` already exist, shipped by another plan before this one was picked up. The shipped version is a strictly better implementation than this task's sample code below:

- Runs inside `DataSource.transaction()` with `receivableRepo.findByIdForUpdate()` (pessimistic row lock) — the sample below has neither transaction nor lock.
- Throws `AppError(ErrorCode.RECEIVABLE_NOT_FOUND | ErrorCode.RECEIVABLE_HAS_PAYMENTS | ErrorCode.CONFLICT, ...)` with Vietnamese messages, not the sample's `NotFoundException`/`BadRequestException` — `application/` throwing `HttpException` is now forbidden repo-wide (`.claude/rules/application.md`, added by the "Application Layer Boundary Enforcement" plan, which shipped after this plan was drafted but before this task was implemented).
- Emits `receivable.status-closed` via `IEventPublisher` after commit (feeds the Collection Activity Timeline and Internal Task auto-dismiss listeners).
- Wired through `@Audited(AuditActionType.RECEIVABLE_CANCEL, ...)` and `IdempotencyService` at the controller (Task 3), neither of which existed as concepts when this task was drafted.

The rest of this task's steps (below) are kept only as a historical record of the original design intent — skip them.

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

### Task 3: Expose `POST /api/v1/receivables/:id/cancel` — SUPERSEDED, already shipped

**Do not implement this task as written.** The route already exists in the real `receivables.controller.ts`, gated by `@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)` — **not** `Permission.RECEIVABLE_WRITE` as this task's Step 1 guessed (the closest-match reasoning at the bottom of Step 1 turned out wrong once implemented; write-off and cancel ended up sharing the narrower, Finance-Manager-oriented permission instead). It's also wrapped in `@Audited(...)` and `IdempotencyService.execute(...)` (reads `Idempotency-Key` header), matching every other mutating route on this controller — concepts this task predates. Tasks 4/5's rewritten tests below assert against the real permission and idempotency-key behavior.

The rest of this task's steps (below) are kept only as a historical record — skip them.

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

**(2026-08-10: rewritten against the real, current e2e conventions — filename, `TypeOrmModule` override to avoid the issue #48 cross-file retry-loop class of bug (fixed in PR #67 by injecting DB config directly instead of relying on shared `process.env`/`ConfigService`), `Membership` seeding required by the real `JwtStrategy` DB re-validation, no `organizationId`/`allocatedByUserId` in request bodies since neither DTO accepts them anymore.)**

**Files:**
- Create: `apps/backend/test/overpayment.e2e-spec.ts`

**Interfaces:**
- Consumes: full `AppModule`, real Postgres via testcontainers (matches `payment-allocation.e2e-spec.ts`'s pattern — no Redis container needed, this path never touches BullMQ), `AllocatePaymentUseCase` (already shipped), `JwtService` for signing a test bearer token
- Produces: verified end-to-end proof that allocating less than a `Payment`'s `totalAmount` leaves the remainder unallocated and that it is never auto-applied to another `Receivable` of the same `Customer` — matches testing-strategy-design.md section 1, case 3

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/overpayment.e2e-spec.ts`, following `apps/backend/test/payment-allocation.e2e-spec.ts`'s exact setup shape (container bootstrap, `TypeOrmModule` override, `configureApp(app)`, `Membership` seeding, env vars for JWT/encryption/webhook secrets):

```typescript
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Overpayment allocation (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('allocating only remainingAmount from a larger payment leaves the rest unallocated and never auto-applies to another receivable', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000101';
    const customerId = '00000000-0000-4000-8000-000000000102';
    const userId = '00000000-0000-4000-8000-000000000103';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Overpayment Test User',
      email: 'overpayment-test@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty B',
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
      .set('Idempotency-Key', 'overpayment-create-receivable-a')
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
      .set('Idempotency-Key', 'overpayment-create-receivable-b')
      .send({
        customerId,
        originalAmount: 100_000_000,
        dueDate: '2026-09-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableBId = receivableBRes.body.id;

    const paymentId = '00000000-0000-4000-8000-000000000104';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount: 80_000_000, // larger than receivableA.remainingAmount (50_000_000)
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    // Only receivable A's remainingAmount is allocated — 50_000_000 of the 80_000_000 payment.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'overpayment-allocate-a')
      .send({ receivableId: receivableAId, amount: 50_000_000 })
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
    const unallocatedAmount =
      Number(paymentRow[0].totalAmount) - Number(paymentRow[0].allocatedAmount);
    expect(unallocatedAmount).toBe(30_000_000);

    // Receivable B was never touched by the allocation above.
    const receivableBRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableBId],
    );
    expect(receivableBRow[0].status).toBe('OPEN');
    expect(Number(receivableBRow[0].paidAmount)).toBe(0);

    const allocationRows = await dataSource.query(
      'SELECT "receivableId" FROM payment_allocations WHERE "paymentId" = $1 AND "deletedAt" IS NULL',
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
      .set('Idempotency-Key', 'overpayment-allocate-b')
      .send({ receivableId: receivableBId, amount: 30_000_000 })
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

(`deletedAt` confirmed against `payment-allocation.orm-entity.ts` — `PaymentAllocation`'s soft-delete column.)

- [ ] **Step 2: Verify Docker is available and run the test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- overpayment.e2e-spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/overpayment.e2e-spec.ts
git commit -m "test: add e2e test for overpayment leftover not auto-applied (case 3)"
```

---

### Task 5: Integration test — CANCEL rejected on PARTIALLY_PAID (case 5)

**(2026-08-10: rewritten — real permission is `RECEIVABLE_WRITE_OFF` not `RECEIVABLE_WRITE`; error shape is `AppError`'s `{ statusCode, errorCode, message }` via `HttpExceptionFilter`, errorCode `RECEIVABLE_HAS_PAYMENTS`, message is Vietnamese ("Không thể hủy khoản phải thu đã nhận thanh toán."), not the plan's original English `BadRequestException` string; cancel route requires `Idempotency-Key` handling like every other mutating route; no Redis container needed, same as Task 4.)**

**Files:**
- Create: `apps/backend/test/cancel-partially-paid-rejected.e2e-spec.ts`

**Interfaces:**
- Consumes: full `AppModule`, real Postgres via testcontainers, already-shipped `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel`, `JwtService` for signing a test bearer token
- Produces: verified end-to-end proof that a `PARTIALLY_PAID` receivable's CANCEL call is rejected with 400/`RECEIVABLE_HAS_PAYMENTS`, and that an untouched `OPEN` receivable can still be cancelled — matches testing-strategy-design.md section 1, case 5

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/cancel-partially-paid-rejected.e2e-spec.ts`, following the same bootstrap shape as Task 4's `overpayment.e2e-spec.ts`:

```typescript
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { PaymentOrmEntity } from '../src/modules/payments/infrastructure/payment.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Cancel a PARTIALLY_PAID receivable (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('rejects POST /api/v1/receivables/:id/cancel once the receivable has received a payment', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000201';
    const customerId = '00000000-0000-4000-8000-000000000202';
    const userId = '00000000-0000-4000-8000-000000000203';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Cancel Test User',
      email: 'cancel-rejected-test@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty C',
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
      .set('Idempotency-Key', 'cancel-rejected-create-receivable')
      .send({
        customerId,
        originalAmount: 50_000_000,
        dueDate: '2026-08-20T00:00:00.000Z',
        salesRepresentativeId: userId,
      })
      .expect(201);
    const receivableId = receivableRes.body.id;

    const paymentId = '00000000-0000-4000-8000-000000000204';
    await dataSource.getRepository(PaymentOrmEntity).save({
      id: paymentId,
      organizationId,
      customerId,
      bankTransactionId: null,
      totalAmount: 20_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty C',
      receivedAt: new Date(),
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-rejected-allocate')
      .send({ receivableId, amount: 20_000_000 })
      .expect(201);

    const beforeCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(beforeCancelRow[0].status).toBe('PARTIALLY_PAID');

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'cancel-rejected-cancel-attempt')
      .expect(400);
    expect(cancelRes.body).toMatchObject({
      statusCode: 400,
      errorCode: 'RECEIVABLE_HAS_PAYMENTS',
    });

    const afterCancelRow = await dataSource.query(
      'SELECT status, "paidAmount" FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(afterCancelRow[0].status).toBe('PARTIALLY_PAID');
    expect(Number(afterCancelRow[0].paidAmount)).toBe(20_000_000);
  });

  it('allows cancelling an OPEN receivable that has never received a payment', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000301';
    const customerId = '00000000-0000-4000-8000-000000000302';
    const userId = '00000000-0000-4000-8000-000000000303';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Cancel OK Test User',
      email: 'cancel-ok-test@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty D',
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
      .set('Idempotency-Key', 'cancel-ok-create-receivable')
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
      .set('Idempotency-Key', 'cancel-ok-cancel')
      .expect(201);

    const row = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(row[0].status).toBe('CANCELLED');
  });
});
```

- [ ] **Step 2: Verify Docker is available and run the test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- cancel-partially-paid-rejected.e2e-spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/cancel-partially-paid-rejected.e2e-spec.ts
git commit -m "test: add e2e test rejecting CANCEL on a PARTIALLY_PAID receivable (case 5)"
```

---

### Task 6: GitHub Actions CI workflow — SUPERSEDED, do not wire `test:e2e` into CI

**Do not implement this task as written.** `.github/workflows/ci.yml` already exists (shipped by another plan) and runs `pnpm verify` (lint + type-check + unit `test` + `arch-check`) + `pnpm build` on every push/PR — it does not run `test:e2e`, and per the **2026-08-10 grilling-session decision** (see rescoping note at the top of this plan and `2026-08-03-testing-strategy-design.md` §5), it should **stay that way deliberately** — `test:e2e` is local-only, to avoid the added time/cost of spinning testcontainers on every push. Do not add a `test:e2e` step to `ci.yml`. Task 7 below (new) covers the one real remaining piece: making `test:e2e` runnable via `pnpm turbo run test:e2e`, for local use only.

The rest of this task's steps (below) are kept only as a historical record of the design this plan originally intended before the CI-cost tradeoff was decided against — skip them.

**Original task content (superseded):**

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

### Task 7: Add `test:e2e` as a `turbo.json` task (local-only, new)

**Files:**
- Modify: `turbo.json`

**Interfaces:**
- Consumes: `apps/backend/package.json`'s existing `test:e2e` script (`jest --config ./test/jest-e2e.json`, already present)
- Produces: `pnpm turbo run test:e2e`, runnable uniformly across the workspace (today only the backend defines the script, but the task exists at the workspace level so any future package can opt in the same way `test` already works)

`turbo.json` currently defines `build`, `dev`, `lint`, `type-check`, `test`, `arch-check` but no `test:e2e` — running it today only works via `pnpm --filter @casso-ledger/backend test:e2e`, which is what `CLAUDE.local.md`'s "Before Committing" checklist already documents. Adding the turbo task doesn't change that checklist's behavior, it just makes `pnpm turbo run test:e2e` available too, mirroring how `test` is already defined.

- [ ] **Step 1: Add the task to `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "dependsOn": ["^build"]
    },
    "arch-check": {}
  }
}
```

Cacheable, same as `test` — turbo's cache key is the hash of the backend package's own tracked source files (plus the lockfile), not "whether Docker ran." Each real run still spins fresh testcontainers in `beforeAll` regardless of caching; caching only skips re-running the suite when nothing in `apps/backend`'s source changed since the last successful run, exactly like `test` already does. Editing files outside that package (e.g. `docs/`) doesn't touch the hash, so it was never going to force a rerun either way.

- [ ] **Step 2: Run it locally to confirm the task resolves and executes the real e2e suite**

Run: `pnpm turbo run test:e2e` (Docker must be running)
Expected: turbo invokes `apps/backend`'s `test:e2e` script; all e2e suites pass (including the two new ones from Tasks 4-5)

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "chore: add test:e2e turbo task for local-only testcontainers e2e runs"
```

---

## Self-Review Notes

**Mapping of all 5 mandatory testing-strategy-design.md section 1 cases (updated 2026-08-10):**

1. **Duplicate webhook idempotency** — covered, `apps/backend/test/webhook-matching.e2e-spec.ts` (renamed/merged from the file this plan's Task 1 originally pointed at). Confirmed, not duplicated.
2. **Partial payment allocation** — covered, `apps/backend/test/payment-allocation.e2e-spec.ts` (renamed from `.integration.spec.ts`). Confirmed, not duplicated.
3. **Overpayment leftover stays unallocated, no auto-apply** — was NOT covered as of 2026-08-10. Added by this plan's Task 4, `apps/backend/test/overpayment.e2e-spec.ts`.
4. **Concurrent optimistic-lock conflict on `BankTransaction.version`** — covered, `apps/backend/test/exception-queue.e2e-spec.ts` (`'lets exactly one of two concurrent match requests succeed'`, asserts `[201, 409]`). Owned by `2026-08-03-exception-queue-audit-log.md`, shipped since this plan was drafted. Not duplicated here.
5. **CANCEL rejected on PARTIALLY_PAID** — the behavior (`CancelReceivableUseCase` throwing `AppError(ErrorCode.RECEIVABLE_HAS_PAYMENTS)`) already shipped, but was NOT covered by a dedicated e2e test as of 2026-08-10. Added by this plan's Task 5, `apps/backend/test/cancel-partially-paid-rejected.e2e-spec.ts`.

**2026-08-10 grilling-session decisions (superseding the original design decisions below):**

- `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel` (originally this plan's Tasks 2-3) shipped independently, before this plan was picked up for implementation, as part of a later plan's work — with a transaction + pessimistic lock + `AppError`/`ErrorCode` + domain event + `@Audited` + idempotency-key handling that this plan never specified. See the SUPERSEDED notes on Tasks 2 and 3 above. Nothing to build there.
- CI (`.github/workflows/ci.yml`) will **not** run `test:e2e` — decided against, for time/cost reasons (spinning testcontainers on every push). `test:e2e` is local-only, made runnable via `pnpm turbo run test:e2e` by this plan's new Task 7. `2026-08-03-testing-strategy-design.md` §5 was updated to reflect this as the CI contract, reversing its original wording (which mandated CI run `test:e2e`).
- Test file naming moved from `*.integration.spec.ts` to `*.e2e-spec.ts` repo-wide since this plan was drafted (`.claude/rules/testing.md`) — Tasks 4-5 above use the current convention.
- The real `cancel` route requires `Permission.RECEIVABLE_WRITE_OFF`, not `Permission.RECEIVABLE_WRITE` as this plan originally guessed in Task 3.
- Issue #48 (e2e cross-file flakiness when multiple testcontainer-backed suites run in the same Jest worker) was found, tracked, and fixed by PR #67 — no longer a blocker to trusting `pnpm turbo run test:e2e` locally.

**Original design decisions (kept for historical context — see above for what actually shipped):**

- **Reconciled with the RBAC-migrated controller (2026-08-04 pass):** an earlier version of this plan built `POST /api/v1/receivables/:id/cancel` against the Domain Core plan's PRE-`2026-08-03-multi-tenancy-rbac.md` `ReceivablesController` shape (no guards, `organizationId` in the request body) on the theory that this kept the diff independent of that plan's parallel edits. In the actual implementation order, `multi-tenancy-rbac.md` runs before this plan and already replaces `ReceivablesController` with the guarded, `TenantContextService`-based version (`create` + `write-off`, `@RequirePermission` per route) — building against the older shape would have produced a controller state that never actually exists once both plans are applied in order.
- The overpayment test (Task 4) demonstrates "no auto-apply" by allocating the leftover to a second receivable in a **separate, explicit** API call and asserting it only happens because that call was made — proving the system has no background/automatic reallocation logic, not merely that a single call didn't reallocate by accident.
- The original Task 6 correctly identified that GitHub's `ubuntu-latest` hosted runners ship a native Docker Engine already reachable at `/var/run/docker.sock` (no Docker-in-Docker needed) — that finding stays true and would apply if the CI-wiring decision is revisited later, but per the 2026-08-10 decision above, it's moot for now.


