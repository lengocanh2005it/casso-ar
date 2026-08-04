# Webhook Ingestion & Matching Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive CASSO Balance Hook webhooks, deduplicate them, normalize the payload into `BankTransaction`, score candidate `Receivable`s via the 5-component Matching Engine formula, and route by threshold: `>= 90` auto-allocate (reusing `AllocatePaymentUseCase` from the Domain Core plan), `60-89` create `MatchingCandidate` rows for the Exception Queue, `< 60` mark `UNMATCHED`.

**Architecture:** `WebhookController` authenticates, resolves the tenant from the referenced ACTIVE `BankConnection`, performs an idempotent insert, then enqueues a BullMQ job. `organizationId` in the provider body is informational only; a mismatch is rejected. A `WebhookProcessor` (queue consumer) does normalization + scoring + routing and receives the resolved `organizationId` in job data.

**Tech Stack:** `@nestjs/bullmq` + `bullmq` (Redis-backed queue, Redis container already running from the Domain Core plan's `docker-compose.yml`), TypeORM, Jest + testcontainers.

## Global Constraints

- `WebhookInbox.providerTransactionId` has a DB `unique` constraint — this IS the idempotency mechanism, not an application-level check (spec section 4.2).
- Processor failures are durable: persist `FAILED`, increment `retryCount`, and store only a redacted, max-500-character `errorMessage` before rethrowing so BullMQ can retry/DLQ the job.
- Header auth uses constant-time comparison (`crypto.timingSafeEqual`), not `===` (spec section 4.1).
- Scoring components are pure functions, independently unit-testable (spec section 3).
- `amount < 0` transactions are never scored — routed out before the Matching Engine runs (spec section 4.4).
- Threshold: `>= 90` auto-allocate, `60-89` Exception Queue, `< 60` `UNMATCHED` (spec section 3).
- Money fields stay integer (VND), no `float` (scaffolding spec Global Constraints, still binding here).
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply.

---

## File Structure

```
apps/backend/src/
  modules/
    bank-accounts/                                  -- minimal forward stub, full flow in Cas ID plan
      domain/customer-bank-account.ts
      infrastructure/customer-bank-account.orm-entity.ts
      application/customer-bank-account-repository.port.ts
      infrastructure/typeorm-customer-bank-account.repository.ts
      bank-accounts.module.ts
    webhooks/
      domain/webhook-inbox.ts
      infrastructure/webhook-inbox.orm-entity.ts
      application/webhook-inbox-repository.port.ts
      infrastructure/typeorm-webhook-inbox.repository.ts
      domain/bank-transaction.ts
      infrastructure/bank-transaction.orm-entity.ts
      application/bank-transaction-repository.port.ts
      infrastructure/typeorm-bank-transaction.repository.ts
      domain/matching-candidate.ts
      infrastructure/matching-candidate.orm-entity.ts
      application/matching-candidate-repository.port.ts
      infrastructure/typeorm-matching-candidate.repository.ts
      application/transaction-normalizer.ts
      application/scoring/reference-code-score.ts
      application/scoring/amount-score.ts
      application/scoring/customer-bank-account-score.ts
      application/scoring/payer-name-score.ts
      application/scoring/timing-score.ts
      application/matching-engine.service.ts
      application/process-webhook.usecase.ts
      presentation/webhook-auth.guard.ts
      presentation/webhooks.controller.ts
      infrastructure/webhook.processor.ts
      infrastructure/webhooks-queue.constants.ts
      webhooks.module.ts
  config/bullmq.config.ts
  app.module.ts                                     -- MODIFY: register BullModule, WebhooksModule, BankAccountsModule
  modules/payments/application/allocate-payment.usecase.ts   -- MODIFY: allocatedByUserId becomes string | null
docker-compose.yml                                   -- already has redis (Domain Core plan Task 5), no change
test/
  webhook-idempotency.integration.spec.ts
  webhook-matching-routing.integration.spec.ts
```

---

### Task 1: CustomerBankAccount (minimal forward stub)

**Files:**
- Create: `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts`
- Create: `apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts`
- Create: `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts`
- Create: `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `BaseRepository` (Multi-tenancy plan)
- Consumes: `IBankConnectionRepository.findByIdUnscoped` (Cas ID plan) for webhook tenant resolution
- Produces: `ICustomerBankAccountRepository.findByAccountNumber(accountNumber)`, used by Task 8's `MatchingEngineService` to resolve `customerId` and compute `customerBankAccountScore`

`CustomerBankAccount` is explicit tenant-owned customer master data: a row maps one normalized provider account number to one `customerId` inside one `organizationId`. The Cas ID plan stores the connected provider account in `BankConnection.accountIdentity`, but must not guess which customer owns it or synthesize this mapping. A customer bank-account management flow (or the seeded/admin setup used by this plan's integration test) creates the row; the Matching Engine only reads it through the tenant-scoped repository.

Mapping contract sample: `{ organizationId: 'org-1', customerId: 'cust-1', accountNumber: '0011002233' }` makes an incoming `counterpartyAccountNumber = '0011002233'` resolve to `cust-1`; the same number in another organization is invisible to the first tenant.

- [ ] **Step 1: Create `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts`**

```typescript
export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  createdAt: Date;
}

export class CustomerBankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly createdAt: Date;

  constructor(props: CustomerBankAccountProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.accountNumber = props.accountNumber;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'customer_bank_accounts' })
@Index(['organizationId', 'accountNumber'])
export class CustomerBankAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  customerId: string;

  @Column()
  accountNumber: string;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 3: Create `apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts`**

```typescript
import { CustomerBankAccount } from '../domain/customer-bank-account';

export interface ICustomerBankAccountRepository {
  findByAccountNumber(accountNumber: string): Promise<CustomerBankAccount | null>;
  save(account: CustomerBankAccount): Promise<void>;
}

export const CUSTOMER_BANK_ACCOUNT_REPOSITORY = Symbol('CUSTOMER_BANK_ACCOUNT_REPOSITORY');
```

- [ ] **Step 4: Create `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { ICustomerBankAccountRepository } from '../application/customer-bank-account-repository.port';
import { CustomerBankAccountOrmEntity } from './customer-bank-account.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCustomerBankAccountRepository
  extends BaseRepository<CustomerBankAccountOrmEntity>
  implements ICustomerBankAccountRepository
{
  constructor(
    @InjectRepository(CustomerBankAccountOrmEntity) repo: Repository<CustomerBankAccountOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByAccountNumber(accountNumber: string): Promise<CustomerBankAccount | null> {
    const row = await this.scopedFindOne({ accountNumber } as any);
    return row ? new CustomerBankAccount(row) : null;
  }

  async save(account: CustomerBankAccount): Promise<void> {
    await this.scopedSave(account as unknown as CustomerBankAccountOrmEntity);
  }
}
```

- [ ] **Step 5: Create `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerBankAccountOrmEntity } from './infrastructure/customer-bank-account.orm-entity';
import { TypeOrmCustomerBankAccountRepository } from './infrastructure/typeorm-customer-bank-account.repository';
import { CUSTOMER_BANK_ACCOUNT_REPOSITORY } from './application/customer-bank-account-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerBankAccountOrmEntity])],
  providers: [
    { provide: CUSTOMER_BANK_ACCOUNT_REPOSITORY, useClass: TypeOrmCustomerBankAccountRepository },
  ],
  exports: [CUSTOMER_BANK_ACCOUNT_REPOSITORY],
})
export class BankAccountsModule {}
```

- [ ] **Step 6: Register `BankAccountsModule` in `apps/backend/src/app.module.ts`**

Add to `imports`.

- [ ] **Step 7: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/bank-accounts apps/backend/src/app.module.ts
git commit -m "feat: add minimal CustomerBankAccount entity for matching engine scoring"
```

---

### Task 2: WebhookInbox entity + repository

**Files:**
- Create: `apps/backend/src/modules/webhooks/domain/webhook-inbox.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/webhook-inbox.orm-entity.ts`
- Create: `apps/backend/src/modules/webhooks/application/webhook-inbox-repository.port.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.ts`
- Create: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/webhooks/domain/webhook-inbox.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `WebhookInbox` domain class, `IWebhookInboxRepository.insertIfNotDuplicate(...)`, used by Task 5 (controller)

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/webhooks/domain/webhook-inbox.spec.ts`:

```typescript
import { WebhookInbox } from './webhook-inbox';

describe('WebhookInbox domain entity', () => {
  it('starts in RECEIVED status', () => {
    const inbox = new WebhookInbox({
      id: 'wh-1',
      organizationId: 'org-1',
      bankConnectionId: 'conn-1',
      providerTransactionId: 'TX-001',
      rawPayload: { foo: 'bar' },
      receivedAt: new Date('2026-08-01'),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    expect(inbox.status).toBe('RECEIVED');
  });

  it('markFailed increments retryCount and stores the error message', () => {
    const inbox = new WebhookInbox({
      id: 'wh-1',
      organizationId: 'org-1',
      bankConnectionId: 'conn-1',
      providerTransactionId: 'TX-001',
      rawPayload: {},
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    const failed = inbox.markFailed('normalizer error');
    expect(failed.status).toBe('FAILED');
    expect(failed.retryCount).toBe(1);
    expect(failed.errorMessage).toBe('normalizer error');
  });

  it('markProcessed sets processedAt', () => {
    const inbox = new WebhookInbox({
      id: 'wh-1',
      organizationId: 'org-1',
      bankConnectionId: 'conn-1',
      providerTransactionId: 'TX-001',
      rawPayload: {},
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    const processed = inbox.markProcessed();
    expect(processed.status).toBe('PROCESSED');
    expect(processed.processedAt).not.toBeNull();
  });

  it('clears a previous failure message after a later successful retry', () => {
    const inbox = new WebhookInbox({
      id: 'wh-1',
      organizationId: 'org-1',
      bankConnectionId: 'conn-1',
      providerTransactionId: 'TX-001',
      rawPayload: {},
      receivedAt: new Date(),
      status: 'FAILED',
      processedAt: null,
      errorMessage: 'temporary failure',
      retryCount: 1,
    });

    expect(inbox.markProcessed().errorMessage).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test webhook-inbox.spec.ts`
