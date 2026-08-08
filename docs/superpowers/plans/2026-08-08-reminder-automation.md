# Reminder Automation Implementation Plan (Updated)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tenant-scoped reminder policies and rules, a daily `@Cron` scan, a fresh-state reminder worker, and immutable `ReminderExecution` records that never email a receivable after it becomes paid, closed, or disputed.

**Architecture:** Add a `reminders` module on top of existing Customer/Receivable modules. The daily `@Cron` scan reads active policies and open receivables, applies one pure offset/rate-limit decision per rule, then enqueues a send job and emits a `reminder.scan.completed` event per organization. The worker reloads the candidate inside the organization tenant context, rechecks payment/dispute state, atomically claims one idempotency key, creates a `PENDING` `ReminderExecution`, and delegates rendering/queueing to the shared `EmailService` via an `IEmailService` port. `EmailQueueProcessor` emits `reminder.execution.completed` events; `ReminderExecutionListener` (in RemindersModule) listens and updates SENT/FAILED — no circular module dependency.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, `@nestjs/schedule` + `@Cron`, BullMQ (email queue only), Redis, Jest, Supertest, Testcontainers, `date-fns-tz`.

## Decisions from Grilling

| Decision | Choice |
|----------|--------|
| `minIntervalDays` scope | Per-rule (each rule has its own interval) |
| `CustomerGroup` location | `customers/domain/customer-group.ts` |
| Circular dependency fix | Events: `IEmailService` port in reminders, `REMINDER_EXECUTION_REPOSITORY` token in `common/tokens/` |
| Bootstrap seeding | At signup (inside existing transaction) |
| `@VersionColumn()` | Not added to reminder entities |
| Timezone | `date-fns-tz` |
| Daily scan scheduler | `@nestjs/schedule` `@Cron` (not BullMQ repeatable) |
| Error handling in scan | try/catch per-organization |

## Global Constraints

- `Customer.customerGroup` is exactly `VIP | REGULAR`; no custom groups or risk scoring.
- A policy is unique by `(organizationId, customerGroup)`; only its `isActive` value controls whether it is used.
- A rule uses `offsetDays`: negative means before `dueDate`, positive means after `dueDate`; the scan only enqueues an exact offset match.
- The scan only considers `Receivable.status IN (OPEN, PARTIALLY_PAID)` and skips open disputes.
- No future reminder schedule rows are created; the daily scan calculates the matching rule from the current `dueDate`.
- Rate limiting checks only the latest `ReminderExecution.status = SENT` for the receivable; a skipped or failed execution does not count as a successful send.
- The send worker always reloads the receivable and dispute state immediately before deciding to dispatch a send.
- A terminal receivable (`PAID`, `WRITTEN_OFF`, `CANCELLED`) records `SKIPPED/ALREADY_PAID`; an open dispute records `SKIPPED/DISPUTED`.
- `ReminderExecution.status` is one of `PENDING`, `SENT`, `FAILED`, or `SKIPPED`; `skipReason` is one of `ALREADY_PAID`, `DISPUTED`, or `RATE_LIMITED` when present.
- `ReminderPolicy` and `ReminderExecution` persist `organizationId`; `ReminderRule` is scoped through its parent `ReminderPolicy`.
- Money remains integer VND as established by the Domain Core plan.
- `ReminderExecution` idempotency is claimed by one database insert against the unique `(receivableId, reminderRuleId, executionDate)` key.
- No Zalo, SMS, Teams, Slack, escalation, customer risk score, or custom customer-group implementation is added here.

---

## File Structure

```
apps/backend/src/
  common/
    tokens/
      reminder-execution.token.ts                    -- CREATE: shared DI token
  modules/
    customers/
      domain/
        customer-group.ts                            -- CREATE: CustomerGroup enum
        customer.ts                                  -- MODIFY: add customerGroup field
      infrastructure/
        customer.orm-entity.ts                       -- MODIFY: add customerGroup column
    reminders/
      domain/
        reminder-policy.ts                           -- CREATE
        reminder-rule.ts                             -- CREATE
        reminder-execution.ts                        -- EXTEND: add missing fields (already exists from Plan #7)
      application/
        reminder-execution-repository.port.ts        -- EXTEND: add methods (already exists, minimal)
        reminder-policy-repository.port.ts           -- CREATE
        reminder-rule-repository.port.ts             -- CREATE
        reminder-candidate-reader.port.ts            -- CREATE
        reminder-rule-matcher.ts                     -- CREATE: pure function
        reminder-policy.service.ts                   -- CREATE: CRUD use case
        reminder-scheduler.service.ts                -- CREATE: daily scan logic
        reminder-sender.service.ts                   -- CREATE: fresh-state re-check + handoff
        i-email-service.port.ts                      -- CREATE: port for EmailService
      infrastructure/
        reminder-execution.orm-entity.ts             -- MODIFY: add missing columns, remove @VersionColumn
        typeorm-reminder-execution.repository.ts     -- EXTEND: add missing methods
        reminder-policy.orm-entity.ts                -- CREATE
        reminder-rule.orm-entity.ts                  -- CREATE
        typeorm-reminder-policy.repository.ts        -- CREATE
        typeorm-reminder-rule.repository.ts          -- CREATE
        typeorm-reminder-candidate.reader.ts         -- CREATE
        reminder-send.processor.ts                   -- CREATE
        reminder-execution.listener.ts               -- CREATE: listens to reminder.execution.completed
      presentation/
        dto/create-reminder-policy.dto.ts            -- CREATE
        dto/update-reminder-policy.dto.ts            -- CREATE
        dto/list-reminder-executions.query.ts        -- CREATE
        reminders.controller.ts                      -- CREATE
      reminders.module.ts                            -- MODIFY: register new providers
    notifications/
      infrastructure/
        email-queue.processor.ts                     -- MODIFY: emit reminder.execution.completed event
  auth/
    infrastructure/
      default-organization-bootstrap.adapter.ts     -- MODIFY: seed default policies/rules
  app.module.ts                                      -- MODIFY: register ScheduleModule
apps/backend/package.json                            -- MODIFY: add @nestjs/schedule, date-fns-tz
test/
  reminder-fixtures.ts                               -- CREATE
  reminder-persistence.integration.spec.ts           -- CREATE
  reminder-automation.integration.spec.ts            -- CREATE
```

