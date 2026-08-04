# Internal Task & Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `InternalTask` (assignable follow-up items on a `Receivable`) with read and write paths: (1) list tasks via `GET /receivables/:id/tasks`, (2) escalation evaluation subscribed to the Reminder Automation daily scan event, (3) manual creation via `POST /receivables/:id/tasks`, (4) resolve/dismiss via `POST /tasks/:id/resolve` and `POST /tasks/:id/dismiss`, plus (5) an auto-dismiss listener that closes any `OPEN` task when its `Receivable` transitions to `PAID`/`WRITTEN_OFF`/`CANCELLED`.

**Architecture:** The Reminder Automation scheduler emits `reminder.scan.completed` after reminder candidates are evaluated. `ReminderScanCompletedListener` subscribes to that event and invokes `RunEscalationScanUseCase`, which opens its own explicit tenant scope because event handlers do not rely on ambient async context. Manual create/resolve/dismiss are plain use cases behind `JwtAuthGuard` + `PermissionGuard`. The auto-dismiss path listens for `receivable.status-closed`, emitted for every terminal status; `receivable.closed` remains the narrower PAID-only event owned by Collection Activity.

**Tech Stack:** `@nestjs/event-emitter` (already installed by the dispute-management plan — reused, not reinstalled), TypeORM, Jest + testcontainers. BullMQ scheduling is owned by Reminder Automation; this module does not register another queue.

## Global Constraints

