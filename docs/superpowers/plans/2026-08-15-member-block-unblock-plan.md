# Member-level block/unblock (issue #178) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org `OWNER` block/unblock a subordinate member of their own org, and let a cross-org `Operator` block/unblock any member of any org (including that org's `OWNER`), without affecting that member's access to any other org.

**Architecture:** `Membership` gains a `status: ACTIVE | BLOCKED` field with pure `block()`/`unblock()` domain transitions. Two independent write paths call it: `BlockMemberUseCase`/`UnblockMemberUseCase` (new, in `modules/auth/application/`, alongside the existing `RemoveMemberUseCase`) for the in-org `OWNER`, and `BlockMemberByOperatorUseCase`/`UnblockMemberByOperatorUseCase` (new, in `modules/admin/application/`) for the cross-org `Operator`, mirroring `LockOrganizationUseCase` exactly. A new `MembershipBlockGuard` enforces the block on every tenant request, mirroring `OrganizationLockGuard`. Both write paths send the same notification email by reusing the existing `send-auth-email` BullMQ job.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, Jest, supertest + testcontainers for e2e.

**Spec:** `docs/superpowers/specs/2026-08-15-member-block-unblock-design.md` (also see ADR-0019 at `docs/adr/0019-member-block-scoped-to-membership.md`)

## Global Constraints

- Money/amounts are not touched by this feature — N/A.
- Every write that changes `Membership.status` MUST be inside one DB transaction (`AGENTS.md` transaction rule).
- Every query/write MUST be scoped by `organizationId` for the in-org path; the Operator path is the documented cross-org exception (ADR-0017) and must still resolve/persist an explicit `organizationId`.
- `errorCode` shape: `{ statusCode, errorCode, message, details? }`. New `ErrorCode.MEMBER_BLOCKED` → HTTP 403.
- No `any`/`as any`/`as unknown as` in production code (tests may use `as never`/`as any` per existing test files in this repo).
- Value imports (never `import type`) for classes used in constructor params/decorators.
- Biome: single quotes, semicolons, 2-space indent, no trailing commas.
- TDD: RED → GREEN → REFACTOR for every task below.

---

