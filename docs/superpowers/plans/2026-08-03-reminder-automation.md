# Reminder Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tenant-scoped reminder policies and rules, a daily BullMQ scan, a fresh-state reminder worker, and immutable `ReminderExecution` records that never email a receivable after it becomes paid, closed, or disputed.

**Architecture:** Add a `reminders` module on top of the existing Customer/Receivable modules. The daily scan reads active policies and open receivables, applies one pure offset/rate-limit decision, then enqueues a send job and emits a `reminder.scan.completed` event per organization. The worker reloads the reminder candidate inside the organization tenant context, rechecks payment/dispute state, atomically claims one idempotency key, creates a `PENDING` `ReminderExecution`, and delegates rendering/queueing to the shared `EmailService` from the Email Notification Service plan.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, `@nestjs/bullmq` + BullMQ, Redis, Jest, Supertest, and Testcontainers.

## Global Constraints

- `Customer.customerGroup` is exactly `VIP | REGULAR`; no custom groups or risk scoring.
- A policy is unique by `(organizationId, customerGroup)`; only its `isActive` value controls whether it is used.
- A rule uses `offsetDays`: negative means before `dueDate`, positive means after `dueDate`; the scan only enqueues an exact offset match.
- The scan only considers `Receivable.status IN (OPEN, PARTIALLY_PAID)` and skips open disputes.
- No future reminder schedule rows are created; the daily scan calculates the matching rule from the current `dueDate`.
- Rate limiting checks only the latest `ReminderExecution.status = SENT` for the receivable; a skipped or failed execution does not count as a successful send.
- The send worker always reloads the receivable and dispute state immediately before deciding to dispatch a send.
- A terminal receivable (`PAID`, `WRITTEN_OFF`, `CANCELLED`) records `SKIPPED/ALREADY_PAID`; an open dispute records `SKIPPED/DISPUTED`.
- `ReminderExecution.status` is one of `PENDING`, `SENT`, `FAILED`, or `SKIPPED`; `skipReason` is one of `ALREADY_PAID`, `DISPUTED`, or `RATE_LIMITED` when present. `PENDING` exists only between "handed off to `EmailService`" and "the email queue worker reports a result" — it is never rate-limit-eligible and never a final state a human acts on.
- `ReminderPolicy` and `ReminderExecution` persist `organizationId`; `ReminderRule` is scoped through its parent `ReminderPolicy` and is never queried without the tenant-scoped policy. All HTTP queries use `TenantContextService` and all worker queries run inside an explicit tenant context.
- The daily organization scan is the single scheduler entry point. After reminder candidates for one organization are evaluated, it emits `reminder.scan.completed` with `{ organizationId, scanDate }`; Internal Tasks may subscribe later without being imported, initialized, or called by this plan. This plan registers no escalation participant.
- Reminder sending is asynchronous end-to-end. `ReminderSenderService` never renders a template or calls an email provider itself — it creates the `ReminderExecution` row (`PENDING`) and delegates to `2026-08-03-email-notification-service.md`'s `EmailService.sendReminderEmail`, which does the real Handlebars render (via `2026-08-03-email-template-management.md`'s `RenderEmailTemplateUseCase`/`EmailTemplate`) and enqueues the actual send. The email queue's `EmailQueueProcessor` (owned by that plan) reports `SENT`/`FAILED` back onto the same `ReminderExecution` row via `IReminderExecutionRepository.updateSendResult`. This plan does not define its own console adapter or template renderer — see Task 6.
- No Zalo, SMS, Teams, Slack, escalation, customer risk score, or custom customer-group implementation is added here.
- `ReminderExecution` idempotency is claimed by one database insert against the unique `(receivableId, reminderRuleId, executionDate)` key; a pre-check alone is not sufficient under concurrent workers.
- Money remains integer VND as established by the Domain Core plan; the reminder module never recalculates financial totals itself.

---

## File Structure

```
apps/backend/src/
  modules/
    customers/
      domain/customer.ts                                      -- MODIFY: add CustomerGroup
      infrastructure/customer.orm-entity.ts                  -- MODIFY: persist CustomerGroup
    reminders/
      domain/
        customer-group.ts
        reminder-policy.ts
        reminder-rule.ts
        reminder-execution.ts
      application/
        reminder-policy-repository.port.ts
        reminder-rule-repository.port.ts
        reminder-execution-repository.port.ts
        reminder-candidate-reader.port.ts
        reminder-rule-matcher.ts
        reminder-policy.service.ts
        reminder-scheduler.service.ts
        reminder-sender.service.ts
      infrastructure/
        reminder-policy.orm-entity.ts
        reminder-rule.orm-entity.ts
        reminder-execution.orm-entity.ts
        typeorm-reminder-policy.repository.ts
        typeorm-reminder-rule.repository.ts
        typeorm-reminder-execution.repository.ts
        typeorm-reminder-candidate.reader.ts
        reminder-queue.constants.ts
        reminder-scan.processor.ts
        reminder-send.processor.ts
      presentation/
        dto/create-reminder-policy.dto.ts
        dto/update-reminder-policy.dto.ts
        dto/list-reminder-executions.query.ts
        reminders.controller.ts
      reminders.module.ts
  app.module.ts                                             -- MODIFY: register RemindersModule
  config/bullmq.config.ts                                   -- EXISTING: reuse BullMQ root connection
test/
  reminder-fixtures.ts
  reminder-persistence.integration.spec.ts
  reminder-automation.integration.spec.ts
```

The plan assumes the earlier Domain Core, Multi-tenancy/RBAC, Authentication, and Webhook plans have already created the paths and providers they promise. The Reminder module does not redefine those modules or copy their repositories. It also assumes `2026-08-03-email-notification-service.md` (`NotificationsModule`, `EmailService`) and `2026-08-03-email-template-management.md` (`EmailTemplatesModule`) have already run — this plan's `ReminderSenderService` is the caller that finally makes `EmailService.sendReminderEmail` reachable end-to-end. Because `EmailService` needs `IReminderExecutionRepository` (to report `SENT`/`FAILED` back) and `ReminderSenderService` needs `EmailService` (to actually send), `RemindersModule` and `NotificationsModule` import each other with NestJS `forwardRef()` — a standard, already-used pattern in this codebase (see the `ReceivablesModule`/`DisputesModule` cycle in `2026-08-03-dispute-management.md`).

Create `apps/backend/test/reminder-fixtures.ts` before the unit tests:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { CustomerGroup } from '../src/modules/reminders/domain/customer-group';
import { ReminderCandidate } from '../src/modules/reminders/application/reminder-candidate-reader.port';

export function buildReminderCandidate(
  overrides: Partial<ReminderCandidate> = {},
): ReminderCandidate {
  return {
    receivableId: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    customerGroup: CustomerGroup.VIP,
    customerName: 'Công ty B',
    customerEmail: 'ap@congtyb.vn',
    invoiceNumber: 'INV-001',
    originalAmount: 50_000_000,
    paidAmount: 0,
    remainingAmount: 50_000_000,
    dueDate: new Date('2026-08-08'),
    status: ReceivableStatus.OPEN,
    isDisputed: false,
    ...overrides,
  };
}
```

---

### Task 1: Add `CustomerGroup` to the Customer domain

**Files:**
- Create: `apps/backend/src/modules/reminders/domain/customer-group.ts`
- Modify: `apps/backend/src/modules/customers/domain/customer.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/customer.orm-entity.ts`
- Modify: existing Customer domain test next to `customer.ts`

**Interfaces:**
- Consumes: the existing `CustomerProps` and `CustomerOrmEntity` from the Domain Core plan.
- Produces: `CustomerGroup.VIP`, `CustomerGroup.REGULAR`, and `Customer.customerGroup`, consumed by policy selection and reminder candidate queries.

- [ ] **Step 1: Write the failing test**

Extend the existing Customer domain test with:

```typescript
import { CustomerGroup } from '../../reminders/domain/customer-group';