- **This plan shares the Reminder Automation scan contract:** the reminder scheduler owns the daily candidate scan and emits `reminder.scan.completed` with `{ organizationId, scanDate }`; `ReminderScanCompletedListener` consumes it and runs only escalation-specific rules. Do not create a second daily scan/queue, import `RemindersModule`, or make the reminder scheduler know this module's use case.
- `escalationThresholdDays` is hardcoded to `30` (spec section 5's first open question is left unresolved at MVP; not configurable per `ReminderPolicy`/`customerGroup`).
- Any authenticated user holding `Permission.INTERNAL_TASK_MANAGE` (granted to `FINANCE_MANAGER` and `ACCOUNTANT`, per spec section 3's `Permissions: FINANCE_MANAGER, ACCOUNTANT`) may resolve or dismiss *any* task in their organization — spec section 5's second open question (restrict to `assignedToUserId`/`OWNER` only) is resolved this way for MVP, simplest option, revisit if abuse becomes a problem.
- `receivable.status-closed` is the broad terminal-state event consumed here. `receivable.closed` is reserved for Collection Activity's PAID-only timeline event.
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
      application/reminder-scan-completed.listener.ts
      application/reminder-scan-completed.listener.spec.ts
      application/create-manual-task.usecase.ts
      application/create-manual-task.usecase.spec.ts
      application/resolve-task.usecase.ts
      application/resolve-task.usecase.spec.ts
      application/dismiss-task.usecase.ts
      application/dismiss-task.usecase.spec.ts
      application/list-receivable-tasks.usecase.ts
      application/list-receivable-tasks.usecase.spec.ts
      application/receivable-closed.listener.ts
      application/receivable-closed.listener.spec.ts
      presentation/dto/create-manual-task.dto.ts
      presentation/internal-tasks.controller.ts
      internal-tasks.module.ts
    organizations/
      application/membership-repository.port.ts                  -- MODIFY: add findFirstByRole()
      infrastructure/typeorm-membership.repository.ts             -- MODIFY: add findFirstByRole()
    receivables/
      application/receivable-repository.port.ts                  -- MODIFY: add findOverdueByThreshold()
      infrastructure/typeorm-receivable.repository.ts             -- MODIFY: add findOverdueByThreshold()
      application/write-off-receivable.usecase.ts                 -- MODIFY: emit 'receivable.status-closed'
      application/write-off-receivable.usecase.spec.ts            -- MODIFY: new constructor args
      application/cancel-receivable.usecase.ts                    -- MODIFY: emit 'receivable.status-closed'
      application/cancel-receivable.usecase.spec.ts               -- MODIFY: new constructor args
    payments/                                                     -- NOT modified by this plan; see Task 10 Step 8
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

### Task 6: Escalation participant — `RunEscalationScanUseCase`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.spec.ts`
- Modify: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`

**Interfaces:**
- Consumes: `IMembershipRepository.findFirstByRole()` (Task 3), `IReceivableRepository.findOverdueByThreshold()` (Task 4), `IInternalTaskRepository.createEscalationIfAbsent()` (Task 2), and `TenantContextService`
- Produces: `RunEscalationScanUseCase.scanOrganization(organizationId)` — called by `ReminderScanCompletedListener` after the reminder scheduler emits `reminder.scan.completed`; no second queue and no Reminder→InternalTasks import.

- [ ] **Step 1: Write failing test for `RunEscalationScanUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.spec.ts`:

```typescript
import { Role } from '../../organizations/domain/membership';
import { Membership } from '../../organizations/domain/membership';
import { Receivable } from '../../receivables/domain/receivable';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { RunEscalationScanUseCase } from './run-escalation-scan.usecase';

function buildFinanceManager(organizationId: string): Membership {
  return new Membership({
    id: 'mem-1',
    organizationId,
    userId: 'fm-user-1',
    role: Role.FINANCE_MANAGER,
    invitedAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  });
}

function buildOverdueReceivable(id: string, organizationId: string): Receivable {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - 35);
  return new Receivable({
    id,
    organizationId,
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

describe('RunEscalationScanUseCase', () => {
  it('creates an ESCALATION task assigned to the FINANCE_MANAGER for an overdue receivable with no existing task', async () => {
    const financeManager = buildFinanceManager('org-1');
    const receivable = buildOverdueReceivable('rec-1', 'org-1');

    const membershipRepo = { findFirstByRole: jest.fn().mockResolvedValue(financeManager) };
    const receivableRepo = { findOverdueByThreshold: jest.fn().mockResolvedValue([receivable]) };
    const internalTaskRepo = {
      createEscalationIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    };
    const tenantContext = { run: jest.fn((_context, callback) => callback()) };

    const useCase = new RunEscalationScanUseCase(
      membershipRepo as any,
      receivableRepo as any,
      internalTaskRepo as any,
      tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(tenantContext.run).toHaveBeenCalledWith(
      { userId: 'system', organizationId: 'org-1', role: Role.OWNER },
      expect.any(Function),
    );
    expect(internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        assignedToUserId: 'fm-user-1',
        taskType: 'ESCALATION',
        status: 'OPEN',
        createdByUserId: null,
      }),
    );
  });

  it('loses safely when another scan inserts the OPEN ESCALATION task first', async () => {
    const financeManager = buildFinanceManager('org-1');
    const receivable = buildOverdueReceivable('rec-1', 'org-1');

    const membershipRepo = { findFirstByRole: jest.fn().mockResolvedValue(financeManager) };
    const receivableRepo = { findOverdueByThreshold: jest.fn().mockResolvedValue([receivable]) };
    const internalTaskRepo = {
      createEscalationIfAbsent: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    };
    const tenantContext = { run: jest.fn((_context, callback) => callback()) };

    const useCase = new RunEscalationScanUseCase(
      membershipRepo as any,
      receivableRepo as any,
      internalTaskRepo as any,
      tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(internalTaskRepo.createEscalationIfAbsent).toHaveBeenCalledTimes(1);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('skips an organization that has no FINANCE_MANAGER membership', async () => {
    const receivable = buildOverdueReceivable('rec-1', 'org-1');

    const membershipRepo = { findFirstByRole: jest.fn().mockResolvedValue(null) };
    const receivableRepo = { findOverdueByThreshold: jest.fn().mockResolvedValue([receivable]) };
    const internalTaskRepo = {
      createEscalationIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    };
    const tenantContext = { run: jest.fn((_context, callback) => callback()) };

    const useCase = new RunEscalationScanUseCase(
      membershipRepo as any,
      receivableRepo as any,
      internalTaskRepo as any,
      tenantContext as any,
    );

    await useCase.scanOrganization('org-1');

    expect(internalTaskRepo.createEscalationIfAbsent).not.toHaveBeenCalled();
    expect(receivableRepo.findOverdueByThreshold).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test run-escalation-scan.usecase.spec.ts`
Expected: FAIL — Cannot find module './run-escalation-scan.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/application/run-escalation-scan.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';
import { InternalTask } from '../domain/internal-task';
import { Role } from '../../organizations/domain/membership';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ESCALATION_THRESHOLD_DAYS = 30; // ponytail: fixed MVP threshold; make per-policy only when product needs it

function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY);
}

@Injectable()
export class RunEscalationScanUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: IMembershipRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async scanOrganization(organizationId: string): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const financeManager = await this.membershipRepo.findFirstByRole(organizationId, Role.FINANCE_MANAGER);
        // ponytail: no fallback assignee when an org has no FINANCE_MANAGER yet — skip silently.
        // Add a fallback (e.g. assign to OWNER) if this proves to happen often in practice.
        if (!financeManager) {
          return;
        }

        const overdueReceivables = await this.receivableRepo.findOverdueByThreshold(
          organizationId,
          ESCALATION_THRESHOLD_DAYS,
        );

        const today = new Date();
        for (const receivable of overdueReceivables) {
          const overdueDays = daysOverdue(receivable.dueDate, today);
          await this.internalTaskRepo.createEscalationIfAbsent(
            new InternalTask({
              id: randomUUID(),
              organizationId,
              receivableId: receivable.id,
              assignedToUserId: financeManager.userId,
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
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test run-escalation-scan.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 6: Subscribe the escalation participant to the Reminder Automation completion event**

Do not create `EscalationCronProcessor`, `EscalationSchedulerService`, or a second BullMQ repeatable queue. Create `application/reminder-scan-completed.listener.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RunEscalationScanUseCase } from './run-escalation-scan.usecase';

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

Add `reminder-scan-completed.listener.spec.ts` that calls `handle({ organizationId: 'org-1', scanDate: '2026-08-03' })` and asserts the use case receives `org-1`. The use case itself reopens tenant context, so the listener does not rely on the emitter preserving async-local state.

- [ ] **Step 7: Register module providers**

Register `RunEscalationScanUseCase`, `ReminderScanCompletedListener`, `InternalTask` repository, `OrganizationsModule` and `ReceivablesModule` in `InternalTasksModule`. Do not import `RemindersModule`; the listener subscribes to the event name only, so the dependency is one-way and no `forwardRef()` cycle is required. No `BullModule.registerQueue` belongs to this module.

- [ ] **Step 8: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/internal-tasks
git commit -m "feat: add internal task escalation to reminder scan"
```

---

### Task 7: `CreateManualTaskUseCase`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts`

**Interfaces:**
- Consumes: `IInternalTaskRepository` (Task 2), `IReceivableRepository` (existing), `TenantContextService`
- Produces: `CreateManualTaskUseCase.execute(input)`, used by Task 9's controller

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { ReceivableStatus } from '@casso-ledger/shared-types';
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

describe('CreateManualTaskUseCase', () => {
  it('creates a MANUAL task for an existing receivable', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(buildReceivable()) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(internalTaskRepo as any, receivableRepo as any, tenantContext as any);

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

  it('throws NotFoundException when the receivable does not exist', async () => {
    const internalTaskRepo = { save: jest.fn() };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null) };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateManualTaskUseCase(internalTaskRepo as any, receivableRepo as any, tenantContext as any);

    await expect(
      useCase.execute({
        receivableId: 'missing',
        assignedToUserId: 'user-2',
        title: 'x',
        description: null,
        createdByUserId: 'user-3',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(internalTaskRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test create-manual-task.usecase.spec.ts`
Expected: FAIL — Cannot find module './create-manual-task.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts`**

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

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
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateManualTaskInput): Promise<InternalTask> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    const task = new InternalTask({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      receivableId: input.receivableId,
      assignedToUserId: input.assignedToUserId ?? input.createdByUserId,
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
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.ts apps/backend/src/modules/internal-tasks/application/create-manual-task.usecase.spec.ts
git commit -m "feat: add CreateManualTaskUseCase"
```

---

### Task 8: `ResolveTaskUseCase` + `DismissTaskUseCase`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.spec.ts`
- Create: `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.spec.ts`

**Interfaces:**
- Consumes: `IInternalTaskRepository` (Task 2), `InternalTask.resolve()`/`dismiss()` (Task 1)
- Produces: `ResolveTaskUseCase.execute(taskId)`, `DismissTaskUseCase.execute(taskId)`, used by Task 9's controller

- [ ] **Step 1: Write failing test for `ResolveTaskUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { InternalTask } from '../domain/internal-task';
import { ResolveTaskUseCase } from './resolve-task.usecase';

function buildOpenTask(): InternalTask {
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
  });
}

describe('ResolveTaskUseCase', () => {
  it('resolves an OPEN task and persists it', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask()), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1');

    expect(result.status).toBe('DONE');
    expect(internalTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DONE' }));
  });

  it('throws NotFoundException when the task does not exist', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const useCase = new ResolveTaskUseCase(internalTaskRepo as any);

    await expect(useCase.execute('missing')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then create `ResolveTaskUseCase`**

Run: `pnpm --filter @casso-ledger/backend test resolve-task.usecase.spec.ts` → FAIL

Create `apps/backend/src/modules/internal-tasks/application/resolve-task.usecase.ts`:

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

@Injectable()
export class ResolveTaskUseCase {
  constructor(@Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository) {}

  async execute(taskId: string): Promise<InternalTask> {
    const task = await this.internalTaskRepo.findById(taskId);
    if (!task) {
      throw new NotFoundException('Internal task not found');
    }
    const resolved = task.resolve();
    await this.internalTaskRepo.save(resolved);
    return resolved;
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test resolve-task.usecase.spec.ts` → both tests PASS

- [ ] **Step 3: Write failing test for `DismissTaskUseCase`**

Create `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { InternalTask } from '../domain/internal-task';
import { DismissTaskUseCase } from './dismiss-task.usecase';

function buildOpenTask(): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-1',
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
  it('dismisses an OPEN task and persists it', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(buildOpenTask()), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    const result = await useCase.execute('task-1');

    expect(result.status).toBe('DISMISSED');
    expect(internalTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DISMISSED' }));
  });

  it('throws NotFoundException when the task does not exist', async () => {
    const internalTaskRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const useCase = new DismissTaskUseCase(internalTaskRepo as any);

    await expect(useCase.execute('missing')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then create `DismissTaskUseCase`**

Run: `pnpm --filter @casso-ledger/backend test dismiss-task.usecase.spec.ts` → FAIL

Create `apps/backend/src/modules/internal-tasks/application/dismiss-task.usecase.ts`:

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InternalTask } from '../domain/internal-task';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

@Injectable()
export class DismissTaskUseCase {
  constructor(@Inject(INTERNAL_TASK_REPOSITORY) private readonly internalTaskRepo: IInternalTaskRepository) {}

  async execute(taskId: string): Promise<InternalTask> {
    const task = await this.internalTaskRepo.findById(taskId);
    if (!task) {
      throw new NotFoundException('Internal task not found');
    }
    const dismissed = task.dismiss();
    await this.internalTaskRepo.save(dismissed);
    return dismissed;
  }
}
```

Run: `pnpm --filter @casso-ledger/backend test dismiss-task.usecase.spec.ts` → both tests PASS

- [ ] **Step 5: Register both use cases in `internal-tasks.module.ts`**

Modify `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts` — add `ResolveTaskUseCase`, `DismissTaskUseCase`, `CreateManualTaskUseCase` to `providers`.

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/internal-tasks
git commit -m "feat: add ResolveTaskUseCase and DismissTaskUseCase"
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
- Consumes: `ListReceivableTasksUseCase`, `CreateManualTaskUseCase`, `ResolveTaskUseCase`, `DismissTaskUseCase` (Tasks 7-8), `JwtAuthGuard`/`PermissionGuard`/`Permission.RECEIVABLE_READ`/`Permission.INTERNAL_TASK_MANAGE`
- Produces: the four HTTP endpoints in the spec's section 3, used by the FE receivable detail and Task 10's integration test

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
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
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
  ) {}

  @Get('receivables/:id/tasks')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('id') receivableId: string) {
    return this.listReceivableTasksUseCase.execute(receivableId);
  }

  @Post('receivables/:id/tasks')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async createManualTask(@Param('id') receivableId: string, @Body() dto: CreateManualTaskDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    return this.createManualTaskUseCase.execute({
      receivableId,
      assignedToUserId: dto.assignedToUserId,
      title: dto.title,
      description: dto.description ?? null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      createdByUserId: user.userId,
    });
  }

  @Post('tasks/:id/resolve')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async resolve(@Param('id') id: string) {
    return this.resolveTaskUseCase.execute(id);
  }

  @Post('tasks/:id/dismiss')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async dismiss(@Param('id') id: string) {
    return this.dismissTaskUseCase.execute(id);
  }
}
```

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

### Task 10: Auto-dismiss on `receivable.status-closed`

**Files:**
- Create: `apps/backend/src/modules/internal-tasks/application/receivable-closed.listener.ts`
- Test: `apps/backend/src/modules/internal-tasks/application/receivable-closed.listener.spec.ts`
- Modify: `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`
- Modify: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts`
- (No changes to `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts` — already emits `receivable.status-closed` per `2026-08-03-collection-activity-timeline.md` Task 5; see Step 8 below)

**Interfaces:**
- Consumes: `EventEmitter2` (already installed and `EventEmitterModule.forRoot()`-registered by the dispute-management plan — reused, not reinstalled), `IInternalTaskRepository` (Task 2)
- Produces: `@OnEvent('receivable.status-closed')` listener dismissing every `OPEN` `InternalTask` for a receivable; two emit call sites (the third, in `AllocatePaymentUseCase`, is added by `2026-08-03-collection-activity-timeline.md` Task 5 — see Step 8 below)

**Naming note:** this event is named `receivable.status-closed`, NOT `receivable.closed`. `2026-08-03-collection-activity-timeline.md` already owns `receivable.closed`, scoped narrowly to "became `PAID`" (matching its own spec's "Receivable.status → PAID" rule exactly — it does not fire on `WRITTEN_OFF`/`CANCELLED`). This plan needs a broader trigger (any of the three terminal statuses), so it defines its own, distinctly-named event rather than overloading the other plan's narrower one. `AllocatePaymentUseCase` (the one file both plans touch) ends up emitting BOTH events side by side when a payment fully pays off a receivable — see Step 8.

- [ ] **Step 1: Write failing test for the listener**

Create `apps/backend/src/modules/internal-tasks/application/receivable-closed.listener.spec.ts`:

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

- [ ] **Step 3: Create `apps/backend/src/modules/internal-tasks/application/receivable-closed.listener.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Role } from '../../organizations/domain/membership';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { IInternalTaskRepository, INTERNAL_TASK_REPOSITORY } from './internal-task-repository.port';

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

This event name/payload shape (`'receivable.status-closed'`, `{ receivableId, organizationId }`) is **defined by this plan** — see the Naming note above for why it's distinct from `2026-08-03-collection-activity-timeline.md`'s `receivable.closed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test receivable-closed.listener.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Register the listener in `internal-tasks.module.ts`**

Modify `apps/backend/src/modules/internal-tasks/internal-tasks.module.ts` — add `ReceivableClosedListener` to `providers`.

- [ ] **Step 6: Emit `receivable.status-closed` from `WriteOffReceivableUseCase`**

Replace `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const receivable = await this.receivableRepo.findById(receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
    }
    const updated = receivable.writeOff();
    await this.receivableRepo.save(updated);

    this.eventEmitter.emit('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: this.tenantContext.getOrganizationId(),
    });

    return updated;
  }
}
```

Modify `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts` — the constructor now takes 3 arguments; update both existing test cases:

```typescript
const tenantContext = { getOrganizationId: () => 'org-1' };
const eventEmitter = { emit: jest.fn() };
const useCase = new WriteOffReceivableUseCase(receivableRepo as any, tenantContext as any, eventEmitter as any);
```

Add one new assertion to the "writes off an OPEN receivable" test case:

```typescript
expect(eventEmitter.emit).toHaveBeenCalledWith('receivable.status-closed', { receivableId: 'rec-1', organizationId: 'org-1' });
```

- [ ] **Step 7: Emit `receivable.status-closed` from `CancelReceivableUseCase`**

Replace `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.ts`:

```typescript
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
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
      throw new BadRequestException(error instanceof Error ? error.message : 'Cannot cancel receivable');
    }

    await this.receivableRepo.save(updated);

    this.eventEmitter.emit('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: this.tenantContext.getOrganizationId(),
    });

    return updated;
  }
}
```

Modify `apps/backend/src/modules/receivables/application/cancel-receivable.usecase.spec.ts` — the constructor now takes a 2nd argument; update all three test cases:

```typescript
const eventEmitter = { emit: jest.fn() };
const tenantContext = { getOrganizationId: () => 'org-1' };
const useCase = new CancelReceivableUseCase(receivableRepo as any, tenantContext as any, eventEmitter as any);
```

Add one new assertion to the "cancels an OPEN receivable" test case:

```typescript
expect(eventEmitter.emit).toHaveBeenCalledWith('receivable.status-closed', { receivableId: 'rec-1', organizationId: 'org-1' });
```

(The final contract matches the RBAC-migrated `WriteOffReceivableUseCase`: tenant identity comes from `TenantContextService`, never from a request body or explicit use-case parameter.)

- [ ] **Step 8: Confirm `AllocatePaymentUseCase` already emits `receivable.status-closed` (no code change in this plan)**

`2026-08-03-collection-activity-timeline.md` Task 5 modifies this same file (`apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`) to emit its own `payment.allocated`/`receivable.closed` events, and its final version ALREADY includes the `receivable.status-closed` emission this plan needs, side by side with `receivable.closed`, inside the same `if (becameClosed)` block — added there specifically to avoid two plans independently rewriting the same use case (see that plan's Task 5 note). Do NOT re-modify `allocate-payment.usecase.ts` from this plan.

If implementing this plan BEFORE `2026-08-03-collection-activity-timeline.md` (out of the specs' natural dependency order), add the `EventEmitter2` dependency and a bare `if (updatedReceivable.status === ReceivableStatus.PAID) { this.eventEmitter.emit('receivable.status-closed', { receivableId: updatedReceivable.id, organizationId }); }` block yourself as a stand-in, but leave a comment noting it must be merged into that plan's richer version (which also captures `customerId` and emits `payment.allocated`) rather than left as a second, competing modification.

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/internal-tasks apps/backend/src/modules/receivables apps/backend/src/modules/payments
git commit -m "feat: auto-dismiss OPEN InternalTasks when a Receivable closes"
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
import { randomUUID } from 'crypto';
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

- **Scheduler ownership and event contract reconciled:** Reminder Automation owns the single daily BullMQ scan and emits `reminder.scan.completed`; `ReminderScanCompletedListener` is the only bridge into this module. This plan contributes escalation evaluation and task creation without importing `RemindersModule`, injecting the scheduler, or creating a second scheduler.
- **Escalation race closed:** the old read-then-save path was not safe when two event deliveries overlapped. `InternalTaskOrmEntity` now has a partial unique index for `(organizationId, receivableId)` where `taskType = ESCALATION AND status = OPEN`, and `createEscalationIfAbsent()` uses one insert and treats PostgreSQL `23505` as the expected losing scan.
- **Background tenant setup is explicit:** the event listener passes only the organization payload; `RunEscalationScanUseCase` itself opens `TenantContextService.run({ userId: 'system', organizationId, role: Role.OWNER }, ...)` before any membership, receivable, or task repository call. Tests cover that constructor and callback contract.
- **Reconciled with `2026-08-03-collection-activity-timeline.md` (2026-08-04 pass).** That plan now exists and owns `receivable.closed`, scoped narrowly to "became `PAID`" (matching its spec's "Receivable.status → PAID" rule exactly — it never fires on `WRITTEN_OFF`/`CANCELLED`). Since this plan's auto-dismiss needs ALL three terminal statuses, the event was renamed to `receivable.status-closed` (Task 10) — a distinct name, not competing for the same one. `WriteOffReceivableUseCase`/`CancelReceivableUseCase` still emit it directly (Steps 6-7, unchanged in substance, renamed). `AllocatePaymentUseCase` (Step 8) is NO LONGER modified by this plan at all — `2026-08-03-collection-activity-timeline.md` Task 5 already emits `receivable.status-closed` alongside its own `receivable.closed`/`payment.allocated` in the same code path, avoiding two plans independently rewriting the same use case.
- **`escalationThresholdDays` is hardcoded to `30`** (`ESCALATION_THRESHOLD_DAYS` constant, Task 6 Step 1) per spec section 5's first open question being explicitly non-blocking. Making it configurable per-organization or per-`ReminderPolicy` is a follow-up once the Reminder Automation plan's `ReminderPolicy`/`ReminderRule` entities exist to hang that configuration off of.
- **Resolve/dismiss permission model.** Spec section 5's second open question (restrict resolve/dismiss to `assignedToUserId`/`OWNER` only, or let anyone with visibility resolve) is resolved here as: any user holding `Permission.INTERNAL_TASK_MANAGE` (`FINANCE_MANAGER`, `ACCOUNTANT`) may resolve/dismiss any task in their organization. Simplest option that satisfies the spec's explicit creation-permission list; tighten to an assignee/owner check later if this proves too permissive in practice.
- **New permission, justified.** `Permission.INTERNAL_TASK_MANAGE` (Task 5) was added rather than reusing `RECEIVABLE_WRITE`, because editing a receivable's own fields and managing its side-table of assignable follow-up tasks are different capabilities — a role that can write receivables should not automatically be able to silently resolve another user's escalation task.
- **`CancelReceivableUseCase` signature mismatch — fixed at the source (2026-08-04 pass).** `2026-08-03-testing-strategy.md` originally gave `CancelReceivableUseCase` an explicit `organizationId` parameter, targeting what it believed was a pre-RBAC-migration controller state. That plan has been corrected to match `WriteOffReceivableUseCase`'s shape exactly (`execute(receivableId)`, no `organizationId` argument, `TenantContextService`-scoped). Task 10 Step 7 here now emits `receivable.status-closed` from that corrected signature — no lingering mismatch, no follow-up needed.
- **`AllocatePaymentInput.allocatedByUserId` is `string | null`** — this plan makes no changes to `AllocatePaymentUseCase` at all (see the note above), so it simply consumes whatever type `2026-08-03-collection-activity-timeline.md`/`2026-08-03-webhook-matching-engine.md` already established there.
- **Spec coverage:** `InternalTask` entity (spec section 1) → Task 1-2. Auto-escalation (section 2) → Tasks 3, 4, 6. Manual create + resolve/dismiss (section 3) → Tasks 7-9. Auto-dismiss on closed status (section 3, last paragraph) → Task 10. Out-of-scope items (section 4: no auto-block on new receivables for a flagged customer, no separate push/Slack channel) are not implemented, matching the spec.