### Task 1: `MEMBER_BLOCK` permission

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts` (create if it does not already exist — check first with `find packages/shared-types/src -iname "*role-permissions*spec*"`; if it exists, add to it instead of creating a duplicate)

**Interfaces:**
- Produces: `Permission.MEMBER_BLOCK` (string enum value `'MEMBER_BLOCK'`), consumed by `@RequirePermission(Permission.MEMBER_BLOCK)` in Task 9.

- [x] **Step 1: Write the failing test**

```typescript
// packages/shared-types/src/role-permissions.spec.ts
import { Permission } from './permission';
import { Role } from './role';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS — MEMBER_BLOCK', () => {
  it('grants MEMBER_BLOCK only to OWNER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.MEMBER_BLOCK);
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern packages/shared-types/src/role-permissions.spec.ts`
Expected: FAIL — `Permission.MEMBER_BLOCK` is `undefined` (property does not exist on the enum).

- [x] **Step 3: Add the permission**

In `packages/shared-types/src/permission.ts`, add one line to the enum (any position; alphabetical grouping is not enforced elsewhere in the file, so append at the end):

```typescript
export enum Permission {
  // ...existing values unchanged...
  ALERT_READ = 'ALERT_READ',
  MEMBER_BLOCK = 'MEMBER_BLOCK',
}
```

No change to `role-permissions.ts` is needed: `ROLE_PERMISSIONS[Role.OWNER]` is `Object.values(Permission)`, which picks up the new value automatically, and no other role's explicit list includes it.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern packages/shared-types/src/role-permissions.spec.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/shared-types/src/permission.ts packages/shared-types/src/role-permissions.spec.ts
git commit -m "feat: add MEMBER_BLOCK permission, OWNER-exclusive"
```

---

### Task 2: `Membership` domain — `status`, `blockedAt`, `block()`, `unblock()`, `isBlocked()`

**Files:**
- Modify: `apps/backend/src/modules/organizations/domain/membership.ts`
- Test: `apps/backend/src/modules/organizations/domain/membership.spec.ts`

**Interfaces:**
- Produces: `MembershipStatus = 'ACTIVE' | 'BLOCKED'`; `Membership.status: MembershipStatus`; `Membership.blockedAt: Date | null`; `Membership.block(): Membership`; `Membership.unblock(): Membership`; `Membership.isBlocked(): boolean`. Consumed by Task 3 (ORM entity), Task 5/6 (use cases), Task 10 (guard).

- [x] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/organizations/domain/membership.spec.ts`:

```typescript
describe('Membership block/unblock', () => {
  function buildMembership(overrides: Partial<Membership> = {}): Membership {
    return new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
      ...overrides,
    });
  }

  it('defaults status to ACTIVE and blockedAt to null', () => {
    const membership = buildMembership();
    expect(membership.status).toBe('ACTIVE');
    expect(membership.blockedAt).toBeNull();
    expect(membership.isBlocked()).toBe(false);
  });

  it('block() sets status to BLOCKED and blockedAt to a Date', () => {
    const membership = buildMembership();
    const blocked = membership.block();
    expect(blocked).not.toBe(membership);
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.blockedAt).toBeInstanceOf(Date);
    expect(blocked.isBlocked()).toBe(true);
    // original instance is unchanged
    expect(membership.status).toBe('ACTIVE');
  });

  it('unblock() sets status to ACTIVE and blockedAt to null', () => {
    const membership = buildMembership({
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });
    const unblocked = membership.unblock();
    expect(unblocked.status).toBe('ACTIVE');
    expect(unblocked.blockedAt).toBeNull();
    expect(unblocked.isBlocked()).toBe(false);
  });

  it('block() applies the same way regardless of joinedAt (pending invite included)', () => {
    const pending = buildMembership({ joinedAt: null });
    const blocked = pending.block();
    expect(blocked.isBlocked()).toBe(true);
    expect(blocked.isActive()).toBe(false); // isActive() still means "invite accepted"
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern apps/backend/src/modules/organizations/domain/membership.spec.ts`
Expected: FAIL — `Property 'status' does not exist on type 'Membership'` (TS compile error surfaced as a test failure) and/or `membership.block is not a function`.

- [x] **Step 3: Implement**

Replace the full contents of `apps/backend/src/modules/organizations/domain/membership.ts`:

```typescript
export { Role } from '@casso-ledger/shared-types';

import type { Role } from '@casso-ledger/shared-types';

export type MembershipStatus = 'ACTIVE' | 'BLOCKED';

export interface MembershipProps {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  invitedAt: Date;
  joinedAt: Date | null;
  createdAt: Date;
  status?: MembershipStatus;
  blockedAt?: Date | null;
}

export class Membership {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;
  readonly status: MembershipStatus;
  readonly blockedAt: Date | null;

  constructor(props: MembershipProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.role = props.role;
    this.invitedAt = props.invitedAt;
    this.joinedAt = props.joinedAt;
    this.createdAt = props.createdAt;
    this.status = props.status ?? 'ACTIVE';
    this.blockedAt = props.blockedAt ?? null;
  }

  isActive(): boolean {
    return this.joinedAt !== null;
  }

  isBlocked(): boolean {
    return this.status === 'BLOCKED';
  }

  withRole(role: Role): Membership {
    return new Membership({ ...this, role });
  }

  block(): Membership {
    return new Membership({ ...this, status: 'BLOCKED', blockedAt: new Date() });
  }

  unblock(): Membership {
    return new Membership({ ...this, status: 'ACTIVE', blockedAt: null });
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern apps/backend/src/modules/organizations/domain/membership.spec.ts`
Expected: PASS (all tests in the file, old and new)

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/domain/membership.ts apps/backend/src/modules/organizations/domain/membership.spec.ts
git commit -m "feat: add Membership block/unblock state"
```

---

### Task 3: `MembershipOrmEntity` columns + migration

**Files:**
- Modify: `apps/backend/src/modules/organizations/infrastructure/membership.orm-entity.ts`
- Create: `apps/backend/src/database/migrations/20260823000000-add-memberships-status.ts`

**Interfaces:**
- Consumes: `Membership.status`/`blockedAt` from Task 2 (must match column names/types exactly — `TypeOrmMembershipRepository.save()` passes the domain `Membership` instance straight to `repo.save()` with no explicit mapper, relying on the two shapes matching structurally; do not break that).
- Produces: `memberships.status` (`varchar`, default `'ACTIVE'`), `memberships.blockedAt` (`timestamptz`, nullable) at the DB layer.

- [x] **Step 1: Modify the ORM entity**

In `apps/backend/src/modules/organizations/infrastructure/membership.orm-entity.ts`, add two columns after `joinedAt`:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../domain/membership';

@Entity({ name: 'memberships' })
@Index(['organizationId', 'userId'], { unique: true })
export class MembershipOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'timestamptz' })
  invitedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: 'ACTIVE' | 'BLOCKED';

  @Column({ type: 'timestamptz', nullable: true })
  blockedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

(Column order in the class does not need to match declaration order elsewhere — placed before `createdAt` to mirror where `status ` sits in `OrganizationOrmEntity` relative to `createdAt`.)

- [x] **Step 2: Write the migration**

Create `apps/backend/src/database/migrations/20260823000000-add-memberships-status.ts`:

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMembershipsStatus20260823000000
  implements MigrationInterface
{
  name = 'AddMembershipsStatus20260823000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "memberships" DROP COLUMN IF EXISTS "blockedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "memberships" DROP COLUMN IF EXISTS "status"',
    );
  }
}
```

No manual registration needed — `typeorm.config.ts` globs `database/migrations/!(*.spec){.js,.ts}`.

- [x] **Step 3: Verify the entity compiles and matches the domain shape**

Run: `npx tsc --noEmit -p apps/backend`
Expected: no new errors. This also indirectly checks `TypeOrmMembershipRepository.save()` (which does `this.repo.save(membership)` with a domain `Membership` passed where a `MembershipOrmEntity` is expected) still type-checks — it does, because `Membership` and `MembershipOrmEntity` now both have `status: 'ACTIVE' | 'BLOCKED'` and `blockedAt: Date | null` with identical names/types.

- [x] **Step 4: Run the existing repository test suite to confirm no regression**

Run: `npx jest --testPathPattern apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.spec.ts`
Expected: PASS (unchanged — these tests mock `repo.findOne` and don't touch the new columns)

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/infrastructure/membership.orm-entity.ts apps/backend/src/database/migrations/20260823000000-add-memberships-status.ts
git commit -m "feat: add memberships.status/blockedAt columns"
```

---

### Task 4: `OperatorAuditLog` — extend `actionType`, add `membershipId`

**Files:**
- Modify: `apps/backend/src/modules/admin/domain/operator-audit-log.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts`
- Create: `apps/backend/src/database/migrations/20260823010000-add-operator-audit-logs-membership-id.ts`
- Test: `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts` (create — none exists yet)

**Interfaces:**
- Produces: `OperatorActionType` now includes `'MEMBER_BLOCKED' | 'MEMBER_UNBLOCKED'`; `OperatorAuditLogProps.membershipId?: string | null`. Consumed by Task 11 (`BlockMemberByOperatorUseCase`).

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts`:

```typescript
import { OperatorAuditLog } from '../domain/operator-audit-log';
import { TypeOrmOperatorAuditLogRepository } from './typeorm-operator-audit-log.repository';

describe('TypeOrmOperatorAuditLogRepository', () => {
  it('persists membershipId when saving a MEMBER_BLOCKED entry', async () => {
    const repo = { save: jest.fn() };
    const repository = new TypeOrmOperatorAuditLogRepository(repo as any);

    await repository.save(
      new OperatorAuditLog({
        id: 'log-1',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
        createdAt: new Date('2026-08-01'),
      }),
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'log-1',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
      }),
    );
  });

  it('persists membershipId as null for an org-level action', async () => {
    const repo = { save: jest.fn() };
    const repository = new TypeOrmOperatorAuditLogRepository(repo as any);

    await repository.save(
      new OperatorAuditLog({
        id: 'log-2',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'ORGANIZATION_LOCKED',
        createdAt: new Date('2026-08-01'),
      }),
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: null }),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts`
Expected: FAIL — TS error, `membershipId` does not exist on `OperatorAuditLogProps`, and/or the assertion on `membershipId: null` fails because the mapper never sets it.

- [x] **Step 3: Implement**

`apps/backend/src/modules/admin/domain/operator-audit-log.ts`:

```typescript
export type OperatorActionType =
  | 'ORGANIZATION_LOCKED'
  | 'ORGANIZATION_UNLOCKED'
  | 'MEMBER_BLOCKED'
  | 'MEMBER_UNBLOCKED';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
  membershipId?: string | null;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;
  readonly membershipId: string | null;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
    this.membershipId = props.membershipId ?? null;
  }
}
```

`apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'operator_audit_logs' })
export class OperatorAuditLogOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  operatorId: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  actionType: string;

  @Column({ type: 'varchar', nullable: true })
  membershipId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

`apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts` — update the explicit `toOrm()` mapper (required here because `actionType` is a narrower union in the domain than `string` in the ORM entity, so the shapes don't match structurally — same reason this file already has a mapper while `Membership` doesn't):

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IOperatorAuditLogRepository } from '../application/operator-audit-log-repository.port';
import type { OperatorAuditLog } from '../domain/operator-audit-log';
import { OperatorAuditLogOrmEntity } from './operator-audit-log.orm-entity';

function toOrm(log: OperatorAuditLog): OperatorAuditLogOrmEntity {
  const row = new OperatorAuditLogOrmEntity();
  row.id = log.id;
  row.operatorId = log.operatorId;
  row.organizationId = log.organizationId;
  row.actionType = log.actionType;
  row.membershipId = log.membershipId;
  row.createdAt = log.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOperatorAuditLogRepository
  implements IOperatorAuditLogRepository
{
  constructor(
    @InjectRepository(OperatorAuditLogOrmEntity)
    private readonly repo: Repository<OperatorAuditLogOrmEntity>,
  ) {}

  async save(log: OperatorAuditLog, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(OperatorAuditLogOrmEntity)
      : this.repo
    ).save(toOrm(log));
  }
}
```

Create `apps/backend/src/database/migrations/20260823010000-add-operator-audit-logs-membership-id.ts`:

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogsMembershipId20260823010000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogsMembershipId20260823010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "membershipId" character varying`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "membershipId"',
    );
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts`
Expected: PASS

- [x] **Step 5: Run the existing lock/unlock use case tests to confirm no regression**

Run: `npx jest --testPathPattern apps/backend/src/modules/admin/application/lock-organization.usecase.spec.ts`
Expected: PASS unchanged (those tests construct `OperatorAuditLog` without `membershipId`, which is optional and defaults to `null`)

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/modules/admin/domain/operator-audit-log.ts apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts apps/backend/src/database/migrations/20260823010000-add-operator-audit-logs-membership-id.ts
git commit -m "feat: extend OperatorAuditLog for member block/unblock actions"
```

---

### Task 5: `IAuthEmailSender` — member block/unblock emails

**Files:**
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts`
- Modify: `apps/backend/src/modules/auth/application/auth-email-sender.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`

**Interfaces:**
- Produces: `IAuthEmailSender.sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>`, `IAuthEmailSender.sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>`. Consumed by Task 6 (`BlockMemberUseCase`) and Task 11 (`BlockMemberByOperatorUseCase`).

- [x] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`:

```typescript
  it('queues member blocked and unblocked emails', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendMemberBlockedEmail('member@example.com', 'Acme');
    await adapter.sendMemberUnblockedEmail('member@example.com', 'Acme');

    expect(emailQueue.add).toHaveBeenNthCalledWith(
      1,
      'send-auth-email',
      expect.objectContaining({
        to: 'member@example.com',
        html: expect.stringContaining('Acme'),
        emailType: 'MEMBER_BLOCKED',
      }),
    );
    expect(emailQueue.add).toHaveBeenNthCalledWith(
      2,
      'send-auth-email',
      expect.objectContaining({
        to: 'member@example.com',
        html: expect.stringContaining('Acme'),
        emailType: 'MEMBER_UNBLOCKED',
      }),
    );
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`
Expected: FAIL — `adapter.sendMemberBlockedEmail is not a function`

- [x] **Step 3: Implement**

In `apps/backend/src/modules/notifications/application/email-queue.port.ts`, widen `AuthEmailJob.emailType`:

```typescript
export interface AuthEmailJob {
  to: string;
  subject: string;
  html: string;
  emailType:
    | 'AUTH_VERIFICATION'
    | 'AUTH_PASSWORD_RESET'
    | 'AUTH_INVITE'
    | 'MEMBER_BLOCKED'
    | 'MEMBER_UNBLOCKED';
}
```

(Leave the rest of the file — `ReminderEmailJob`, `OwnerAlertEmailJob`, `IEmailQueue` — unchanged.)

In `apps/backend/src/modules/auth/application/auth-email-sender.port.ts`:

```typescript
export interface IAuthEmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
  sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void>;
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
}

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');
```

In `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`, add two methods to the class (after `sendInviteEmail`):

```typescript
  async sendMemberBlockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    await this.emailQueue.add('send-auth-email', {
      to,
      subject: `Quyền truy cập của bạn vào ${organizationName} đã bị chặn`,
      html: `<p>Quyền truy cập của bạn vào tổ chức ${organizationName} trên Casso đã bị chặn. Liên hệ quản trị viên của tổ chức nếu bạn cho rằng đây là nhầm lẫn.</p>`,
      emailType: 'MEMBER_BLOCKED',
    });
  }

  async sendMemberUnblockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    await this.emailQueue.add('send-auth-email', {
      to,
      subject: `Quyền truy cập của bạn vào ${organizationName} đã được khôi phục`,
      html: `<p>Quyền truy cập của bạn vào tổ chức ${organizationName} trên Casso đã được khôi phục.</p>`,
      emailType: 'MEMBER_UNBLOCKED',
    });
  }
```

No change needed in `EmailQueueProcessor` — `processAuthEmail` already forwards any `AuthEmailJob` (any `emailType`) to Resend generically.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`
Expected: PASS (all tests in the file)

- [x] **Step 5: Run the email queue processor test suite to confirm no regression**

Run: `npx jest --testPathPattern apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`
Expected: PASS unchanged

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/modules/notifications/application/email-queue.port.ts apps/backend/src/modules/auth/application/auth-email-sender.port.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts
git commit -m "feat: add member block/unblock notification emails"
```

