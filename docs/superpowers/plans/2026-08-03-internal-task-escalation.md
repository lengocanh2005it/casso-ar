# Internal Task & Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `InternalTask` (assignable follow-up items on a `Receivable`) with read and write paths: (1) list tasks via `GET /receivables/:id/tasks`, (2) escalation evaluation subscribed to the Reminder Automation daily scan event, (3) manual creation via `POST /receivables/:id/tasks`, (4) resolve/dismiss via `POST /tasks/:id/resolve` and `POST /tasks/:id/dismiss`, plus (5) an auto-dismiss listener that closes any `OPEN` task when its `Receivable` transitions to `PAID`/`WRITTEN_OFF`/`CANCELLED`.

**Architecture:** The Reminder Automation scheduler emits `reminder.scan.completed` after reminder candidates are evaluated. `ReminderScanCompletedListener` subscribes to that event and invokes `RunEscalationScanUseCase`, which opens its own explicit tenant scope because event handlers do not rely on ambient async context. Manual create/resolve/dismiss are plain use cases behind `JwtAuthGuard` + `PermissionGuard`. The auto-dismiss path listens for `receivable.status-closed`, emitted for every terminal status; `receivable.closed` remains the narrower PAID-only event owned by Collection Activity.

**Tech Stack:** `@nestjs/event-emitter` (already installed by the dispute-management plan — reused, not reinstalled), TypeORM, Jest + testcontainers. BullMQ scheduling is owned by Reminder Automation; this module does not register another queue.

## Global Constraints

> **2026-08-08 grilling pass — supersedes the original MVP defaults below where noted.** Every bullet here reflects the decisions actually shipped; do not follow a code snippet further down that contradicts a bullet here — the bullet wins.

- **This plan shares the Reminder Automation scan contract:** the reminder scheduler owns the daily candidate scan and emits `reminder.scan.completed` with `{ organizationId, scanDate }`; `ReminderScanCompletedListener` consumes it and runs only escalation-specific rules. Do not create a second daily scan/queue, or make the reminder scheduler know this module's use case. **Unlike the original draft of this constraint, this plan DOES import `RemindersModule`** — one-way, to inject the already-exported `IReminderPolicyRepository` (see the next bullet) — and `CustomersModule`, to inject `ICustomerRepository`. Neither import creates a cycle: `RemindersModule`/`CustomersModule` do not depend on `InternalTasksModule`.
- **`escalationThresholdDays` is configurable per `ReminderPolicy`/`customerGroup`, NOT hardcoded.** It is a new field on the existing `ReminderPolicy` entity (`2026-08-03-reminder-automation-design.md` section 2), reusing that entity's existing write path (`PATCH /reminder-policies/:id`, `Permission.REMINDER_POLICY_WRITE`) rather than a new settings screen. `RunEscalationScanUseCase` resolves each overdue receivable's threshold via `IReminderPolicyRepository.findByCustomerGroup(customer.customerGroup)` (already exists, no port change needed); if the customer has no active policy for its group, fall back to `DEFAULT_ESCALATION_THRESHOLD_DAYS = 30`. See Task 6.
- **Escalation assignee: first `FINANCE_MANAGER`, falling back to first `OWNER`.** Every organization has at least one `OWNER` (a tenant cannot exist without one), so this fallback guarantees an escalation is never silently assigned to nobody — replacing the original draft's "skip silently when there is no `FINANCE_MANAGER`". No in-app notification is added for this fallback case; see the design spec section 4 for why (no in-app notification system exists yet — that's a separate, cross-cutting ticket).
- **Manual task creation validates `assignedToUserId`.** Whether supplied in the request body or defaulted to the creator, it MUST resolve to an existing `Membership` in the current organization (`IMembershipRepository.findByUserAndOrganization`, already exists) — reject with `AppError(ErrorCode.VALIDATION_ERROR, ...)` otherwise. See Task 7.
- **Resolve/dismiss is assignee-scoped, with an `OWNER` override — NOT open to every `INTERNAL_TASK_MANAGE` holder.** Only the task's `assignedToUserId`, or any `OWNER`, may resolve or dismiss it; an `INTERNAL_TASK_MANAGE` holder who is neither is rejected with `AppError(ErrorCode.FORBIDDEN, ...)` even though they can still list and create tasks. This supersedes the original draft's "any `INTERNAL_TASK_MANAGE` holder may act on any task." See Task 8.
- **Application-layer code throws only `AppError`, never a `@nestjs/common` exception class.** Several code snippets below predate this correction and still show `NotFoundException`/`BadRequestException` thrown from `application/` — those are fixed inline in Tasks 7, 8, and 10; do not copy the exception-class import from an unmarked snippet.
- **Domain events are published through the `IEventPublisher` port (`common/events/event-publisher.port.ts`, token `EVENT_PUBLISHER`), never by injecting `EventEmitter2` directly into a use case.** `@nestjs/event-emitter` is a concrete SDK; `application/` may depend only on the port, matching `AllocatePaymentUseCase`'s existing pattern. Earlier drafts of Tasks 6 and 10 inject `EventEmitter2` directly — corrected inline in those tasks below.
- **`@OnEvent`-decorated listener classes live in `infrastructure/`, not `application/`** — matching the only two precedents in the codebase, `CollectionActivityListener` and `ReminderExecutionListener` (both under `infrastructure/`). `ReminderScanCompletedListener` and `ReceivableClosedListener` are placed there too (Tasks 6 and 10), not under `application/` as an earlier draft of the File Structure below showed.
- `receivable.status-closed` is the broad terminal-state event consumed here (see ADR-0005 for why it is a second, distinctly-named event rather than a widened `receivable.closed`). It is emitted from all three terminal-status call sites — `AllocatePaymentUseCase` (PAID), `WriteOffReceivableUseCase` (WRITTEN_OFF), and the new `CancelReceivableUseCase` (CANCELLED, built by this plan — see the note below and Task 10) — side by side with `receivable.closed`, which stays PAID-only and owned by Collection Activity.
- **`CancelReceivableUseCase` + `POST /receivables/:id/cancel` do not exist yet and are built by this plan (Task 10).** `Receivable.cancel()` (domain) already exists and is fully implemented, but no use case or controller route ever called it — confirmed by searching the codebase, not assumed. `AuditActionType.RECEIVABLE_CANCEL` and `ErrorCode.RECEIVABLE_HAS_PAYMENTS` already exist in `common/`, unused until now, which is why Task 10 wires them up rather than adding new ones.
- Background-job tenant scoping follows `ProcessWebhookUseCase`'s exact pattern (`2026-08-03-webhook-matching-engine.md` Task 9): `TenantContextService.run({ userId: 'system', organizationId, role: Role.OWNER }, async () => { ... })` opened once per organization being scanned.
- Money fields, naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply (not directly relevant here — `InternalTask` has no money field — but the layering rule, domain has no framework imports, is followed).

---

## File Structure

```
apps/backend/src/
  modules/
    internal-tasks/
      domain/internal-task.ts
      domain/internal-task.spec.ts
      infrastructure/internal-task.orm-entity.ts
      application/internal-task-repository.port.ts
      infrastructure/typeorm-internal-task.repository.ts
      application/run-escalation-scan.usecase.ts
      application/run-escalation-scan.usecase.spec.ts
      infrastructure/reminder-scan-completed.listener.ts
      infrastructure/reminder-scan-completed.listener.spec.ts
      application/create-manual-task.usecase.ts
      application/create-manual-task.usecase.spec.ts
      application/resolve-task.usecase.ts
      application/resolve-task.usecase.spec.ts
      application/dismiss-task.usecase.ts
      application/dismiss-task.usecase.spec.ts
      application/list-receivable-tasks.usecase.ts
      application/list-receivable-tasks.usecase.spec.ts
      infrastructure/receivable-closed.listener.ts
      infrastructure/receivable-closed.listener.spec.ts
      presentation/dto/create-manual-task.dto.ts
      presentation/internal-tasks.controller.ts
      internal-tasks.module.ts
    organizations/
      application/membership-repository.port.ts                  -- MODIFY: add findFirstByRole()
      infrastructure/typeorm-membership.repository.ts             -- MODIFY: add findFirstByRole()
    reminders/
      domain/reminder-policy.ts                                   -- MODIFY: add escalationThresholdDays
      domain/reminder-policy.spec.ts                               -- MODIFY: validate the new field
      infrastructure/reminder-policy.orm-entity.ts                 -- MODIFY: add escalationThresholdDays column
      presentation/dto/create-reminder-policy.dto.ts                -- MODIFY: add optional escalationThresholdDays
      presentation/dto/update-reminder-policy.dto.ts                -- MODIFY: add optional escalationThresholdDays
      application/reminder-policy.service.ts                        -- MODIFY: pass the field through create/update
    receivables:
      application/receivable-repository.port.ts                  -- MODIFY: add findOverdueByThreshold()
      infrastructure/typeorm-receivable.repository.ts             -- MODIFY: add findOverdueByThreshold()
      application/write-off-receivable.usecase.ts                 -- MODIFY: emit 'receivable.status-closed'
      application/write-off-receivable.usecase.spec.ts            -- MODIFY: new constructor arg
      application/cancel-receivable.usecase.ts                    -- CREATE (did not exist — see Task 10)
      application/cancel-receivable.usecase.spec.ts               -- CREATE
      presentation/receivables.controller.ts                      -- MODIFY: add POST :id/cancel
    payments/
      application/allocate-payment.usecase.ts                     -- MODIFY: also emit 'receivable.status-closed'
      application/allocate-payment.usecase.spec.ts                 -- MODIFY: new assertion
    customers/                                                     -- NOT modified; ICustomerRepository already exported
  common/
    rbac/
      permission.enum.ts             -- MODIFY: add INTERNAL_TASK_MANAGE
      role-permissions.map.ts        -- MODIFY: grant to FINANCE_MANAGER, ACCOUNTANT
  app.module.ts                      -- MODIFY: register InternalTasksModule
test/
  internal-task-escalation.integration.spec.ts
```