---

### Task 1: Add `CustomerGroup` to the Customer domain

**Files:**
- Create: `apps/backend/src/modules/customers/domain/customer-group.ts`
- Modify: `apps/backend/src/modules/customers/domain/customer.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/customer.orm-entity.ts`
- Test: `apps/backend/src/modules/customers/domain/customer.spec.ts` (extend existing)

**Interfaces:**
- Consumes: existing `Customer` interface and `CustomerOrmEntity`.
- Produces: `CustomerGroup.VIP`, `CustomerGroup.REGULAR`, `Customer.customerGroup`, consumed by policy selection and reminder candidate queries.

- [ ] **Step 1: Write the failing test**

Extend the existing Customer domain test with:

```typescript
import { CustomerGroup } from './customer-group';

it('stores the customer group used by reminder policy selection', () => {
  const customer: Customer = {
    id: 'cust-1',
    organizationId: 'org-1',
    name: 'Company B',
    taxCode: '0312345678',
    email: 'ap@congtyb.vn',
    phone: '0900000000',
    defaultPaymentTermDays: 30,
    creditLimit: 100_000_000,
    priority: 1,
    customerGroup: CustomerGroup.VIP,
    createdAt: new Date('2026-01-01'),
  };

  expect(customer.customerGroup).toBe(CustomerGroup.VIP);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`

Expected: FAIL because `CustomerGroup` and `customerGroup` are not defined yet.

- [ ] **Step 3: Create the enum**

Create `apps/backend/src/modules/customers/domain/customer-group.ts`:

```typescript
export enum CustomerGroup {
  VIP = 'VIP',
  REGULAR = 'REGULAR',
}
```

- [ ] **Step 4: Add the property to the Customer domain**

Add `customerGroup` to the `Customer` interface:

```typescript
import { CustomerGroup } from './customer-group';

export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  customerGroup: CustomerGroup;
  createdAt: Date;
}
```

- [ ] **Step 5: Add the column to the ORM entity**

Add to `CustomerOrmEntity`:

```typescript
import { CustomerGroup } from '../domain/customer-group';

// Add column:
@Column({ type: 'enum', enum: CustomerGroup, default: CustomerGroup.REGULAR })
customerGroup: CustomerGroup;
```

Update every existing Customer fixture in tests to pass `customerGroup: CustomerGroup.REGULAR` unless the test is specifically about VIP behavior.

- [ ] **Step 6: Run the Customer tests**

Run: `pnpm --filter @casso-ledger/backend test customer.spec.ts`

Expected: all Customer tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/customers
git commit -m "feat: add CustomerGroup enum for reminder policies"
```

---

### Task 2: Extend `ReminderExecution` domain + repository + move token

**Files:**
- Modify: `apps/backend/src/modules/reminders/domain/reminder-execution.ts` (already exists from Plan #7)
- Modify: `apps/backend/src/modules/reminders/infrastructure/reminder-execution.orm-entity.ts` (already exists)
- Modify: `apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts` (already exists, minimal)
- Modify: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-execution.repository.ts` (already exists)
- Create: `apps/backend/src/common/tokens/reminder-execution.token.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts` (update import path)
- Test: `apps/backend/src/modules/reminders/domain/reminder-execution.spec.ts` (extend existing)

**Interfaces:**
- Consumes: existing `ReminderExecution` domain entity from Plan #7.
- Produces: extended `IReminderExecutionRepository` with `findLatestSent`, `findByKey`, `insertIfAbsent`, `findById`, `findPage`; shared `REMINDER_EXECUTION_REPOSITORY` token in `common/tokens/`.

- [ ] **Step 1: Extend the domain entity**

The existing `ReminderExecution` already has all needed fields. Verify it matches the spec:

```typescript
// Existing fields: id, organizationId, receivableId, reminderRuleId, executionDate,
// sentAt, status, skipReason, providerMessageId, failureReason, createdAt, version
// All present — no changes needed to domain entity.
```