---

### Task 6: `BlockMemberUseCase` / `UnblockMemberUseCase` (in-org OWNER path)

**Files:**
- Create: `apps/backend/src/modules/auth/application/block-member.usecase.ts`
- Create: `apps/backend/src/modules/auth/application/unblock-member.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/block-member.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/unblock-member.usecase.spec.ts`

**Interfaces:**
- Consumes: `IMembershipRepository.findByUserAndOrganization`/`save` (existing, `modules/organizations/application/membership-repository.port.ts`); `IAuthEmailSender.sendMemberBlockedEmail`/`sendMemberUnblockedEmail` (Task 5); `IUserRepository.findById` (existing, `modules/users/application/user-repository.port.ts`); `Membership.block()`/`unblock()` (Task 2).
- Produces: `BlockMemberUseCase.execute(input: BlockMemberInput): Promise<Membership>`, `UnblockMemberUseCase.execute(input: UnblockMemberInput): Promise<Membership>`, where `BlockMemberInput = { organizationId: string; organizationName: string; actorUserId: string; targetUserId: string }` and `UnblockMemberInput` is the same shape without the self/OWNER checks. Consumed by Task 9 (`InvitesController`).

- [x] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/auth/application/block-member.usecase.spec.ts`:

```typescript
import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { BlockMemberUseCase } from './block-member.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-2',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-2', email: 'member@example.com' }),
  };
  const authEmailSender = {
    sendMemberBlockedEmail: jest.fn(),
  };
  return { membershipRepo, userRepo, authEmailSender };
}

describe('BlockMemberUseCase', () => {
  beforeEach(() => {
    dataSource.transaction.mockClear();
  });

  it('blocks the target membership and sends a notification email', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership(),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      actorUserId: 'user-1',
      targetUserId: 'user-2',
    });

    expect(result.isBlocked()).toBe(true);
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BLOCKED' }),
      manager,
    );
    expect(authEmailSender.sendMemberBlockedEmail).toHaveBeenCalledWith(
      'member@example.com',
      'Acme',
    );
  });

  it('rejects blocking your own membership', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ userId: 'user-1' }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberBlockedEmail).not.toHaveBeenCalled();
  });

  it('rejects blocking a membership with role OWNER', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ role: Role.OWNER }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-2',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the target membership does not exist', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(null);
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-9',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });

  it('is a no-op when the membership is already BLOCKED', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ status: 'BLOCKED', blockedAt: new Date('2026-08-05') }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      actorUserId: 'user-1',
      targetUserId: 'user-2',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberBlockedEmail).not.toHaveBeenCalled();
  });
});
```

Create `apps/backend/src/modules/auth/application/unblock-member.usecase.spec.ts`:

```typescript
import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { UnblockMemberUseCase } from './unblock-member.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-2',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    status: 'BLOCKED',
    blockedAt: new Date('2026-08-05'),
    ...overrides,
  });
}

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-2', email: 'member@example.com' }),
  };
  const authEmailSender = { sendMemberUnblockedEmail: jest.fn() };
  return { membershipRepo, userRepo, authEmailSender };
}

describe('UnblockMemberUseCase', () => {
  it('unblocks the target membership and sends a notification email', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership(),
    );
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      targetUserId: 'user-2',
    });

    expect(result.isBlocked()).toBe(false);
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      manager,
    );
    expect(authEmailSender.sendMemberUnblockedEmail).toHaveBeenCalledWith(
      'member@example.com',
      'Acme',
    );
  });

  it('is a no-op when the membership is already ACTIVE', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ status: 'ACTIVE', blockedAt: null }),
    );
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      targetUserId: 'user-2',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberUnblockedEmail).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the target membership does not exist', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(null);
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        targetUserId: 'user-9',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern "apps/backend/src/modules/auth/application/(block|unblock)-member.usecase.spec.ts"`
Expected: FAIL — `Cannot find module './block-member.usecase'` / `./unblock-member.usecase`

- [x] **Step 3: Implement**

Create `apps/backend/src/modules/auth/application/block-member.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Membership, Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';

export interface BlockMemberInput {
  organizationId: string;
  organizationName: string;
  actorUserId: string;
  targetUserId: string;
}

@Injectable()
export class BlockMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: BlockMemberInput): Promise<Membership> {
    if (input.actorUserId === input.targetUserId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Không thể tự chặn quyền truy cập của chính mình.',
      );
    }

    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.targetUserId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy thành viên trong tổ chức.',
      );
    }
    if (membership.role === Role.OWNER) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Không thể chặn quyền truy cập của chủ sở hữu tổ chức.',
      );
    }
    if (membership.isBlocked()) {
      return membership;
    }

    const blocked = membership.block();
    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(blocked, manager);
    });

    // Email is sent only after the transaction commits — the DB write must
    // never roll back because the queue (Redis/BullMQ) is unavailable
    // (AGENTS.md: no external calls inside a transaction; hold locks only
    // inside it, never outside). Mirrors BlockMemberByOperatorUseCase (Task 10).
    const user = await this.userRepo.findById(input.targetUserId);
    if (user) {
      await this.authEmailSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    }
    return blocked;
  }
}
```

Create `apps/backend/src/modules/auth/application/unblock-member.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import type { Membership } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';

export interface UnblockMemberInput {
  organizationId: string;
  organizationName: string;
  targetUserId: string;
}

@Injectable()
export class UnblockMemberUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: UnblockMemberInput): Promise<Membership> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.targetUserId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy thành viên trong tổ chức.',
      );
    }
    if (!membership.isBlocked()) {
      return membership;
    }

    const unblocked = membership.unblock();
    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(unblocked, manager);
    });

    // Same reasoning as BlockMemberUseCase: email goes out after commit,
    // never inside the transaction.
    const user = await this.userRepo.findById(input.targetUserId);
    if (user) {
      await this.authEmailSender.sendMemberUnblockedEmail(
        user.email,
        input.organizationName,
      );
    }
    return unblocked;
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern "apps/backend/src/modules/auth/application/(block|unblock)-member.usecase.spec.ts"`
Expected: PASS (all tests in both files)

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/block-member.usecase.ts apps/backend/src/modules/auth/application/block-member.usecase.spec.ts apps/backend/src/modules/auth/application/unblock-member.usecase.ts apps/backend/src/modules/auth/application/unblock-member.usecase.spec.ts
git commit -m "feat: add BlockMemberUseCase/UnblockMemberUseCase for org OWNER"
```