---

### Task 1: `InternalTask` domain entity

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/domain/internal-task.ts`
- Test: `apps/backend/src/modules/internal-tasks/domain/internal-task.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `InternalTask` domain class with `resolve()`/`dismiss()` transitions, used by every later task in this plan

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/internal-tasks/domain/internal-task.spec.ts`:

```typescript
import { InternalTask } from './internal-task';

function buildTask(overrides: Partial<ConstructorParameters<typeof InternalTask>[0]> = {}): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-1',
    createdByUserId: null,
    taskType: 'ESCALATION',
    title: 'Overdue receivable by 30 days requires action',
    description: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    ...overrides,
  });
}

describe('InternalTask domain entity', () => {
  it('starts in OPEN status', () => {
    expect(buildTask().status).toBe('OPEN');
  });

  it('resolve() transitions OPEN to DONE and sets resolvedAt', () => {
    const resolved = buildTask().resolve();
    expect(resolved.status).toBe('DONE');
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it('dismiss() transitions OPEN to DISMISSED and sets resolvedAt', () => {
    const dismissed = buildTask().dismiss();
    expect(dismissed.status).toBe('DISMISSED');
    expect(dismissed.resolvedAt).not.toBeNull();
  });

  it('resolve() throws when the task is already DONE', () => {
    const done = buildTask({ status: 'DONE', resolvedAt: new Date('2026-08-02') });
    expect(() => done.resolve()).toThrow('Cannot resolve a task in status DONE');
  });

  it('dismiss() throws when the task is already DISMISSED', () => {
    const dismissed = buildTask({ status: 'DISMISSED', resolvedAt: new Date('2026-08-02') });
    expect(() => dismissed.dismiss()).toThrow('Cannot dismiss a task in status DISMISSED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test internal-task.spec.ts`
Expected: FAIL — Cannot find module './internal-task'

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/domain/internal-task.ts`**

```typescript
export type InternalTaskType = 'ESCALATION' | 'MANUAL';
export type InternalTaskStatus = 'OPEN' | 'DONE' | 'DISMISSED';

export interface InternalTaskProps {
  id: string;
  organizationId: string;
  receivableId: string;
  assignedToUserId: string;
  createdByUserId: string | null;
  taskType: InternalTaskType;
  title: string;
  description: string | null;
  dueDate?: Date | null;
  status: InternalTaskStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export class InternalTask {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly assignedToUserId: string;
  readonly createdByUserId: string | null;
  readonly taskType: InternalTaskType;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: Date | null;
  readonly status: InternalTaskStatus;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;

  constructor(props: InternalTaskProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.receivableId = props.receivableId;
    this.assignedToUserId = props.assignedToUserId;
    this.createdByUserId = props.createdByUserId;
    this.taskType = props.taskType;
    this.title = props.title;
    this.description = props.description;
    this.dueDate = props.dueDate ?? null;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.resolvedAt = props.resolvedAt;
  }

  private withProps(overrides: Partial<InternalTaskProps>): InternalTask {
    return new InternalTask({ ...this, ...overrides });
  }

  resolve(): InternalTask {
    if (this.status !== 'OPEN') {
      throw new Error(`Cannot resolve a task in status ${this.status}`);
    }
    return this.withProps({ status: 'DONE', resolvedAt: new Date() });
  }

  dismiss(): InternalTask {
    if (this.status !== 'OPEN') {
      throw new Error(`Cannot dismiss a task in status ${this.status}`);
    }
    return this.withProps({ status: 'DISMISSED', resolvedAt: new Date() });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test internal-task.spec.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/internal-tasks/domain
git commit -m "feat: add InternalTask domain entity with resolve/dismiss transitions"
```

---

### Task 2: `InternalTaskOrmEntity` + `IInternalTaskRepository` + module skeleton

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/infrastructure/internal-task.orm-entity.ts`
- Create: `apps/backend/src/modules/internal-tasks/application/internal-task-repository.port.ts`
- Create: `apps/backend/src/modules/internal-tasks/infrastructure/typeorm-internal-task.repository.ts`
- Create: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `BaseRepository`/`TenantContextService` (`2026-08-03-multi-tenancy-rbac.md`)
- Produces: `IInternalTaskRepository` with `findById`, `findOpenEscalationByReceivableId`, `findOpenByReceivableId`, `createEscalationIfAbsent`, and `save` — used by every use case in Tasks 6-9

- [ ] **Step 1: Create `apps/backend/src/modules/internal-tasks/infrastructure/internal-task.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { InternalTaskStatus, InternalTaskType } from '../domain/internal-task';

@Entity({ name: 'internal_tasks' })
@Index(['organizationId', 'receivableId', 'status'])
@Index('uq_internal_open_escalation_per_receivable', ['organizationId', 'receivableId'], {
  unique: true,
  where: `"taskType" = 'ESCALATION' AND "status" = 'OPEN'`,
})
export class InternalTaskOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  assignedToUserId: string;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column()
  taskType: InternalTaskType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @Column()
  status: InternalTaskStatus;

  @Column()
  createdAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date | null;
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/internal-tasks/application/internal-task-repository.port.ts`**

```typescript
import { InternalTask } from '../domain/internal-task';

export interface IInternalTaskRepository {
  findById(id: string): Promise<InternalTask | null>;
  findByReceivableId(receivableId: string): Promise<InternalTask[]>;
  findOpenEscalationByReceivableId(receivableId: string): Promise<InternalTask | null>;
  findOpenByReceivableId(receivableId: string): Promise<InternalTask[]>;
  /** Atomically inserts an OPEN ESCALATION task; false means the partial unique index won the race. */
  createEscalationIfAbsent(task: InternalTask): Promise<boolean>;
  save(task: InternalTask): Promise<void>;
}

export const INTERNAL_TASK_REPOSITORY = Symbol('INTERNAL_TASK_REPOSITORY');
```

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/infrastructure/typeorm-internal-task.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository } from '../application/internal-task-repository.port';
import { InternalTaskOrmEntity } from './internal-task.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmInternalTaskRepository
  extends BaseRepository<InternalTaskOrmEntity>
  implements IInternalTaskRepository
{
  constructor(
    @InjectRepository(InternalTaskOrmEntity) repo: Repository<InternalTaskOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<InternalTask | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new InternalTask(row) : null;
  }

  async findByReceivableId(receivableId: string): Promise<InternalTask[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { organizationId, receivableId } as any,
      order: { createdAt: 'DESC' } as any,
    });
    return rows.map((row) => new InternalTask(row));
  }

  async findOpenEscalationByReceivableId(receivableId: string): Promise<InternalTask | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { organizationId, receivableId, taskType: 'ESCALATION', status: 'OPEN' } as any,
    });
    return row ? new InternalTask(row) : null;
  }

  async findOpenByReceivableId(receivableId: string): Promise<InternalTask[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { organizationId, receivableId, status: 'OPEN' } as any });
    return rows.map((row) => new InternalTask(row));
  }

  async createEscalationIfAbsent(task: InternalTask): Promise<boolean> {
    try {
      await this.ormRepo.insert(task as unknown as InternalTaskOrmEntity);
      return true;
    } catch (error) {
      if (error instanceof QueryFailedError && (error as any).code === '23505') {
        return false;
      }
      throw error;
    }
  }

  async save(task: InternalTask): Promise<void> {
    await this.scopedSave(task as unknown as InternalTaskOrmEntity);
  }
}
```

`findOpenEscalationByReceivableId`/`findOpenByReceivableId` bypass `scopedFindOne` (which only fetches a single narrowly-scoped row) the same way `TypeOrmReceivableRepository.findOpenTopNByOrganization` does in the webhook-matching-engine plan — they read `organizationId` directly off `TenantContextService` and query `this.ormRepo` for a list.

- [ ] **Step 4: Create `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`** (skeleton, extended by later tasks)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalTaskOrmEntity } from './infrastructure/internal-task.orm-entity';
import { TypeOrmInternalTaskRepository } from './infrastructure/typeorm-internal-task.repository';
import { INTERNAL_TASK_REPOSITORY } from './application/internal-task-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([InternalTaskOrmEntity])],
  providers: [{ provide: INTERNAL_TASK_REPOSITORY, useClass: TypeOrmInternalTaskRepository }],
  exports: [INTERNAL_TASK_REPOSITORY],
})
export class InternalTasksModule {}
```

- [ ] **Step 5: Register `InternalTasksModule` in `apps/backend/src/app.module.ts`**

Add `InternalTasksModule` to `imports`.

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/internal-tasks apps/backend/src/app.module.ts
git commit -m "feat: add InternalTask entity and repository skeleton"
```

---

### Task 3: `Membership.findFirstByRole()`

**Files:**
- Modify: `apps/backend/src/modules/organizations/application/membership-repository.port.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts`

**Interfaces:**
- Consumes: `Organization`, `Membership` domain classes (`2026-08-03-multi-tenancy-rbac.md` Task 1)
- Produces: `IMembershipRepository.findFirstByRole(organizationId, role)`, used by Task 6's `RunEscalationScanUseCase`

`RunEscalationScanUseCase` only needs the first Finance Manager in the organization; the daily organization list comes from Reminder Automation's active-policy query, so this plan does not add an unscoped organization scan.

- [ ] **Step 1: Add `findFirstByRole()` to `IMembershipRepository`**

Modify `apps/backend/src/modules/organizations/application/membership-repository.port.ts`:

```typescript
import { Membership, Role } from '../domain/membership';

export interface IMembershipRepository {
  findByUserAndOrganization(userId: string, organizationId: string): Promise<Membership | null>;
  findFirstByRole(organizationId: string, role: Role): Promise<Membership | null>;
  save(membership: Membership): Promise<void>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
```

- [ ] **Step 2: Implement `findFirstByRole()` in `TypeOrmMembershipRepository`**

Modify `apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts` — add:

```typescript
async findFirstByRole(organizationId: string, role: Role): Promise<Membership | null> {
  const row = await this.repo.findOne({
    where: { organizationId, role },
    order: { createdAt: 'ASC' },
  });
  return row ? new Membership(row) : null;
}
```

`order: { createdAt: 'ASC' }` makes "first match" deterministic (the earliest-created `FINANCE_MANAGER` membership), matching the spec's "first match" wording (section 2) exactly rather than leaving it to unspecified row order.

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/organizations
git commit -m "feat: add Membership.findFirstByRole for escalation scan"
```

---

### Task 4: `Receivable.findOverdueByThreshold()`

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`

**Interfaces:**
- Consumes: `ReceivableOrmEntity` (`2026-08-03-project-scaffolding-and-domain-core.md` Task 10)
- Produces: `IReceivableRepository.findOverdueByThreshold(organizationId, minDaysOverdue)` — org-wide (not top-N like the webhook plan's `findOpenTopNByOrganization`), used by Task 6's `RunEscalationScanUseCase`

- [ ] **Step 1: Add `findOverdueByThreshold()` to `IReceivableRepository`**

Modify `apps/backend/src/modules/receivables/application/receivable-repository.port.ts` — add:

```typescript
findOverdueByThreshold(organizationId: string, minDaysOverdue: number): Promise<Receivable[]>;
```

- [ ] **Step 2: Implement `findOverdueByThreshold()` in `TypeOrmReceivableRepository`**

Modify `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts` — add (import `ReceivableStatus` from `@casso-ledger/shared-types` at the top if not already present):

```typescript
async findOverdueByThreshold(organizationId: string, minDaysOverdue: number): Promise<Receivable[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - minDaysOverdue);

  const rows = await this.ormRepo
    .createQueryBuilder('receivable')
    .where('receivable."organizationId" = :organizationId', { organizationId })
    .andWhere('receivable.status IN (:...statuses)', {
      statuses: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
    })
    .andWhere('receivable."dueDate" <= :cutoff', { cutoff })
    .getMany();

  return rows.map((row) => new Receivable(row));
}
```

Takes `organizationId` as an explicit parameter (not read from `TenantContextService` internally) — the same style as `findOpenTopNByOrganization` in the webhook-matching-engine plan — so it works correctly when called from inside the escalation cron's per-organization `TenantContextService.run()` scope without a second implicit dependency on which scope happens to be active.

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/receivables/application/receivable-repository.port.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts
git commit -m "feat: add Receivable.findOverdueByThreshold for escalation scan"
```

---

### Task 5: `Permission.INTERNAL_TASK_MANAGE`

**Files:**
- Modify: `apps/backend/src/common/rbac/permission.enum.ts`
- Modify: `apps/backend/src/common/rbac/role-permissions.map.ts`

**Interfaces:**
- Consumes: `Permission` enum, `ROLE_PERMISSIONS` map (`2026-08-03-multi-tenancy-rbac.md` Task 8)
- Produces: `Permission.INTERNAL_TASK_MANAGE`, used by Task 9's `InternalTasksController`

None of the 13 existing permissions cover "manage an internal follow-up task" — `RECEIVABLE_WRITE` is about the receivable's own fields (amount/dueDate/status), not a side-table of assignable tasks, and reusing it would mean any role that can edit a receivable could also silently resolve someone else's escalation task. A new, narrowly-scoped permission is justified and matches spec section 3's explicit `Permissions: FINANCE_MANAGER, ACCOUNTANT` for task creation (this plan extends the same grant to resolve/dismiss, per the Global Constraints decision on spec section 5's second open question).

- [ ] **Step 1: Add `INTERNAL_TASK_MANAGE` to `Permission`**

Modify `apps/backend/src/common/rbac/permission.enum.ts`:

```typescript
export enum Permission {
  RECEIVABLE_READ = 'RECEIVABLE_READ',
  RECEIVABLE_WRITE = 'RECEIVABLE_WRITE',
  RECEIVABLE_WRITE_OFF = 'RECEIVABLE_WRITE_OFF',
  RECEIVABLE_DISPUTE = 'RECEIVABLE_DISPUTE',
  PAYMENT_ALLOCATE = 'PAYMENT_ALLOCATE',
  PAYMENT_ALLOCATE_UNDO = 'PAYMENT_ALLOCATE_UNDO',
  REMINDER_POLICY_WRITE = 'REMINDER_POLICY_WRITE',
  REMINDER_SEND_MANUAL = 'REMINDER_SEND_MANUAL',
  BANK_CONNECTION_MANAGE = 'BANK_CONNECTION_MANAGE',
  SUBSCRIPTION_MANAGE = 'SUBSCRIPTION_MANAGE',
  USER_MANAGE = 'USER_MANAGE',
  REPORT_READ = 'REPORT_READ',
  AUDIT_LOG_READ = 'AUDIT_LOG_READ',
  INTERNAL_TASK_MANAGE = 'INTERNAL_TASK_MANAGE',
}
```

- [ ] **Step 2: Grant `INTERNAL_TASK_MANAGE` to `FINANCE_MANAGER` and `ACCOUNTANT`**

Modify `apps/backend/src/common/rbac/role-permissions.map.ts` — add `Permission.INTERNAL_TASK_MANAGE` to both arrays:

```typescript
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: Object.values(Permission),
  [Role.FINANCE_MANAGER]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_WRITE_OFF,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.PAYMENT_ALLOCATE_UNDO,
    Permission.REMINDER_POLICY_WRITE,
    Permission.REMINDER_SEND_MANUAL,
    Permission.REPORT_READ,
    Permission.AUDIT_LOG_READ,
    Permission.INTERNAL_TASK_MANAGE,
  ],
  [Role.ACCOUNTANT]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.REMINDER_SEND_MANUAL,
    Permission.REPORT_READ,
    Permission.INTERNAL_TASK_MANAGE,
  ],
  [Role.SALES_REP]: [Permission.RECEIVABLE_READ, Permission.REPORT_READ],
  [Role.VIEWER]: [Permission.RECEIVABLE_READ, Permission.REPORT_READ, Permission.AUDIT_LOG_READ],
};
```

(`Role.OWNER: Object.values(Permission)` already includes the new permission automatically — no change needed there.)

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS (existing `role-permissions.map` / `permission.guard` tests are unaffected — they assert on `RECEIVABLE_WRITE_OFF`, not the new permission)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/common/rbac
git commit -m "feat: add INTERNAL_TASK_MANAGE permission for FINANCE_MANAGER and ACCOUNTANT"
```

---

### Task 6: `ReminderPolicy.escalationThresholdDays` + escalation participant — `RunEscalationScanUseCase`

**Files:**
- Modify: `apps/backend/src/modules/reminders/domain/reminder-policy.ts`
- Modify: `apps/backend/src/modules/reminders/domain/reminder-policy.spec.ts`
- Modify: `apps/backend/src/modules/reminders/infrastructure/reminder-policy.orm-entity.ts`
- Create: `apps/backend/src/database/migrations/<timestamp>-add-reminder-policy-escalation-threshold.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/dto/create-reminder-policy.dto.ts`
- Modify: `apps/backend/src/modules/reminders/presentation/dto/update-reminder-policy.dto.ts`
- Modify: `apps/backend/src/modules/reminders/application/reminder-policy.service.ts`
- Create: `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.spec.ts`
- Create: `apps/backend/src/modules/internal-tasks/infrastructure/reminder-scan-completed.listener.ts`
- Test: `apps/backend/src/modules/internal-tasks/infrastructure/reminder-scan-completed.listener.spec.ts`
- Modify: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`

**Interfaces:**
- Consumes: `IMembershipRepository.findFirstByRole()` (Task 3, for `FINANCE_MANAGER`) and `IMembershipRepository.findOwnerByOrganization()` (existing — reused as-is for the OWNER fallback, not a second `findFirstByRole` call), `IReceivableRepository.findOverdueByThreshold()` (Task 4, called with a 1-day floor, not a fixed threshold — see Step 4), `ICustomerRepository.findById()` (existing, from `CustomersModule`), `IReminderPolicyRepository.findByCustomerGroup()` (existing, from `RemindersModule`, no port change), `IInternalTaskRepository.createEscalationIfAbsent()` (Task 2), and `TenantContextService`
- Produces: `RunEscalationScanUseCase.scanOrganization(organizationId)` — called by `ReminderScanCompletedListener` after the reminder scheduler emits `reminder.scan.completed`; no second queue.

- [ ] **Step 1: Write a failing domain test for `ReminderPolicy.escalationThresholdDays`**

Add to `apps/backend/src/modules/reminders/domain/reminder-policy.spec.ts`:

```typescript
it('rejects a non-positive escalationThresholdDays', () => {
  expect(
    () =>
      new ReminderPolicy({
        id: 'pol-1',
        organizationId: 'org-1',
        customerGroup: CustomerGroup.VIP,
        isActive: true,
        escalationThresholdDays: 0,
        createdAt: new Date('2026-01-01'),
      }),
  ).toThrow('escalationThresholdDays must be a positive integer');
});

it('defaults escalationThresholdDays to 30 when not provided', () => {
  const policy = new ReminderPolicy({
    id: 'pol-1',
    organizationId: 'org-1',
    customerGroup: CustomerGroup.VIP,
    isActive: true,
    createdAt: new Date('2026-01-01'),
  });
  expect(policy.escalationThresholdDays).toBe(30);
});
```

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.spec.ts` → FAIL (property does not exist yet).

- [ ] **Step 2: Add `escalationThresholdDays` to the `ReminderPolicy` domain entity**

Modify `apps/backend/src/modules/reminders/domain/reminder-policy.ts`:

```typescript
import { CustomerGroup } from '../../customers/domain/customer-group';

export const DEFAULT_ESCALATION_THRESHOLD_DAYS = 30;

export interface ReminderPolicyProps {
  id: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  isActive: boolean;
  escalationThresholdDays?: number;
  createdAt: Date;
}

export class ReminderPolicy {
  readonly id: string;
  readonly organizationId: string;
  readonly customerGroup: CustomerGroup;
  readonly isActive: boolean;
  readonly escalationThresholdDays: number;
  readonly createdAt: Date;

  constructor(props: ReminderPolicyProps) {
    if (!Object.values(CustomerGroup).includes(props.customerGroup)) {
      throw new Error(`Invalid customer group: ${props.customerGroup}`);
    }
    const escalationThresholdDays =
      props.escalationThresholdDays ?? DEFAULT_ESCALATION_THRESHOLD_DAYS;
    if (
      !Number.isInteger(escalationThresholdDays) ||
      escalationThresholdDays <= 0
    ) {
      throw new Error('escalationThresholdDays must be a positive integer');
    }
    Object.assign(this, { ...props, escalationThresholdDays });
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test reminder-policy.spec.ts` → PASS.

- [ ] **Step 3: Persist the column and expose it in the DTOs**

Modify `apps/backend/src/modules/reminders/infrastructure/reminder-policy.orm-entity.ts` — add:

```typescript
@Column('int', { default: 30 })
escalationThresholdDays: number;
```

Create a migration (`apps/backend/src/database/migrations/<timestamp>-add-reminder-policy-escalation-threshold.ts`) adding the column with `DEFAULT 30 NOT NULL`, following the existing migration style in that directory (see `20260808000000-add-invoice-unique-index.ts` for the file shape).

Modify `apps/backend/src/modules/reminders/presentation/dto/create-reminder-policy.dto.ts` and `update-reminder-policy.dto.ts` — add:

```typescript
@IsOptional()
@IsInt()
@IsPositive()
escalationThresholdDays?: number;
```

Modify `apps/backend/src/modules/reminders/application/reminder-policy.service.ts` — pass `dto.escalationThresholdDays` through to the `ReminderPolicy` constructor call in both `create()` and `update()` (omit the field to keep the domain default/existing value — do not force it to `30` on every update).

Run: `pnpm --filter @casso-ledger/backend test` → all PASS. Run `npx tsc --noEmit` → clean.

- [ ] **Step 4: Write a failing test for `RunEscalationScanUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.spec.ts`:

```typescript
import { CustomerGroup } from '../../customers/domain/customer-group';
import { Customer } from '../../customers/domain/customer';
import { ReminderPolicy } from '../../reminders/domain/reminder-policy';
import { Role } from '../../organizations/domain/membership';
import { Membership } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { RunEscalationScanUseCase } from './run-escalation-scan.usecase';

function buildMembership(userId: string, role: Role): Membership {
  return new Membership({
    id: `mem-${userId}`,
    organizationId: 'org-1',
    userId,
    role,
    invitedAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  });
}

function buildOverdueReceivable(id: string, overdueByDays: number): Receivable {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - overdueByDays);
  return new Receivable({
    id,
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate,
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
  });
}

function buildCustomer(customerGroup: CustomerGroup): Customer {
  return {
    id: 'cust-1',
    organizationId: 'org-1',
    name: 'Acme',
    taxCode: '',
    email: '',
    phone: '',
    customerGroup,
    defaultPaymentTermDays: 30,
    creditLimit: 0,
    priority: 0,
    createdAt: new Date('2026-01-01'),
  };
}

function buildPolicy(customerGroup: CustomerGroup, escalationThresholdDays: number): ReminderPolicy {
  return new ReminderPolicy({
    id: 'pol-1',
    organizationId: 'org-1',
    customerGroup,
    isActive: true,
    escalationThresholdDays,
    createdAt: new Date('2026-01-01'),
  });
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    membershipRepo: {
      findFirstByRole: jest.fn().mockResolvedValue(buildMembership('fm-user-1', Role.FINANCE_MANAGER)),
      findOwnerByOrganization: jest.fn().mockResolvedValue(buildMembership('owner-user-1', Role.OWNER)),
    },
    receivableRepo: { findOverdueByThreshold: jest.fn().mockResolvedValue([buildOverdueReceivable('rec-1', 35)]) },
    customerRepo: { findById: jest.fn().mockResolvedValue(buildCustomer(CustomerGroup.VIP)) },
    reminderPolicyRepo: { findByCustomerGroup: jest.fn().mockResolvedValue(buildPolicy(CustomerGroup.VIP, 30)) },
    internalTaskRepo: { createEscalationIfAbsent: jest.fn().mockResolvedValue(true), save: jest.fn() },
    tenantContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
    ...overrides,
  };
}

describe('RunEscalationScanUseCase', () => {
  it('creates an ESCALATION task assigned to the FINANCE_MANAGER once past the customerGroup policy threshold', async () => {
    const deps = buildDeps();
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any, deps.receivableRepo as any, deps.customerRepo as any,
      deps.reminderPolicyRepo as any, deps.internalTaskRepo as any, deps.tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(deps.internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ assignedToUserId: 'fm-user-1', taskType: 'ESCALATION', status: 'OPEN' }),
    );
  });

  it('falls back to the DEFAULT_ESCALATION_THRESHOLD_DAYS when the customer has no matching active policy', async () => {
    const deps = buildDeps({
      reminderPolicyRepo: { findByCustomerGroup: jest.fn().mockResolvedValue(null) },
      receivableRepo: { findOverdueByThreshold: jest.fn().mockResolvedValue([buildOverdueReceivable('rec-1', 25)]) },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any, deps.receivableRepo as any, deps.customerRepo as any,
      deps.reminderPolicyRepo as any, deps.internalTaskRepo as any, deps.tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    // 25 days overdue, no policy → falls back to 30-day default → not yet due for escalation
    expect(deps.internalTaskRepo.createEscalationIfAbsent).not.toHaveBeenCalled();
  });

  it('falls back to the OWNER when the organization has no FINANCE_MANAGER', async () => {
    const deps = buildDeps({
      membershipRepo: {
        findFirstByRole: jest.fn().mockResolvedValue(null),
        findOwnerByOrganization: jest.fn().mockResolvedValue(buildMembership('owner-user-1', Role.OWNER)),
      },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any, deps.receivableRepo as any, deps.customerRepo as any,
      deps.reminderPolicyRepo as any, deps.internalTaskRepo as any, deps.tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(deps.internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ assignedToUserId: 'owner-user-1' }),
    );
  });

  it('loses safely when another scan inserts the OPEN ESCALATION task first', async () => {
    const deps = buildDeps({
      internalTaskRepo: { createEscalationIfAbsent: jest.fn().mockResolvedValue(false), save: jest.fn() },
    });
    const useCase = new RunEscalationScanUseCase(
      deps.membershipRepo as any, deps.receivableRepo as any, deps.customerRepo as any,
      deps.reminderPolicyRepo as any, deps.internalTaskRepo as any, deps.tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(deps.internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledTimes(1);
    expect(deps.internalTaskRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test run-escalation-scan.usecase.spec.ts`
Expected: FAIL — Cannot find module './run-escalation-scan.usecase'

- [ ] **Step 6: Create `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from '../../customers/application/customer-repository.port';
import {
  IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  DEFAULT_ESCALATION_THRESHOLD_DAYS,
} from '../../reminders/domain/reminder-policy';
import type { IReminderPolicyRepository } from '../../reminders/application/reminder-policy-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Widest possible net for the DB pre-filter — the real, customer-group-specific
// threshold is resolved per receivable below, so this floor only needs to be
// no larger than the smallest threshold any policy could configure.
const OVERDUE_CANDIDATE_FLOOR_DAYS = 1;

function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY);
}

@Injectable()
export class RunEscalationScanUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: IMembershipRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject('IReminderPolicyRepository') private readonly reminderPolicyRepo: IReminderPolicyRepository,
    @Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async scanOrganization(organizationId: string): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const financeManager = await this.membershipRepo.findFirstByRole(organizationId, Role.FINANCE_MANAGER);
        const assignee = financeManager ?? (await this.membershipRepo.findOwnerByOrganization(organizationId));
        if (!assignee) {
          return; // guard only — every organization has at least one OWNER in practice
        }

        const candidates = await this.receivableRepo.findOverdueByThreshold(
          organizationId,
          OVERDUE_CANDIDATE_FLOOR_DAYS,
        );

        const today = new Date();
        for (const receivable of candidates) {
          const overdueDays = daysOverdue(receivable.dueDate, today);
          const threshold = await this.resolveEscalationThreshold(receivable.customerId);
          if (overdueDays < threshold) {
            continue;
          }

          await this.internalTaskRepo.createEscalationIfAbsent(
            new InternalTask({
              id: randomUUID(),
              organizationId,
              receivableId: receivable.id,
              assignedToUserId: assignee.userId,
              createdByUserId: null,
              taskType: 'ESCALATION',
              title: `Overdue receivable by ${overdueDays} days requires action`,
              description: null,
              status: 'OPEN',
              createdAt: new Date(),
              resolvedAt: null,
            }),
          );
        }
      },
    );
  }

  private async resolveEscalationThreshold(customerId: string): Promise<number> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      return DEFAULT_ESCALATION_THRESHOLD_DAYS;
    }
    const policy = await this.reminderPolicyRepo.findByCustomerGroup(customer.customerGroup);
    return policy?.escalationThresholdDays ?? DEFAULT_ESCALATION_THRESHOLD_DAYS;
  }
}
```

`IReminderPolicyRepository` is injected with the string token `'IReminderPolicyRepository'`, matching how `RemindersModule` already provides/exports it (see that module's `providers`/`exports` arrays) — not a `Symbol`, because this plan does not modify that existing token style.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test run-escalation-scan.usecase.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 8: Subscribe the escalation participant to the Reminder Automation completion event**

Do not create `EscalationCronProcessor`, `EscalationSchedulerService`, or a second BullMQ repeatable queue. Create `infrastructure/reminder-scan-completed.listener.ts` (in `infrastructure/`, not `application/` — matching `CollectionActivityListener`/`ReminderExecutionListener`'s existing placement):

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RunEscalationScanUseCase } from '../application/run-escalation-scan.usecase';

export interface ReminderScanCompletedPayload {
  organizationId: string;
  scanDate: string;
}

@Injectable()
export class ReminderScanCompletedListener {
  constructor(private readonly runEscalationScan: RunEscalationScanUseCase) {}

  @OnEvent('reminder.scan.completed')
  async handle(payload: ReminderScanCompletedPayload): Promise<void> {
    await this.runEscalationScan.scanOrganization(payload.organizationId);
  }
}
```