Expected: FAIL — Cannot find module './webhook-inbox'

- [ ] **Step 3: Create `apps/backend/src/modules/webhooks/domain/webhook-inbox.ts`**

```typescript
export type WebhookInboxStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED';

export interface WebhookInboxProps {
  id: string;
  organizationId: string;
  bankConnectionId: string;
  providerTransactionId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: Date;
  status: WebhookInboxStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export class WebhookInbox {
  readonly id: string;
  readonly organizationId: string;
  readonly bankConnectionId: string;
  readonly providerTransactionId: string;
  readonly rawPayload: Record<string, unknown>;
  readonly receivedAt: Date;
  readonly status: WebhookInboxStatus;
  readonly processedAt: Date | null;
  readonly errorMessage: string | null;
  readonly retryCount: number;

  constructor(props: WebhookInboxProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.bankConnectionId = props.bankConnectionId;
    this.providerTransactionId = props.providerTransactionId;
    this.rawPayload = props.rawPayload;
    this.receivedAt = props.receivedAt;
    this.status = props.status;
    this.processedAt = props.processedAt;
    this.errorMessage = props.errorMessage;
    this.retryCount = props.retryCount;
  }

  markFailed(errorMessage: string): WebhookInbox {
    return new WebhookInbox({
      ...this,
      status: 'FAILED',
      errorMessage,
      retryCount: this.retryCount + 1,
    });
  }

  markProcessed(): WebhookInbox {
    return new WebhookInbox({
      ...this,
      status: 'PROCESSED',
      processedAt: new Date(),
      errorMessage: null,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test webhook-inbox.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Create `apps/backend/src/modules/webhooks/infrastructure/webhook-inbox.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { WebhookInboxStatus } from '../domain/webhook-inbox';

@Entity({ name: 'webhook_inbox' })
export class WebhookInboxOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  bankConnectionId: string;

  @Column({ unique: true })
  providerTransactionId: string;

  @Column({ type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @Column()
  receivedAt: Date;

  @Column()
  status: WebhookInboxStatus;

  @Column({ nullable: true })
  processedAt: Date | null;

  @Column({ nullable: true })
  errorMessage: string | null;

  @Column({ default: 0 })
  retryCount: number;
}
```

`providerTransactionId` unique constraint IS the idempotency mechanism (spec section 4.2) — Task 5's insert relies on the DB rejecting a duplicate, not an application-level pre-check (which would race under concurrent delivery).

- [ ] **Step 6: Create `apps/backend/src/modules/webhooks/application/webhook-inbox-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { WebhookInbox } from '../domain/webhook-inbox';

export class DuplicateWebhookError extends Error {
  constructor(providerTransactionId: string) {
    super(`Webhook with providerTransactionId ${providerTransactionId} already received`);
  }
}

export interface IWebhookInboxRepository {
  insert(inbox: WebhookInbox): Promise<void>;
  save(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<WebhookInbox | null>;
}

export const WEBHOOK_INBOX_REPOSITORY = Symbol('WEBHOOK_INBOX_REPOSITORY');
```

- [ ] **Step 7: Create `apps/backend/src/modules/webhooks/infrastructure/typeorm-webhook-inbox.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { WebhookInbox } from '../domain/webhook-inbox';
import {
  DuplicateWebhookError,
  IWebhookInboxRepository,
} from '../application/webhook-inbox-repository.port';
import { WebhookInboxOrmEntity } from './webhook-inbox.orm-entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class TypeOrmWebhookInboxRepository implements IWebhookInboxRepository {
  constructor(
    @InjectRepository(WebhookInboxOrmEntity)
    private readonly repo: Repository<WebhookInboxOrmEntity>,
  ) {}

  async insert(inbox: WebhookInbox): Promise<void> {
    try {
      await this.repo.insert(inbox as unknown as WebhookInboxOrmEntity);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as any).code === POSTGRES_UNIQUE_VIOLATION) {
        throw new DuplicateWebhookError(inbox.providerTransactionId);
      }
      throw error;
    }
  }

  async save(inbox: WebhookInbox, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(WebhookInboxOrmEntity) : this.repo).save(
      inbox as unknown as WebhookInboxOrmEntity,
    );
  }

  async findById(id: string, organizationId: string): Promise<WebhookInbox | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new WebhookInbox(row) : null;
  }
}
```

`WebhookInbox` is deliberately NOT behind `BaseRepository`/`TenantContextService` — the webhook controller runs BEFORE any tenant is known (the organization is resolved FROM the payload/bank connection, not from a JWT), so `findById`/`insert` take `organizationId` explicitly here.

- [ ] **Step 8: Create `apps/backend/src/modules/webhooks/webhooks.module.ts`** (skeleton, extended by later tasks)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookInboxOrmEntity } from './infrastructure/webhook-inbox.orm-entity';
import { TypeOrmWebhookInboxRepository } from './infrastructure/typeorm-webhook-inbox.repository';
import { WEBHOOK_INBOX_REPOSITORY } from './application/webhook-inbox-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookInboxOrmEntity])],
  providers: [
    { provide: WEBHOOK_INBOX_REPOSITORY, useClass: TypeOrmWebhookInboxRepository },
  ],
})
export class WebhooksModule {}
```

- [ ] **Step 9: Register `WebhooksModule` in `apps/backend/src/app.module.ts`**

Add to `imports`.

- [ ] **Step 10: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/webhooks apps/backend/src/app.module.ts
git commit -m "feat: add WebhookInbox entity with unique-constraint-based idempotency"
```

---

### Task 3: BankTransaction entity + repository

**Files:**
- Create: `apps/backend/src/modules/webhooks/domain/bank-transaction.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/bank-transaction.orm-entity.ts`
- Create: `apps/backend/src/modules/webhooks/application/bank-transaction-repository.port.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/typeorm-bank-transaction.repository.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Test: `apps/backend/src/modules/webhooks/domain/bank-transaction.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `BankTransaction` domain class with `version` optimistic lock (spec depends on `2026-08-03-exception-queue-audit-log-design.md` section 1's `version` field, defined here since `BankTransaction` is owned by this module), used by Task 8 (Matching Engine writes `status`)

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/webhooks/domain/bank-transaction.spec.ts`:

```typescript
import { BankTransaction } from './bank-transaction';

function buildTransaction(): BankTransaction {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'wh-1',
    providerTransactionId: 'TX-001',
    amount: 30_000_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'CONG TY B',
    transferContent: 'TT HD INV-2026-0012',
    status: 'UNMATCHED',
    version: 1,
    createdAt: new Date('2026-08-01'),
  });
}

describe('BankTransaction domain entity', () => {
  it('markMatched transitions status to MATCHED', () => {
    const updated = buildTransaction().markMatched();
    expect(updated.status).toBe('MATCHED');
    expect(updated.version).toBe(1);
  });

  it('markPendingReview transitions status to PENDING_REVIEW', () => {
    const updated = buildTransaction().markPendingReview();
    expect(updated.status).toBe('PENDING_REVIEW');
  });

  it('isRefund is true only for negative amounts', () => {
    expect(buildTransaction().isRefund()).toBe(false);
    const refund = new BankTransaction({ ...buildTransaction(), amount: -5_000_000 });
    expect(refund.isRefund()).toBe(true);
  });

  it('markIgnored transitions status to IGNORED', () => {
    expect(buildTransaction().markIgnored().status).toBe('IGNORED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test bank-transaction.spec.ts`
Expected: FAIL — Cannot find module './bank-transaction'

- [ ] **Step 3: Create `apps/backend/src/modules/webhooks/domain/bank-transaction.ts`**