---

### Task 7: `AuthModule` wiring — export `AUTH_EMAIL_SENDER`, register new use cases

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `BlockMemberUseCase`, `UnblockMemberUseCase` (Task 6).
- Produces: `AuthModule` now exports `AUTH_EMAIL_SENDER`, consumed by Task 12 (`AdminModule`).

- [x] **Step 1: No new test — this is DI wiring only, verified by the compile check and the controller test in Task 9**

- [x] **Step 2: Modify `auth.module.ts`**

Add the two new imports and register the two new providers, and add an `exports` array (none currently exists):

```typescript
import { BlockMemberUseCase } from './application/block-member.usecase';
// ...(alongside existing application imports, alphabetically near the top of that group)
import { UnblockMemberUseCase } from './application/unblock-member.usecase';
```

In the `providers` array, add `BlockMemberUseCase,` and `UnblockMemberUseCase,` (e.g. next to `RemoveMemberUseCase,`).

After the `controllers: [...]` line, add:

```typescript
  exports: [AUTH_EMAIL_SENDER],
```

(`AUTH_EMAIL_SENDER` is already imported at the top of the file.)

- [x] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/backend`
Expected: no new errors.

- [x] **Step 4: Run the full backend unit suite to confirm no regression**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS, same or higher total test count than before this task.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat: wire BlockMemberUseCase/UnblockMemberUseCase into AuthModule, export AUTH_EMAIL_SENDER"
```

---

### Task 8: `MembershipBlockGuard` — enforcement

**Files:**
- Create: `apps/backend/src/modules/organizations/presentation/membership-block.guard.ts`
- Create: `apps/backend/src/modules/organizations/presentation/membership-block.guard.spec.ts`
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/status-by-error-code.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `IMembershipRepository.findByUserAndOrganization` (existing); `Membership.isBlocked()` (Task 2); `AuthenticatedUser` (existing, `common/auth/authenticated-user.ts`).
- Produces: registers as a fourth global `APP_GUARD`, runs after `OrganizationLockGuard`.

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/organizations/presentation/membership-block.guard.spec.ts`:

```typescript
import type { ExecutionContext } from '@nestjs/common';
import { Membership, Role } from '../domain/membership';
import { MembershipBlockGuard } from './membership-block.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildMembership(status: 'ACTIVE' | 'BLOCKED') {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    status,
    blockedAt: status === 'BLOCKED' ? new Date('2026-08-05') : null,
  });
}

