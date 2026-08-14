# Batch Operations (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five new batch endpoints — `POST /bank-transactions/batch-skip`, `batch-mark-prepaid`, `batch-match`, and `POST /receivables/batch-write-off`, `batch-cancel` — let an accountant act on up to 50 rows in one request, each row processed and reported independently.

**Architecture:** Each endpoint gets a thin `Batch<Verb><Entity>UseCase` in the owning module's `application/` layer. Every batch use case is a for-loop over the existing, unmodified single-item use case (`SkipBankTransactionUseCase`, `MarkPrepaidBankTransactionUseCase`, `MatchBankTransactionUseCase`, `WriteOffReceivableUseCase`, `CancelReceivableUseCase`) via one shared iterator, `runBatch()` (new, `common/batch/`), which catches each item's `AppError` and turns it into a `{ id, status, errorCode?, message? }` entry instead of letting it propagate. On success, the batch use case writes one `AuditLog` row directly (there is no per-item HTTP request for `@Audited`'s interceptor to hook). The controller wraps the whole call in the existing `IdempotencyService`, exactly like every other mutating endpoint.

**Tech Stack:** NestJS 11, TypeORM 1.1 (unchanged — no new entities/migrations), class-validator, Jest 30.

**Spec:** GitHub issue #134, `docs/adr/0016-batch-endpoints-process-items-independently.md`, `CONTEXT.md` §"Batch Operations" and Business Rule 11 — these three documents captured every design decision from grilling + domain-modeling; this plan implements what they already decided, it does not re-decide anything.

## Global Constraints

- Batch size: max 50 items per request (`CONTEXT.md` §Batch Operations) — enforced by `@ArrayMaxSize(50)` on every batch DTO.
- Every item is processed in its own transaction via the single-item use case it reuses; a batch endpoint is never wrapped in one all-or-nothing transaction (ADR-0016).
- `application/` layer code MUST NOT throw `HttpException`/`@nestjs/common` exception classes or import concrete SDKs (AGENTS.md, `.claude/rules/application.md`) — only `AppError`, ports, `DataSource`/`EntityManager`, `@Injectable`/`@Inject`.
- Response DTOs MUST NOT leak `organizationId` or `version` (AGENTS.md) — the one documented exception is `BankTransactionResponseDto.version`, already established by the single-item `match` endpoint; batch responses reuse the same DTO mappers unchanged.
- Every batch endpoint uses `@RequirePermission()` with the same permission as the single-item endpoint it batches (AGENTS.md) — a batch endpoint is never a separate authorization path.
- Every mutating POST wraps its handler in `IdempotencyService.execute(endpoint, key, input, callback)` (`.claude/rules/api.md`) — one `Idempotency-Key` covers the whole batch.
- TDD RED → GREEN → REFACTOR for every task.
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas.
- Money/persisted-rollup/tenant-isolation rules are unchanged and untouched by this plan — every batch item runs through the same tenant-scoped, transaction-locked use case as the existing single-item endpoint.

---

### Task 1: Shared batch iterator — `runBatch()`

**Files:**
- Create: `apps/backend/src/common/batch/run-batch.ts`
- Test: `apps/backend/src/common/batch/run-batch.spec.ts`

**Interfaces:**
- Produces: `BatchItemResult<T>` (`{ id: string; status: 'success' | 'error'; data?: T; errorCode?: string; message?: string }`) and `runBatch<TInput, TResult>(items: TInput[], getId: (item: TInput) => string, handle: (item: TInput) => Promise<TResult>): Promise<BatchItemResult<TResult>[]>` — every later task's batch use case calls this.

- [x] **Step 1: Write the failing test**

```typescript
// apps/backend/src/common/batch/run-batch.spec.ts
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';
import { runBatch } from './run-batch';

describe('runBatch', () => {
  it('processes items independently and reports one result per item', async () => {
    const results = await runBatch(
      [1, 2, 3],
      (n) => String(n),
      async (n) => {
        if (n === 2) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'bad item');
        }
        return n * 10;
      },
    );

    expect(results).toEqual([
      { id: '1', status: 'success', data: 10 },
      {
        id: '2',
        status: 'error',
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'bad item',
      },
      { id: '3', status: 'success', data: 30 },
    ]);
  });

  it('wraps a non-AppError as INTERNAL_SERVER_ERROR without stopping the batch', async () => {
    const results = await runBatch(
      [1, 2],
      (n) => String(n),
      async (n) => {
        if (n === 1) throw new Error('unexpected');
        return n;
      },
    );

    expect(results[0]).toEqual({
      id: '1',
      status: 'error',
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi không xác định.',
    });
    expect(results[1]).toEqual({ id: '2', status: 'success', data: 2 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern common/batch/run-batch`
Expected: FAIL with "Cannot find module './run-batch'"

- [x] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/common/batch/run-batch.ts
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';

export interface BatchItemResult<T> {
  id: string;
  status: 'success' | 'error';
  data?: T;
  errorCode?: string;
  message?: string;
}

export async function runBatch<TInput, TResult>(
  items: TInput[],
  getId: (item: TInput) => string,
  handle: (item: TInput) => Promise<TResult>,
): Promise<BatchItemResult<TResult>[]> {
  const results: BatchItemResult<TResult>[] = [];
  for (const item of items) {
    const id = getId(item);
    try {
      const data = await handle(item);
      results.push({ id, status: 'success', data });
    } catch (error) {
      if (error instanceof AppError) {
        results.push({
          id,
          status: 'error',
          errorCode: error.errorCode,
          message: error.message,
        });
      } else {
        results.push({
          id,
          status: 'error',
          errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Đã xảy ra lỗi không xác định.',
        });
      }
    }
  }
  return results;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern common/batch/run-batch`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/common/batch/run-batch.ts apps/backend/src/common/batch/run-batch.spec.ts
git commit -m "feat: add shared runBatch iterator for batch endpoints"
```

---

### Task 2: Shared `BatchIdsDto`

**Files:**
- Create: `apps/backend/src/common/dto/batch-ids.dto.ts`
- Test: `apps/backend/src/common/dto/batch-ids.dto.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BATCH_MAX_ITEMS = 50` and `BatchIdsDto { ids: string[] }` — reused as the request body for `batch-skip`, `batch-write-off`, `batch-cancel` (Tasks 3, 6, 7).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/common/dto/batch-ids.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BatchIdsDto } from './batch-ids.dto';

describe('BatchIdsDto', () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('rejects an empty ids array', async () => {
    const dto = plainToInstance(BatchIdsDto, { ids: [] });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'ids')).toBe(true);
  });

  it('rejects more than 50 ids', async () => {
    const dto = plainToInstance(BatchIdsDto, {
      ids: Array.from({ length: 51 }, (_, i) => uuid(i)),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'ids')).toBe(true);
  });

  it('accepts between 1 and 50 valid UUIDs', async () => {
    const dto = plainToInstance(BatchIdsDto, {
      ids: [uuid(1), uuid(2)],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern common/dto/batch-ids.dto`
Expected: FAIL with "Cannot find module './batch-ids.dto'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/common/dto/batch-ids.dto.ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export const BATCH_MAX_ITEMS = 50;

export class BatchIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @IsUUID('4', { each: true })
  ids: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern common/dto/batch-ids.dto`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/dto/batch-ids.dto.ts apps/backend/src/common/dto/batch-ids.dto.spec.ts
git commit -m "feat: add shared BatchIdsDto for id-list batch endpoints"
```

---

### Task 3: `POST /bank-transactions/batch-skip`

**Files:**
- Create: `apps/backend/src/modules/exception-queue/application/batch-skip-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/batch-skip-bank-transaction.usecase.spec.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`

**Context:** `SkipBankTransactionUseCase.execute(bankTransactionId: string): Promise<BankTransaction>` (`skip-bank-transaction.usecase.ts`) already exists and is reused unchanged. `AUDIT_LOG_REPOSITORY` (`common/audit/audit-log-repository.port.ts`) is provided globally by `@Global() AuditModule` — no new import needed in `exception-queue.module.ts`. `TenantContextService.getCurrentUser()` returns `AuthenticatedUser | undefined` (`{ userId, organizationId, role }`).

**Interfaces:**
- Consumes: `runBatch` (Task 1), `SkipBankTransactionUseCase.execute` (existing), `AUDIT_LOG_REPOSITORY`/`IAuditLogRepository.create` (existing), `TenantContextService.getCurrentUser` (existing), `sanitizeAuditPayload` (existing, `common/audit/sanitize-audit-payload.ts`).
- Produces: `BatchSkipBankTransactionUseCase.execute(ids: string[]): Promise<BatchItemResult<BankTransaction>[]>` — Task 8's e2e test calls it indirectly through the HTTP endpoint.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-skip-bank-transaction.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { BatchSkipBankTransactionUseCase } from './batch-skip-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from './skip-bank-transaction.usecase';

function buildTransaction(id: string): BankTransaction {
  return new BankTransaction({
    id,
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'inbox-1',
    providerTransactionId: `TX-${id}`,
    amount: 10_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'Customer',
    transferContent: 'note',
    status: 'IGNORED',
    version: 2,
    createdAt: new Date('2026-08-01'),
  });
}

describe('BatchSkipBankTransactionUseCase', () => {
  it('skips each transaction independently and audits only the successes', async () => {
    const skipUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'tx-fail') {
          throw new AppError(ErrorCode.CONFLICT, 'Giao dịch đã được xử lý.');
        }
        return buildTransaction(id);
      }),
    } as unknown as SkipBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchSkipBankTransactionUseCase(
      skipUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['tx-ok', 'tx-fail']);

    expect(results).toEqual([
      { id: 'tx-ok', status: 'success', data: buildTransaction('tx-ok') },
      {
        id: 'tx-fail',
        status: 'error',
        errorCode: ErrorCode.CONFLICT,
        message: 'Giao dịch đã được xử lý.',
      },
    ]);
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create.mock.calls[0][0]).toMatchObject({
      entityId: 'tx-ok',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern batch-skip-bank-transaction.usecase`
Expected: FAIL with "Cannot find module './batch-skip-bank-transaction.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-skip-bank-transaction.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import { type BatchItemResult, runBatch } from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { SkipBankTransactionUseCase } from './skip-bank-transaction.usecase';

@Injectable()
export class BatchSkipBankTransactionUseCase {
  constructor(
    private readonly skipUseCase: SkipBankTransactionUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(ids: string[]): Promise<BatchItemResult<BankTransaction>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(ids, (id) => id, async (id) => {
      const transaction = await this.skipUseCase.execute(id);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: user.organizationId,
          userId: user.userId,
          actionType: AuditActionType.BANK_TRANSACTION_SKIP,
          entityType: AuditEntityType.BANK_TRANSACTION,
          entityId: id,
          beforeState: null,
          afterState: sanitizeAuditPayload(transaction),
          ipAddress: null,
          createdAt: new Date(),
        }),
      );
      return transaction;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern batch-skip-bank-transaction.usecase`
Expected: PASS (1 test)

- [ ] **Step 5: Wire the controller endpoint**

Modify `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`:

```typescript
// add to imports at top of the file
import { BatchIdsDto } from '../../../common/dto/batch-ids.dto';
import { BatchSkipBankTransactionUseCase } from '../application/batch-skip-bank-transaction.usecase';

// add to constructor params, alongside the existing skipUseCase
    private readonly batchSkipUseCase: BatchSkipBankTransactionUseCase,

// add as a new controller method, after skip()
  @Post('batch-skip')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async batchSkip(
    @Body() dto: BatchIdsDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /bank-transactions/batch-skip',
      key,
      dto,
      async () => {
        const results = await this.batchSkipUseCase.execute(dto.ids);
        return {
          results: results.map((result) =>
            result.status === 'success' && result.data
              ? { ...result, data: toBankTransactionResponse(result.data) }
              : result,
          ),
        };
      },
    );
  }
```

- [ ] **Step 6: Wire the module provider**

Modify `apps/backend/src/modules/exception-queue/exception-queue.module.ts`:

```typescript
// add import
import { BatchSkipBankTransactionUseCase } from './application/batch-skip-bank-transaction.usecase';

// add to providers array, alongside SkipBankTransactionUseCase
    BatchSkipBankTransactionUseCase,
```

- [ ] **Step 7: Type-check and run the full exception-queue test suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern exception-queue`
Expected: PASS, no type errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/exception-queue
git commit -m "feat: add POST /bank-transactions/batch-skip"
```

---

### Task 4: `POST /bank-transactions/batch-mark-prepaid`

**Files:**
- Create: `apps/backend/src/modules/exception-queue/presentation/dto/batch-mark-prepaid-bank-transaction.dto.ts`
- Create: `apps/backend/src/modules/exception-queue/application/batch-mark-prepaid-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/batch-mark-prepaid-bank-transaction.usecase.spec.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`

**Context:** Grilling decision: bulk mark-prepaid uses **one customer for the whole batch** (`{ bankTransactionIds: string[], customerId: string }`), not a per-row customer — `CONTEXT.md` §Batch Operations. `MarkPrepaidBankTransactionUseCase.execute(input: { bankTransactionId: string; customerId: string }): Promise<{ transaction: BankTransaction; payment: Payment }>` already exists and is reused unchanged.

**Interfaces:**
- Consumes: `runBatch` (Task 1), `MarkPrepaidBankTransactionUseCase.execute` (existing).
- Produces: `BatchMarkPrepaidBankTransactionDto { bankTransactionIds: string[]; customerId: string }`, `BatchMarkPrepaidBankTransactionUseCase.execute(bankTransactionIds: string[], customerId: string): Promise<BatchItemResult<{ transaction: BankTransaction; payment: Payment }>[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-mark-prepaid-bank-transaction.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchMarkPrepaidBankTransactionUseCase } from './batch-mark-prepaid-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from './mark-prepaid-bank-transaction.usecase';

describe('BatchMarkPrepaidBankTransactionUseCase', () => {
  it('applies the same customer to every transaction and reports per-item results', async () => {
    const markPrepaidUseCase = {
      execute: jest.fn(async ({ bankTransactionId, customerId }) => {
        if (bankTransactionId === 'tx-fail') {
          throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
        }
        return {
          transaction: { id: bankTransactionId, status: 'PREPAID' },
          payment: { id: `pay-${bankTransactionId}`, customerId },
        };
      }),
    } as unknown as MarkPrepaidBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchMarkPrepaidBankTransactionUseCase(
      markPrepaidUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['tx-ok', 'tx-fail'], 'cust-1');

    expect(markPrepaidUseCase.execute).toHaveBeenCalledWith({
      bankTransactionId: 'tx-ok',
      customerId: 'cust-1',
    });
    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'tx-fail',
      status: 'error',
      errorCode: ErrorCode.NOT_FOUND,
      message: 'Không tìm thấy khách hàng.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern batch-mark-prepaid-bank-transaction.usecase`
Expected: FAIL with "Cannot find module './batch-mark-prepaid-bank-transaction.usecase'"

- [ ] **Step 3: Write the DTO**

```typescript
// apps/backend/src/modules/exception-queue/presentation/dto/batch-mark-prepaid-bank-transaction.dto.ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { BATCH_MAX_ITEMS } from '../../../../common/dto/batch-ids.dto';

export class BatchMarkPrepaidBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @IsUUID('4', { each: true })
  bankTransactionIds: string[];

  @IsUUID()
  customerId: string;
}
```

- [ ] **Step 4: Write minimal implementation**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-mark-prepaid-bank-transaction.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import { type BatchItemResult, runBatch } from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Payment } from '../../payments/application/payment-repository.port';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { MarkPrepaidBankTransactionUseCase } from './mark-prepaid-bank-transaction.usecase';

@Injectable()
export class BatchMarkPrepaidBankTransactionUseCase {
  constructor(
    private readonly markPrepaidUseCase: MarkPrepaidBankTransactionUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    bankTransactionIds: string[],
    customerId: string,
  ): Promise<BatchItemResult<{ transaction: BankTransaction; payment: Payment }>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(
      bankTransactionIds,
      (id) => id,
      async (bankTransactionId) => {
        const result = await this.markPrepaidUseCase.execute({
          bankTransactionId,
          customerId,
        });
        await this.auditLogRepo.create(
          new AuditLog({
            organizationId: user.organizationId,
            userId: user.userId,
            actionType: AuditActionType.BANK_TRANSACTION_MARK_PREPAID,
            entityType: AuditEntityType.BANK_TRANSACTION,
            entityId: bankTransactionId,
            beforeState: null,
            afterState: sanitizeAuditPayload(result),
            ipAddress: null,
            createdAt: new Date(),
          }),
        );
        return result;
      },
    );
  }
}
```

Note: `Payment` is exported as a type from `payment-repository.port.ts` in this codebase's existing import graph used by `mark-prepaid-bank-transaction.usecase.ts`; if the type-check in Step 6 reports it is not exported from that path, import it from `../../payments/domain/payment` instead (the module `mark-prepaid-bank-transaction.usecase.ts` already imports `Payment` from `../../payments/domain/payment` — mirror that import path exactly).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern batch-mark-prepaid-bank-transaction.usecase`
Expected: PASS (1 test)

- [ ] **Step 6: Wire the controller endpoint**

Modify `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`:

```typescript
// add to imports
import { BatchMarkPrepaidBankTransactionDto } from './dto/batch-mark-prepaid-bank-transaction.dto';
import { BatchMarkPrepaidBankTransactionUseCase } from '../application/batch-mark-prepaid-bank-transaction.usecase';

// add to constructor params
    private readonly batchMarkPrepaidUseCase: BatchMarkPrepaidBankTransactionUseCase,

// add as a new controller method, after markPrepaid()
  @Post('batch-mark-prepaid')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async batchMarkPrepaid(
    @Body() dto: BatchMarkPrepaidBankTransactionDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /bank-transactions/batch-mark-prepaid',
      key,
      dto,
      async () => {
        const results = await this.batchMarkPrepaidUseCase.execute(
          dto.bankTransactionIds,
          dto.customerId,
        );
        return {
          results: results.map((result) =>
            result.status === 'success' && result.data
              ? {
                  ...result,
                  data: {
                    transaction: toBankTransactionResponse(result.data.transaction),
                    payment: toPaymentResponse(result.data.payment),
                  },
                }
              : result,
          ),
        };
      },
    );
  }
```

- [ ] **Step 7: Wire the module provider**

Modify `apps/backend/src/modules/exception-queue/exception-queue.module.ts` — add `BatchMarkPrepaidBankTransactionUseCase` to the `providers` array, same as Task 3 Step 6.

- [ ] **Step 8: Type-check and run the full exception-queue test suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern exception-queue`
Expected: PASS, no type errors

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/exception-queue
git commit -m "feat: add POST /bank-transactions/batch-mark-prepaid"
```

---

### Task 5: `POST /bank-transactions/batch-match`

**Files:**
- Create: `apps/backend/src/modules/exception-queue/presentation/dto/batch-match-bank-transaction.dto.ts`
- Create: `apps/backend/src/modules/exception-queue/application/batch-match-bank-transaction.usecase.ts`
- Test: `apps/backend/src/modules/exception-queue/application/batch-match-bank-transaction.usecase.spec.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`

**Context:** Grilling decision (Q3): each item carries its own `allocations[]` and `version` — `{ items: [{ bankTransactionId, allocations: [{ receivableId, amount }], version }] }`. `MatchBankTransactionUseCase.execute(input: MatchBankTransactionInput): Promise<BankTransaction>` already exists (`match-bank-transaction.usecase.ts`) and takes `{ bankTransactionId, allocations, version, allocatedByUserId }` — reused unchanged. `MatchAllocationItemDto` already exists in `match-bank-transaction.dto.ts` and is reused for each batch item's `allocations`.

**Interfaces:**
- Consumes: `runBatch` (Task 1), `MatchBankTransactionUseCase.execute` (existing), `MatchAllocationItemDto` (existing, `./match-bank-transaction.dto.ts`).
- Produces: `BatchMatchBankTransactionDto { items: BatchMatchItemDto[] }`, `BatchMatchItemDto { bankTransactionId: string; allocations: MatchAllocationItemDto[]; version: number }`, `BatchMatchBankTransactionUseCase.execute(items: BatchMatchItem[], allocatedByUserId: string): Promise<BatchItemResult<BankTransaction>[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-match-bank-transaction.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchMatchBankTransactionUseCase } from './batch-match-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

describe('BatchMatchBankTransactionUseCase', () => {
  it('matches each item with its own allocations/version and reports per-item results', async () => {
    const matchUseCase = {
      execute: jest.fn(async ({ bankTransactionId }) => {
        if (bankTransactionId === 'tx-stale') {
          throw new AppError(
            ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
            'Giao dịch đã được xử lý bởi người dùng khác.',
          );
        }
        return { id: bankTransactionId, status: 'MATCHED' };
      }),
    } as unknown as MatchBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchMatchBankTransactionUseCase(
      matchUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute([
      {
        bankTransactionId: 'tx-ok',
        allocations: [{ receivableId: 'rec-1', amount: 10_000 }],
        version: 1,
      },
      {
        bankTransactionId: 'tx-stale',
        allocations: [{ receivableId: 'rec-2', amount: 5_000 }],
        version: 1,
      },
    ]);

    expect(matchUseCase.execute).toHaveBeenCalledWith({
      bankTransactionId: 'tx-ok',
      allocations: [{ receivableId: 'rec-1', amount: 10_000 }],
      version: 1,
      allocatedByUserId: 'user-1',
    });
    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'tx-stale',
      status: 'error',
      errorCode: ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      message: 'Giao dịch đã được xử lý bởi người dùng khác.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern batch-match-bank-transaction.usecase`
Expected: FAIL with "Cannot find module './batch-match-bank-transaction.usecase'"

- [ ] **Step 3: Write the DTO**

```typescript
// apps/backend/src/modules/exception-queue/presentation/dto/batch-match-bank-transaction.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BATCH_MAX_ITEMS } from '../../../../common/dto/batch-ids.dto';
import { MatchAllocationItemDto } from './match-bank-transaction.dto';

export class BatchMatchItemDto {
  @IsUUID()
  bankTransactionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MatchAllocationItemDto)
  allocations: MatchAllocationItemDto[];

  @IsInt()
  @IsPositive()
  version: number;
}

export class BatchMatchBankTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BatchMatchItemDto)
  items: BatchMatchItemDto[];
}
```

- [ ] **Step 4: Write minimal implementation**

```typescript
// apps/backend/src/modules/exception-queue/application/batch-match-bank-transaction.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import { type BatchItemResult, runBatch } from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import type { MatchAllocationItem } from './match-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

export interface BatchMatchItem {
  bankTransactionId: string;
  allocations: MatchAllocationItem[];
  version: number;
}

@Injectable()
export class BatchMatchBankTransactionUseCase {
  constructor(
    private readonly matchUseCase: MatchBankTransactionUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(items: BatchMatchItem[]): Promise<BatchItemResult<BankTransaction>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(
      items,
      (item) => item.bankTransactionId,
      async (item) => {
        const transaction = await this.matchUseCase.execute({
          bankTransactionId: item.bankTransactionId,
          allocations: item.allocations,
          version: item.version,
          allocatedByUserId: user.userId,
        });
        await this.auditLogRepo.create(
          new AuditLog({
            organizationId: user.organizationId,
            userId: user.userId,
            actionType: AuditActionType.PAYMENT_ALLOCATE,
            entityType: AuditEntityType.BANK_TRANSACTION,
            entityId: item.bankTransactionId,
            beforeState: null,
            afterState: sanitizeAuditPayload(transaction),
            ipAddress: null,
            createdAt: new Date(),
          }),
        );
        return transaction;
      },
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern batch-match-bank-transaction.usecase`
Expected: PASS (1 test)

- [ ] **Step 6: Wire the controller endpoint**

Modify `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`:

```typescript
// add to imports
import { BatchMatchBankTransactionDto } from './dto/batch-match-bank-transaction.dto';
import { BatchMatchBankTransactionUseCase } from '../application/batch-match-bank-transaction.usecase';

// add to constructor params
    private readonly batchMatchUseCase: BatchMatchBankTransactionUseCase,

// add as a new controller method, after match()
  @Post('batch-match')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async batchMatch(
    @Body() dto: BatchMatchBankTransactionDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /bank-transactions/batch-match',
      key,
      dto,
      async () => {
        const results = await this.batchMatchUseCase.execute(dto.items);
        return {
          results: results.map((result) =>
            result.status === 'success' && result.data
              ? { ...result, data: toBankTransactionResponse(result.data) }
              : result,
          ),
        };
      },
    );
  }
```

- [ ] **Step 7: Wire the module provider**

Modify `apps/backend/src/modules/exception-queue/exception-queue.module.ts` — add `BatchMatchBankTransactionUseCase` to the `providers` array.

- [ ] **Step 8: Type-check and run the full exception-queue test suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern exception-queue`
Expected: PASS, no type errors

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/exception-queue
git commit -m "feat: add POST /bank-transactions/batch-match"
```

---

### Task 6: `POST /receivables/batch-write-off`

**Files:**
- Create: `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts`
- Test: `apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`

**Context:** `WriteOffReceivableUseCase.execute(receivableId: string): Promise<Receivable>` (`write-off-receivable.usecase.ts`) already exists and is reused unchanged. Reuses the shared `BatchIdsDto` from Task 2 — no new DTO file needed.

**Interfaces:**
- Consumes: `runBatch` (Task 1), `BatchIdsDto` (Task 2), `WriteOffReceivableUseCase.execute` (existing).
- Produces: `BatchWriteOffReceivableUseCase.execute(ids: string[]): Promise<BatchItemResult<Receivable>[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchWriteOffReceivableUseCase } from './batch-write-off-receivable.usecase';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';

describe('BatchWriteOffReceivableUseCase', () => {
  it('writes off each receivable independently and audits only the successes', async () => {
    const writeOffUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'rec-missing') {
          throw new AppError(ErrorCode.RECEIVABLE_NOT_FOUND, 'Không tìm thấy khoản phải thu.');
        }
        return { id, status: 'WRITTEN_OFF' };
      }),
    } as unknown as WriteOffReceivableUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'FINANCE_MANAGER',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchWriteOffReceivableUseCase(
      writeOffUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['rec-ok', 'rec-missing']);

    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'rec-missing',
      status: 'error',
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
      message: 'Không tìm thấy khoản phải thu.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern batch-write-off-receivable.usecase`
Expected: FAIL with "Cannot find module './batch-write-off-receivable.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/receivables/application/batch-write-off-receivable.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import { type BatchItemResult, runBatch } from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Receivable } from '../domain/receivable';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';

@Injectable()
export class BatchWriteOffReceivableUseCase {
  constructor(
    private readonly writeOffUseCase: WriteOffReceivableUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(ids: string[]): Promise<BatchItemResult<Receivable>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(ids, (id) => id, async (id) => {
      const receivable = await this.writeOffUseCase.execute(id);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: user.organizationId,
          userId: user.userId,
          actionType: AuditActionType.RECEIVABLE_WRITE_OFF,
          entityType: AuditEntityType.RECEIVABLE,
          entityId: id,
          beforeState: null,
          afterState: sanitizeAuditPayload(receivable),
          ipAddress: null,
          createdAt: new Date(),
        }),
      );
      return receivable;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern batch-write-off-receivable.usecase`
Expected: PASS (1 test)

- [ ] **Step 5: Wire the controller endpoint**

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`:

```typescript
// add to imports
import { BatchIdsDto } from '../../../common/dto/batch-ids.dto';
import { BatchWriteOffReceivableUseCase } from '../application/batch-write-off-receivable.usecase';

// add to constructor params
    private readonly batchWriteOffReceivableUseCase: BatchWriteOffReceivableUseCase,

// add as a new controller method, after writeOff()
  @Post('batch-write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async batchWriteOff(
    @Body() dto: BatchIdsDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /receivables/batch-write-off',
      key,
      dto,
      async () => {
        const results = await this.batchWriteOffReceivableUseCase.execute(dto.ids);
        return {
          results: results.map((result) =>
            result.status === 'success' && result.data
              ? { ...result, data: toReceivableResponse(result.data) }
              : result,
          ),
        };
      },
    );
  }
```

- [ ] **Step 6: Wire the module provider**

Modify `apps/backend/src/modules/receivables/receivables.module.ts` — add `BatchWriteOffReceivableUseCase` to the `providers` array, alongside `WriteOffReceivableUseCase`.

- [ ] **Step 7: Type-check and run the full receivables test suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern receivables`
Expected: PASS, no type errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/receivables
git commit -m "feat: add POST /receivables/batch-write-off"
```

---

### Task 7: `POST /receivables/batch-cancel`

**Files:**
- Create: `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts`
- Test: `apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/receivables.module.ts`

**Context:** Identical shape to Task 6, reusing `CancelReceivableUseCase.execute(receivableId: string): Promise<Receivable>` (`cancel-receivable.usecase.ts`) and `BatchIdsDto` (Task 2). `CancelReceivableUseCase` is currently a provider of `ReceivablesModule` but is **not** exported — confirm it's still resolvable inside the module (it is; only cross-module consumers need the export).

**Interfaces:**
- Consumes: `runBatch` (Task 1), `BatchIdsDto` (Task 2), `CancelReceivableUseCase.execute` (existing).
- Produces: `BatchCancelReceivableUseCase.execute(ids: string[]): Promise<BatchItemResult<Receivable>[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchCancelReceivableUseCase } from './batch-cancel-receivable.usecase';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

describe('BatchCancelReceivableUseCase', () => {
  it('cancels each receivable independently and audits only the successes', async () => {
    const cancelUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'rec-has-payments') {
          throw new AppError(
            ErrorCode.RECEIVABLE_HAS_PAYMENTS,
            'Không thể hủy khoản phải thu đã nhận thanh toán.',
          );
        }
        return { id, status: 'CANCELLED' };
      }),
    } as unknown as CancelReceivableUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'FINANCE_MANAGER',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchCancelReceivableUseCase(
      cancelUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['rec-ok', 'rec-has-payments']);

    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'rec-has-payments',
      status: 'error',
      errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS,
      message: 'Không thể hủy khoản phải thu đã nhận thanh toán.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern batch-cancel-receivable.usecase`
Expected: FAIL with "Cannot find module './batch-cancel-receivable.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/receivables/application/batch-cancel-receivable.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import { type BatchItemResult, runBatch } from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

@Injectable()
export class BatchCancelReceivableUseCase {
  constructor(
    private readonly cancelUseCase: CancelReceivableUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(ids: string[]): Promise<BatchItemResult<Receivable>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(ids, (id) => id, async (id) => {
      const receivable = await this.cancelUseCase.execute(id);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: user.organizationId,
          userId: user.userId,
          actionType: AuditActionType.RECEIVABLE_CANCEL,
          entityType: AuditEntityType.RECEIVABLE,
          entityId: id,
          beforeState: null,
          afterState: sanitizeAuditPayload(receivable),
          ipAddress: null,
          createdAt: new Date(),
        }),
      );
      return receivable;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern batch-cancel-receivable.usecase`
Expected: PASS (1 test)

- [ ] **Step 5: Wire the controller endpoint**

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`:

```typescript
// add to imports (BatchIdsDto already imported by Task 6)
import { BatchCancelReceivableUseCase } from '../application/batch-cancel-receivable.usecase';

// add to constructor params
    private readonly batchCancelReceivableUseCase: BatchCancelReceivableUseCase,

// add as a new controller method, after cancel()
  @Post('batch-cancel')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async batchCancel(
    @Body() dto: BatchIdsDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /receivables/batch-cancel',
      key,
      dto,
      async () => {
        const results = await this.batchCancelReceivableUseCase.execute(dto.ids);
        return {
          results: results.map((result) =>
            result.status === 'success' && result.data
              ? { ...result, data: toReceivableResponse(result.data) }
              : result,
          ),
        };
      },
    );
  }
```

- [ ] **Step 6: Wire the module provider**

Modify `apps/backend/src/modules/receivables/receivables.module.ts` — add `BatchCancelReceivableUseCase` to the `providers` array.

- [ ] **Step 7: Type-check and run the full receivables test suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern receivables`
Expected: PASS, no type errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/receivables
git commit -m "feat: add POST /receivables/batch-cancel"
```

---

### Task 8: End-to-end coverage for partial success

**Files:**
- Create: `apps/backend/test/batch-operations.e2e-spec.ts`

**Context:** Tasks 3–7 already unit-test every batch use case's per-item independence with mocked single-item use cases. This task proves the same behavior through the real HTTP + Postgres stack for one bank-transaction batch endpoint and one receivables batch endpoint, following the existing e2e pattern in `apps/backend/test/exception-queue.e2e-spec.ts` (testcontainers Postgres, JWT via `JwtService.sign`, `configureApp(app)`).

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/backend/test/batch-operations.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
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
import { AuditLogOrmEntity } from '../src/common/audit/audit-log.orm-entity';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';

describe('Batch Operations (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const organizationId = '00000000-0000-4000-8000-000000000201';
  const userId = '00000000-0000-4000-8000-000000000202';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'batch-operations-e2e-secret';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.RESEND_API_KEY = 'batch-operations-e2e-resend-key';

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

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Batch Ops User',
      email: 'batch-ops@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    const jwt = moduleRef.get(JwtService);
    token = jwt.sign({ userId, organizationId, role: Role.OWNER });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  async function createReviewTransaction(amount: number): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(BankTransactionOrmEntity).save({
      id,
      organizationId,
      bankConnectionId: randomUUID(),
      webhookInboxId: randomUUID(),
      providerTransactionId: `TX-${id}`,
      amount,
      transactionDateTime: new Date('2026-08-01'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'Batch Customer',
      transferContent: 'manual review',
      status: 'PENDING_REVIEW',
      version: 1,
      createdAt: new Date(),
    });
    return id;
  }

  async function createOpenReceivable(): Promise<string> {
    const customerId = randomUUID();
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: `Customer ${customerId.slice(-4)}`,
      taxCode: `TAX-${customerId.slice(-8)}`,
      email: `${customerId}@example.com`,
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    const id = randomUUID();
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
    return id;
  }

  it('skips valid transactions and reports the invalid one without blocking the rest', async () => {
    const okId = await createReviewTransaction(10_000);
    const missingId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/api/v1/bank-transactions/batch-skip')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `batch-skip-${okId}`)
      .send({ ids: [okId, missingId] })
      .expect(201);

    const results = response.body.results as Array<{ id: string; status: string }>;
    expect(results.find((r) => r.id === okId)?.status).toBe('success');
    expect(results.find((r) => r.id === missingId)?.status).toBe('error');

    const transaction = await dataSource
      .getRepository(BankTransactionOrmEntity)
      .findOneByOrFail({ id: okId });
    expect(transaction.status).toBe('IGNORED');

    const auditRows = await dataSource
      .getRepository(AuditLogOrmEntity)
      .countBy({ entityId: okId, organizationId });
    expect(auditRows).toBe(1);
  }, 20_000);

  it('writes off valid receivables and reports the invalid one without blocking the rest', async () => {
    const okId = await createOpenReceivable();
    const missingId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/api/v1/receivables/batch-write-off')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `batch-write-off-${okId}`)
      .send({ ids: [okId, missingId] })
      .expect(201);

    const results = response.body.results as Array<{ id: string; status: string }>;
    expect(results.find((r) => r.id === okId)?.status).toBe('success');
    expect(results.find((r) => r.id === missingId)?.status).toBe('error');

    const receivable = await dataSource
      .getRepository(ReceivableOrmEntity)
      .findOneByOrFail({ id: okId });
    expect(receivable.status).toBe(ReceivableStatus.WRITTEN_OFF);
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- batch-operations`
Expected: FAIL (endpoints don't exist yet if run before Tasks 3–7; if run after, this step should already PASS — in that case skip straight to Step 3 and note the exception, since Tasks 3–7 already drove the RED→GREEN cycle for this behavior at the unit level)

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- batch-operations`
Expected: PASS (2 tests) — requires Docker running

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/batch-operations.e2e-spec.ts
git commit -m "test: add e2e coverage for batch endpoint partial success"
```

---

## Self-Review Notes

- **Spec coverage:** All 5 endpoints from issue #134 are covered (Tasks 3–7). Batch size limit (Global Constraints, Task 2). Per-row independent processing and reporting (Task 1, every use case test). Idempotency (every controller step). Audit logging without `@Audited` (every batch use case). RBAC reused unchanged (every controller step uses the single-item endpoint's existing `@RequirePermission`).
- **Not in this plan:** the frontend bulk action bar (separate plan, `docs/superpowers/plans/2026-08-14-batch-operations-frontend.md`) and the `BULK_APPROVE_THRESHOLD = 80` confidence gate for "Approve match," which is a frontend-only concern — the backend `batch-match` endpoint accepts whatever allocations the caller sends, it does not know about "approve from candidate."