```typescript
export type BankTransactionStatus = 'UNMATCHED' | 'PENDING_REVIEW' | 'MATCHED' | 'IGNORED';

export interface BankTransactionProps {
  id: string;
  organizationId: string;
  bankConnectionId: string;
  webhookInboxId: string;
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
  status: BankTransactionStatus;
  version: number;
  createdAt: Date;
}

export class BankTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly bankConnectionId: string;
  readonly webhookInboxId: string;
  readonly providerTransactionId: string;
  readonly amount: number;
  readonly transactionDateTime: Date;
  readonly counterpartyAccountNumber: string;
  readonly counterpartyName: string;
  readonly transferContent: string;
  readonly status: BankTransactionStatus;
  readonly version: number;
  readonly createdAt: Date;

  constructor(props: BankTransactionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.bankConnectionId = props.bankConnectionId;
    this.webhookInboxId = props.webhookInboxId;
    this.providerTransactionId = props.providerTransactionId;
    this.amount = props.amount;
    this.transactionDateTime = props.transactionDateTime;
    this.counterpartyAccountNumber = props.counterpartyAccountNumber;
    this.counterpartyName = props.counterpartyName;
    this.transferContent = props.transferContent;
    this.status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
  }

  isRefund(): boolean {
    return this.amount < 0;
  }

  markMatched(): BankTransaction {
    return new BankTransaction({ ...this, status: 'MATCHED' });
  }

  markPendingReview(): BankTransaction {
    return new BankTransaction({ ...this, status: 'PENDING_REVIEW' });
  }

  markUnmatched(): BankTransaction {
    return new BankTransaction({ ...this, status: 'UNMATCHED' });
  }

  markIgnored(): BankTransaction {
    return new BankTransaction({ ...this, status: 'IGNORED' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test bank-transaction.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Create `apps/backend/src/modules/webhooks/infrastructure/bank-transaction.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { BankTransactionStatus } from '../domain/bank-transaction';

@Entity({ name: 'bank_transactions' })
export class BankTransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  bankConnectionId: string;

  @Column()
  webhookInboxId: string;

  @Column({ unique: true })
  providerTransactionId: string;

  @Column('bigint')
  amount: number;

  @Column()
  transactionDateTime: Date;

  @Column()
  counterpartyAccountNumber: string;

  @Column()
  counterpartyName: string;

  @Column('text')
  transferContent: string;

  @Column()
  status: BankTransactionStatus;

  @VersionColumn()
  version: number;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/webhooks/application/bank-transaction-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { BankTransaction } from '../domain/bank-transaction';

export interface IBankTransactionRepository {
  save(transaction: BankTransaction, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<BankTransaction | null>;
}

export const BANK_TRANSACTION_REPOSITORY = Symbol('BANK_TRANSACTION_REPOSITORY');
```

Not behind `BaseRepository` for the same reason as `WebhookInbox` — the queue processor supplies `organizationId` explicitly (resolved from the webhook payload's bank connection), it does not come from an authenticated request.

- [ ] **Step 7: Create `apps/backend/src/modules/webhooks/infrastructure/typeorm-bank-transaction.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BankTransaction } from '../domain/bank-transaction';
import { IBankTransactionRepository } from '../application/bank-transaction-repository.port';
import { BankTransactionOrmEntity } from './bank-transaction.orm-entity';

@Injectable()
export class TypeOrmBankTransactionRepository implements IBankTransactionRepository {
  constructor(
    @InjectRepository(BankTransactionOrmEntity)
    private readonly repo: Repository<BankTransactionOrmEntity>,
  ) {}

  async save(transaction: BankTransaction, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(BankTransactionOrmEntity) : this.repo).save(
      transaction as unknown as BankTransactionOrmEntity,
    );
  }

  async findById(id: string, organizationId: string): Promise<BankTransaction | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new BankTransaction(row) : null;
  }
}
```

- [ ] **Step 8: Register in `apps/backend/src/modules/webhooks/webhooks.module.ts`**

Add `BankTransactionOrmEntity` to `TypeOrmModule.forFeature([...])` and the repository provider.

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/webhooks
git commit -m "feat: add BankTransaction entity with optimistic lock version field"
```

---

### Task 4: BullMQ setup

**Files:**
- Create: `apps/backend/src/config/bullmq.config.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/.env`

**Interfaces:**
- Consumes: Redis container from Domain Core plan's `docker-compose.yml`
- Produces: `BullModule` registered globally, used by Task 5 (`WebhooksModule` registers the `webhook-processing` queue)

- [ ] **Step 1: Install `@nestjs/bullmq` and `bullmq`**

Run: `pnpm --filter @casso-ledger/backend add @nestjs/bullmq bullmq`

- [ ] **Step 2: Add Redis env vars to `apps/backend/.env`**

```
REDIS_HOST=localhost
REDIS_PORT=6379
```

- [ ] **Step 3: Create `apps/backend/src/config/bullmq.config.ts`**

```typescript
import { BullRootModuleOptions } from '@nestjs/bullmq';

export const bullMqConfig: BullRootModuleOptions = {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
};
```

- [ ] **Step 4: Register `BullModule.forRoot` in `apps/backend/src/app.module.ts`**

Add `BullModule.forRoot(bullMqConfig)` to `imports` (with `import { BullModule } from '@nestjs/bullmq';` and `import { bullMqConfig } from './config/bullmq.config';`).

- [ ] **Step 5: Verify app boots with Redis running**

Run: `docker compose up -d redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/config/bullmq.config.ts apps/backend/src/app.module.ts apps/backend/.env apps/backend/package.json
git commit -m "feat: register BullMQ root module for background job processing"
```

---

### Task 5: Webhook controller (auth + idempotent ingest + enqueue)