describe('MembershipBlockGuard', () => {
  function buildGuard(membership: Membership | null) {
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    return new MembershipBlockGuard(membershipRepo as any, reflector as any);
  }

  it('rejects with MEMBER_BLOCKED when the caller membership is BLOCKED', async () => {
    const guard = buildGuard(buildMembership('BLOCKED'));
    const request = {
      user: { userId: 'user-1', organizationId: 'org-1', role: 'ACCOUNTANT' },
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({ response: { errorCode: 'MEMBER_BLOCKED' } });
  });

  it('allows the request when the caller membership is ACTIVE', async () => {
    const guard = buildGuard(buildMembership('ACTIVE'));
    const request = {
      user: { userId: 'user-1', organizationId: 'org-1', role: 'ACCOUNTANT' },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(
      true,
    );
  });

  it('allows unauthenticated requests through (JwtAuthGuard rejects those first)', async () => {
    const guard = buildGuard(null);
    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
  });

  it('allows public routes through without checking membership', async () => {
    const membershipRepo = { findByUserAndOrganization: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new MembershipBlockGuard(
      membershipRepo as any,
      reflector as any,
    );

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
    expect(membershipRepo.findByUserAndOrganization).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern apps/backend/src/modules/organizations/presentation/membership-block.guard.spec.ts`
Expected: FAIL — `Cannot find module './membership-block.guard'`

- [x] **Step 3: Add the `MEMBER_BLOCKED` error code**

In `apps/backend/src/common/errors/error-code.ts`, add one line to the enum:

```typescript
  ORGANIZATION_LOCKED = 'ORGANIZATION_LOCKED',
  MEMBER_BLOCKED = 'MEMBER_BLOCKED',
```

In `apps/backend/src/common/errors/status-by-error-code.ts`, add one line to the map:

```typescript
  [ErrorCode.ORGANIZATION_LOCKED]: 403,
  [ErrorCode.MEMBER_BLOCKED]: 403,
```

- [x] **Step 4: Implement the guard**

Create `apps/backend/src/modules/organizations/presentation/membership-block.guard.ts`:

```typescript
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../application/membership-repository.port';

@Injectable()
export class MembershipBlockGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.organizationId) return true;

    const membership = await this.membershipRepo.findByUserAndOrganization(
      user.userId,
      user.organizationId,
    );
    if (membership?.isBlocked()) {
      throw new ForbiddenException({
        errorCode: ErrorCode.MEMBER_BLOCKED,
        message: 'Quyền truy cập của bạn vào tổ chức này đã bị chặn.',
      });
    }
    return true;
  }
}
```

- [x] **Step 5: Register the guard globally**

In `apps/backend/src/app.module.ts`, add the import:

```typescript
import { MembershipBlockGuard } from './modules/organizations/presentation/membership-block.guard';
```

And add a fourth `APP_GUARD` entry, after `OrganizationLockGuard`:

```typescript
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: OrganizationLockGuard },
    { provide: APP_GUARD, useClass: MembershipBlockGuard },
```

- [x] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPattern apps/backend/src/modules/organizations/presentation/membership-block.guard.spec.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/organizations/presentation/membership-block.guard.ts apps/backend/src/modules/organizations/presentation/membership-block.guard.spec.ts apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/status-by-error-code.ts apps/backend/src/app.module.ts
git commit -m "feat: enforce blocked membership via MembershipBlockGuard"
```

---

### Task 9: `InvitesController` — block/unblock endpoints (in-org OWNER)

**Files:**
- Modify: `apps/backend/src/modules/auth/presentation/invites.controller.ts`

**Interfaces:**
- Consumes: `BlockMemberUseCase`, `UnblockMemberUseCase` (Task 6); `IOrganizationRepository` (already injected in this controller); `IdempotencyService` (already injected); `assertOrgMatches` (existing helper).
- Produces: `POST /api/v1/organizations/:id/members/:userId/block`, `POST /api/v1/organizations/:id/members/:userId/unblock`.

- [x] **Step 1: No new unit test file — this controller has no existing `*.spec.ts` (verified: only e2e coverage exists for `InvitesController` today). Coverage for these two endpoints is added at the e2e layer in Task 13.**

- [x] **Step 2: Modify the controller**

In `apps/backend/src/modules/auth/presentation/invites.controller.ts`, add two imports:

```typescript
import { BlockMemberUseCase } from '../application/block-member.usecase';
import { UnblockMemberUseCase } from '../application/unblock-member.usecase';
```

Add two constructor params (after `removeMemberUseCase`):

```typescript
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    private readonly blockMemberUseCase: BlockMemberUseCase,
    private readonly unblockMemberUseCase: UnblockMemberUseCase,
```

Add two new endpoint methods, after `removeMember`:

```typescript
  @Post('organizations/:id/members/:userId/block')
  @ApiOperation({ summary: 'Block a member’s access to an organization' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Membership blocked',
    schema: {
      type: 'object',
      required: ['id', 'userId', 'status'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['ACTIVE', 'BLOCKED'] },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.MEMBER_BLOCK)
  async blockMember(
    @Param('id') organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, organizationId);
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');

    return this.idempotency.execute(
      `POST /organizations/${organizationId}/members/${userId}/block`,
      key,
      { userId },
      async () => {
        const membership = await this.blockMemberUseCase.execute({
          organizationId,
          organizationName: organization.name,
          actorUserId: request.user?.userId ?? '',
          targetUserId: userId,
        });
        return { id: membership.id, userId: membership.userId, status: membership.status };
      },
    );
  }

  @Post('organizations/:id/members/:userId/unblock')
  @ApiOperation({ summary: 'Unblock a member’s access to an organization' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Membership unblocked',
    schema: {
      type: 'object',
      required: ['id', 'userId', 'status'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['ACTIVE', 'BLOCKED'] },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.MEMBER_BLOCK)
  async unblockMember(
    @Param('id') organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, organizationId);
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');

    return this.idempotency.execute(
      `POST /organizations/${organizationId}/members/${userId}/unblock`,
      key,
      { userId },
      async () => {
        const membership = await this.unblockMemberUseCase.execute({
          organizationId,
          organizationName: organization.name,
          targetUserId: userId,
        });
        return { id: membership.id, userId: membership.userId, status: membership.status };
      },
    );
  }
```

- [x] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/backend`
Expected: no new errors.

- [x] **Step 4: Run the full backend unit suite to confirm no regression**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/invites.controller.ts
git commit -m "feat: add block/unblock member endpoints for org OWNER"
```

---

### Task 10: `BlockMemberByOperatorUseCase` / `UnblockMemberByOperatorUseCase` (cross-org Operator path)

**Files:**
- Create: `apps/backend/src/modules/admin/application/block-member-by-operator.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.ts`
- Test: `apps/backend/src/modules/admin/application/block-member-by-operator.usecase.spec.ts`
- Test: `apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.spec.ts`

**Interfaces:**
- Consumes: `IMembershipRepository` (existing); `IUserRepository` (existing); `IOperatorAuditLogRepository` (existing); `IAuthEmailSender` (Task 5, made available to `AdminModule` in Task 12); `OperatorAuditLog` (Task 4); `Membership.block()`/`unblock()` (Task 2).
- Produces: `BlockMemberByOperatorUseCase.execute(input): Promise<void>`, `UnblockMemberByOperatorUseCase.execute(input): Promise<void>`, where the input shape is `{ organizationId: string; organizationName: string; userId: string; operatorId: string }`. Consumed by Task 12 (`AdminController`).

- [x] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/admin/application/block-member-by-operator.usecase.spec.ts`:

```typescript
import { Membership, Role } from '../../organizations/domain/membership';
import { BlockMemberByOperatorUseCase } from './block-member-by-operator.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'owner@example.com' }),
  };
  const auditRepo = { save: jest.fn() };
  const authEmailSender = { sendMemberBlockedEmail: jest.fn() };
  const dataSource = {
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback({}),
    ),
  };
  return { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource };
}

describe('BlockMemberByOperatorUseCase', () => {
  it('blocks a membership with role OWNER (Operator-exclusive) and writes an audit log', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(buildMembership());
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BLOCKED' }),
      expect.anything(),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
      }),
      expect.anything(),
    );
    expect(authEmailSender.sendMemberBlockedEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Acme',
    );
  });

  it('is a no-op when the membership is already BLOCKED', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(
        buildMembership({ status: 'BLOCKED', blockedAt: new Date('2026-08-05') }),
      );
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the membership does not exist', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(null);
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        userId: 'user-9',
        operatorId: 'op-1',
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
```

Create `apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.spec.ts` (same shape, mirroring `unlock-organization.usecase.ts`'s relationship to `lock-organization.usecase.ts` — read that file first for the exact unlock pattern):

```typescript
import { Membership, Role } from '../../organizations/domain/membership';
import { UnblockMemberByOperatorUseCase } from './unblock-member-by-operator.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    status: 'BLOCKED',
    blockedAt: new Date('2026-08-05'),
    ...overrides,
  });
}

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'owner@example.com' }),
  };
  const auditRepo = { save: jest.fn() };
  const authEmailSender = { sendMemberUnblockedEmail: jest.fn() };
  const dataSource = {
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback({}),
    ),
  };
  return { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource };
}