it('stores the customer group used by reminder policy selection', () => {
  const customer = new Customer({
    id: 'cust-1',
    organizationId: 'org-1',
    name: 'Công ty B',
    taxCode: '0312345678',
    email: 'ap@congtyb.vn',
    phone: '0900000000',
    defaultPaymentTermDays: 30,
    creditLimit: 100_000_000,
    priority: 1,
    customerGroup: CustomerGroup.VIP,
    createdAt: new Date('2026-01-01'),
  });

  expect(customer.customerGroup).toBe(CustomerGroup.VIP);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`

Expected: FAIL because `CustomerGroup` and `customerGroup` are not defined yet.

- [ ] **Step 3: Create the enum**

Create `apps/backend/src/modules/reminders/domain/customer-group.ts`:

```typescript
export enum CustomerGroup {
  VIP = 'VIP',
  REGULAR = 'REGULAR',
}
```

- [ ] **Step 4: Add the property to the Customer domain and ORM entity**

Add `customerGroup: CustomerGroup` to `CustomerProps` and `Customer`, assign it in the constructor, and add this column to `CustomerOrmEntity`:

```typescript
@Column({ type: 'enum', enum: CustomerGroup, default: CustomerGroup.REGULAR })
customerGroup: CustomerGroup;
```

Update every existing Customer fixture to pass `CustomerGroup.REGULAR` unless the test is specifically about VIP behavior. Keep the database default `REGULAR` so existing imports and older rows remain valid.

- [ ] **Step 5: Run the Customer tests**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`

Expected: all Customer tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/customers apps/backend/src/modules/reminders/domain/customer-group.ts
git commit -m "feat: add customer groups for reminder policies"
```

---

### Task 2: Implement reminder domain entities and pure rule matching

**Files:**
- Create: `apps/backend/src/modules/reminders/domain/reminder-policy.ts`
- Create: `apps/backend/src/modules/reminders/domain/reminder-rule.ts`
- Create: `apps/backend/src/modules/reminders/domain/reminder-execution.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-rule-matcher.ts`
- Test: `apps/backend/src/modules/reminders/domain/reminder-policy.spec.ts`
- Test: `apps/backend/src/modules/reminders/application/reminder-rule-matcher.spec.ts`

**Interfaces:**
- Consumes: `CustomerGroup` from Task 1 and `ReceivableStatus` from `@casso-ledger/shared-types`.
- Produces: validated domain objects and `findMatchingRule(rules, offsetDays)`, used by Tasks 3–6.

- [ ] **Step 1: Write policy and rule tests**

Create `reminder-policy.spec.ts` with these cases:

```typescript
import { CustomerGroup } from './customer-group';
import { ReminderPolicy } from './reminder-policy';

describe('ReminderPolicy', () => {
  it('accepts one VIP or REGULAR policy with active state', () => {
    const policy = new ReminderPolicy({
      id: 'policy-1',
      organizationId: 'org-1',
      customerGroup: CustomerGroup.VIP,
      isActive: true,
      createdAt: new Date('2026-08-03'),
    });

    expect(policy.customerGroup).toBe(CustomerGroup.VIP);
    expect(policy.isActive).toBe(true);
  });

  it('rejects a negative minimum interval', () => {
    expect(() => new ReminderRule({
      id: 'rule-1',
      reminderPolicyId: 'policy-1',
      offsetDays: -5,
      emailTemplateId: 'template-1',
      minIntervalDays: -1,
      createdAt: new Date('2026-08-03'),
    })).toThrow('minIntervalDays must be non-negative');
  });
});
```

- [ ] **Step 2: Write pure matcher tests**

Create `reminder-rule-matcher.spec.ts`:

```typescript
import { findMatchingRule } from './reminder-rule-matcher';
import { ReminderRule } from '../domain/reminder-rule';

const rule = (offsetDays: number): ReminderRule => new ReminderRule({
  id: `rule-${offsetDays}`,
  reminderPolicyId: 'policy-1',
  offsetDays,
  emailTemplateId: 'template-1',
  minIntervalDays: 7,
  createdAt: new Date('2026-08-03'),
});

it('returns the exact offset rule', () => {
  expect(findMatchingRule([rule(-5), rule(3)], -5)?.id).toBe('rule--5');
});

it('returns null when no exact offset exists', () => {
  expect(findMatchingRule([rule(-5)], -4)).toBeNull();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.spec.ts reminder-rule-matcher.spec.ts`

Expected: FAIL because the domain files and matcher do not exist.

- [ ] **Step 4: Create the domain types**

Use these shapes:

```typescript
export enum ReminderExecutionStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum ReminderSkipReason {
  ALREADY_PAID = 'ALREADY_PAID',
  DISPUTED = 'DISPUTED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ReminderRuleProps {
  id: string;
  reminderPolicyId: string;
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
  createdAt: Date;
}

export class ReminderRule {
  readonly id: string;
  readonly reminderPolicyId: string;
  readonly offsetDays: number;
  readonly emailTemplateId: string;
  readonly minIntervalDays: number;
  readonly createdAt: Date;

  constructor(props: ReminderRuleProps) {
    if (!Number.isInteger(props.offsetDays)) {
      throw new Error('offsetDays must be an integer');
    }
    if (!Number.isInteger(props.minIntervalDays) || props.minIntervalDays < 0) {
      throw new Error('minIntervalDays must be non-negative');
    }
    this.id = props.id;
    this.reminderPolicyId = props.reminderPolicyId;
    this.offsetDays = props.offsetDays;
    this.emailTemplateId = props.emailTemplateId;
    this.minIntervalDays = props.minIntervalDays;
    this.createdAt = props.createdAt;
  }
}
```

`ReminderPolicy` owns `id`, `organizationId`, `customerGroup`, `isActive`, and `createdAt`; it rejects a customer group outside the enum. `ReminderExecution` owns `organizationId`, `receivableId`, `reminderRuleId` (nullable — see below), `executionDate`, `sentAt`, `status`, `skipReason`, `providerMessageId`, `failureReason`, and `createdAt`. `executionDate` is a date-only deduplication key for one receivable/rule/day and `providerMessageId`/`failureReason` support the send result without changing the business status vocabulary. A row is created with `status: PENDING` the moment `ReminderSenderService` hands the send off to `EmailService` (Task 6); `2026-08-03-email-notification-service.md`'s `EmailQueueProcessor` later flips it to `SENT` (with `providerMessageId`) or `FAILED` (with `failureReason`) once the actual email attempt resolves.

`reminderRuleId: string | null` — `null` means this execution was NOT produced by the daily scan/rule-matching flow in this plan; it represents a manual/ad-hoc reminder send triggered elsewhere (e.g. `2026-08-03-collection-copilot.md`'s `ConfirmPendingActionUseCase`, which creates a `ReminderExecution` row directly with `reminderRuleId: null` before calling `EmailService.sendReminderEmail`, reusing this same table rather than inventing a parallel one). Every code path OWNED by this plan (`ReminderSenderService`, the scheduler's rate-limit check) always sets a real `reminderRuleId` — the nullable case only exists to be written by, and is never read/matched by, this plan's own logic.

- [ ] **Step 5: Create the pure matcher**

Create `reminder-rule-matcher.ts`:

```typescript
import { ReminderRule } from '../domain/reminder-rule';

export function findMatchingRule(
  rules: readonly ReminderRule[],
  offsetDays: number,
): ReminderRule | null {
  return rules.find((rule) => rule.offsetDays === offsetDays) ?? null;
}
```

- [ ] **Step 6: Run the unit tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.spec.ts reminder-rule-matcher.spec.ts`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/reminders/domain apps/backend/src/modules/reminders/application/reminder-rule-matcher.ts
git commit -m "feat: add reminder domain entities and rule matcher"
```

---

### Task 3: Persist policies, rules, executions, and reminder candidates

**Files:**
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-policy.orm-entity.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-rule.orm-entity.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-policy-repository.port.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-rule-repository.port.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-candidate-reader.port.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-policy.repository.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-rule.repository.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-candidate.reader.ts`
- Create: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/reminder-persistence.integration.spec.ts`

**Interfaces:**
- Consumes: TypeORM, existing `CustomerOrmEntity`, `ReceivableOrmEntity`, `InvoiceOrmEntity`, `DisputeOrmEntity`, `BaseRepository`, and `TenantContextService`.
- Produces: repositories used by policy CRUD and the two reminder processors.

- [ ] **Step 1: Define repository ports**

Use these exact application interfaces:

```typescript
export interface IReminderPolicyRepository {
  findByCustomerGroup(customerGroup: CustomerGroup): Promise<ReminderPolicy | null>;
  findAll(): Promise<ReminderPolicy[]>;
  findAllOrganizationIdsForScheduler(): Promise<string[]>;
  save(policy: ReminderPolicy, manager?: EntityManager): Promise<void>;
}

export interface IDefaultReminderBootstrap {
  seed(
    organizationId: string,
    templates: readonly { id: string; name: string }[],
    now: Date,
    manager: EntityManager,
  ): Promise<void>;
}
export const DEFAULT_REMINDER_BOOTSTRAP = Symbol('DEFAULT_REMINDER_BOOTSTRAP');

export interface IReminderRuleRepository {
  findById(id: string): Promise<ReminderRule | null>;
  findByPolicyId(policyId: string): Promise<ReminderRule[]>;
  replaceForPolicy(
    policyId: string,
    rules: ReminderRule[],
    manager: EntityManager,
  ): Promise<void>;
}

export interface IReminderExecutionRepository {
  findLatestSent(receivableId: string): Promise<ReminderExecution | null>;
  findByKey(receivableId: string, reminderRuleId: string | null, executionDate: Date): Promise<ReminderExecution | null>;
  findById(id: string): Promise<ReminderExecution | null>;
  /** Returns false when another worker already claimed the unique key. */
  insertIfAbsent(execution: ReminderExecution): Promise<boolean>;
  save(execution: ReminderExecution, manager?: EntityManager): Promise<void>;
  /**
   * Called by 2026-08-03-email-notification-service.md's EmailQueueProcessor once the
   * queued send attempt resolves — NOT by anything in this plan. `providerMessageId` is
   * set on SENT and left null on FAILED; a fixed `failureReason` string is written on FAILED
   * since EmailQueueProcessor's `@OnWorkerEvent('failed')` hook does not have a human-readable
   * provider error message to pass through (it only knows the job exhausted its attempts).
   */
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}

export const REMINDER_EXECUTION_REPOSITORY = Symbol('REMINDER_EXECUTION_REPOSITORY');
```

`REMINDER_EXECUTION_REPOSITORY` is the one DI token in this plan given an explicit `Symbol` (unlike the other three reminder repositories, whose exact token names are an implementation detail local to this module) because `2026-08-03-email-notification-service.md`'s `NotificationsModule` imports `RemindersModule` and injects this exact token — the two plans must agree on the same `Symbol` instance, not just the same string name.

`findAllOrganizationIdsForScheduler` is deliberately the only unscoped scheduler read. It returns distinct organization IDs from active policies; the scheduler opens `TenantContextService.run()` before every tenant-scoped query. Do not expose an unscoped generic `findAll` to controllers.

Define `ReminderCandidate` as:

```typescript
export interface ReminderCandidate {
  receivableId: string;
  organizationId: string;
  customerId: string;
  customerGroup: CustomerGroup;
  customerName: string;
  customerEmail: string;
  invoiceNumber: string | null;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  status: ReceivableStatus;
  isDisputed: boolean;
}

export interface IReminderCandidateReader {
  findOpenCandidates(): Promise<ReminderCandidate[]>;
  findByReceivableId(receivableId: string): Promise<ReminderCandidate | null>;
}
```

- [ ] **Step 2: Write the persistence integration test**

Create a Testcontainers PostgreSQL test that:

1. Saves one VIP policy and two rules.
2. Loads the policy and rules through repository ports.
3. Saves a `SENT` execution and verifies `findLatestSent` returns it.
4. Attempts a second policy for the same organization and customer group and expects the database unique constraint to reject it.

The test must use `organizationId = 'org-1'` and `organizationId = 'org-2'` records to prove the repository does not return another tenant's policy.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-persistence.integration.spec.ts`

Expected: FAIL because the ORM entities and repositories do not exist.

- [ ] **Step 4: Create the ORM entities and constraints**

Apply these database constraints:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../domain/customer-group';
import { ReminderExecutionStatus, ReminderSkipReason } from '../domain/reminder-execution';

@Index(['organizationId', 'customerGroup'], { unique: true })
@Entity({ name: 'reminder_policies' })
export class ReminderPolicyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: CustomerGroup })
  customerGroup: CustomerGroup;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  createdAt: Date;
}

@Index(['reminderPolicyId', 'offsetDays'], { unique: true })
@Entity({ name: 'reminder_rules' })
export class ReminderRuleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reminderPolicyId: string;

  @Column('integer')
  offsetDays: number;

  @Column()
  emailTemplateId: string;

  @Column('integer')
  minIntervalDays: number;

  @Column()
  createdAt: Date;
}