**Files:**
- Create: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/webhooks-queue.constants.ts`
- Create: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Modify: `apps/backend/.env`
- Test: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `IWebhookInboxRepository` (Task 2), `BullModule` (Task 4)
- Produces: `POST /webhooks/casso-balance-hook` — 401 on bad auth, 200 on duplicate (no enqueue), 202 + enqueued job otherwise; used by Task 10's integration tests

- [ ] **Step 1: Add CASSO webhook credentials to `apps/backend/.env`**

```
CASSO_WEBHOOK_CLIENT_ID=dev-client-id
CASSO_WEBHOOK_SECRET_KEY=dev-secret-key-change-me
```

- [ ] **Step 2: Write failing test for the auth guard**

Create `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('WebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CASSO_WEBHOOK_CLIENT_ID: 'client-1', CASSO_WEBHOOK_SECRET_KEY: 'secret-1' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows requests with matching client id and secret key headers', () => {
    const guard = new WebhookAuthGuard();
    const context = buildContext({ 'x-client-id': 'client-1', 'x-secret-key': 'secret-1' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects requests with a wrong secret key', () => {
    const guard = new WebhookAuthGuard();
    const context = buildContext({ 'x-client-id': 'client-1', 'x-secret-key': 'wrong' });
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('rejects requests with missing headers', () => {
    const guard = new WebhookAuthGuard();
    const context = buildContext({});
    expect(() => guard.canActivate(context)).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test webhook-auth.guard.spec.ts`
Expected: FAIL — Cannot find module './webhook-auth.guard'

- [ ] **Step 4: Create `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clientId = request.headers['x-client-id'];
    const secretKey = request.headers['x-secret-key'];

    const expectedClientId = process.env.CASSO_WEBHOOK_CLIENT_ID ?? '';
    const expectedSecretKey = process.env.CASSO_WEBHOOK_SECRET_KEY ?? '';

    if (
      typeof clientId !== 'string' ||
      typeof secretKey !== 'string' ||
      !constantTimeEquals(clientId, expectedClientId) ||
      !constantTimeEquals(secretKey, expectedSecretKey)
    ) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }

    return true;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test webhook-auth.guard.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 6: Create `apps/backend/src/modules/webhooks/infrastructure/webhooks-queue.constants.ts`**

```typescript
export const WEBHOOK_PROCESSING_QUEUE = 'webhook-processing';
```

- [ ] **Step 7: Create `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`**

```typescript
import { BadRequestException, Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { WebhookAuthGuard } from './webhook-auth.guard';
import {
  IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
  DuplicateWebhookError,
} from '../application/webhook-inbox-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WEBHOOK_PROCESSING_QUEUE } from '../infrastructure/webhooks-queue.constants';
import { Inject } from '@nestjs/common';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from '../../bank-connections/application/bank-connection-repository.port';

interface BalanceHookPayload {
  organizationId?: string;
  bankConnectionId: string;
  transactionId: string;
  [key: string]: unknown;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY) private readonly webhookInboxRepo: IWebhookInboxRepository,
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('casso-balance-hook')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(200)
  async receiveBalanceHook(@Body() payload: BalanceHookPayload, @Req() req: Request) {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(payload.bankConnectionId);
    if (!connection || !connection.isUsable()) {
      return { received: true, ignored: true, reason: 'bank connection not ACTIVE' };
    }
    if (payload.organizationId && payload.organizationId !== connection.organizationId) {
      throw new BadRequestException('Webhook organization does not match bank connection');
    }

    const inbox = new WebhookInbox({
      id: randomUUID(),
      organizationId: connection.organizationId,
      bankConnectionId: connection.id,
      providerTransactionId: payload.transactionId,
      rawPayload: payload as unknown as Record<string, unknown>,
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    try {
      await this.webhookInboxRepo.insert(inbox);
    } catch (error) {
      if (error instanceof DuplicateWebhookError) {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    await this.queue.add(
      'process-webhook',
      { webhookInboxId: inbox.id, organizationId: inbox.organizationId, bankConnectionId: connection.id },
      { jobId: payload.transactionId, attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { received: true, duplicate: false };
  }
}
```

`jobId: payload.transactionId` gives BullMQ its own dedup layer on top of the DB unique constraint (defense in depth — a job with the same `jobId` already in the queue is a no-op add).

- [ ] **Step 8: Register controller and `BullModule.registerQueue` in `webhooks.module.ts`**

Modify `apps/backend/src/modules/webhooks/webhooks.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookInboxOrmEntity } from './infrastructure/webhook-inbox.orm-entity';
import { BankTransactionOrmEntity } from './infrastructure/bank-transaction.orm-entity';
import { TypeOrmWebhookInboxRepository } from './infrastructure/typeorm-webhook-inbox.repository';
import { TypeOrmBankTransactionRepository } from './infrastructure/typeorm-bank-transaction.repository';
import { WEBHOOK_INBOX_REPOSITORY } from './application/webhook-inbox-repository.port';
import { BANK_TRANSACTION_REPOSITORY } from './application/bank-transaction-repository.port';
import { WebhooksController } from './presentation/webhooks.controller';
import { WEBHOOK_PROCESSING_QUEUE } from './infrastructure/webhooks-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookInboxOrmEntity, BankTransactionOrmEntity]),
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
  ],
  controllers: [WebhooksController],
  providers: [
    { provide: WEBHOOK_INBOX_REPOSITORY, useClass: TypeOrmWebhookInboxRepository },
    { provide: BANK_TRANSACTION_REPOSITORY, useClass: TypeOrmBankTransactionRepository },
  ],
})
export class WebhooksModule {}
```

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/webhooks apps/backend/.env
git commit -m "feat: add webhook controller with header auth and idempotent ingest"
```

---

### Task 6: Transaction Normalizer

**Files:**
- Create: `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`
- Test: `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`

**Interfaces:**
- Consumes: raw `WebhookInbox.rawPayload`
- Produces: `normalizeBalanceHookPayload(payload): NormalizedTransaction`, used by Task 9's `WebhookProcessor`

Field names below follow the Balance Hook fields listed in the spec's section 0 (Transaction ID + unique code, amount, transaction time, account numbers, counterparty info) — actual field names are an assumption pending confirmation with CASSO's Developer Portal (spec section 0's own caveat); this function is the single place to fix if real field names differ.

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`:

```typescript
import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps a Balance Hook payload into a NormalizedTransaction', () => {
    const payload = {
      transactionId: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: '2026-08-01T10:00:00.000Z',
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    };

    const result = normalizeBalanceHookPayload(payload);

    expect(result).toEqual({
      providerTransactionId: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01T10:00:00.000Z'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test transaction-normalizer.spec.ts`
Expected: FAIL — Cannot find module './transaction-normalizer'

- [ ] **Step 3: Create `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`**

```typescript
export interface NormalizedTransaction {
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

interface RawBalanceHookPayload {
  transactionId: string;
  amount: number;
  transactionDateTime: string;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

export function normalizeBalanceHookPayload(payload: Record<string, unknown>): NormalizedTransaction {
  const raw = payload as unknown as RawBalanceHookPayload;
  return {
    providerTransactionId: raw.transactionId,
    amount: raw.amount,
    transactionDateTime: new Date(raw.transactionDateTime),
    counterpartyAccountNumber: raw.counterpartyAccountNumber,
    counterpartyName: raw.counterpartyName,
    transferContent: raw.transferContent,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test transaction-normalizer.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/transaction-normalizer.ts apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts
git commit -m "feat: add Balance Hook payload normalizer"
```

---

### Task 7: Scoring pure functions

**Files:**
- Create: `apps/backend/src/modules/webhooks/application/scoring/reference-code-score.ts`
- Create: `apps/backend/src/modules/webhooks/application/scoring/amount-score.ts`
- Create: `apps/backend/src/modules/webhooks/application/scoring/customer-bank-account-score.ts`
- Create: `apps/backend/src/modules/webhooks/application/scoring/payer-name-score.ts`
- Create: `apps/backend/src/modules/webhooks/application/scoring/timing-score.ts`
- Test: one `.spec.ts` per function (5 files)

**Interfaces:**
- Consumes: nothing (pure functions)
- Produces: 5 scoring functions, used by Task 8's `MatchingEngineService`

- [ ] **Step 1: Write failing tests for `referenceCodeScore`**

Create `apps/backend/src/modules/webhooks/application/scoring/reference-code-score.spec.ts`:

```typescript
import { referenceCodeScore } from './reference-code-score';

describe('referenceCodeScore', () => {
  it('returns 60 for an exact invoice number match', () => {
    expect(referenceCodeScore('TT HD INV-2026-0012 thanh toan', 'INV-2026-0012')).toBe(60);
  });

  it('returns 30 for a near match (missing a character)', () => {
    expect(referenceCodeScore('TT HD INV202-60012', 'INV-2026-0012')).toBe(30);
  });

  it('returns 0 when there is no resemblance', () => {
    expect(referenceCodeScore('chuyen tien mua hang', 'INV-2026-0012')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test reference-code-score.spec.ts`
Expected: FAIL — Cannot find module './reference-code-score'

- [ ] **Step 3: Create `apps/backend/src/modules/webhooks/application/scoring/reference-code-score.ts`**

```typescript
function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ponytail: "near match" heuristic is character-set overlap, not true edit distance —
// upgrade to a Levenshtein-based ratio if real-world transferContent proves this too loose.
function isNearMatch(normalizedContent: string, normalizedCode: string): boolean {
  const codeChars = normalizedCode.split('');
  const matchingChars = codeChars.filter((char) => normalizedContent.includes(char));
  return matchingChars.length / codeChars.length >= 0.7;
}

export function referenceCodeScore(transferContent: string, invoiceNumber: string): number {
  const normalizedContent = normalize(transferContent);
  const normalizedCode = normalize(invoiceNumber);

  if (normalizedContent.includes(normalizedCode)) {
    return 60;
  }
  if (isNearMatch(normalizedContent, normalizedCode)) {
    return 30;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test reference-code-score.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Write failing tests for `amountScore`**

Create `apps/backend/src/modules/webhooks/application/scoring/amount-score.spec.ts`:

```typescript
import { amountScore } from './amount-score';

describe('amountScore', () => {
  it('returns 20 for an exact match', () => {
    expect(amountScore(30_000_000, 30_000_000)).toBe(20);
  });

  it('returns 10 when within 1% deviation', () => {
    expect(amountScore(30_000_000, 30_200_000)).toBe(10);
  });

  it('returns 0 when deviation exceeds 1%', () => {
    expect(amountScore(30_000_000, 35_000_000)).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then create the implementation**

Run: `pnpm --filter @casso-ledger/backend test amount-score.spec.ts` → FAIL

Create `apps/backend/src/modules/webhooks/application/scoring/amount-score.ts`:

```typescript
export function amountScore(transactionAmount: number, remainingAmount: number): number {
  if (transactionAmount === remainingAmount) {
    return 20;
  }
  const deviation = Math.abs(transactionAmount - remainingAmount) / remainingAmount;
  if (deviation <= 0.01) {
    return 10;
  }
  return 0;
}
```

Run: `pnpm --filter @casso-ledger/backend test amount-score.spec.ts` → all 3 tests PASS

- [ ] **Step 7: Write failing tests for `customerBankAccountScore`**

Create `apps/backend/src/modules/webhooks/application/scoring/customer-bank-account-score.spec.ts`:

```typescript
import { customerBankAccountScore } from './customer-bank-account-score';

describe('customerBankAccountScore', () => {
  it('returns 10 when the account number matches a saved account', () => {
    expect(customerBankAccountScore('0011002233', ['0011002233', '0099998888'])).toBe(10);
  });

  it('returns 0 when there is no match', () => {
    expect(customerBankAccountScore('0011002233', ['0099998888'])).toBe(0);
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then create the implementation**

Run: `pnpm --filter @casso-ledger/backend test customer-bank-account-score.spec.ts` → FAIL

Create `apps/backend/src/modules/webhooks/application/scoring/customer-bank-account-score.ts`:

```typescript
export function customerBankAccountScore(
  counterpartyAccountNumber: string,
  savedAccountNumbers: string[],
): number {
  return savedAccountNumbers.includes(counterpartyAccountNumber) ? 10 : 0;
}
```

Run: `pnpm --filter @casso-ledger/backend test customer-bank-account-score.spec.ts` → both tests PASS

- [ ] **Step 9: Write failing tests for `payerNameScore`**

Create `apps/backend/src/modules/webhooks/application/scoring/payer-name-score.spec.ts`:

```typescript
import { payerNameScore } from './payer-name-score';

describe('payerNameScore', () => {
  it('returns 5 for an exact match', () => {
    expect(payerNameScore('COMPANY B', 'Company B')).toBe(5);
  });

  it('returns 5 for a close fuzzy match (accents/case differences)', () => {
    expect(payerNameScore('B LLC', 'Company B')).toBe(5);
  });

  it('returns 0 for an unrelated name', () => {
    expect(payerNameScore('NGUYEN VAN A', 'Company B')).toBe(0);
  });
});
```

- [ ] **Step 10: Run test to verify it fails, then create the implementation**

Run: `pnpm --filter @casso-ledger/backend test payer-name-score.spec.ts` → FAIL

Create `apps/backend/src/modules/webhooks/application/scoring/payer-name-score.ts`:

```typescript
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

// ponytail: word-overlap + edit-distance blend, not a proper name-matching library —
// swap for a dedicated fuzzy-match package if false positives show up in real data.
export function payerNameScore(counterpartyName: string, customerName: string): number {
  const normalizedCounterparty = normalize(counterpartyName);
  const normalizedCustomer = normalize(customerName);

  const counterpartyWords = new Set(normalizedCounterparty.split(/\s+/).filter(Boolean));
  const customerWords = normalizedCustomer.split(/\s+/).filter(Boolean);
  const overlapRatio =
    customerWords.filter((word) => counterpartyWords.has(word)).length / customerWords.length;

  const distance = levenshteinDistance(normalizedCounterparty, normalizedCustomer);
  const maxLength = Math.max(normalizedCounterparty.length, normalizedCustomer.length);
  const similarity = maxLength === 0 ? 1 : 1 - distance / maxLength;

  return overlapRatio >= 0.5 || similarity >= 0.6 ? 5 : 0;
}
```

Run: `pnpm --filter @casso-ledger/backend test payer-name-score.spec.ts` → all 3 tests PASS

- [ ] **Step 11: Write failing tests for `timingScore`**

Create `apps/backend/src/modules/webhooks/application/scoring/timing-score.spec.ts`:

```typescript
import { timingScore } from './timing-score';

describe('timingScore', () => {
  it('returns 5 when within 30 days before the due date', () => {
    expect(timingScore(new Date('2026-08-05'), new Date('2026-08-20'))).toBe(5);
  });

  it('returns 5 when within 30 days after the due date', () => {
    expect(timingScore(new Date('2026-09-10'), new Date('2026-08-20'))).toBe(5);
  });

  it('returns 0 when outside the 30-day window', () => {
    expect(timingScore(new Date('2026-06-01'), new Date('2026-08-20'))).toBe(0);
  });
});
```

- [ ] **Step 12: Run test to verify it fails, then create the implementation**

Run: `pnpm --filter @casso-ledger/backend test timing-score.spec.ts` → FAIL

Create `apps/backend/src/modules/webhooks/application/scoring/timing-score.ts`:

```typescript
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function timingScore(transactionDateTime: Date, dueDate: Date): number {
  const diff = Math.abs(transactionDateTime.getTime() - dueDate.getTime());
  return diff <= THIRTY_DAYS_MS ? 5 : 0;
}
```

Run: `pnpm --filter @casso-ledger/backend test timing-score.spec.ts` → all 3 tests PASS

- [ ] **Step 13: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 14: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/scoring
git commit -m "feat: add 5 pure scoring functions for the matching engine"
```

---

### Task 8: MatchingCandidate entity + MatchingEngineService

**Files:**
- Create: `apps/backend/src/modules/webhooks/domain/matching-candidate.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/matching-candidate.orm-entity.ts`
- Create: `apps/backend/src/modules/webhooks/application/matching-candidate-repository.port.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/typeorm-matching-candidate.repository.ts`
- Create: `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Test: `apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts`

**Interfaces:**
- Consumes: `ICustomerBankAccountRepository` (Task 1), `IReceivableRepository`/`IInvoiceRepository` (Domain Core plan), 5 scoring functions (Task 7)
- Produces: `MatchingEngineService.scoreCandidates(transaction): ScoredCandidate[]` sorted by `totalScore` descending, used by Task 9's `WebhookProcessor`

- [ ] **Step 1: Create `MatchingCandidate` domain + ORM entity + repository**

`apps/backend/src/modules/webhooks/domain/matching-candidate.ts`:

```typescript
export interface MatchingCandidateProps {
  id: string;
  bankTransactionId: string;
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
  createdAt: Date;
}

export class MatchingCandidate {
  readonly id: string;
  readonly bankTransactionId: string;
  readonly receivableId: string;
  readonly customerId: string;
  readonly referenceCodeScore: number;
  readonly amountScore: number;
  readonly customerBankAccountScore: number;
  readonly payerNameScore: number;
  readonly timingScore: number;
  readonly totalScore: number;
  readonly createdAt: Date;

  constructor(props: MatchingCandidateProps) {
    this.id = props.id;
    this.bankTransactionId = props.bankTransactionId;
    this.receivableId = props.receivableId;
    this.customerId = props.customerId;
    this.referenceCodeScore = props.referenceCodeScore;
    this.amountScore = props.amountScore;
    this.customerBankAccountScore = props.customerBankAccountScore;
    this.payerNameScore = props.payerNameScore;
    this.timingScore = props.timingScore;
    this.totalScore = props.totalScore;
    this.createdAt = props.createdAt;
  }
}
```

`apps/backend/src/modules/webhooks/infrastructure/matching-candidate.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'matching_candidates' })
export class MatchingCandidateOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bankTransactionId: string;

  @Column()
  receivableId: string;

  @Column()
  customerId: string;

  @Column()
  referenceCodeScore: number;

  @Column()
  amountScore: number;

  @Column()
  customerBankAccountScore: number;

  @Column()
  payerNameScore: number;

  @Column()
  timingScore: number;

  @Column()
  totalScore: number;

  @Column()
  createdAt: Date;
}
```

`apps/backend/src/modules/webhooks/application/matching-candidate-repository.port.ts`:

```typescript
import { MatchingCandidate } from '../domain/matching-candidate';

export interface IMatchingCandidateRepository {
  saveMany(candidates: MatchingCandidate[]): Promise<void>;
}

export const MATCHING_CANDIDATE_REPOSITORY = Symbol('MATCHING_CANDIDATE_REPOSITORY');
```

`apps/backend/src/modules/webhooks/infrastructure/typeorm-matching-candidate.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchingCandidate } from '../domain/matching-candidate';
import { IMatchingCandidateRepository } from '../application/matching-candidate-repository.port';
import { MatchingCandidateOrmEntity } from './matching-candidate.orm-entity';

@Injectable()
export class TypeOrmMatchingCandidateRepository implements IMatchingCandidateRepository {
  constructor(
    @InjectRepository(MatchingCandidateOrmEntity)
    private readonly repo: Repository<MatchingCandidateOrmEntity>,
  ) {}

  async saveMany(candidates: MatchingCandidate[]): Promise<void> {
    await this.repo.save(candidates as unknown as MatchingCandidateOrmEntity[]);
  }
}
```

- [ ] **Step 2: Write failing test for `MatchingEngineService`**

Create `apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { MatchingEngineService } from './matching-engine.service';
import { Receivable } from '../../receivables/domain/receivable';
import { NormalizedTransaction } from './transaction-normalizer';

describe('MatchingEngineService', () => {
  function buildTransaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
    return {
      providerTransactionId: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-05'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
      ...overrides,
    };
  }

  function buildReceivable(): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
    });
  }

  it('resolves candidates via CustomerBankAccount and scores them highly for a strong match', async () => {
    const bankAccountRepo = {
      findByAccountNumber: jest.fn().mockResolvedValue({ organizationId: 'org-1', customerId: 'cust-1', accountNumber: '0011002233' }),
    };
    const receivableQueryService = {
      findOpenByCustomerId: jest.fn().mockResolvedValue([buildReceivable()]),
      findOpenTopNByOrganization: jest.fn(),
    };
    const invoiceQueryService = {
      findInvoiceNumberByReceivableId: jest.fn().mockResolvedValue('INV-2026-0012'),
    };
    const customerQueryService = {
      findNameByCustomerId: jest.fn().mockResolvedValue('Company B'),
    };

    const service = new MatchingEngineService(
      bankAccountRepo as any,
      receivableQueryService as any,
      invoiceQueryService as any,
      customerQueryService as any,
    );

    const candidates = await service.scoreCandidates(buildTransaction(), 'org-1');

    expect(bankAccountRepo.findByAccountNumber).toHaveBeenCalledWith('0011002233');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].totalScore).toBe(100); // 60+20+10+5+5
    expect(candidates[0].receivableId).toBe('rec-1');
  });

  it('falls back to org-wide top-N scan when no CustomerBankAccount matches, scoring only reference+amount', async () => {
    const bankAccountRepo = { findByAccountNumber: jest.fn().mockResolvedValue(null) };
    const receivableQueryService = {
      findOpenByCustomerId: jest.fn(),
      findOpenTopNByOrganization: jest.fn().mockResolvedValue([buildReceivable()]),
    };
    const invoiceQueryService = {
      findInvoiceNumberByReceivableId: jest.fn().mockResolvedValue('INV-2026-0012'),
    };
    const customerQueryService = { findNameByCustomerId: jest.fn() };

    const service = new MatchingEngineService(
      bankAccountRepo as any,
      receivableQueryService as any,
      invoiceQueryService as any,
      customerQueryService as any,
    );

    const candidates = await service.scoreCandidates(buildTransaction(), 'org-1');

    expect(candidates[0].totalScore).toBe(80); // 60 (reference) + 20 (amount) only
    expect(candidates[0].customerBankAccountScore).toBe(0);
    expect(candidates[0].payerNameScore).toBe(0);
    expect(candidates[0].timingScore).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test matching-engine.service.spec.ts`
Expected: FAIL — Cannot find module './matching-engine.service'

- [ ] **Step 4: Create small read-side query service ports the Matching Engine depends on**

`MatchingEngineService` needs read patterns (`findOpenByCustomerId`, `findOpenTopNByOrganization`) that don't exist on `IReceivableRepository` yet. Add them directly to that port (from the Domain Core plan) rather than creating a parallel interface:

Modify `apps/backend/src/modules/receivables/application/receivable-repository.port.ts` — add two methods:

```typescript
findOpenByCustomerId(customerId: string): Promise<Receivable[]>;
findOpenTopNByOrganization(organizationId: string, limit: number): Promise<Receivable[]>;
```

Modify `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts` — add implementations:

```typescript
async findOpenByCustomerId(customerId: string): Promise<Receivable[]> {
  const organizationId = this.tenantContext.getOrganizationId();
  const rows = await this.ormRepo.find({
    where: [
      { organizationId, customerId, status: ReceivableStatus.OPEN },
      { organizationId, customerId, status: ReceivableStatus.PARTIALLY_PAID },
    ],
  });
  return rows.map((row) => new Receivable(row));
}

async findOpenTopNByOrganization(organizationId: string, limit: number): Promise<Receivable[]> {
  const rows = await this.ormRepo.find({
    where: [
      { organizationId, status: ReceivableStatus.OPEN },
      { organizationId, status: ReceivableStatus.PARTIALLY_PAID },
    ],
    order: { dueDate: 'ASC' },
    take: limit,
  });
  return rows.map((row) => new Receivable(row));
}
```

(add `import { ReceivableStatus } from '@casso-ledger/shared-types';` at the top if not already present)

- [ ] **Step 5: Create small invoice/customer lookup ports the Matching Engine needs**

Modify `apps/backend/src/modules/invoices/application/invoice-repository.port.ts` — add:

```typescript
findByReceivableId(receivableId: string): Promise<Invoice | null>;
```

Modify `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts` — this requires a join through `Receivable.invoiceId`; simplest correct implementation queries `Receivable` first:

```typescript
async findByReceivableId(receivableId: string): Promise<Invoice | null> {
  const organizationId = this.tenantContext.getOrganizationId();
  const receivableRow = await this.repo.manager.query(
    'SELECT "invoiceId" FROM receivables WHERE id = $1 AND "organizationId" = $2',
    [receivableId, organizationId],
  );
  if (!receivableRow[0]?.invoiceId) return null;
  return this.findById(receivableRow[0].invoiceId);
}
```

(this repository must also migrate to `BaseRepository`/`TenantContextService` per the Multi-tenancy plan pattern — already done in that plan's Task 6; this step only adds the new method on top)

Modify `apps/backend/src/modules/customers/application/customer-repository.port.ts` — add:

```typescript
findNameById(customerId: string): Promise<string | null>;
```

Modify `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts` — add:

```typescript
async findNameById(customerId: string): Promise<string | null> {
  const customer = await this.findById(customerId);
  return customer?.name ?? null;
}
```

- [ ] **Step 6: Create `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  ICustomerBankAccountRepository,
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
} from '../../bank-accounts/application/customer-bank-account-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IInvoiceRepository, INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import { ICustomerRepository, CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import { NormalizedTransaction } from './transaction-normalizer';
import { referenceCodeScore } from './scoring/reference-code-score';
import { amountScore } from './scoring/amount-score';
import { customerBankAccountScore } from './scoring/customer-bank-account-score';
import { payerNameScore } from './scoring/payer-name-score';
import { timingScore } from './scoring/timing-score';
import { MatchingCandidate } from '../domain/matching-candidate';

const ORG_WIDE_SCAN_LIMIT = 20;

export interface ScoredCandidate {
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
}

@Injectable()
export class MatchingEngineService {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepo: IInvoiceRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
  ) {}

  async scoreCandidates(
    transaction: NormalizedTransaction,
    organizationId: string,
  ): Promise<ScoredCandidate[]> {
    const account = await this.bankAccountRepo.findByAccountNumber(
      transaction.counterpartyAccountNumber,
    );

    if (account) {
      const receivables = await this.receivableRepo.findOpenByCustomerId(account.customerId);
      const customerName = await this.customerRepo.findNameById(account.customerId);
      const scored = await Promise.all(
        receivables.map((receivable) =>
          this.scoreFull(transaction, receivable, [transaction.counterpartyAccountNumber], customerName),
        ),
      );
      return scored.sort((a, b) => b.totalScore - a.totalScore);
    }

    const receivables = await this.receivableRepo.findOpenTopNByOrganization(
      organizationId,
      ORG_WIDE_SCAN_LIMIT,
    );
    const scored = await Promise.all(
      receivables.map((receivable) => this.scoreReferenceAndAmountOnly(transaction, receivable)),
    );
    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  private async scoreFull(
    transaction: NormalizedTransaction,
    receivable: { id: string; remainingAmount: number; dueDate: Date },
    savedAccountNumbers: string[],
    customerName: string | null,
  ): Promise<ScoredCandidate> {
    const invoice = await this.invoiceRepo.findByReceivableId(receivable.id);
    const reference = invoice ? referenceCodeScore(transaction.transferContent, invoice.invoiceNumber) : 0;
    const amount = amountScore(transaction.amount, receivable.remainingAmount);
    const bankAccount = customerBankAccountScore(transaction.counterpartyAccountNumber, savedAccountNumbers);
    const payerName = customerName ? payerNameScore(transaction.counterpartyName, customerName) : 0;
    const timing = timingScore(transaction.transactionDateTime, receivable.dueDate);

    return {
      receivableId: receivable.id,
      customerId: receivable.customerId,
      referenceCodeScore: reference,
      amountScore: amount,
      customerBankAccountScore: bankAccount,
      payerNameScore: payerName,
      timingScore: timing,
      totalScore: reference + amount + bankAccount + payerName + timing,
    };
  }

  private async scoreReferenceAndAmountOnly(
    transaction: NormalizedTransaction,
    receivable: { id: string; remainingAmount: number },
  ): Promise<ScoredCandidate> {
    const invoice = await this.invoiceRepo.findByReceivableId(receivable.id);
    const reference = invoice ? referenceCodeScore(transaction.transferContent, invoice.invoiceNumber) : 0;
    const amount = amountScore(transaction.amount, receivable.remainingAmount);

    return {
      receivableId: receivable.id,
      customerId: receivable.customerId,
      referenceCodeScore: reference,
      amountScore: amount,
      customerBankAccountScore: 0,
      payerNameScore: 0,
      timingScore: 0,
      totalScore: reference + amount,
    };
  }

  toMatchingCandidateEntities(bankTransactionId: string, scored: ScoredCandidate[]): MatchingCandidate[] {
    return scored.map(
      (candidate) =>
        new MatchingCandidate({
          id: randomUUID(),
          bankTransactionId,
          receivableId: candidate.receivableId,
          customerId: candidate.customerId,
          referenceCodeScore: candidate.referenceCodeScore,
          amountScore: candidate.amountScore,
          customerBankAccountScore: candidate.customerBankAccountScore,
          payerNameScore: candidate.payerNameScore,
          timingScore: candidate.timingScore,
          totalScore: candidate.totalScore,
          createdAt: new Date(),
        }),
    );
  }
}
```

`customerId` resolution intentionally covers only the bank-account-match path in this plan (spec section 3's second resolution path — parsing an invoice/receivable code out of `transferContent` when no bank account matches — is folded into the org-wide fallback scan's `referenceCodeScore`, which already checks each candidate's invoice number against `transferContent`; a transaction that matches by reference code alone in the fallback scan gets the same `referenceCodeScore` it would have gotten had `customerId` been resolved first, satisfying the spec's intent without a separate resolution step).

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test matching-engine.service.spec.ts`
Expected: both tests PASS

- [ ] **Step 8: Register new providers in `webhooks.module.ts`**

Add `MatchingCandidateOrmEntity` to `TypeOrmModule.forFeature([...])`, and `MATCHING_CANDIDATE_REPOSITORY`/`MatchingEngineService` to `providers`. Import `BankAccountsModule`, `ReceivablesModule`, `InvoicesModule`, `CustomersModule` in `imports` (all already exist from earlier plans).

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/webhooks apps/backend/src/modules/receivables apps/backend/src/modules/invoices apps/backend/src/modules/customers
git commit -m "feat: add MatchingCandidate entity and MatchingEngineService"
```

---

### Task 9: WebhookProcessor (queue consumer) + routing logic

**Files:**
- Create: `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Test: `apps/backend/src/modules/webhooks/application/process-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `MatchingEngineService` (Task 8), `AllocatePaymentUseCase` (Domain Core plan, modified here), `TenantContextService` (Multi-tenancy plan)
- Produces: `ProcessWebhookUseCase.execute(webhookInboxId, organizationId)` fully routing a transaction by score; `WebhookProcessor` wires it to BullMQ with retry/DLQ

- [ ] **Step 1: Allow `allocatedByUserId: null` for auto-match allocations**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts` — change the input type:

```typescript
export interface AllocatePaymentInput {
  paymentId: string;
  receivableId: string;
  amount: number;
  allocatedByUserId: string | null;
}
```

(the rest of the use case body is unchanged — it already just forwards `allocatedByUserId` into `PaymentAllocation`, whose `allocatedByUserId` field was already `string | null` from the Domain Core plan)

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts` and `apps/backend/src/modules/payments/presentation/dto/allocate-payment.dto.ts` — no change needed, since `string` is still assignable where `string | null` is expected in the existing tests/DTO (widening, not narrowing).

- [ ] **Step 2: Write failing test for `ProcessWebhookUseCase`**

Create `apps/backend/src/modules/webhooks/application/process-webhook.usecase.spec.ts`:

```typescript
import { WebhookInbox } from '../domain/webhook-inbox';
import { ProcessWebhookUseCase } from './process-webhook.usecase';

describe('ProcessWebhookUseCase', () => {
  function buildInbox(): WebhookInbox {
    return new WebhookInbox({
      id: 'wh-1',
      organizationId: 'org-1',
      bankConnectionId: 'conn-1',
      providerTransactionId: 'TX-001',
      rawPayload: {
        transactionId: 'TX-001',
        amount: 30_000_000,
        transactionDateTime: '2026-08-05T00:00:00.000Z',
        counterpartyAccountNumber: '0011002233',
        counterpartyName: 'CONG TY B',
        transferContent: 'TT HD INV-2026-0012',
      },
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });
  }

  it('auto-allocates when the top candidate scores >= 90', async () => {
    const webhookInboxRepo = { findById: jest.fn().mockResolvedValue(buildInbox()), save: jest.fn(), insert: jest.fn() };
    const bankTransactionRepo = { save: jest.fn(), findById: jest.fn() };
    const matchingEngine = {
      scoreCandidates: jest.fn().mockResolvedValue([{ receivableId: 'rec-1', customerId: 'cust-1', totalScore: 95 }]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const matchingCandidateRepo = { saveMany: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const allocatePaymentUseCase = { execute: jest.fn(), allocateWithinTransaction: jest.fn() };
    const dataSource = { transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb({})) };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };

    const useCase = new ProcessWebhookUseCase(
      webhookInboxRepo as any,
      bankTransactionRepo as any,
      matchingEngine as any,
      matchingCandidateRepo as any,
      paymentRepo as any,
      allocatePaymentUseCase as any,
      dataSource as any,
      tenantContext as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(allocatePaymentUseCase.allocateWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ receivableId: 'rec-1', allocatedByUserId: null }),
    );
    expect(bankTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'MATCHED' }),
      expect.anything(),
    );
  });

  it('routes to Exception Queue (PENDING_REVIEW) when the top score is 60-89', async () => {
    const webhookInboxRepo = { findById: jest.fn().mockResolvedValue(buildInbox()), save: jest.fn(), insert: jest.fn() };
    const bankTransactionRepo = { save: jest.fn(), findById: jest.fn() };
    const matchingEngine = {
      scoreCandidates: jest.fn().mockResolvedValue([{ receivableId: 'rec-1', customerId: 'cust-1', totalScore: 75 }]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([{ id: 'mc-1' }]),
    };
    const matchingCandidateRepo = { saveMany: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const allocatePaymentUseCase = { execute: jest.fn(), allocateWithinTransaction: jest.fn() };
    const dataSource = { transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb({})) };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };

    const useCase = new ProcessWebhookUseCase(
      webhookInboxRepo as any,
      bankTransactionRepo as any,
      matchingEngine as any,
      matchingCandidateRepo as any,
      paymentRepo as any,
      allocatePaymentUseCase as any,
      dataSource as any,
      tenantContext as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(matchingCandidateRepo.saveMany).toHaveBeenCalled();
    expect(bankTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_REVIEW' }),
    );
    expect(allocatePaymentUseCase.allocateWithinTransaction).not.toHaveBeenCalled();
  });

  it('marks UNMATCHED when the top score is below 60', async () => {
    const webhookInboxRepo = { findById: jest.fn().mockResolvedValue(buildInbox()), save: jest.fn(), insert: jest.fn() };
    const bankTransactionRepo = { save: jest.fn(), findById: jest.fn() };
    const matchingEngine = {
      scoreCandidates: jest.fn().mockResolvedValue([{ receivableId: 'rec-1', customerId: 'cust-1', totalScore: 20 }]),
      toMatchingCandidateEntities: jest.fn().mockReturnValue([]),
    };
    const matchingCandidateRepo = { saveMany: jest.fn() };
    const paymentRepo = { save: jest.fn() };
    const allocatePaymentUseCase = { execute: jest.fn(), allocateWithinTransaction: jest.fn() };
    const dataSource = { transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb({})) };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };

    const useCase = new ProcessWebhookUseCase(
      webhookInboxRepo as any,
      bankTransactionRepo as any,
      matchingEngine as any,
      matchingCandidateRepo as any,
      paymentRepo as any,
      allocatePaymentUseCase as any,
      dataSource as any,
      tenantContext as any,
    );

    await useCase.execute('wh-1', 'org-1');

    expect(bankTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'UNMATCHED' }),
    );
  });

  it('persists FAILED state before rethrowing a processing error', async () => {
    const inbox = buildInbox();
    const webhookInboxRepo = {
      findById: jest.fn().mockResolvedValue(inbox),
      save: jest.fn(),
      insert: jest.fn(),
    };
    const matchingEngine = {
      scoreCandidates: jest.fn().mockRejectedValue(new Error('token=secret-value normalizer failed')),
      toMatchingCandidateEntities: jest.fn(),
    };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };
    const dataSource = { transaction: jest.fn() };

    const useCase = new ProcessWebhookUseCase(
      webhookInboxRepo as any,
      { save: jest.fn() } as any,
      matchingEngine as any,
      { saveMany: jest.fn() } as any,
      { save: jest.fn() } as any,
      { allocateWithinTransaction: jest.fn() } as any,
      dataSource as any,
      tenantContext as any,
    );

    await expect(useCase.execute('wh-1', 'org-1')).rejects.toThrow('token=secret-value normalizer failed');
    expect(webhookInboxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        retryCount: 1,
        errorMessage: expect.not.stringContaining('secret-value'),
      }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test process-webhook.usecase.spec.ts`
Expected: FAIL — Cannot find module './process-webhook.usecase'

- [ ] **Step 4: Create `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Role } from '../../organizations/domain/membership';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';
import {
  IBankTransactionRepository,
  BANK_TRANSACTION_REPOSITORY,
} from './bank-transaction-repository.port';
import { BankTransaction } from '../domain/bank-transaction';
import { MatchingEngineService } from './matching-engine.service';
import {
  IMatchingCandidateRepository,
  MATCHING_CANDIDATE_REPOSITORY,
} from './matching-candidate-repository.port';
import { normalizeBalanceHookPayload } from './transaction-normalizer';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../payments/application/payment-repository.port';
import { Payment } from '../../payments/domain/payment';
import { AllocatePaymentUseCase } from '../../payments/application/allocate-payment.usecase';