describe('UnblockMemberByOperatorUseCase', () => {
  it('unblocks a membership and writes an audit log', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(buildMembership());
    const useCase = new UnblockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      expect.anything(),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'MEMBER_UNBLOCKED' }),
      expect.anything(),
    );
  });

  it('is a no-op when the membership is already ACTIVE', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(buildMembership({ status: 'ACTIVE', blockedAt: null }));
    const useCase = new UnblockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern "apps/backend/src/modules/admin/application/(block|unblock)-member-by-operator.usecase.spec.ts"`
Expected: FAIL — modules don't exist yet.

- [x] **Step 3: Implement**

`unlock-organization.usecase.ts` confirms the exact sibling shape: `dataSource.transaction`, `if (organization.status === 'ACTIVE') return;` as the no-op guard, `actionType: 'ORGANIZATION_UNLOCKED'`. The two use cases below follow that same shape for `Membership`.

Create `apps/backend/src/modules/admin/application/block-member-by-operator.usecase.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../auth/application/auth-email-sender.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface BlockMemberByOperatorInput {
  organizationId: string;
  organizationName: string;
  userId: string;
  operatorId: string;
}

@Injectable()
export class BlockMemberByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
  ) {}

  async execute(input: BlockMemberByOperatorInput): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.userId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thành viên.');
    }
    if (membership.isBlocked()) return;

    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(membership.block(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'MEMBER_BLOCKED',
          membershipId: membership.id,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const user = await this.userRepo.findById(input.userId);
    if (user) {
      await this.authEmailSender.sendMemberBlockedEmail(
        user.email,
        input.organizationName,
      );
    }
  }
}
```

Create `apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.ts` (same shape, `unblock()`/`'MEMBER_UNBLOCKED'`/`sendMemberUnblockedEmail`):

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../auth/application/auth-email-sender.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface UnblockMemberByOperatorInput {
  organizationId: string;
  organizationName: string;
  userId: string;
  operatorId: string;
}

@Injectable()
export class UnblockMemberByOperatorUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly authEmailSender: IAuthEmailSender,
  ) {}

  async execute(input: UnblockMemberByOperatorInput): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.userId,
      input.organizationId,
    );
    if (!membership) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thành viên.');
    }
    if (!membership.isBlocked()) return;

    await this.dataSource.transaction(async (manager) => {
      await this.membershipRepo.save(membership.unblock(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'MEMBER_UNBLOCKED',
          membershipId: membership.id,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const user = await this.userRepo.findById(input.userId);
    if (user) {
      await this.authEmailSender.sendMemberUnblockedEmail(
        user.email,
        input.organizationName,
      );
    }
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern "apps/backend/src/modules/admin/application/(block|unblock)-member-by-operator.usecase.spec.ts"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/admin/application/block-member-by-operator.usecase.ts apps/backend/src/modules/admin/application/block-member-by-operator.usecase.spec.ts apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.ts apps/backend/src/modules/admin/application/unblock-member-by-operator.usecase.spec.ts
git commit -m "feat: add BlockMemberByOperatorUseCase/UnblockMemberByOperatorUseCase"
```

---

### Task 11: `AdminModule` wiring + `AdminController` endpoints (cross-org Operator)

**Files:**
- Modify: `apps/backend/src/modules/admin/admin.module.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.ts`
- Modify: `apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts`

**Interfaces:**
- Consumes: `BlockMemberByOperatorUseCase`, `UnblockMemberByOperatorUseCase` (Task 10); `AUTH_EMAIL_SENDER` export from `AuthModule` (Task 7); `USER_REPOSITORY` from `UsersModule`.
- Produces: `POST /admin/organizations/:orgId/members/:userId/block`, `POST /admin/organizations/:orgId/members/:userId/unblock`.

- [ ] **Step 1: No new unit test — DI wiring + thin controller, covered by the e2e test in Task 12**

- [ ] **Step 2: Modify `admin.module.ts`**

Add two imports and two entries to the `imports` array:

```typescript
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
```

```typescript
  imports: [
    TypeOrmModule.forFeature([OperatorAuditLogOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    OrganizationsModule,
    UsersModule,
    AuthModule,
    CopilotModule,
  ],
```

Add two provider imports and register them in `providers`:

```typescript
import { BlockMemberByOperatorUseCase } from './application/block-member-by-operator.usecase';
import { UnblockMemberByOperatorUseCase } from './application/unblock-member-by-operator.usecase';
```

```typescript
    ListOrganizationsUseCase,
    LockOrganizationUseCase,
    UnlockOrganizationUseCase,
    BlockMemberByOperatorUseCase,
    UnblockMemberByOperatorUseCase,
    GetAiUsageAggregateUseCase,
    GetAiUsageTrendUseCase,
    AdminAuthGuard,
```

- [ ] **Step 3: Add a response DTO**

In `apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts`, append:

```typescript
export class AdminMemberStatusResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  status: 'ACTIVE' | 'BLOCKED';
}
```

- [ ] **Step 4: Modify `admin.controller.ts`**

Add imports:

```typescript
import { BlockMemberByOperatorUseCase } from '../application/block-member-by-operator.usecase';
import { UnblockMemberByOperatorUseCase } from '../application/unblock-member-by-operator.usecase';
```

Add `AdminMemberStatusResponseDto` to the existing DTO import line.

Add `ORGANIZATION_REPOSITORY`/`IOrganizationRepository` import (needed to resolve `organizationName` for the email, same as `InvitesController` does):

```typescript
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
```

Add two constructor params and one `@Inject`:

```typescript
    private readonly blockMemberByOperatorUseCase: BlockMemberByOperatorUseCase,
    private readonly unblockMemberByOperatorUseCase: UnblockMemberByOperatorUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
```

(Add `Inject` to the `@nestjs/common` import line at the top if not already present — it is not currently imported in this file.)

Add two endpoint methods, after `unlock`:

```typescript
  @Post('organizations/:orgId/members/:userId/block')
  @ApiOperation({ summary: 'Block a member of any organization' })
  @ApiCreatedResponse({ type: AdminMemberStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async blockMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AdminRequest,
  ) {
    const organization = await this.organizationRepo.findById(orgId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    await this.blockMemberByOperatorUseCase.execute({
      organizationId: orgId,
      organizationName: organization.name,
      userId,
      operatorId: request.user.operatorId,
    });
    return { status: 'BLOCKED' as const };
  }

  @Post('organizations/:orgId/members/:userId/unblock')
  @ApiOperation({ summary: 'Unblock a member of any organization' })
  @ApiCreatedResponse({ type: AdminMemberStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async unblockMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AdminRequest,
  ) {
    const organization = await this.organizationRepo.findById(orgId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    await this.unblockMemberByOperatorUseCase.execute({
      organizationId: orgId,
      organizationName: organization.name,
      userId,
      operatorId: request.user.operatorId,
    });
    return { status: 'ACTIVE' as const };
  }
```