Add `infrastructure/reminder-scan-completed.listener.spec.ts` that calls `handle({ organizationId: 'org-1', scanDate: '2026-08-03' })` and asserts the use case receives `org-1`. The use case itself reopens tenant context, so the listener does not rely on the emitter preserving async-local state.

- [ ] **Step 9: Register module providers and imports**

Register `RunEscalationScanUseCase`, `ReminderScanCompletedListener`, `InternalTask` repository in `InternalTasksModule`'s `providers`. Add `RemindersModule` (for `'IReminderPolicyRepository'`), `CustomersModule` (for `CUSTOMER_REPOSITORY`), `OrganizationsModule`, and `ReceivablesModule` to its `imports` — all one-way, no `forwardRef()` needed since none of those modules import `InternalTasksModule` back. No `BullModule.registerQueue` belongs to this module.

- [ ] **Step 10: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/internal-tasks apps/backend/src/modules/reminders apps/backend/src/database/migrations
git commit -m "feat: add per-customerGroup escalation threshold and internal task escalation scan"
```

---

### Task 7: `CreateManualTaskUseCase`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts`

**Interfaces:**
- Consumes: `IInternalTaskRepository` (Task 2), `IReceivableRepository` (existing), `IMembershipRepository.findByUserAndOrganization()` (existing — validates `assignedToUserId`), `TenantContextService`
- Produces: `CreateManualTaskUseCase.execute(input)`, used by Task 9's controller

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts`:

```typescript
import { AppError } from '../../../common/errors/app-error';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Membership, Role } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { CreateManualTaskUseCase } from './create-manual-task.usecase';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
  });
}