const AUTO_MATCH_THRESHOLD = 90;
const EXCEPTION_QUEUE_THRESHOLD = 60;

@Injectable()
export class ProcessWebhookUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY) private readonly webhookInboxRepo: IWebhookInboxRepository,
    @Inject(BANK_TRANSACTION_REPOSITORY) private readonly bankTransactionRepo: IBankTransactionRepository,
    private readonly matchingEngine: MatchingEngineService,
    @Inject(MATCHING_CANDIDATE_REPOSITORY)
    private readonly matchingCandidateRepo: IMatchingCandidateRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(webhookInboxId: string, organizationId: string): Promise<void> {
    const inbox = await this.webhookInboxRepo.findById(webhookInboxId, organizationId);
    if (!inbox) {
      throw new Error(`WebhookInbox ${webhookInboxId} not found`);
    }

    try {
      await this.tenantContext.run(
        { userId: 'system', organizationId: inbox.organizationId, role: Role.OWNER },
        async () => {
        const normalized = normalizeBalanceHookPayload(inbox.rawPayload);

        if (normalized.amount < 0) {
          await this.webhookInboxRepo.save(inbox.markProcessed());
          return; // refund flow — out of scope (spec section 4.4)
        }

        const bankTransaction = new BankTransaction({
          id: randomUUID(),
          organizationId: inbox.organizationId,
          bankConnectionId: inbox.bankConnectionId,
          webhookInboxId: inbox.id,
          providerTransactionId: normalized.providerTransactionId,
          amount: normalized.amount,
          transactionDateTime: normalized.transactionDateTime,
          counterpartyAccountNumber: normalized.counterpartyAccountNumber,
          counterpartyName: normalized.counterpartyName,
          transferContent: normalized.transferContent,
          status: 'UNMATCHED',
          version: 1,
          createdAt: new Date(),
        });

        const scoredCandidates = await this.matchingEngine.scoreCandidates(
          normalized,
          inbox.organizationId,
        );
        const topCandidate = scoredCandidates[0];
        let inboxProcessedInTransaction = false;

        if (topCandidate && topCandidate.totalScore >= AUTO_MATCH_THRESHOLD) {
          const payment = new Payment({
            id: randomUUID(),
            organizationId: inbox.organizationId,
            customerId: topCandidate.customerId,
            bankTransactionId: bankTransaction.id,
            totalAmount: bankTransaction.amount,
            allocatedAmount: 0,
            payerName: bankTransaction.counterpartyName,
            receivedAt: bankTransaction.transactionDateTime,
            createdAt: new Date(),
          });
          await this.dataSource.transaction(async (manager) => {
            await this.paymentRepo.save(payment, manager);
            await this.bankTransactionRepo.save(bankTransaction, manager);
            await this.allocatePaymentUseCase.allocateWithinTransaction(manager, {
              paymentId: payment.id,
              receivableId: topCandidate.receivableId,
              amount: bankTransaction.amount,
              allocatedByUserId: null,
            });
            await this.bankTransactionRepo.save(bankTransaction.markMatched(), manager);
            await this.webhookInboxRepo.save(inbox.markProcessed(), manager);
            inboxProcessedInTransaction = true;
          });
        } else if (topCandidate && topCandidate.totalScore >= EXCEPTION_QUEUE_THRESHOLD) {
          await this.bankTransactionRepo.save(bankTransaction);
          const candidateEntities = this.matchingEngine.toMatchingCandidateEntities(
            bankTransaction.id,
            scoredCandidates,
          );
          await this.matchingCandidateRepo.saveMany(candidateEntities);
          await this.bankTransactionRepo.save(bankTransaction.markPendingReview());
        } else {
          await this.bankTransactionRepo.save(bankTransaction);
        }

        if (!inboxProcessedInTransaction) {
          await this.webhookInboxRepo.save(inbox.markProcessed());
        }
        },
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown webhook processing error';
      const safeMessage = rawMessage
        .replace(/(authorization|bearer|token|secret|password)\s*[:=]?\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, 500);
      await this.webhookInboxRepo.save(inbox.markFailed(safeMessage));
      throw error;
    }
  }
}
```

The `catch` wraps normalization, matching, allocation, and persistence inside the tenant-scoped path. It writes `FAILED`/`retryCount`/`errorMessage` before rethrowing; a BullMQ retry re-enters the same inbox row, and a later success calls `markProcessed()` to clear the old error.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test process-webhook.usecase.spec.ts`
Expected: all 4 tests PASS, including durable failure state before the error is rethrown