Add `NotFoundException` to the `@nestjs/common` import line if not already present.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p apps/backend`
Expected: no new errors.

- [ ] **Step 6: Run the full backend unit suite to confirm no regression**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/admin/admin.module.ts apps/backend/src/modules/admin/presentation/admin.controller.ts apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts
git commit -m "feat: add block/unblock member endpoints for cross-org Operator"
```

---

### Task 12: e2e coverage — guard enforcement + both write paths

**Files:**
- Modify: `apps/backend/test/admin.e2e-spec.ts` (add Operator block/unblock member cases)
- Create: `apps/backend/test/membership-block.e2e-spec.ts` (in-org OWNER path + `MembershipBlockGuard` enforcement)

**Interfaces:**
- Consumes: the full running `AppModule` (existing e2e pattern, `PostgreSqlContainer` + `supertest`).

- [ ] **Step 1: Add Operator block/unblock member cases to `admin.e2e-spec.ts`**

`admin.e2e-spec.ts` already seeds `organizationId`/`operatorId` and logs in the operator via `POST /api/v1/auth/login` to get `operatorToken` (see the file's existing `beforeAll`). Append, inside the existing `describe('Admin (e2e)', ...)` block, a new `describe('member block/unblock', ...)` that seeds one additional member row and exercises both endpoints:

```typescript
describe('member block/unblock', () => {
  const memberId = '33333333-3333-3333-3333-333333333333';
  const membershipId = '44444444-4444-4444-4444-444444444444';

  beforeAll(async () => {
    await dataSource.getRepository(UserOrmEntity).save({
      id: memberId,
      name: 'Member',
      email: 'member-admin-e2e@casso.vn',
      passwordHash: await hashPassword('Password123!'),
      emailVerifiedAt: new Date(),
      isOperator: false,
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: membershipId,
      organizationId,
      userId: memberId,
      role: Role.ACCOUNTANT,
      invitedAt: new Date(),
      joinedAt: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    });
  });

  it('blocks and unblocks a member, idempotently', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/members/${memberId}/block`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
      .expect({ status: 'BLOCKED' });

    // second call is a no-op, not an error
    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/members/${memberId}/block`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
      .expect({ status: 'BLOCKED' });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/members/${memberId}/unblock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
      .expect({ status: 'ACTIVE' });
  });
});
```

Add `MembershipOrmEntity` and `Role` imports to the top of the file (`'../src/modules/organizations/infrastructure/membership.orm-entity'`, `'../src/modules/organizations/domain/membership'`).

- [ ] **Step 2: Create `membership-block.e2e-spec.ts`**

Copy the container/app bootstrap from `apps/backend/test/member-management-export.e2e-spec.ts` (own `PostgreSqlContainer`, `app.use(cookieParser())`, `configureApp(app)`, and critically its `jwtService.sign({ userId, organizationId, role })` `token()` helper — mint JWTs directly instead of calling `/auth/login`, since these tests only need a valid token, not to exercise the login flow itself). Seed one `OrganizationOrmEntity`, one `OWNER` `UserOrmEntity`/`MembershipOrmEntity` pair, and one `ACCOUNTANT` `UserOrmEntity`/`MembershipOrmEntity` pair, all with `status: 'ACTIVE'` and `joinedAt` set.

```typescript
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Membership block/unblock (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '55555555-5555-5555-5555-555555555555';
  const ownerId = '66666666-6666-6666-6666-666666666666';
  const memberId = '77777777-7777-7777-7777-777777777777';

  function token(userId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'membership-block-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'membership-block-e2e-resend-key';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    app.use(cookieParser());
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Acme',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerId,
        name: 'Owner',
        email: 'owner-membership-block-e2e@casso.vn',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        isOperator: false,
        createdAt: new Date(),
      },
      {
        id: memberId,
        name: 'Member',
        email: 'member-membership-block-e2e@casso.vn',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        isOperator: false,
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        userId: ownerId,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId,
        userId: memberId,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('OWNER blocks a member; the member is rejected with MEMBER_BLOCKED on the next request; OWNER unblocks and access returns', async () => {
    const ownerToken = token(ownerId, Role.OWNER);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/${memberId}/block`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const blockedMemberToken = token(memberId, Role.ACCOUNTANT);
    const rejected = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${blockedMemberToken}`)
      .expect(403);
    expect(rejected.body.errorCode).toBe('MEMBER_BLOCKED');

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/${memberId}/unblock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const unblockedMemberToken = token(memberId, Role.ACCOUNTANT);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${unblockedMemberToken}`)
      .expect(200);
  });

  it('OWNER cannot block their own membership', async () => {
    const ownerToken = token(ownerId, Role.OWNER);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/${ownerId}/block`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    expect(response.body.errorCode).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 3: Run the new e2e suites**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern "(admin|membership-block).e2e-spec.ts"`
Expected: PASS (requires Docker for testcontainers — if Docker is unavailable in this environment, state that exception explicitly per `AGENTS.md`'s e2e note rather than skipping silently)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/admin.e2e-spec.ts apps/backend/test/membership-block.e2e-spec.ts
git commit -m "test: add e2e coverage for member block/unblock, both actors"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS, 0 failures

- [ ] **Step 2: Run e2e (if Docker is available)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS, 0 failures. If Docker is unavailable, state this exception explicitly instead of claiming e2e passed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Lint/format**

Run: `npx biome check --write .`
Expected: 0 remaining issues after auto-fix; review the diff for anything unexpected

- [ ] **Step 5: Full verify + domain-check**

Run: `pnpm verify`
Expected: all tasks (lint, type-check, test, arch-check) green

Run the `domain-check` skill (`/domain-check`) per `AGENTS.md`'s "after any backend code change" rule, and fix any violations before treating this plan as complete.

- [ ] **Step 6: Update `docs/wayfinder/feature-map.md`**

Change issue #178's status entry to `in-progress` (or `done` with a `Shipped:` date + PR reference once merged, per `AGENTS.md`'s worktree workflow). Read the current entry for #178 in that file first to match its existing format before editing.