function buildMembership(userId: string): Membership {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId,
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  });
}

describe('CreateManualTaskUseCase', () => {
  it('creates a MANUAL task for an existing receivable when the assignee is a member of the organization', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()) };
    const membershipRepo = { findByUserAndOrganization: jest.fn().mockResolvedValue(buildMembership('user-2')) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(
      internalTaskRepo as any, receivableRepo as any, membershipRepo as any, tenantContext as any,
    );

    const task = await useCase.execute({
      receivableId: 'rec-1',
      assignedToUserId: 'user-2',
      title: 'Call customer to remind them',
      description: 'Customer promised to pay next week',
      createdByUserId: 'user-3',
    });

    expect(task.taskType).toBe('MANUAL');
    expect(task.status).toBe('OPEN');
    expect(task.organizationId).toBe('org-1');
    expect(internalTaskRepo.save).toHaveBeenCalledWith(task);
  });

  it('throws when the receivable does not exist', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null) };
    const membershipRepo = { findByUserAndOrganization: jest.fn().mockResolvedValue(buildMembership('user-2')) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(
      internalTaskRepo as any, receivableRepo as any, membershipRepo as any, tenantContext as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'missing',
        assignedToUserId: 'user-2',
        title: 'x',
        description: null,
        createdByUserId: 'user-3',
      }),
    ).rejects.toThrow(AppError);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('throws when assignedToUserId is not a member of the organization', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()) };
    const membershipRepo = { findByUserAndOrganization: jest.fn().mockResolvedValue(null) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(
      internalTaskRepo as any, receivableRepo as any, membershipRepo as any, tenantContext as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'rec-1',
        assignedToUserId: 'not-a-member',
        title: 'x',
        description: null,
        createdByUserId: 'user-3',
      }),
    ).rejects.toThrow(AppError);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('validates the default assignee (the creator) the same way as an explicit one', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()) };
    const membershipRepo = { findByUserAndOrganization: jest.fn().mockResolvedValue(buildMembership('user-3')) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(
      internalTaskRepo as any, receivableRepo as any, membershipRepo as any, tenantContext as any,
    );

    const task = await useCase.execute({
      receivableId: 'rec-1',
      title: 'x',
      description: null,
      createdByUserId: 'user-3',
    });

    expect(task.assignedToUserId).toBe('user-3');
    expect(membershipRepo.findByUserAndOrganization).toHaveBeenCalledWith('user-3', 'org-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test create-manual-task.usecase.spec.ts`
Expected: FAIL — Cannot find module './create-manual-task.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

export interface CreateManualTaskInput {
  receivableId: string;
  assignedToUserId?: string;
  title: string;
  description: string | null;
  dueDate?: Date | null;
  createdByUserId: string;
}

@Injectable()
export class CreateManualTaskUseCase {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateManualTaskInput): Promise<InternalTask> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(ErrorCode.RECEIVABLE_NOT_FOUND, 'Không tìm thấy khoản phải thu.');
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const assignedToUserId = input.assignedToUserId ?? input.createdByUserId;
    const assigneeMembership = await this.membershipRepo.findByUserAndOrganization(
      assignedToUserId,
      organizationId,
    );
    if (!assigneeMembership) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Người được giao việc không thuộc tổ chức này.',
      );
    }

    const task = new InternalTask({
      id: randomUUID(),
      organizationId,
      receivableId: input.receivableId,
      assignedToUserId,
      createdByUserId: input.createdByUserId,
      taskType: 'MANUAL',
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
      createdAt: new Date(),
      resolvedAt: null,
    });

    await this.internalTaskRepo.save(task);
    return task;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test create-manual-task.usecase.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts
git commit -m "feat: add CreateManualTaskUseCase with assignee membership validation"
```

---

### Task 8: `ResolveTaskUseCase` + `DismissTaskUseCase` (assignee-or-OWNER only)

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.spec.ts`
- Create: `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.spec.ts`

**Interfaces:**
- Consumes: `IInternalTaskRepository` (Task 2), `InternalTask.resolve()`/`dismiss()` (Task 1)
- Produces: `ResolveTaskUseCase.execute(taskId, actor)`, `DismissTaskUseCase.execute(taskId, actor)` — `actor: { userId: string; role: Role }` — used by Task 9's controller. `PermissionGuard`/`RequirePermission(Permission.INTERNAL_TASK_MANAGE)` only proves the caller can act on *some* task; per-instance ownership (is this caller allowed to act on *this* task) is a resource-ownership check the role-based guard cannot express, so it lives here in the use case, not the controller decorator.

- [ ] **Step 1: Write failing test for `ResolveTaskUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.spec.ts`:

```typescript
import { AppError } from '../../../common/errors/app-error';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { ResolveTaskUseCase } from './resolve-task.usecase';

function buildOpenTask(assignedToUserId = 'user-1'): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId,
    createdByUserId: null,
    taskType: 'ESCALATION',
    title: 'Overdue receivable by 30 days requires action',
    description: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
  });
}

describe('ResolveTaskUseCase', () => {
  it('resolves an OPEN task when the actor is the assignee', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1', { userId: 'user-1', role: Role.ACCOUNTANT });

    expect(result.status).toBe('DONE');
    expect(internalTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DONE' }));
  });

  it('resolves an OPEN task when the actor is OWNER, even if not the assignee', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1', { userId: 'owner-1', role: Role.OWNER });

    expect(result.status).toBe('DONE');
  });

  it('rejects a non-assignee, non-OWNER actor', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    await expect(
      useCase.execute('task-1', { userId: 'user-2', role: Role.FINANCE_MANAGER }),
    ).rejects.toThrow(AppError);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the task does not exist', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    await expect(
      useCase.execute('missing', { userId: 'user-1', role: Role.ACCOUNTANT }),
    ).rejects.toThrow(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then create `ResolveTaskUseCase`**

Run: `pnpm --filter @casso-ledger/backend test resolve-task.usecase.spec.ts` → FAIL

Create `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

export interface TaskActor {
  userId: string;
  role: Role;
}

@Injectable()
export class ResolveTaskUseCase {
  constructor(@Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository) {}