@Index(['receivableId', 'reminderRuleId', 'executionDate'], { unique: true })
@Entity({ name: 'reminder_executions' })
export class ReminderExecutionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column({ nullable: true })
  reminderRuleId: string | null;

  @Column({ type: 'date' })
  executionDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'enum', enum: ReminderExecutionStatus })
  status: ReminderExecutionStatus;

  @Column({ type: 'enum', enum: ReminderSkipReason, nullable: true })
  skipReason: ReminderSkipReason | null;

  @Column({ nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column()
  createdAt: Date;
}
```

Use PostgreSQL `date` for `executionDate`, PostgreSQL `enum` for `CustomerGroup`, execution status, and skip reason, and `text` for `failureReason`. Keep `providerMessageId` nullable. Do not add a `ReminderSchedule` table.

- [ ] **Step 5: Implement repositories**

Implement the ports with TypeORM. Policy/rule/execution repositories must extend the existing tenant-scoped repository pattern. `findAllOrganizationIdsForScheduler` may use a direct repository query that returns only `organizationId` from active policies and no financial data.

`TypeOrmReminderExecutionRepository.updateSendResult` is UNSCOPED (no `TenantContextService` lookup) because `EmailQueueProcessor` (in `2026-08-03-email-notification-service.md`) calls it from inside its own `TenantContextService.run()` scope keyed off `job.data.organizationId`, exactly like this plan's own `ReminderSendProcessor` does — the row is found by primary key (`id`). It is also the single terminal transition that emits `reminder.sent`/`reminder.failed` after the row update, so Collection Activity can consume the real provider result rather than the enqueue attempt.

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryFailedError } from 'typeorm';
import { ReminderExecutionOrmEntity } from './reminder-execution.orm-entity';

// Add `private readonly eventEmitter: EventEmitter2` to the existing repository constructor.

async insertIfAbsent(execution: ReminderExecution): Promise<boolean> {
  try {
    await this.ormRepo.insert(execution as unknown as ReminderExecutionOrmEntity);
    return true;
  } catch (error) {
    if (error instanceof QueryFailedError && (error as any).code === '23505') {
      return false;
    }
    throw error;
  }
}

async updateSendResult(
  id: string,
  status: 'SENT' | 'FAILED',
  providerMessageId: string | null,
): Promise<void> {
  const current = await this.ormRepo.findOne({ where: { id } });
  if (!current || current.status !== 'PENDING') {
    return;
  }
  const result = await this.ormRepo.update(
    { id, status: 'PENDING' },
    {
      status,
      providerMessageId,
      sentAt: status === 'SENT' ? new Date() : null,
      failureReason: status === 'FAILED' ? 'Email delivery failed after max attempts' : null,
    },
  );
  if (result.affected !== 1) {
    return;
  }
  this.eventEmitter.emit(status === 'SENT' ? 'reminder.sent' : 'reminder.failed', {
    reminderExecutionId: id,
    receivableId: current.receivableId,
    organizationId: current.organizationId,
  });
}

async findById(id: string): Promise<ReminderExecution | null> {
  const row = await this.ormRepo.findOne({ where: { id } });
  return row ? new ReminderExecution(row) : null;
}
```

The repository constructor injects `EventEmitter2`; `insertIfAbsent()` is the only claim path for `PENDING` executions, and `updateSendResult()` emits at most once because the conditional update must affect exactly one still-`PENDING` row. The unique violation is an expected concurrent-claim result, not a worker failure.

The candidate reader must join Customers, Receivables, optional Invoices, and open Disputes. It must return only:

```sql
receivable.status IN ('OPEN', 'PARTIALLY_PAID')
```

and must calculate `remainingAmount = originalAmount - paidAmount` in the projection. A candidate with an open Dispute remains queryable so the scheduler can explicitly skip it; it is not silently deleted from the read path.

- [ ] **Step 6: Register the module**

Register the three reminder ORM entities, plus the existing Customer, Invoice, Receivable, and Dispute ORM entities needed by the candidate reader, along with all reminder repositories and repository tokens in `RemindersModule`. Export the policy, rule, candidate-reader tokens, and — explicitly, since another module consumes it — `REMINDER_EXECUTION_REPOSITORY`:

```typescript
exports: [
  /* existing policy/rule/candidate-reader tokens */
  REMINDER_EXECUTION_REPOSITORY,
],
```

Import `RemindersModule` from `AppModule`. Task 6 revisits this module's `imports` again to add `forwardRef(() => NotificationsModule)`, since `ReminderSenderService` needs `EmailService`.

- [ ] **Step 7: Run persistence tests**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-persistence.integration.spec.ts`

Expected: all persistence and tenant-isolation assertions PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/reminders apps/backend/src/app.module.ts apps/backend/test/reminder-persistence.integration.spec.ts
git commit -m "feat: persist reminder policies rules executions and candidates"
```

---

### Task 4: Implement policy CRUD and rule replacement

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-policy.service.ts`
- Create: `apps/backend/src/modules/reminders/presentation/dto/create-reminder-policy.dto.ts`
- Create: `apps/backend/src/modules/reminders/presentation/dto/update-reminder-policy.dto.ts`
- Create: `apps/backend/src/modules/reminders/presentation/reminders.controller.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Test: `apps/backend/src/modules/reminders/application/reminder-policy.service.spec.ts`

**Interfaces:**
- Consumes: repository ports from Task 3, `TenantContextService`, and `Permission.REMINDER_POLICY_WRITE` / `Permission.REPORT_READ` from the RBAC plan.
- Produces: `POST /reminder-policies`, `GET /reminder-policies`, and `PATCH /reminder-policies/:id`.

- [ ] **Step 1: Write service tests**

Create tests for:

```typescript
import { DataSource } from 'typeorm';
import { CustomerGroup } from '../domain/customer-group';
import { ReminderPolicyService } from './reminder-policy.service';
import { IReminderPolicyRepository } from './reminder-policy-repository.port';
import { IReminderRuleRepository } from './reminder-rule-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

const tenantContext = {
  getOrganizationId: jest.fn().mockReturnValue('org-1'),
} as unknown as TenantContextService;

it('creates one policy and replaces its rules atomically', async () => {
  const policyRepo = { findByCustomerGroup: jest.fn().mockResolvedValue(null), save: jest.fn(), findAll: jest.fn() };
  const ruleRepo = { replaceForPolicy: jest.fn() };
  const dataSource = { transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) => callback({})) };
  const service = new ReminderPolicyService(
    policyRepo as unknown as IReminderPolicyRepository,
    ruleRepo as unknown as IReminderRuleRepository,
    dataSource as unknown as DataSource,
    tenantContext,
  );

  const result = await service.create({
    customerGroup: CustomerGroup.VIP,
    isActive: true,
    rules: [{ offsetDays: -5, emailTemplateId: 'template-1', minIntervalDays: 7 }],
  });

  expect(result.customerGroup).toBe(CustomerGroup.VIP);
  expect(ruleRepo.replaceForPolicy).toHaveBeenCalledWith(
    result.id,
    expect.arrayContaining([expect.objectContaining({ offsetDays: -5 })]),
    expect.anything(),
  );
});

it('rejects a second policy for the same customer group', async () => {
  const policyRepo = { findByCustomerGroup: jest.fn().mockResolvedValue({ id: 'existing' }) };
  const service = new ReminderPolicyService(
    policyRepo as unknown as IReminderPolicyRepository,
    { replaceForPolicy: jest.fn() } as unknown as IReminderRuleRepository,
    { transaction: jest.fn() } as unknown as DataSource,
    tenantContext,
  );

  await expect(service.create({
    customerGroup: CustomerGroup.REGULAR,
    isActive: true,
    rules: [],
  })).rejects.toThrow('Reminder policy already exists for customer group');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.service.spec.ts`

Expected: FAIL because `ReminderPolicyService` and DTOs do not exist.

- [ ] **Step 3: Implement the service**

Use these input shapes:

```typescript
export interface ReminderRuleInput {
  offsetDays: number;
  emailTemplateId: string;
  minIntervalDays: number;
}

export interface SaveReminderPolicyInput {
  customerGroup: CustomerGroup;
  isActive: boolean;
  rules: ReminderRuleInput[];
}
```

`create()` must reject an existing `(organizationId, customerGroup)`, create the policy with `randomUUID()`, create each rule with `randomUUID()`, and save the policy plus full rule replacement in one database transaction. `update()` must load the policy through the scoped repository, update `isActive`, replace all rules atomically, and preserve the policy ID. Reject duplicate `offsetDays` values in one request before opening the transaction.

- [ ] **Step 4: Add DTO validation and controllers**

`CreateReminderPolicyDto` and `UpdateReminderPolicyDto` must validate:

```typescript
customerGroup: CustomerGroup;
isActive: boolean;
rules: Array<{
  offsetDays: number;        // integer
  emailTemplateId: string;   // non-empty
  minIntervalDays: number;   // integer >= 0
}>;
```

Wire:

```text
POST  /reminder-policies       @RequirePermission(REMINDER_POLICY_WRITE)
GET   /reminder-policies       @RequirePermission(REPORT_READ)
PATCH /reminder-policies/:id  @RequirePermission(REMINDER_POLICY_WRITE)
```

The controller obtains `organizationId` and `userId` from `TenantContextService`; neither is accepted from the request body. Apply `JwtAuthGuard` and `PermissionGuard` to the controller.

- [ ] **Step 5: Run unit and controller tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy`

Expected: all service, validation, and permission tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reminders/application/reminder-policy.service.ts apps/backend/src/modules/reminders/presentation apps/backend/src/modules/reminders/reminders.module.ts
git commit -m "feat: add reminder policy and rule management"
```

---

### Task 5: Build the daily scheduler and queue registration

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-queue.constants.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-scan.processor.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/.env`
- Test: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.spec.ts`

**Interfaces:**
- Consumes: `IReminderPolicyRepository`, `IReminderRuleRepository`, `IReminderExecutionRepository`, `IReminderCandidateReader`, `TenantContextService`, `EventEmitter2`, BullMQ root setup, and `findMatchingRule()`.
- Produces: a repeatable daily scan, `ReminderSendJob` records consumed by Task 6, and `reminder.scan.completed` events consumed by optional later participants.

- [ ] **Step 1: Define queue names and job data**

Create `reminder-queue.constants.ts`:

```typescript
export const REMINDER_SCAN_QUEUE = 'reminder-scan';
export const REMINDER_SEND_QUEUE = 'reminder-send';

export interface ReminderSendJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string; // YYYY-MM-DD in the reminder timezone
}
```

- [ ] **Step 2: Write scheduler tests**

Create tests for the four decisions below:

```typescript
import { Queue } from 'bullmq';
import { Role } from '../../organizations/domain/membership';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { CustomerGroup } from '../domain/customer-group';
import { ReminderPolicy } from '../domain/reminder-policy';
import { ReminderRule } from '../domain/reminder-rule';
import { ReminderCandidate } from './reminder-candidate-reader.port';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderSendJob } from '../infrastructure/reminder-queue.constants';
import { buildReminderCandidate } from '../../../../test/reminder-fixtures';
import { IReminderPolicyRepository } from './reminder-policy-repository.port';
import { IReminderRuleRepository } from './reminder-rule-repository.port';
import { IReminderExecutionRepository } from './reminder-execution-repository.port';
import { IReminderCandidateReader } from './reminder-candidate-reader.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { EventEmitter2 } from '@nestjs/event-emitter';

function createScheduler(
  candidates: ReminderCandidate[],
  queue: Queue<ReminderSendJob>,
  executionRepo = { findLatestSent: jest.fn().mockResolvedValue(null), save: jest.fn() },
  eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) },
): ReminderSchedulerService {
  const policy = new ReminderPolicy({
    id: 'policy-vip',
    organizationId: 'org-1',
    customerGroup: CustomerGroup.VIP,
    isActive: true,
    createdAt: new Date('2026-08-01'),
  });
  const rule = new ReminderRule({
    id: 'rule-5',
    reminderPolicyId: policy.id,
    offsetDays: -5,
    emailTemplateId: 'template-1',
    minIntervalDays: 7,
    createdAt: new Date('2026-08-01'),
  });
  const tenantContext = {
    run: async (_user: { userId: string; organizationId: string; role: Role }, callback: () => Promise<void>) => callback(),
  };
  return new ReminderSchedulerService(
    {
      findAllOrganizationIdsForScheduler: jest.fn().mockResolvedValue(['org-1']),
      findByCustomerGroup: jest.fn().mockResolvedValue(policy),
    } as unknown as IReminderPolicyRepository,
    { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as unknown as IReminderRuleRepository,
    executionRepo as unknown as IReminderExecutionRepository,
    {
      findOpenCandidates: jest.fn().mockResolvedValue(candidates),
    } as unknown as IReminderCandidateReader,
    queue,
    tenantContext as unknown as TenantContextService,
    eventEmitter as unknown as EventEmitter2,
  );
}

it('enqueues the exact offset rule for an eligible candidate', async () => {
  const candidate = buildReminderCandidate({
    status: ReceivableStatus.OPEN,
    dueDate: new Date('2026-08-08'),
    isDisputed: false,
    customerGroup: CustomerGroup.VIP,
  });
  const queue = { add: jest.fn() } as unknown as Queue<ReminderSendJob>;
  const scheduler = createScheduler([candidate], queue);

  await scheduler.scan(new Date('2026-08-03'));

  expect(queue.add).toHaveBeenCalledWith(
    'send-reminder',
    expect.objectContaining({ receivableId: candidate.receivableId, reminderRuleId: 'rule-5' }),
    expect.objectContaining({ jobId: expect.stringContaining(candidate.receivableId) }),
  );
});

it('emits one completion event after the organization candidates are evaluated', async () => {
  const queue = { add: jest.fn() } as unknown as Queue<ReminderSendJob>;
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  await createScheduler([], queue, undefined, eventEmitter).scan(new Date('2026-08-03'));
  expect(eventEmitter.emitAsync).toHaveBeenCalledWith('reminder.scan.completed', {
    organizationId: 'org-1',
    scanDate: '2026-08-03',
  });
});

it('does not enqueue a disputed candidate', async () => {
  const queue = { add: jest.fn() } as unknown as Queue<ReminderSendJob>;
  await createScheduler([buildReminderCandidate({ isDisputed: true })], queue).scan(new Date('2026-08-03'));
  expect(queue.add).not.toHaveBeenCalled();
});

it('records RATE_LIMITED when a recent SENT execution is inside minIntervalDays', async () => {
  const executionRepo = {
    findLatestSent: jest.fn().mockResolvedValue({ sentAt: new Date('2026-08-01') }),
    save: jest.fn(),
  };
  const queue = { add: jest.fn() } as unknown as Queue<ReminderSendJob>;
  await createScheduler([buildReminderCandidate({ dueDate: new Date('2026-08-08') })], queue, executionRepo as any)
    .scan(new Date('2026-08-03'));

  expect(executionRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'SKIPPED', skipReason: 'RATE_LIMITED' }),
    expect.anything(),
  );
  expect(queue.add).not.toHaveBeenCalled();
});
```

Also test that `DRAFT`, `PAID`, `WRITTEN_OFF`, and `CANCELLED` candidates never reach the queue, even if a caller accidentally returns them from a repository mock.

- [ ] **Step 3: Run scheduler tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-scheduler.service.spec.ts`

Expected: FAIL because the scheduler and queue constants do not exist.

- [ ] **Step 4: Implement the offset and date calculation**

Use calendar dates, not elapsed milliseconds. Convert both dates to `YYYY-MM-DD` in `REMINDER_TIMEZONE`, defaulting to `Asia/Ho_Chi_Minh`, then calculate:

```typescript
offsetDays = calendarDate(dueDate) - calendarDate(today)
```

For example, due date `2026-08-08` and scan date `2026-08-03` produce `-5` because the reminder is five days before the due date. Do not let daylight-saving or time-of-day change the result.

- [ ] **Step 5: Implement `ReminderSchedulerService.scan()`**

The method must:

1. Read active policy organization IDs using the scheduler-only repository method.
2. For each organization, call `TenantContextService.run({ userId: 'system', organizationId, role: Role.OWNER }, ...)`.
3. Load open candidates, skip disputed candidates, select the policy for `candidate.customerGroup`, and find the exact offset rule.
4. Query the latest `SENT` execution. If `sentAt` is within `rule.minIntervalDays`, insert `SKIPPED/RATE_LIMITED` for the current `executionDate` and do not enqueue.
5. Otherwise enqueue `ReminderSendJob` on `REMINDER_SEND_QUEUE` with:

```typescript
{
  jobId: `reminder:${candidate.receivableId}:${rule.id}:${executionDate}`,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
}
```

6. After all reminder candidates for the organization are evaluated, call `await eventEmitter.emitAsync('reminder.scan.completed', { organizationId, scanDate: executionDate })` while still inside the same `TenantContextService.run(...)` callback. This is an extension seam only; this plan does not import or call escalation code.

The daily scan itself is a BullMQ repeatable job with pattern `0 1 * * *` and timezone `Asia/Ho_Chi_Minh`. Register it once from `onModuleInit`; use the fixed job ID `reminder-daily-scan` so application restarts do not create duplicate repeatable jobs.

- [ ] **Step 6: Add the scan processor and register both queues**

`ReminderScanProcessor` consumes `REMINDER_SCAN_QUEUE` and calls `scheduler.scan(new Date())`. Register `REMINDER_SEND_QUEUE` for Task 6 even though its processor is added there. Do not import `InternalTasksModule` here; a later module may subscribe to `reminder.scan.completed` without making Reminder Automation depend on escalation. Reuse the existing global Redis connection from `config/bullmq.config.ts`; do not add another Redis client.

- [ ] **Step 7: Run scheduler tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-scheduler.service.spec.ts`

Expected: all scheduler unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/reminders apps/backend/src/app.module.ts apps/backend/.env
git commit -m "feat: add daily reminder scheduler and BullMQ queue"
```

---

### Task 6: Implement fresh-state reminder sending (delegates the actual send to `EmailService`)

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-sender.service.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-send.processor.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Test: `apps/backend/src/modules/reminders/application/reminder-sender.service.spec.ts`

**Interfaces:**
- Consumes: `ReminderSendJob`, `IReminderCandidateReader`, `IReminderExecutionRepository`, `IReminderRuleRepository`, `TenantContextService`, the existing BullMQ/Redis setup, and `EmailService.sendReminderEmail` from `2026-08-03-email-notification-service.md` (`NotificationsModule`, imported here via `forwardRef`).
- Produces: a worker that records `SKIPPED` immediately for a stale candidate, or creates a `PENDING` execution and hands it to `EmailService` for an eligible one. `SENT`/`FAILED` are written later, out-of-band, by that plan's `EmailQueueProcessor`.

This plan does NOT define its own email port, adapter, or template renderer. Sending a reminder email is entirely `EmailService`'s responsibility — this service's only job is the fresh-state re-check and the `PENDING` handoff.

- [ ] **Step 1: Write sender tests**

Create `reminder-sender.service.spec.ts`:

```typescript
import { ReminderRule } from '../domain/reminder-rule';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ReminderSenderService } from './reminder-sender.service';
import { IReminderCandidateReader } from './reminder-candidate-reader.port';
import { IReminderExecutionRepository } from './reminder-execution-repository.port';
import { IReminderRuleRepository } from './reminder-rule-repository.port';
import { EmailService } from '../../notifications/application/email.service';
import { buildReminderCandidate } from '../../../../test/reminder-fixtures';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