- [ ] **Step 2: Remove `@VersionColumn` from ORM entity**

Modify `reminder-execution.orm-entity.ts`:
- Remove `@VersionColumn() version: number` (and the `VersionColumn` import)
- Add missing unique index: `@Index(['receivableId', 'reminderRuleId', 'executionDate'], { unique: true })`
- Keep existing `@Index(['organizationId', 'receivableId'])`

- [ ] **Step 3: Write failing tests for new repository methods**

Extend the existing `reminder-execution.spec.ts` with:

```typescript
it('findLatestSent returns the most recent SENT execution for a receivable', async () => {
  // Save a SENT execution, call findLatestSent, verify it returns the right one
});

it('findByKey returns execution matching receivableId + ruleId + executionDate', async () => {
  // Save an execution, call findByKey, verify match
});

it('insertIfAbsent returns false when duplicate key exists', async () => {
  // Insert same key twice, second returns false
});

it('findPage returns paginated results scoped by organizationId', async () => {
  // Save executions for 2 orgs, verify only one org's returned
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-execution`

Expected: FAIL because new methods don't exist.

- [ ] **Step 5: Move REMINDER_EXECUTION_REPOSITORY token to common/tokens/**

Create `apps/backend/src/common/tokens/reminder-execution.token.ts`:

```typescript
export const REMINDER_EXECUTION_REPOSITORY = Symbol('REMINDER_EXECUTION_REPOSITORY');
```

Update `reminder-execution-repository.port.ts` — remove the Symbol export (keep only the interface):

```typescript
import type { ReminderExecutionStatus } from '../domain/reminder-execution';

export interface IReminderExecutionRepository {
  getStatus(id: string): Promise<ReminderExecutionStatus | null>;
  findLatestSent(receivableId: string): Promise<{ sentAt: Date } | null>;
  findByKey(receivableId: string, reminderRuleId: string | null, executionDate: Date): Promise<{ id: string; status: ReminderExecutionStatus } | null>;
  findById(id: string): Promise<ReminderExecution | null>;
  insertIfAbsent(execution: ReminderExecution): Promise<boolean>;
  findPage(input: {
    receivableId?: string;
    status?: ReminderExecutionStatus;
    page: number;
    limit: number;
  }): Promise<{ items: ReminderExecution[]; total: number }>;
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}
```

- [ ] **Step 6: Update imports across codebase**

Update all files that import `REMINDER_EXECUTION_REPOSITORY` from the old location to import from `common/tokens/reminder-execution.token.ts`:
- `reminders.module.ts`
- `notifications.module.ts`
- `email-queue.processor.ts`

- [ ] **Step 7: Implement new repository methods**

Add to `TypeOrmReminderExecutionRepository`:

```typescript
async findLatestSent(receivableId: string): Promise<{ sentAt: Date } | null> {
  const organizationId = this.tenantContext.getOrganizationId();
  const row = await this.dataSource.getRepository(ReminderExecutionOrmEntity)
    .createQueryBuilder('e')
    .select('e."sentAt"')
    .where('e."receivableId" = :receivableId', { receivableId })
    .andWhere('e."organizationId" = :organizationId', { organizationId })
    .andWhere('e.status = :status', { status: ReminderExecutionStatus.SENT })
    .orderBy('e."sentAt"', 'DESC')
    .limit(1)
    .getOne();
  return row ? { sentAt: row.sentAt! } : null;
}

async findByKey(
  receivableId: string,
  reminderRuleId: string | null,
  executionDate: Date,
): Promise<{ id: string; status: ReminderExecutionStatus } | null> {
  const organizationId = this.tenantContext.getOrganizationId();
  const row = await this.dataSource.getRepository(ReminderExecutionOrmEntity)
    .createQueryBuilder('e')
    .select(['e.id', 'e.status'])
    .where('e."receivableId" = :receivableId', { receivableId })
    .andWhere('e."organizationId" = :organizationId', { organizationId })
    .andWhere('e."reminderRuleId" IS NOT DISTINCT FROM :reminderRuleId', { reminderRuleId })
    .andWhere('e."executionDate" = :executionDate', { executionDate })
    .getOne();
  return row ? { id: row.id, status: row.status } : null;
}

async findById(id: string): Promise<ReminderExecution | null> {
  const organizationId = this.tenantContext.getOrganizationId();
  const row = await this.dataSource.getRepository(ReminderExecutionOrmEntity)
    .findOne({ where: { id, organizationId } });
  return row ? new ReminderExecution(row) : null;
}

async insertIfAbsent(execution: ReminderExecution): Promise<boolean> {
  const organizationId = this.tenantContext.getOrganizationId();
  try {
    await this.dataSource.getRepository(ReminderExecutionOrmEntity).insert({
      id: execution.id,
      organizationId,
      receivableId: execution.receivableId,
      reminderRuleId: execution.reminderRuleId,
      executionDate: execution.executionDate,
      status: execution.status,
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    if (error instanceof QueryFailedError && (error as any).code === '23505') {
      return false;
    }
    throw error;
  }
}

async findPage(input: {
  receivableId?: string;
  status?: ReminderExecutionStatus;
  page: number;
  limit: number;
}): Promise<{ items: ReminderExecution[]; total: number }> {
  const organizationId = this.tenantContext.getOrganizationId();
  const qb = this.dataSource.getRepository(ReminderExecutionOrmEntity)
    .createQueryBuilder('e')
    .where('e."organizationId" = :organizationId', { organizationId });

  if (input.receivableId) {
    qb.andWhere('e."receivableId" = :receivableId', { receivableId: input.receivableId });
  }
  if (input.status) {
    qb.andWhere('e.status = :status', { status: input.status });
  }

  const [items, total] = await qb
    .orderBy('e."createdAt"', 'DESC')
    .skip((input.page - 1) * input.limit)
    .take(input.limit)
    .getManyAndCount();

  return { items: items.map(r => new ReminderExecution(r)), total };
}
```

Update `updateSendResult` to remove `organizationId` scoping (called from `EmailQueueProcessor` which sets its own tenant context):

```typescript
async updateSendResult(
  id: string,
  status: 'SENT' | 'FAILED',
  providerMessageId: string | null,
): Promise<void> {
  const nextStatus = status === 'SENT'
    ? ReminderExecutionStatus.SENT
    : ReminderExecutionStatus.FAILED;
  await this.dataSource.transaction(async (manager) => {
    await manager.getRepository(ReminderExecutionOrmEntity)
      .createQueryBuilder()
      .update()
      .set({
        status: nextStatus,
        providerMessageId,
        sentAt: status === 'SENT' ? new Date() : null,
        failureReason: status === 'FAILED' ? 'Email delivery failed after max attempts' : null,
      })
      .where('id = :id', { id })
      .andWhere('status = :pending', { pending: ReminderExecutionStatus.PENDING })
      .execute();
  });
}
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-execution`

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/tokens apps/backend/src/modules/reminders apps/backend/src/modules/notifications
git commit -m "feat: extend ReminderExecution repository and move token to common/tokens"
```

---

### Task 3: Implement reminder domain entities and pure rule matching

**Files:**
- Create: `apps/backend/src/modules/reminders/domain/reminder-policy.ts`
- Create: `apps/backend/src/modules/reminders/domain/reminder-rule.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-rule-matcher.ts`
- Test: `apps/backend/src/modules/reminders/domain/reminder-policy.spec.ts`
- Test: `apps/backend/src/modules/reminders/application/reminder-rule-matcher.spec.ts`

**Interfaces:**
- Consumes: `CustomerGroup` from Task 1.
- Produces: `ReminderPolicy`, `ReminderRule` domain entities, `findMatchingRule()` pure function.

- [ ] **Step 1: Write policy and rule tests**

Create `reminder-policy.spec.ts`:

```typescript
import { CustomerGroup } from '../../customers/domain/customer-group';
import { ReminderPolicy } from './reminder-policy';
import { ReminderRule } from './reminder-rule';

describe('ReminderPolicy', () => {
  it('accepts a valid policy with active state', () => {
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
});

describe('ReminderRule', () => {
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

  it('rejects non-integer offsetDays', () => {
    expect(() => new ReminderRule({
      id: 'rule-1',
      reminderPolicyId: 'policy-1',
      offsetDays: 3.5,
      emailTemplateId: 'template-1',
      minIntervalDays: 7,
      createdAt: new Date('2026-08-03'),
    })).toThrow('offsetDays must be an integer');
  });
});
```

- [ ] **Step 2: Write pure matcher tests**

Create `reminder-rule-matcher.spec.ts`:

```typescript
import { findMatchingRule } from './reminder-rule-matcher';
import { ReminderRule } from '../domain/reminder-rule';

const makeRule = (offsetDays: number): ReminderRule => new ReminderRule({
  id: `rule-${offsetDays}`,
  reminderPolicyId: 'policy-1',
  offsetDays,
  emailTemplateId: 'template-1',
  minIntervalDays: 7,
  createdAt: new Date('2026-08-01'),
});

describe('findMatchingRule', () => {
  it('returns the exact offset rule', () => {
    expect(findMatchingRule([makeRule(-5), makeRule(3)], -5)?.id).toBe('rule--5');
  });

  it('returns null when no exact offset exists', () => {
    expect(findMatchingRule([makeRule(-5)], -4)).toBeNull();
  });

  it('returns null for empty rules array', () => {
    expect(findMatchingRule([], -5)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.spec.ts reminder-rule-matcher.spec.ts`

Expected: FAIL because domain files and matcher don't exist.

- [ ] **Step 4: Create the domain types**

Create `reminder-policy.ts`:

```typescript
import { CustomerGroup } from '../../customers/domain/customer-group';

export interface ReminderPolicyProps {
  id: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  createdAt: Date;
}

export class ReminderPolicy {
  readonly id: string;
  readonly organizationId: string;
  readonly customerGroup: CustomerGroup;
  readonly isActive: boolean;
  readonly createdAt: Date;

  constructor(props: ReminderPolicyProps) {
    if (!Object.values(CustomerGroup).includes(props.customerGroup)) {
      throw new Error(`Invalid customer group: ${props.customerGroup}`);
    }
    Object.assign(this, props);
  }
}
```

Create `reminder-rule.ts`:

```typescript
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
    Object.assign(this, props);
  }
}
```

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

### Task 4: Persist policies, rules, and reminder candidates

**Files:**
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-policy.orm-entity.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-rule.orm-entity.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-policy-repository.port.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-rule-repository.port.ts`
- Create: `apps/backend/src/modules/reminders/application/reminder-candidate-reader.port.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-policy.repository.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-rule.repository.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/typeorm-reminder-candidate.reader.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/reminder-persistence.integration.spec.ts`

**Interfaces:**
- Consumes: TypeORM, existing `CustomerOrmEntity`, `ReceivableOrmEntity`, `InvoiceOrmEntity`, `DisputeOrmEntity`, `BaseRepository`, `TenantContextService`.
- Produces: repositories used by policy CRUD and the two reminder processors.

- [ ] **Step 1: Define repository ports**

Create `reminder-policy-repository.port.ts`:

```typescript
import { CustomerGroup } from '../../customers/domain/customer-group';
import type { ReminderPolicy } from '../domain/reminder-policy';
import type { EntityManager } from 'typeorm';

export interface IReminderPolicyRepository {
  findByCustomerGroup(customerGroup: CustomerGroup): Promise<ReminderPolicy | null>;
  findAll(): Promise<ReminderPolicy[]>;
  findAllOrganizationIdsForScheduler(): Promise<string[]>;
  save(policy: ReminderPolicy, manager?: EntityManager): Promise<void>;
}
```

Create `reminder-rule-repository.port.ts`:

```typescript
import type { ReminderRule } from '../domain/reminder-rule';
import type { EntityManager } from 'typeorm';

export interface IReminderRuleRepository {
  findById(id: string): Promise<ReminderRule | null>;
  findByPolicyId(policyId: string): Promise<ReminderRule[]>;
  replaceForPolicy(policyId: string, rules: ReminderRule[], manager: EntityManager): Promise<void>;
}
```

Create `reminder-candidate-reader.port.ts`:

```typescript
import type { CustomerGroup } from '../../customers/domain/customer-group';
import type { ReceivableStatus } from '@casso-ledger/shared-types';

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

Create `test/reminder-persistence.integration.spec.ts` — Testcontainers PostgreSQL test that:
1. Saves one VIP policy and two rules.
2. Loads the policy and rules through repository ports.
3. Saves a `SENT` execution and verifies `findLatestSent` returns it.
4. Attempts a second policy for the same organization and customer group → expects DB unique constraint to reject.
5. Uses `organizationId = 'org-1'` and `org-2` to prove tenant isolation.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-persistence.integration.spec.ts`

Expected: FAIL because ORM entities and repositories don't exist.

- [ ] **Step 4: Create the ORM entities**

Create `reminder-policy.orm-entity.ts`:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../../customers/domain/customer-group';

@Entity({ name: 'reminder_policies' })
@Index(['organizationId', 'customerGroup'], { unique: true })
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
```

Create `reminder-rule.orm-entity.ts`:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'reminder_rules' })
@Index(['reminderPolicyId', 'offsetDays'], { unique: true })
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
```

- [ ] **Step 5: Implement repositories**

Implement `TypeOrmReminderPolicyRepository` and `TypeOrmReminderRuleRepository` extending the tenant-scoped `BaseRepository` pattern. `findAllOrganizationIdsForScheduler` uses a direct query returning distinct `organizationId` from active policies.

Implement `TypeOrmReminderCandidateReader` joining Customers, Receivables, optional Invoices, and open Disputes. Returns only `receivable.status IN ('OPEN', 'PARTIALLY_PAID')` and calculates `remainingAmount = originalAmount - paidAmount`.

- [ ] **Step 6: Register the module**

Update `RemindersModule` to register all new ORM entities, repositories, and tokens. Export `REMINDER_EXECUTION_REPOSITORY` (from `common/tokens/`), policy/rule/candidate-reader tokens.

Import `RemindersModule` from `AppModule`.

- [ ] **Step 7: Run persistence tests**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-persistence.integration.spec.ts`

Expected: all persistence and tenant-isolation assertions PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/reminders apps/backend/src/app.module.ts apps/backend/test/reminder-persistence.integration.spec.ts
git commit -m "feat: persist reminder policies rules and candidates"
```

---

### Task 5: Implement policy CRUD and rule replacement

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-policy.service.ts`
- Create: `apps/backend/src/modules/reminders/presentation/dto/create-reminder-policy.dto.ts`
- Create: `apps/backend/src/modules/reminders/presentation/dto/update-reminder-policy.dto.ts`
- Create: `apps/backend/src/modules/reminders/presentation/reminders.controller.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Test: `apps/backend/src/modules/reminders/application/reminder-policy.service.spec.ts`

**Interfaces:**
- Consumes: repository ports from Task 4, `TenantContextService`, `Permission.REMINDER_POLICY_WRITE` / `Permission.REPORT_READ` from RBAC plan.
- Produces: `POST /reminder-policies`, `GET /reminder-policies`, `PATCH /reminder-policies/:id`.

- [ ] **Step 1: Write service tests**

```typescript
import { DataSource } from 'typeorm';
import { CustomerGroup } from '../../customers/domain/customer-group';
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
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb({})) };
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.service.spec.ts`

Expected: FAIL because `ReminderPolicyService` doesn't exist.

- [ ] **Step 3: Implement the service**

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

`create()`: reject existing `(organizationId, customerGroup)`, create policy + rules in one transaction. `update()`: load policy through scoped repo, update `isActive`, replace all rules atomically. Reject duplicate `offsetDays` values before opening transaction.

- [ ] **Step 4: Add DTO validation and controllers**

`CreateReminderPolicyDto` and `UpdateReminderPolicyDto` validate `customerGroup`, `isActive`, and `rules` array with `offsetDays` (integer), `emailTemplateId` (non-empty), `minIntervalDays` (integer >= 0).

Wire:
```
POST  /reminder-policies       @RequirePermission(REMINDER_POLICY_WRITE)
GET   /reminder-policies       @RequirePermission(REPORT_READ)
PATCH /reminder-policies/:id   @RequirePermission(REMINDER_POLICY_WRITE)
```

- [ ] **Step 5: Run unit and controller tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-policy`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/reminders/application/reminder-policy.service.ts apps/backend/src/modules/reminders/presentation apps/backend/src/modules/reminders/reminders.module.ts
git commit -m "feat: add reminder policy and rule management"
```

---

### Task 6: Build the daily @Cron scheduler and IEmailService port

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts`
- Create: `apps/backend/src/modules/reminders/application/i-email-service.port.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json` (add `@nestjs/schedule`, `date-fns-tz`)
- Test: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.spec.ts`

**Interfaces:**
- Consumes: `IReminderPolicyRepository`, `IReminderRuleRepository`, `IReminderExecutionRepository`, `IReminderCandidateReader`, `TenantContextService`, `IEventPublisher`, `findMatchingRule()`, `date-fns-tz`.
- Produces: `@Cron` daily scan, `ReminderSendJob` data consumed by Task 7, `reminder.scan.completed` events.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @casso-ledger/backend add @nestjs/schedule date-fns-tz
```

- [ ] **Step 2: Define IEmailService port**

Create `i-email-service.port.ts`:

```typescript
export interface ISendReminderEmailInput {
  receivableId: string;
  templateId: string;
  reminderExecutionId: string;
}

export interface IEmailService {
  sendReminderEmail(input: ISendReminderEmailInput): Promise<void>;
}
```

- [ ] **Step 3: Define queue constants**

Create `reminder-send-job.ts` (in application layer, not infrastructure — no BullMQ dependency here):

```typescript
export interface ReminderSendJob {
  organizationId: string;
  receivableId: string;
  reminderRuleId: string;
  executionDate: string; // YYYY-MM-DD in reminder timezone
}
```

- [ ] **Step 4: Write scheduler tests**

Test four decisions:
1. Enqueues the exact offset rule for an eligible candidate.
2. Emits one `reminder.scan.completed` event per organization.
3. Does not enqueue a disputed candidate.
4. Records `SKIPPED/RATE_LIMITED` when a recent `SENT` execution is inside `minIntervalDays`.

Also test that `DRAFT`, `PAID`, `WRITTEN_OFF`, and `CANCELLED` candidates never reach the queue.

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-scheduler.service.spec.ts`

Expected: FAIL because scheduler doesn't exist.

- [ ] **Step 6: Implement timezone and date calculation**

Use `date-fns-tz`:

```typescript
import { formatInTimeZone } from 'date-fns-tz';

const REMINDER_TIMEZONE = 'Asia/Ho_Chi_Minh';

function calendarDate(date: Date): string {
  return formatInTimeZone(date, REMINDER_TIMEZONE, 'yyyy-MM-dd');
}

function calculateOffsetDays(dueDate: Date, today: Date): number {
  const due = new Date(calendarDate(dueDate));
  const now = new Date(calendarDate(today));
  return Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
```

- [ ] **Step 7: Implement `ReminderSchedulerService`**

The `@Cron('0 1 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` decorated `scan()` method:

1. Read active org IDs via `findAllOrganizationIdsForScheduler()`.
2. For each org, wrap in try/catch, call `TenantContextService.run({ userId: 'system', organizationId, role: Role.OWNER }, ...)`.
3. Inside tenant context: load candidates, skip disputed, select policy by `customerGroup`, find exact offset rule.
4. Query latest `SENT` execution. If `sentAt` within `rule.minIntervalDays` → insert `SKIPPED/RATE_LIMITED`.
5. Otherwise enqueue `ReminderSendJob` with `{ jobId: 'reminder:${receivableId}:${ruleId}:${executionDate}', attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`.
6. After all candidates evaluated, emit `reminder.scan.completed` with `{ organizationId, scanDate }`.

The send queue uses BullMQ (separate from scan) because email needs retry with exponential backoff. Register `REMINDER_SEND_QUEUE` in the module.

- [ ] **Step 8: Run scheduler tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-scheduler.service.spec.ts`

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/reminders apps/backend/src/app.module.ts apps/backend/package.json
git commit -m "feat: add daily reminder cron scheduler and IEmailService port"
```

---

### Task 7: Implement fresh-state reminder sending

**Files:**
- Create: `apps/backend/src/modules/reminders/application/reminder-sender.service.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-send.processor.ts`
- Create: `apps/backend/src/modules/reminders/infrastructure/reminder-execution.listener.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts`
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts` (emit `reminder.execution.completed`)
- Test: `apps/backend/src/modules/reminders/application/reminder-sender.service.spec.ts`

**Interfaces:**
- Consumes: `ReminderSendJob`, `IReminderCandidateReader`, `IReminderExecutionRepository`, `IReminderRuleRepository`, `TenantContextService`, `IEmailService` port.
- Produces: worker that records `SKIPPED` for stale candidate, or creates `PENDING` execution and hands off to `IEmailService`. `SENT`/`FAILED` written later by `EmailQueueProcessor` via `reminder.execution.completed` event.

- [ ] **Step 1: Write sender tests**

```typescript
it('skips without calling EmailService when the receivable was paid after scheduling', async () => {
  // candidate.status = PAID → SKIPPED/ALREADY_PAID, no EmailService call
});

it('skips when an open dispute appears after scheduling', async () => {
  // candidate.isDisputed = true → SKIPPED/DISPUTED, no EmailService call
});

it('creates a PENDING execution and hands it to EmailService for an eligible candidate', async () => {
  // candidate.status = OPEN, not disputed → insertIfAbsent(PENDING), EmailService.sendReminderEmail called
});

it('does not re-dispatch when a PENDING or SENT execution already exists', async () => {
  // findByKey returns existing → no insert, no EmailService call
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test reminder-sender.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `ReminderSenderService.send()`**

1. Check `findByKey(receivableId, ruleId, executionDate)` FIRST — if exists, return immediately.
2. Load candidate via `findByReceivableId(job.receivableId)`.
3. If absent or terminal status → save `SKIPPED/ALREADY_PAID`, return.
4. If disputed → save `SKIPPED/DISPUTED`, return.
5. Load rule by `job.reminderRuleId`; if not exists, throw (BullMQ retries).
6. Create `ReminderExecution` with `status: PENDING`, call `insertIfAbsent()`. If false, return (another worker won).
7. Call `IEmailService.sendReminderEmail({ receivableId, templateId: rule.emailTemplateId, reminderExecutionId: execution.id })`.

- [ ] **Step 4: Create the send processor**

`ReminderSendProcessor` consumes `REMINDER_SEND_QUEUE`, opens `TenantContextService.run()` with job's `organizationId` and `Role.OWNER`, then calls `ReminderSenderService.send(job.data)`.

- [ ] **Step 5: Create the execution listener**

`ReminderExecutionListener` listens to `reminder.execution.completed` event (emitted by `EmailQueueProcessor`):

```typescript
@OnEvent('reminder.execution.completed')
async handleExecutionCompleted(payload: {
  id: string;
  status: 'SENT' | 'FAILED';
  providerMessageId: string | null;
  organizationId: string;
}) {
  await this.tenantContext.run(
    { userId: 'system', organizationId: payload.organizationId, role: Role.OWNER },
    () => this.executionRepo.updateSendResult(payload.id, payload.status, payload.providerMessageId),
  );
}
```

- [ ] **Step 6: Emit event from EmailQueueProcessor**

Modify `email-queue.processor.ts`: after successful send, emit `reminder.execution.completed` instead of `reminder.sent`. After final failure, emit `reminder.execution.completed` with `FAILED`. The listener handles the rest.

- [ ] **Step 7: Wire `IEmailService` into `RemindersModule`**

Register `EmailService` as provider for `IEmailService` token:

```typescript
{ provide: I_EMAIL_SERVICE, useExisting: EmailService }
```

Import `NotificationsModule` (one-way: Reminders → Notifications, no cycle).

- [ ] **Step 8: Run sender tests**

Run: `pnpm --filter @casso-ledger/backend test reminder-sender.service.spec.ts`

Expected: all 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/reminders apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts
git commit -m "feat: add fresh-state reminder sender with event-driven completion"
```

---

### Task 8: Expose reminder execution history

**Files:**
- Create: `apps/backend/src/modules/reminders/presentation/dto/list-reminder-executions.query.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/reminders.controller.ts`
- Test: `apps/backend/src/modules/reminders/presentation/reminders.controller.spec.ts`

**Interfaces:**
- Consumes: `IReminderExecutionRepository`, `Permission.REPORT_READ`.
- Produces: `GET /reminder-executions` for UI and audit.

- [ ] **Step 1: Write the controller test**

Test that an authenticated user with `REPORT_READ` can request:
```
GET /reminder-executions?receivableId=rec-1&status=SENT&page=1&limit=50
```
and receives rows scoped to `organizationId`. Test DTO rejects `limit=0`, `limit=101`, unknown status.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test reminders.controller.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Add the route**

Implement `GET /reminder-executions` with defaults `page=1`, `limit=50`, max `limit=100`. Return `{ items, total, page, limit }`.

- [ ] **Step 4: Run controller test**

Run: `pnpm --filter @casso-ledger/backend test reminders.controller.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/reminders/presentation
git commit -m "feat: expose reminder execution history endpoint"
```

---

### Task 9: Bootstrap default policies and rules at signup

**Files:**
- Modify: `apps/backend/src/modules/auth/infrastructure/default-organization-bootstrap.adapter.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/default-organization-bootstrap.adapter.spec.ts` (extend)

**Interfaces:**
- Consumes: existing `IOrganizationBootstrap` port, `IReminderPolicyRepository`, `IReminderRuleRepository`, `IEmailTemplateRepository` (to look up template IDs by name).
- Produces: 2 default policies (VIP + REGULAR) × 4 rules = 8 rows seeded in signup transaction.

- [ ] **Step 1: Write the bootstrap test**

Extend existing test:

```typescript
it('seeds default reminder policies and rules', async () => {
  const policyRepo = { save: jest.fn() };
  const ruleRepo = { replaceForPolicy: jest.fn() };
  const templateRepo = { findByName: jest.fn().mockResolvedValue({ id: 'tpl-1', name: 'Reminder 3 days before due date' }) };
  const bootstrap = new DefaultOrganizationBootstrap(templateRepo, policyRepo, ruleRepo);

  await bootstrap.seed('org-1', new Date(), manager);

  expect(policyRepo.save).toHaveBeenCalledTimes(2); // VIP + REGULAR
  expect(ruleRepo.replaceForPolicy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test default-organization-bootstrap`

Expected: FAIL.

- [ ] **Step 3: Implement the seeding**

In `DefaultOrganizationBootstrap.seed()`, after email templates:

```typescript
const templates = await this.templateRepo.findAllForOrganization(organizationId);
const templateMap = new Map(templates.map(t => [t.name, t.id]));

for (const customerGroup of [CustomerGroup.VIP, CustomerGroup.REGULAR]) {
  const policy = new ReminderPolicy({
    id: randomUUID(),
    organizationId,
    customerGroup,
    isActive: true,
    createdAt: now,
  });
  await this.policyRepo.save(policy, manager);

  const rules = [
    { name: 'Reminder 3 days before due date', offsetDays: -3 },
    { name: 'Reminder 1 day overdue', offsetDays: 1 },
    { name: 'Reminder 7 days overdue', offsetDays: 7 },
    { name: 'Reminder 30 days overdue', offsetDays: 30 },
  ].map(r => new ReminderRule({
    id: randomUUID(),
    reminderPolicyId: policy.id,
    offsetDays: r.offsetDays,
    emailTemplateId: templateMap.get(r.name) ?? '',
    minIntervalDays: 7,
    createdAt: now,
  }));
  await this.ruleRepo.replaceForPolicy(policy.id, rules, manager);
}
```

- [ ] **Step 4: Update AuthModule imports**

Add `RemindersModule` to `AuthModule` imports so `IReminderPolicyRepository` and `IReminderRuleRepository` are available.

- [ ] **Step 5: Run bootstrap test**

Run: `pnpm --filter @casso-ledger/backend test default-organization-bootstrap`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth
git commit -m "feat: seed default reminder policies and rules at signup"
```

---

### Task 10: End-to-end reminder automation verification

**Files:**
- Create: `apps/backend/test/reminder-automation.integration.spec.ts`
- Modify: `apps/backend/src/modules/reminders/reminders.module.ts` only if test exposes an unregistered provider

**Interfaces:**
- Consumes: complete `AppModule`, real PostgreSQL/Redis containers, `EMAIL_PROVIDER_ADAPTER` overridden with in-test fake.
- Produces: proof of behavior required by spec through real `EmailService`/`EmailQueueProcessor` pipeline.

- [ ] **Step 1: Write the integration test**

Use one organization with:
```
VIP policy:    offsetDays = -5, minIntervalDays = 7
REGULAR policy: offsetDays = 3, minIntervalDays = 0
R1: OPEN, VIP, dueDate = 2026-08-08, no dispute
R2: PARTIALLY_PAID, REGULAR, dueDate = 2026-08-06, no dispute
R3: OPEN, VIP, dueDate = 2026-08-08, open dispute
R4: PAID, VIP, dueDate = 2026-08-08
```

Assert:
1. Scan on 2026-08-03 enqueues R1 with VIP rule.
2. Scan does not enqueue R3 (open dispute).
3. R2 only enqueues when exact +3 offset is reached.
4. Recent SENT execution for R1 → SKIPPED/RATE_LIMITED.
5. Paying R1 after scan but before worker → SKIPPED/ALREADY_PAID.
6. Resolving dispute before later scan → R3 matches normally.
7. Successful send: PENDING → EmailService called → SENT with providerMessageId.
8. With fake provider that throws: PENDING → FAILED after retries.
9. Second tenant's data never appears in first tenant's scan or history.

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- reminder-automation.integration.spec.ts`

Expected: all 9 behavior groups PASS.

- [ ] **Step 3: Run complete backend verification**

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e
pnpm --filter @casso-ledger/backend type-check
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/reminder-automation.integration.spec.ts apps/backend/src/modules/reminders
git commit -m "test: verify reminder scheduling and fresh-state sending e2e"
```