  async execute(taskId: string, actor: TaskActor): Promise<InternalTask> {
    const task = await this.internalTaskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy công việc.');
    }
    if (task.assignedToUserId !== actor.userId && actor.role !== Role.OWNER) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Chỉ người được giao việc hoặc chủ tổ chức mới có thể xử lý công việc này.',
      );
    }
    const resolved = task.resolve();
    await this.internalTaskRepo.save(resolved);
    return resolved;
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test resolve-task.usecase.spec.ts` → all 4 tests PASS

- [ ] **Step 3: Write failing test for `DismissTaskUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.spec.ts` — mirror `resolve-task.usecase.spec.ts` exactly (assignee succeeds, OWNER succeeds, non-assignee/non-OWNER `FINANCE_MANAGER` rejected, missing task rejected), asserting `status: 'DISMISSED'` and importing `DismissTaskUseCase`:

```typescript
import { AppError } from '../../../common/errors/app-error';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { DismissTaskUseCase } from './dismiss-task.usecase';

function buildOpenTask(assignedToUserId = 'user-1'): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId,
    createdByUserId: null,
    taskType: 'MANUAL',
    title: 'Call customer to remind them',
    description: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
  });
}

describe('DismissTaskUseCase', () => {
  it('dismisses an OPEN task when the actor is the assignee', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1', { userId: 'user-1', role: Role.ACCOUNTANT });

    expect(result.status).toBe('DISMISSED');
  });

  it('dismisses an OPEN task when the actor is OWNER, even if not the assignee', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1', { userId: 'owner-1', role: Role.OWNER });

    expect(result.status).toBe('DISMISSED');
  });

  it('rejects a non-assignee, non-OWNER actor', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask('user-1')), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    await expect(
      useCase.execute('task-1', { userId: 'user-2', role: Role.FINANCE_MANAGER }),
    ).rejects.toThrow(AppError);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the task does not exist', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    await expect(
      useCase.execute('missing', { userId: 'user-1', role: Role.ACCOUNTANT }),
    ).rejects.toThrow(AppError);
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then create `DismissTaskUseCase`**

Run: `pnpm --filter @casso-ledger/backend test dismiss-task.usecase.spec.ts` → FAIL

Create `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.ts` — identical shape to `ResolveTaskUseCase`, calling `task.dismiss()` instead of `task.resolve()`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';
import type { TaskActor } from './resolve-task.usecase';

@Injectable()
export class DismissTaskUseCase {
  constructor(@Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository) {}

  async execute(taskId: string, actor: TaskActor): Promise<InternalTask> {
    const task = await this.internalTaskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy công việc.');
    }
    if (task.assignedToUserId !== actor.userId && actor.role !== Role.OWNER) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Chỉ người được giao việc hoặc chủ tổ chức mới có thể xử lý công việc này.',
      );
    }
    const dismissed = task.dismiss();
    await this.internalTaskRepo.save(dismissed);
    return dismissed;
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test dismiss-task.usecase.spec.ts` → all 4 tests PASS

- [ ] **Step 5: Register both use cases in `internal-tasks.module.ts`**

Modify `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts` — add `ResolveTaskUseCase`, `DismissTaskUseCase`, `CreateManualTaskUseCase` to `providers`.

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/internal-tasks
git commit -m "feat: add assignee-or-OWNER-scoped ResolveTaskUseCase and DismissTaskUseCase"
```

---

### Task 9: HTTP endpoints — `GET/POST /receivables/:id/tasks`, `POST /tasks/:id/resolve`, `POST /tasks/:id/dismiss`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/presentation/dto/create-manual-task.dto.ts`
- Create: `apps/backend/src/modules/internal-tasks/presentation/internal-tasks.controller.ts`
- Create: `apps/backend/src/modules/internal-tasks/application/list-receivable-tasks.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/list-receivable-tasks.usecase.spec.ts`
- Modify: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`

**Interfaces:**
- Consumes: `ListReceivableTasksUseCase`, `CreateManualTaskUseCase`, `ResolveTaskUseCase`, `DismissTaskUseCase` (Tasks 7-8), `JwtAuthGuard`/`PermissionGuard`/`Permission.RECEIVABLE_READ`/`Permission.INTERNAL_TASK_MANAGE`, `TenantContextService.getCurrentUser()` (existing — see `collection-activity.controller.ts`/`disputes.controller.ts` for the established pattern; this plan does not use `@Req()`)
- Produces: the four HTTP endpoints in the spec's section 3, used by the FE receivable detail and Task 11's integration test

- [ ] **Step 1: Create `ListReceivableTasksUseCase` and its focused test**

The use case calls `IInternalTaskRepository.findByReceivableId(receivableId)` and returns all tenant-scoped tasks newest first. It has no write permission or status filtering; `RECEIVABLE_READ` gates the HTTP route, while the repository enforces the current organization.

```typescript
@Injectable()
export class ListReceivableTasksUseCase {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository,
  ) {}

  execute(receivableId: string): Promise<InternalTask[]> {
    return this.internalTaskRepo.findByReceivableId(receivableId);
  }
}
```

Test that the use case delegates the receivable ID and returns the repository result.

- [ ] **Step 2: Create `apps/backend/src/modules/internal-tasks/presentation/dto/create-manual-task.dto.ts`**

```typescript
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateManualTaskDto {
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
```

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/presentation/internal-tasks.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CreateManualTaskUseCase } from '../application/create-manual-task.usecase';
import { ResolveTaskUseCase } from '../application/resolve-task.usecase';
import { DismissTaskUseCase } from '../application/dismiss-task.usecase';
import { ListReceivableTasksUseCase } from '../application/list-receivable-tasks.usecase';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InternalTasksController {
  constructor(
    private readonly listReceivableTasksUseCase: ListReceivableTasksUseCase,
    private readonly createManualTaskUseCase: CreateManualTaskUseCase,
    private readonly resolveTaskUseCase: ResolveTaskUseCase,
    private readonly dismissTaskUseCase: DismissTaskUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('receivables/:id/tasks')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('id') receivableId: string) {
    return this.listReceivableTasksUseCase.execute(receivableId);
  }

  @Post('receivables/:id/tasks')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async createManualTask(@Param('id') receivableId: string, @Body() dto: CreateManualTaskDto) {
    const currentUser = this.getCurrentUser();
    return this.createManualTaskUseCase.execute({
      receivableId,
      assignedToUserId: dto.assignedToUserId,
      title: dto.title,
      description: dto.description ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      createdByUserId: currentUser.userId,
    });
  }

  @Post('tasks/:id/resolve')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async resolve(@Param('id') id: string) {
    const currentUser = this.getCurrentUser();
    return this.resolveTaskUseCase.execute(id, { userId: currentUser.userId, role: currentUser.role });
  }

  @Post('tasks/:id/dismiss')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async dismiss(@Param('id') id: string) {
    const currentUser = this.getCurrentUser();
    return this.dismissTaskUseCase.execute(id, { userId: currentUser.userId, role: currentUser.role });
  }

  private getCurrentUser() {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return user;
  }
}
```

The `getCurrentUser()` private helper matches the existing pattern in `disputes.controller.ts` exactly (`JwtAuthGuard` guarantees a user in practice; this throws instead of silently continuing with `undefined` if that guarantee is ever violated).

Full paths (`receivables/:id/tasks`, `tasks/:id/resolve`, `tasks/:id/dismiss`) are set per-route with no shared `@Controller()` prefix, since the three routes live under two different resource roots (`/receivables/...` and `/tasks/...`) — the same simplest option as putting them in three separate one-route controllers, without three near-empty controller classes.

- [ ] **Step 4: Register the list use case and controller in `internal-tasks.module.ts`**

Modify `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts` — add `ListReceivableTasksUseCase` to `providers` and `InternalTasksController` to `controllers`.

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/internal-tasks
git commit -m "feat: expose task list/create/resolve/dismiss endpoints"
```

---

### Task 10: `CancelReceivableUseCase` + auto-dismiss on `receivable.status-closed`

**Verified against the actual codebase, not assumed** (2026-08-08 grilling pass): `WriteOffReceivableUseCase` exists today with a transactional `DataSource`/`AuditContextService` shape that is materially different from — and better than — the stale snippet an earlier draft of this task showed (that draft's `throw new Error('Receivable not found')` and 1-argument constructor do not match reality; ignore them). `CancelReceivableUseCase` and `POST /receivables/:id/cancel` **do not exist at all** — no file, no route — even though `Receivable.cancel()` (domain), `AuditActionType.RECEIVABLE_CANCEL`, and `ErrorCode.RECEIVABLE_HAS_PAYMENTS` all already exist, unused, clearly waiting for exactly this. This task builds `CancelReceivableUseCase` from scratch, mirroring `WriteOffReceivableUseCase` exactly.

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/infrastructure/receivable-closed.listener.ts`
- Test: `apps/backend/src/modules/internal-tasks/infrastructure/receivable-closed.listener.spec.ts`
- Modify: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts` — add `EVENT_PUBLISHER` emission
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`
- Create: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts` (did not exist)
- Create: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` — add `POST :id/cancel`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts` — also emit `receivable.status-closed`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEventPublisher`/`EVENT_PUBLISHER` (`common/events/event-publisher.port.ts`, existing — NOT `EventEmitter2` injected directly, see the Global Constraints correction), `IInternalTaskRepository` (Task 2), `Receivable.cancel()` (domain, existing)
- Produces: `@OnEvent('receivable.status-closed')` listener dismissing every `OPEN` `InternalTask` for a receivable; three emit call sites now cover all three terminal statuses — `AllocatePaymentUseCase` (PAID), `WriteOffReceivableUseCase` (WRITTEN_OFF), `CancelReceivableUseCase` (CANCELLED, new)

**Naming note:** this event is named `receivable.status-closed`, NOT `receivable.closed` — see ADR-0005 for the full reasoning. `receivable.closed` stays PAID-only and owned by Collection Activity Timeline; `AllocatePaymentUseCase` ends up emitting both, side by side, in the same `if (input.becameClosed)` block (Step 8 below).

- [ ] **Step 1: Write failing test for the listener**

Create `apps/backend/src/modules/internal-tasks/infrastructure/receivable-closed.listener.spec.ts`:

```typescript
import { InternalTask } from '../domain/internal-task';
import { ReceivableClosedListener } from './receivable-closed.listener';

function buildOpenTask(id: string): InternalTask {
  return new InternalTask({
    id,
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-1',
    createdByUserId: null,
    taskType: 'ESCALATION',
    title: 'x',
    description: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
  });
}

describe('ReceivableClosedListener', () => {
  it('dismisses every OPEN task for the receivable', async () => {
    const openTasks = [buildOpenTask('task-1'), buildOpenTask('task-2')];
    const internalTaskRepo = {
      findOpenByReceivableId: jest.fn().mockResolvedValue(openTasks),
      save: jest.fn(),
    };
    const tenantContext = { run: jest.fn((_user, callback) => callback()) };

    const listener = new ReceivableClosedListener(internalTaskRepo as any, tenantContext as any);

    await listener.handle({ receivableId: 'rec-1', organizationId: 'org-1' });

    expect(internalTaskRepo.save).toHaveBeenCalledTimes(2);
    expect(internalTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DISMISSED' }));
  });

  it('does nothing when there are no OPEN tasks', async () => {
    const internalTaskRepo = { findOpenByReceivableId: jest.fn().mockResolvedValue([]), save: jest.fn() };
    const tenantContext = { run: jest.fn((_user, callback) => callback()) };

    const listener = new ReceivableClosedListener(internalTaskRepo as any, tenantContext as any);

    await listener.handle({ receivableId: 'rec-1', organizationId: 'org-1' });

    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test receivable-closed.listener.spec.ts`
Expected: FAIL — Cannot find module './receivable-closed.listener'

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/infrastructure/receivable-closed.listener.ts`**

In `infrastructure/`, not `application/` — matching `CollectionActivityListener`/`ReminderExecutionListener`'s existing placement:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Role } from '../../organizations/domain/membership';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from '../application/internal-task-repository.port';

export interface ReceivableClosedPayload {
  receivableId: string;
  organizationId: string;
}

@Injectable()
export class ReceivableClosedListener {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('receivable.status-closed')
  async handle(payload: ReceivableClosedPayload): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId: payload.organizationId, role: Role.OWNER },
      async () => {
        const openTasks = await this.internalTaskRepo.findOpenByReceivableId(payload.receivableId);
        for (const task of openTasks) {
          await this.internalTaskRepo.save(task.dismiss());
        }
      },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test receivable-closed.listener.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Register the listener in `internal-tasks.module.ts`**

Modify `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts` — add `ReceivableClosedListener` to `providers`.

- [ ] **Step 6: Emit `receivable.status-closed` from `WriteOffReceivableUseCase`**

Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts` (the real current file — add an `EVENT_PUBLISHER` constructor param and emit once the transaction has committed, matching `AllocatePaymentUseCase`'s "emit only after commit" comment):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../common/events/event-publisher.port';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const updated = await this.dataSource.transaction(async (manager: EntityManager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(receivableId, manager);
      if (!receivable) {
        throw new AppError(
          ErrorCode.RECEIVABLE_NOT_FOUND,
          'Không tìm thấy khoản phải thu.',
        );
      }
      this.auditContext.setBefore(receivable);
      const next = receivable.writeOff();
      await this.receivableRepo.save(next, manager);
      return next;
    });

    await this.eventPublisher.emitAsync('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: updated.organizationId,
    });

    return updated;
  }
}
```

Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts` — add a 4th constructor argument (`eventPublisher`) to both existing test cases and one new assertion on the happy-path test:

```typescript
const eventPublisher = { emit: jest.fn(), emitAsync: jest.fn() };
const useCase = new WriteOffReceivableUseCase(
  receivableRepo as any, dataSource as any, auditContext as any, eventPublisher as any,
);
// ...
expect(eventPublisher.emitAsync).toHaveBeenCalledWith('receivable.status-closed', {
  receivableId: 'rec-1',
  organizationId: 'org-1',
});
```

- [ ] **Step 7: Create `CancelReceivableUseCase` and its test**

`Receivable.cancel()` (domain) throws a plain `Error` for two distinct conditions — wrong status, or `paidAmount > 0`. Check `paidAmount` explicitly before calling `cancel()` so the use case can map to the correct, already-existing `ErrorCode` without parsing the error message string:

Create `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

function buildOpenReceivable(paidAmount = 0): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

function buildDeps(receivable: Receivable | null) {
  const manager = {} as EntityManager;
  return {
    receivableRepo: { findByIdForUpdate: jest.fn().mockResolvedValue(receivable), save: jest.fn() },
    dataSource: { transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)) },
    auditContext: { setBefore: jest.fn() },
    eventPublisher: { emit: jest.fn(), emitAsync: jest.fn() },
    manager,
  };
}

describe('CancelReceivableUseCase', () => {
  it('cancels an OPEN receivable with no payments and emits receivable.status-closed', async () => {
    const receivable = buildOpenReceivable(0);
    const deps = buildDeps(receivable);
    const useCase = new CancelReceivableUseCase(
      deps.receivableRepo as any, deps.dataSource as any, deps.auditContext as any, deps.eventPublisher as any,
    );

    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.CANCELLED);
    expect(deps.receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.CANCELLED }),
      deps.manager,
    );
    expect(deps.eventPublisher.emitAsync).toHaveBeenCalledWith('receivable.status-closed', {
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('throws RECEIVABLE_HAS_PAYMENTS when the receivable has received a payment', async () => {
    const deps = buildDeps(buildOpenReceivable(10_000_000));
    const useCase = new CancelReceivableUseCase(
      deps.receivableRepo as any, deps.dataSource as any, deps.auditContext as any, deps.eventPublisher as any,
    );

    await expect(useCase.execute('rec-1')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS,
    });
    expect(deps.receivableRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the receivable does not exist', async () => {
    const deps = buildDeps(null);
    const useCase = new CancelReceivableUseCase(
      deps.receivableRepo as any, deps.dataSource as any, deps.auditContext as any, deps.eventPublisher as any,
    );

    await expect(useCase.execute('missing')).rejects.toThrow(AppError);
  });
});
```

Run: `pnpm --filter @casso-ledger/backend test cancel-receivable.usecase.spec.ts` → FAIL (module does not exist).

Create `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts` — mirrors `WriteOffReceivableUseCase` exactly:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../common/events/event-publisher.port';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const updated = await this.dataSource.transaction(async (manager: EntityManager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(receivableId, manager);
      if (!receivable) {
        throw new AppError(
          ErrorCode.RECEIVABLE_NOT_FOUND,
          'Không tìm thấy khoản phải thu.',
        );
      }
      if (receivable.paidAmount > 0) {
        throw new AppError(
          ErrorCode.RECEIVABLE_HAS_PAYMENTS,
          'Không thể hủy khoản phải thu đã nhận thanh toán.',
        );
      }
      this.auditContext.setBefore(receivable);
      const next = receivable.cancel(); // throws only the wrong-status case now — paidAmount already checked above
      await this.receivableRepo.save(next, manager);
      return next;
    });

    await this.eventPublisher.emitAsync('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: updated.organizationId,
    });

    return updated;
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test cancel-receivable.usecase.spec.ts` → all 3 tests PASS.

- [ ] **Step 8: Expose `POST /receivables/:id/cancel`**

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` — add a route mirroring the existing `write-off` route exactly, reusing `Permission.RECEIVABLE_WRITE_OFF` (cancelling is the same risk tier as writing off — a new receivable-terminating permission is not justified for one more action at the same tier) and the already-existing `AuditActionType.RECEIVABLE_CANCEL`:

```typescript
@Post(':id/cancel')
@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
@Audited(AuditActionType.RECEIVABLE_CANCEL, AuditEntityType.RECEIVABLE)
async cancel(
  @Param('id') id: string,
  @Headers('idempotency-key') key: string | undefined,
) {
  return this.idempotency.execute(
    `POST /receivables/${id}/cancel`,
    key,
    { id },
    async () => {
      const receivable = await this.cancelReceivableUseCase.execute(id);
      return toReceivableResponse(receivable);
    },
  );
}
```

Add `cancelReceivableUseCase: CancelReceivableUseCase` to the constructor and its import, matching `writeOffReceivableUseCase`'s existing wiring.

- [ ] **Step 9: Also emit `receivable.status-closed` from `AllocatePaymentUseCase`**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts` — its `emitAllocationEvents` method already emits `payment.allocated` always and `receivable.closed` when `input.becameClosed`; add `receivable.status-closed` alongside `receivable.closed` in that same `if` block:

```typescript
if (input.becameClosed) {
  await this.eventPublisher.emitAsync('receivable.closed', {
    receivableId: input.receivableId,
    customerId: input.customerId,
    organizationId: input.organizationId,
  });
  await this.eventPublisher.emitAsync('receivable.status-closed', {
    receivableId: input.receivableId,
    organizationId: input.organizationId,
  });
}
```

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts` — add one assertion to whichever existing test case allocates a payment that fully closes the receivable (`becameClosed: true`):

```typescript
expect(eventPublisher.emitAsync).toHaveBeenCalledWith('receivable.status-closed', {
  receivableId: 'rec-1',
  organizationId: 'org-1',
});
```

- [ ] **Step 10: Register `CancelReceivableUseCase` and `EVENT_PUBLISHER` in `receivables.module.ts`**