function createReminderSender(input: {
  candidate: ReturnType<typeof buildReminderCandidate>;
  emailService: Pick<EmailService, 'sendReminderEmail'>;
  executionRepo: IReminderExecutionRepository;
}): ReminderSenderService {
  const candidateReader = {
    findByReceivableId: jest.fn().mockResolvedValue(input.candidate),
  } as unknown as IReminderCandidateReader;
  const ruleRepository = {
    findById: jest.fn().mockResolvedValue(new ReminderRule({
      id: 'rule-1',
      reminderPolicyId: 'policy-1',
      offsetDays: -5,
      emailTemplateId: 'template-1',
      minIntervalDays: 7,
      createdAt: new Date('2026-08-01'),
    })),
  } as unknown as IReminderRuleRepository;
  const tenantContext = {
    run: async (_user: unknown, callback: () => Promise<void>) => callback(),
  };
  return new ReminderSenderService(
    candidateReader,
    ruleRepository,
    input.executionRepo,
    input.emailService as EmailService,
    tenantContext as unknown as TenantContextService,
  );
}

it('skips without creating an execution or calling EmailService when the receivable was paid after scheduling', async () => {
  const candidate = buildReminderCandidate({ status: ReceivableStatus.PAID, isDisputed: false });
  const emailService = { sendReminderEmail: jest.fn() };
  const executionRepo = { findByKey: jest.fn().mockResolvedValue(null), insertIfAbsent: jest.fn().mockResolvedValue(true), save: jest.fn(), findById: jest.fn(), updateSendResult: jest.fn(), findLatestSent: jest.fn() };
  const service = createReminderSender({ candidate, emailService, executionRepo });

  await service.send({
    organizationId: 'org-1',
    receivableId: candidate.receivableId,
    reminderRuleId: 'rule-1',
    executionDate: '2026-08-03',
  });

  expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  expect(executionRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'SKIPPED', skipReason: 'ALREADY_PAID' }),
  );
});