- [ ] **Step 6: Create `apps/backend/src/modules/webhooks/infrastructure/webhook.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';

interface WebhookJobData {
  webhookInboxId: string;
  organizationId: string;
}

@Injectable()
@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly processWebhookUseCase: ProcessWebhookUseCase) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.processWebhookUseCase.execute(job.data.webhookInboxId, job.data.organizationId);
  }
}
```

Retry/backoff (5 attempts, exponential 5s) is already configured at enqueue time in Task 5's controller (`queue.add(..., { attempts: 5, backoff: {...} })`) — after the final attempt fails, BullMQ moves the job to the `failed` state (its Dead Letter Queue equivalent), inspectable via `queue.getFailed()`.

- [ ] **Step 7: Register `ProcessWebhookUseCase` and `WebhookProcessor` in `webhooks.module.ts`**

Add both to `providers`, and import `PaymentsModule` in `imports` (already exists, exports `AllocatePaymentUseCase`).

- [ ] **Step 8: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/webhooks apps/backend/src/modules/payments/application/allocate-payment.usecase.ts
git commit -m "feat: add ProcessWebhookUseCase and BullMQ WebhookProcessor with score-based routing"
```

---

### Task 10: Integration tests — idempotency and end-to-end routing

**Files:**
- Create: `apps/backend/test/webhook-idempotency.integration.spec.ts`
- Create: `apps/backend/test/webhook-matching-routing.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-9), real Postgres + Redis via testcontainers
- Produces: verified proof of `2026-08-03-testing-strategy-design.md` section 1 case 1 (duplicate webhook) plus the score-based routing decision end-to-end