`EVENT_PUBLISHER` is not exported by any module `ReceivablesModule` imports — `disputes.module.ts`, `payments.module.ts`, and `reminders.module.ts` each provide it locally, and none list it in their `exports` array (confirmed by reading all three; this is an established per-module pattern, not an oversight to "fix" by exporting one of them). Add the same local provider `ReceivablesModule` needs, alongside `CancelReceivableUseCase`:

```typescript
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { CancelReceivableUseCase } from './application/cancel-receivable.usecase';

// in @Module({ providers: [...] }):
{ provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
CancelReceivableUseCase,
```

`WriteOffReceivableUseCase` (already a provider here) now also depends on `EVENT_PUBLISHER` (Step 6) — this same addition satisfies both.

- [ ] **Step 11: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/modules/internal-tasks apps/backend/src/modules/receivables apps/backend/src/modules/payments
git commit -m "feat: add CancelReceivableUseCase and auto-dismiss OPEN InternalTasks on any receivable closure"
```

---

### Task 11: Integration test — escalation cron creates a task assigned to the Finance Manager

**Files:**
- Create: `apps/backend/test/internal-task-escalation.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-10), real Postgres + Redis via testcontainers
- Produces: verified end-to-end proof that a `Receivable` overdue past `escalationThresholdDays` gets an `ESCALATION` `InternalTask` created and assigned to the org's `FINANCE_MANAGER` after the single daily reminder scan runs once

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/internal-task-escalation.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { Role } from '../src/modules/organizations/domain/membership';

describe('Internal Task Escalation (integration)', () => {
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
    process.env.JWT_SECRET = 'test-secret';
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

  it('creates an ESCALATION InternalTask assigned to the FINANCE_MANAGER when the daily scan completion event is emitted', async () => {
    const organizationId = randomUUID();
    const financeManagerUserId = randomUUID();
    const receivableId = randomUUID();

    // ponytail: seeding via raw SQL rather than through HTTP signup/create-receivable flows —
    // those flows belong to other plans (Authentication, Domain Core) not exercised here;
    // this is the smallest correct way to get rows this test needs into the DB.
    await dataSource.query(`INSERT INTO organizations (id, name, "createdAt") VALUES ($1, $2, now())`, [
      organizationId,
      'Acme Corp',
    ]);
    await dataSource.query(
      `INSERT INTO memberships (id, "organizationId", "userId", role, "invitedAt", "joinedAt", "createdAt")
       VALUES ($1, $2, $3, $4, now(), now(), now())`,
      [randomUUID(), organizationId, financeManagerUserId, Role.FINANCE_MANAGER],
    );

    const overdueDueDate = new Date();
    overdueDueDate.setDate(overdueDueDate.getDate() - 35);
    await dataSource.query(
      `INSERT INTO receivables
        (id, "organizationId", "customerId", "invoiceId", "originalAmount", "paidAmount", "dueDate", status, "salesRepresentativeId", "createdAt", "closedAt")
       VALUES ($1, $2, $3, NULL, $4, 0, $5, $6, $7, now(), NULL)`,
      [receivableId, organizationId, randomUUID(), 50_000_000, overdueDueDate, ReceivableStatus.OPEN, randomUUID()],
    );

    const eventEmitter = app.get(EventEmitter2);
    await eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: '2026-08-03',
    });

    const tasks = await dataSource.query(`SELECT * FROM internal_tasks WHERE "receivableId" = $1`, [receivableId]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe('ESCALATION');
    expect(tasks[0].status).toBe('OPEN');
    expect(tasks[0].assignedToUserId).toBe(financeManagerUserId);
    expect(tasks[0].organizationId).toBe(organizationId);
  });

  it('does not create a second ESCALATION task on a repeated daily scan', async () => {
    const organizationId = randomUUID();
    const financeManagerUserId = randomUUID();
    const receivableId = randomUUID();

    await dataSource.query(`INSERT INTO organizations (id, name, "createdAt") VALUES ($1, $2, now())`, [
      organizationId,
      'Beta Corp',
    ]);
    await dataSource.query(
      `INSERT INTO memberships (id, "organizationId", "userId", role, "invitedAt", "joinedAt", "createdAt")
       VALUES ($1, $2, $3, $4, now(), now(), now())`,
      [randomUUID(), organizationId, financeManagerUserId, Role.FINANCE_MANAGER],
    );

    const overdueDueDate = new Date();
    overdueDueDate.setDate(overdueDueDate.getDate() - 40);
    await dataSource.query(
      `INSERT INTO receivables
        (id, "organizationId", "customerId", "invoiceId", "originalAmount", "paidAmount", "dueDate", status, "salesRepresentativeId", "createdAt", "closedAt")
       VALUES ($1, $2, $3, NULL, $4, 0, $5, $6, $7, now(), NULL)`,
      [receivableId, organizationId, randomUUID(), 20_000_000, overdueDueDate, ReceivableStatus.PARTIALLY_PAID, randomUUID()],
    );

    const eventEmitter = app.get(EventEmitter2);
    await eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: '2026-08-03',
    });
    await eventEmitter.emitAsync('reminder.scan.completed', {
      organizationId,
      scanDate: '2026-08-03',
    });

    const tasks = await dataSource.query(`SELECT * FROM internal_tasks WHERE "receivableId" = $1`, [receivableId]);

    expect(tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:integration -- internal-task-escalation.integration.spec.ts`
Expected: both tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/internal-task-escalation.integration.spec.ts
git commit -m "test: add integration coverage for the InternalTask escalation scan"
```

---

## Self-Review Notes

- **Scheduler ownership and event contract reconciled:** Reminder Automation owns the single daily BullMQ scan and emits `reminder.scan.completed`; `ReminderScanCompletedListener` is the only bridge into this module for that event. This plan does not create a second scheduler or a second daily scan — it does, however, import `RemindersModule` and `CustomersModule` for repository access (see the next bullet and the Global Constraints correction).
- **Escalation race closed:** the old read-then-save path was not safe when two event deliveries overlapped. `InternalTaskOrmEntity` now has a partial unique index for `(organizationId, receivableId)` where `taskType = ESCALATION AND status = OPEN`, and `createEscalationIfAbsent()` uses one insert and treats PostgreSQL `23505` as the expected losing scan.
- **Background tenant setup is explicit:** the event listener passes only the organization payload; `RunEscalationScanUseCase` itself opens `TenantContextService.run({ userId: 'system', organizationId, role: Role.OWNER }, ...)` before any membership, receivable, customer, policy, or task repository call. Tests cover that constructor and callback contract.
- **`receivable.status-closed` vs `receivable.closed` — see ADR-0005.** Distinct, deliberately-named events per audience rather than widening `receivable.closed` out from under Collection Activity Timeline's PAID-only contract. All three terminal-status call sites emit `receivable.status-closed`: `AllocatePaymentUseCase` (PAID, Task 10 Step 9), `WriteOffReceivableUseCase` (WRITTEN_OFF, Task 10 Step 6), and the newly-built `CancelReceivableUseCase` (CANCELLED, Task 10 Step 7).

**2026-08-08 grilling pass — the four corrections below supersede the plan's original MVP defaults; see the Global Constraints section for the authoritative summary:**

- **`escalationThresholdDays` is configurable per `ReminderPolicy`/`customerGroup`, not hardcoded** (Task 6). Resolves spec section 5's first open question. Falls back to `DEFAULT_ESCALATION_THRESHOLD_DAYS = 30` when a customer has no matching active policy.
- **Escalation assignee falls back to `OWNER`, never skips silently** (Task 6) — replacing the original "skip when no FINANCE_MANAGER" default. No in-app notification for this case; see the design spec section 4 for why.
- **Resolve/dismiss is assignee-or-OWNER only, not any `INTERNAL_TASK_MANAGE` holder** (Task 8) — resolves spec section 5's second open question in the *stricter* direction than the original draft chose. `Permission.INTERNAL_TASK_MANAGE` still gates list/create; the assignee check is a separate, per-instance ownership check the role-based permission cannot express.
- **`assignedToUserId` on manual task creation is validated against organization membership** (Task 7) — was previously accepted unchecked.
- **`CancelReceivableUseCase` did not exist and is built by this plan** (Task 10) — the original draft's Step 7/8 assumed both `CancelReceivableUseCase` and `AllocatePaymentUseCase`'s `receivable.status-closed` emission already existed elsewhere. Neither did; both are now built/added directly in Task 10, verified against the actual current codebase rather than assumed from an older plan's claims.
- **Application-layer exceptions and event publishing corrected to match `AGENTS.md`.** Earlier drafts of Tasks 6, 7, 8, and 10 threw `NotFoundException`/`BadRequestException` from `application/` and injected `EventEmitter2` directly — both forbidden. Fixed to `AppError` and the `IEventPublisher` port throughout; `@OnEvent` listeners moved to `infrastructure/` to match the only two existing precedents (`CollectionActivityListener`, `ReminderExecutionListener`).
- **New permission, justified.** `Permission.INTERNAL_TASK_MANAGE` (Task 5) was added rather than reusing `RECEIVABLE_WRITE`, because editing a receivable's own fields and managing its side-table of assignable follow-up tasks are different capabilities — a role that can write receivables should not automatically be able to silently resolve another user's escalation task.
- **Spec coverage:** `InternalTask` entity (spec section 1) → Task 1-2. Auto-escalation with per-customerGroup threshold and OWNER fallback (section 2) → Tasks 3, 4, 6. Manual create with assignee validation + assignee-or-OWNER resolve/dismiss (section 3) → Tasks 7-9. Auto-dismiss on closed status, all three terminal statuses (section 3, last paragraph) → Task 10. Out-of-scope items (section 4: no auto-block on new receivables for a flagged customer, no separate push/Slack channel, no in-app notification system) are not implemented, matching the spec.