it('skips without creating an execution or calling EmailService when an open dispute appears after scheduling', async () => {
  const candidate = buildReminderCandidate({ status: ReceivableStatus.OPEN, isDisputed: true });
  const emailService = { sendReminderEmail: jest.fn() };
  const executionRepo = { findByKey: jest.fn().mockResolvedValue(null), insertIfAbsent: jest.fn().mockResolvedValue(true), save: jest.fn(), findById: jest.fn(), updateSendResult: jest.fn(), findLatestSent: jest.fn() };
  const service = createReminderSender({ candidate, emailService, executionRepo });

  await service.send({
    organizationId: 'org-1',
    receivableId: candidate.receivableId,
    reminderRuleId: 'rule-1',
    executionDate: '2026-08-03',
  });

  expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  expect(executionRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'SKIPPED', skipReason: 'DISPUTED' }),
  );
});

it('creates a PENDING execution and hands it to EmailService for an eligible candidate', async () => {
  const candidate = buildReminderCandidate({ status: ReceivableStatus.OPEN, isDisputed: false });
  const emailService = { sendReminderEmail: jest.fn().mockResolvedValue(undefined) };
  const executionRepo = { findByKey: jest.fn().mockResolvedValue(null), insertIfAbsent: jest.fn().mockResolvedValue(true), save: jest.fn(), findById: jest.fn(), updateSendResult: jest.fn(), findLatestSent: jest.fn() };
  const service = createReminderSender({ candidate, emailService, executionRepo });

  await service.send({
    organizationId: 'org-1',
    receivableId: candidate.receivableId,
    reminderRuleId: 'rule-1',
    executionDate: '2026-08-03',
  });

  expect(executionRepo.insertIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
  const savedExecution = executionRepo.insertIfAbsent.mock.calls[0][0];
  expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
    receivableId: candidate.receivableId,
    templateId: 'template-1',
    reminderExecutionId: savedExecution.id,
  });
});