- [ ] **Step 1: Write the idempotency integration test**

Create `apps/backend/test/webhook-idempotency.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Webhook idempotency (integration)', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'test-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'test-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await redis.stop();
    await postgres.stop();
  });

  it('processes a webhook once and returns duplicate:true on a repeated delivery', async () => {
    const payload = {
      organizationId: '00000000-0000-0000-0000-000000000001',
      bankConnectionId: '00000000-0000-0000-0000-000000000002',
      transactionId: 'TX-DUP-001',
      amount: 10_000_000,
      transactionDateTime: '2026-08-01T00:00:00.000Z',
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY X',
      transferContent: 'chuyen tien',
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('x-client-id', 'test-client')
      .set('x-secret-key', 'test-secret')
      .send(payload)
      .expect(200);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('x-client-id', 'test-client')
      .set('x-secret-key', 'test-secret')
      .send(payload)
      .expect(200);
    expect(second.body.duplicate).toBe(true);

    const rows = await dataSource.query(
      'SELECT COUNT(*) FROM webhook_inbox WHERE "providerTransactionId" = $1',
      ['TX-DUP-001'],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('rejects requests with wrong webhook credentials', () => {
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('x-client-id', 'wrong')
      .set('x-secret-key', 'wrong')
      .send({})
      .expect(401);
  });
});
```