it('does not re-dispatch when a PENDING or SENT execution already exists for this key (replayed job)', async () => {
  const candidate = buildReminderCandidate({ status: ReceivableStatus.OPEN, isDisputed: false });
  const emailService = { sendReminderEmail: jest.fn() };
  const executionRepo = {
    findByKey: jest.fn().mockResolvedValue({ id: 'exec-existing', status: 'PENDING' }),
    insertIfAbsent: jest.fn().mockResolvedValue(false),
    save: jest.fn(),
    findById: jest.fn(),
    updateSendResult: jest.fn(),
    findLatestSent: jest.fn(),
  };
  const service = createReminderSender({ candidate, emailService, executionRepo });

  await service.send({
    organizationId: 'org-1',
    receivableId: candidate.receivableId,
    reminderRuleId: 'rule-1',
    executionDate: '2026-08-03',
  });

  expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  expect(executionRepo.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run sender tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-sender.service.spec.ts`

Expected: FAIL because `ReminderSenderService` does not exist yet.

- [ ] **Step 3: Implement `ReminderSenderService.send()`**

The method must:

1. Check `findByKey(receivableId, ruleId, executionDate)` FIRST as a fast path, before reloading the candidate. If a row already exists (any status — `PENDING`, `SENT`, `FAILED`, or `SKIPPED`), return immediately without creating another execution or calling `EmailService` again.
2. Load the candidate again with `findByReceivableId(job.receivableId)`; never use candidate data from the scan job.
3. If the candidate is absent or its status is `PAID`, `WRITTEN_OFF`, or `CANCELLED`, save a new execution with `SKIPPED/ALREADY_PAID` and return.
4. If `candidate.isDisputed` is true, save a new execution with `SKIPPED/DISPUTED` and return.
5. Load the rule by `job.reminderRuleId`; if it no longer exists, throw a configuration error and let BullMQ retry the job.
6. Create a new `ReminderExecution` with `status: PENDING`, `sentAt: null`, `providerMessageId: null`, `failureReason: null`, `id: randomUUID()`, and call `insertIfAbsent(execution)`. If it returns `false`, another worker won the unique `(receivableId, reminderRuleId, executionDate)` claim; return without calling `EmailService`.
7. Call `EmailService.sendReminderEmail({ receivableId, templateId: rule.emailTemplateId, reminderExecutionId: execution.id })` and return. Do NOT catch errors from this call to swallow them silently — let enqueue errors propagate so BullMQ records the failed job. The database claim, not the pre-check, is the correctness boundary; recovery of a stuck `PENDING` row is an explicit post-MVP operational flow, not part of this basic plan.

- [ ] **Step 4: Create the processor**

`ReminderSendProcessor` consumes `REMINDER_SEND_QUEUE`, opens `TenantContextService.run()` with the job's organization ID and `Role.OWNER`, then calls `ReminderSenderService.send(job.data)`.

- [ ] **Step 5: Wire `EmailService` into `RemindersModule`**

Modify `apps/backend/src/modules/reminders/reminders.module.ts` — add `forwardRef(() => NotificationsModule)` to `imports`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
// ...existing imports...

@Module({
  imports: [
    // ...existing TypeOrmModule.forFeature(...) and other imports...
    forwardRef(() => NotificationsModule),
  ],
  providers: [
    // ...existing providers...
    ReminderSenderService,
    ReminderSendProcessor,
  ],
  exports: [
    // ...existing exports (including REMINDER_EXECUTION_REPOSITORY)...
  ],
})
export class RemindersModule {}
```

- [ ] **Step 6: Run sender tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-sender.service.spec.ts`

Expected: all 4 sender tests PASS, including the assertion that a replayed job for an already-dispatched key never calls `EmailService` twice.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/reminders
git commit -m "feat: add fresh-state reminder sender that delegates sending to EmailService"
```

---

### Task 7: Expose reminder execution history

**Files:**
- Create: `apps/backend/src/modules/reminders/presentation/dto/list-reminder-executions.query.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/reminders.controller.ts`
- Test: `apps/backend/src/modules/reminders/presentation/reminders.controller.spec.ts`

**Interfaces:**
- Consumes: `IReminderExecutionRepository`, `Permission.REPORT_READ`, and existing JWT/RBAC guards.
- Produces: `GET /reminder-executions` for the UI and audit/debugging; no mutation endpoint is added for execution history.

- [ ] **Step 1: Write the controller test**

Test that an authenticated user with `REPORT_READ` can request:

```text
GET /reminder-executions?receivableId=rec-1&status=SENT&page=1&limit=50
```

and receives rows scoped to the current `organizationId`. Test that the DTO rejects `limit=0`, `limit=101`, and an unknown execution status.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test reminders.controller.spec.ts`

Expected: FAIL because the query DTO, repository method, and route do not exist.

- [ ] **Step 3: Add the scoped read method and route**

Add this repository method:

```typescript
findPage(input: {
  receivableId?: string;
  status?: ReminderExecutionStatus;
  page: number;
  limit: number;
}): Promise<{ items: ReminderExecution[]; total: number }>;
```

Implement `GET /reminder-executions` with defaults `page=1`, `limit=50`, maximum `limit=100`. The controller must not accept `organizationId`; the repository obtains it from `TenantContextService`. Return `{ items, total, page, limit }`.

- [ ] **Step 4: Run the controller test**

Run: `pnpm --filter @casso-ledger/backend test reminders.controller.spec.ts`

Expected: all route, validation, permission, and tenant-scope tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reminders/presentation apps/backend/src/modules/reminders/application apps/backend/src/modules/reminders/infrastructure
git commit -m "feat: expose reminder execution history"
```

---

### Task 8: End-to-end reminder automation verification

**Files:**
- Create: `apps/backend/test/reminder-automation.integration.spec.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts` only if the test exposes an unregistered provider

**Interfaces:**
- Consumes: the complete `AppModule` (so `RemindersModule`, `NotificationsModule`, and `EmailTemplatesModule` are all wired together exactly as they will be in production), real PostgreSQL/Redis containers, `EMAIL_PROVIDER_ADAPTER` overridden with an in-test fake (no real Resend calls), and the existing Customer/Receivable/Dispute fixtures plus one seeded `EmailTemplate`.
- Produces: proof of the behavior required by the Reminder Automation spec, through the REAL `EmailService`/`EmailQueueProcessor` pipeline — not a stand-in.

Build this test with `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER_ADAPTER).useClass(...)`, following the exact `.overrideProvider()` pattern `2026-08-03-email-notification-service.md`'s Task 8 already established, rather than assembling `RemindersModule` in isolation — this is the one place in the whole reminder pipeline where the full cross-module wire-up (including the `forwardRef` cycle between `RemindersModule` and `NotificationsModule`) gets proven to actually boot.

- [ ] **Step 1: Write the integration test cases**

Use one organization with:

```text
VIP policy:  offsetDays = -5, minIntervalDays = 7
REGULAR policy: offsetDays = 3, minIntervalDays = 0
R1: OPEN, VIP, dueDate = 2026-08-08, no dispute
R2: PARTIALLY_PAID, REGULAR, dueDate = 2026-08-06, no dispute
R3: OPEN, VIP, dueDate = 2026-08-08, open dispute
R4: PAID, VIP, dueDate = 2026-08-08
```

Assert all of the following:

```text
1. Scan on 2026-08-03 enqueues R1 with the VIP rule.
2. Scan does not enqueue R3 because it has an open dispute.
3. R2 only enqueues when its exact +3 offset is reached; a different offset does not match.
4. A recent SENT execution for R1 creates SKIPPED/RATE_LIMITED and does not enqueue another job.
5. Paying R1 after the scan but before the worker causes SKIPPED/ALREADY_PAID and zero calls into `EmailService`.
6. Resolving the dispute before a later scan allows R3 to match its policy normally.
7. A successful eligible send: the worker creates a `PENDING` execution, calls `EmailService.sendReminderEmail`, which renders the seeded `EmailTemplate` and enqueues into `email-queue`; after allowing time for that second queue's worker to run (mirror the ~3s wait `2026-08-03-webhook-matching-engine.md`'s Task 10 and `2026-08-03-email-notification-service.md`'s Task 8 already use for their own async queue assertions), the SAME execution row is `SENT` with a non-null `providerMessageId` — exactly one row exists for this receivable/rule/day, not two — and exactly one `EMAIL_SENT` activity row was inserted from `reminder.sent`.
8. With `EMAIL_PROVIDER_ADAPTER` overridden to a fake that always throws, a successful eligible send's execution goes `PENDING` → (after `email-queue` exhausts its 3 attempts, waiting out the real exponential backoff as `2026-08-03-email-notification-service.md`'s Task 8 does) → `FAILED`, with `failureReason` set, and exactly one `EMAIL_FAILED` activity row was inserted from `reminder.failed`.
9. A second tenant's policy, customer, and receivable are never returned in the first tenant's scan or execution history.
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-automation.integration.spec.ts`

Expected: all nine behavior groups PASS against real PostgreSQL and Redis.

- [ ] **Step 3: Run the complete backend verification**

Run:

```bash
docker compose up -d postgres redis
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e
pnpm --filter @casso-ledger/backend type-check
```

Expected: unit tests, persistence tests, BullMQ integration tests, and TypeScript checks all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/reminder-automation.integration.spec.ts apps/backend/src/modules/reminders
git commit -m "test: verify reminder scheduling and fresh-state sending"
```

---

## Signup bootstrap contract

`RemindersModule` exports `DEFAULT_REMINDER_BOOTSTRAP`. Its implementation is called inside the signup transaction after the four default `EmailTemplate` rows exist. It creates one active `ReminderPolicy` for each `CustomerGroup` (`VIP` and `REGULAR`) and four `ReminderRule` rows per policy, pointing to the matching template by exact template name:

| Template name | `offsetDays` |
|---|---:|
| Nhắc trước hạn 3 ngày | -3 |
| Nhắc quá hạn 1 ngày | 1 |
| Nhắc quá hạn 7 ngày | 7 |
| Nhắc quá hạn 30 ngày | 30 |

All policy/rule inserts use the signup `EntityManager`; if any insert fails, the organization, subscription, templates, policies, and rules roll back together. The implementation is the only provider for `DEFAULT_REMINDER_BOOTSTRAP`; `SignupUseCase` must not create a second direct reminder-rule path.

## Self-Review Notes

- **Spec coverage:** `VIP | REGULAR` policy selection and rule entities → Tasks 1–4; exact `offsetDays` matching → Task 2 and Task 5; daily BullMQ scan → Task 5; open/partial filtering and dispute skip → Tasks 3, 5, and 8; rate limiting → Task 5; fresh worker re-check → Task 6; `PENDING`/`SENT`/`FAILED`/`SKIPPED` execution outcomes → Tasks 2, 3, 6, and 8; conditional idempotent claim plus terminal `reminder.sent`/`reminder.failed` events → Task 3 and Task 8; no future schedules or escalation → Global Constraints.
- **Reconciled with the Email/Notification and Email Template plans (2026-08-04 pass):** this plan originally shipped with its own `IReminderEmailSender`/`IReminderTemplateRenderer` ports and a console-log adapter, built before `2026-08-03-email-notification-service.md` and `2026-08-03-email-template-management.md` existed. Those two plans have since been written and already define the real `EmailService.sendReminderEmail` / `RenderEmailTemplateUseCase` / `EmailTemplate` — having two parallel email-sending pipelines would mean reminders never actually go out through Resend. Task 6 was rewritten to delete the local ports/adapter entirely; `ReminderSenderService` now only re-checks fresh state and hands off to the real `EmailService` via a `PENDING` `ReminderExecution` row. `IReminderExecutionRepository` (Task 3) gained an explicit `REMINDER_EXECUTION_REPOSITORY` `Symbol` token and an `updateSendResult`/`findById` pair specifically so `2026-08-03-email-notification-service.md`'s `EmailQueueProcessor` can report the final `SENT`/`FAILED` result back onto the same row it was handed. See that plan's own Self-Review Notes for the matching changes made on its side (real `IEmailTemplateRepository`/receivable-aware `EmailService.sendReminderEmail`, `forwardRef` import of `RemindersModule`).
- **Intentionally not covered:** Zalo/SMS, risk scoring, custom customer groups, escalation tasks, and advanced dispute lifecycle beyond the open/resolved check. `EmailTemplate` CRUD and Resend integration are now fully covered by the two plans this one depends on, not by this one.
- **Known integration prerequisite:** the Dispute Management plan must provide the `disputes` table/ORM entity used by `TypeOrmReminderCandidateReader`; if that plan has not run yet, implement the reader against the same `isDisputed = EXISTS(open dispute)` query once the entity is registered, without copying dispute state onto `Receivable`.
- **Type consistency:** `ReminderSendJob` uses the same `organizationId`, `receivableId`, `reminderRuleId`, and `executionDate` names in the scheduler, queue, processor, and sender; `ReminderExecutionStatus` and `ReminderSkipReason` are shared by domain, ORM, repository, and tests. `REMINDER_EXECUTION_REPOSITORY`'s `Symbol` instance (Task 3) is the same object imported by both this plan's `RemindersModule` and `2026-08-03-email-notification-service.md`'s `NotificationsModule` — not two separately-declared tokens that happen to share a name.
- **Idempotency and event contract:** `insertIfAbsent()` is the only PENDING claim and treats the database unique violation as a benign loser result; `updateSendResult()` uses a conditional update and emits `reminder.sent`/`reminder.failed` only when it changes one PENDING row. The Email Queue Processor must call these exact repository methods, and Collection Activity listens to those terminal events.
- **No speculative schedule table:** the daily scan is the only source of future work, so changing `dueDate` automatically changes the next matching offset without create/cancel synchronization code.