- [ ] **Step 2: Run the idempotency test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-idempotency.integration.spec.ts`
Expected: both tests PASS

- [ ] **Step 3: Write the end-to-end routing integration test**

Create `apps/backend/test/webhook-matching-routing.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { InvoiceOrmEntity } from '../src/modules/invoices/infrastructure/invoice.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { CustomerBankAccountOrmEntity } from '../src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity';

describe('Webhook matching routing (integration)', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  const organizationId = '00000000-0000-0000-0000-000000000010';
  const customerId = '00000000-0000-0000-0000-000000000011';
  const invoiceId = '00000000-0000-0000-0000-000000000012';
  const receivableId = '00000000-0000-0000-0000-000000000013';

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'test-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'test-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company B',
      taxCode: '111',
      email: 'b@b.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerBankAccountOrmEntity).save({
      id: '00000000-0000-0000-0000-000000000014',
      organizationId,
      customerId,
      accountNumber: '0011002233',
      createdAt: new Date(),
    });
    await dataSource.getRepository(InvoiceOrmEntity).save({
      id: invoiceId,
      organizationId,
      customerId,
      invoiceNumber: 'INV-2026-0099',
      issueDate: new Date('2026-07-20'),
      totalAmount: 30_000_000,
      taxAmount: 0,
      sourceType: 'MANUAL',
      fileUrl: null,
      status: 'ISSUED',
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId,
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: '00000000-0000-0000-0000-000000000015',
      createdAt: new Date(),
      closedAt: null,
    });
  }, 90_000);

  afterAll(async () => {
    await app.close();
    await redis.stop();
    await postgres.stop();
  });

  it('auto-allocates a strong-match transaction end-to-end via the queue worker', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('x-client-id', 'test-client')
      .set('x-secret-key', 'test-secret')
      .send({
        organizationId,
        bankConnectionId: '00000000-0000-0000-0000-000000000016',
        transactionId: 'TX-STRONG-001',
        amount: 30_000_000,
        transactionDateTime: '2026-08-05T00:00:00.000Z',
        counterpartyAccountNumber: '0011002233',
        counterpartyName: 'CONG TY B',
        transferContent: 'TT HD INV-2026-0099',
      })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 3000)); // allow the BullMQ worker to process the job

    const receivableRow = await dataSource.query(
      'SELECT status FROM receivables WHERE id = $1',
      [receivableId],
    );
    expect(receivableRow[0].status).toBe('PAID');

    const bankTransactionRow = await dataSource.query(
      'SELECT status FROM bank_transactions WHERE "providerTransactionId" = $1',
      ['TX-STRONG-001'],
    );
    expect(bankTransactionRow[0].status).toBe('MATCHED');
  }, 15_000);
});
```

- [ ] **Step 4: Run the routing test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-matching-routing.integration.spec.ts`
Expected: PASS (the `setTimeout` wait gives the async BullMQ worker time to process before assertions run — acceptable for this integration test; a flakier CI run would warrant polling instead of a fixed sleep, noted as a follow-up)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/webhook-idempotency.integration.spec.ts apps/backend/test/webhook-matching-routing.integration.spec.ts
git commit -m "test: add integration tests for webhook idempotency and end-to-end matching routing"
```

---

## Self-Review Notes

- **Spec coverage:** Idempotency via unique constraint (section 4.2) → Task 2, Task 10. Header auth constant-time compare (section 4.1) → Task 5. Retry/backoff (section 4.3) → Task 5 (enqueue config) + Task 9 (processor). Refund routing (section 4.4) → Task 9 (`normalized.amount < 0` early return). Candidate scope resolution (section 3) → Task 8. 5 scoring functions + threshold routing (section 3) → Task 7, Task 9.
- **Deliberate scope decision flagged inline:** `customerId` resolution via parsing an invoice code out of `transferContent` (spec section 3's second bullet) is folded into the org-wide fallback scan rather than implemented as a separate resolution step — documented in Task 8 Step 6's comment. If a future review finds this insufficient (e.g., needs to narrow the fallback scan to ONE customer once a reference code uniquely identifies one), revisit `MatchingEngineService.scoreCandidates`.
- **Not covered in this plan (by design):** The actual `POST /bank-transactions/:id/match` Exception Queue UI endpoint (manual accountant review/override) belongs to the Exception Queue & Audit Log plan, which owns `BankTransaction.version`-based optimistic locking for concurrent manual match attempts. Cas ID connection/consent flow that populates `CustomerBankAccount` for real — separate plan.
- **Type consistency checked:** `NormalizedTransaction` (Task 6) fields match what `MatchingEngineService.scoreCandidates` (Task 8) and `ProcessWebhookUseCase` (Task 9) both consume. `AllocatePaymentInput.allocatedByUserId` widened to `string | null` (Task 9 Step 1) is backward-compatible with every existing caller from the Domain Core and Multi-tenancy plans.


