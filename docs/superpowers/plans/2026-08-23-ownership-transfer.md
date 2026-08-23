# Ownership Transfer Implementation Plan (Issue #322)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the only remaining way to grant `OWNER` — a password+OTP-confirmed, target-accepted `OwnershipTransferRequest` flow — closing issue #322.

**Architecture:** A new `ownership-transfer/` module owns the `OwnershipTransferRequest` domain entity, its repository port, and its TypeORM infrastructure (storage-only, mirroring how `profile/` owns `ChangePasswordOtp` storage). The five use cases that drive the state machine (request, confirm, cancel, accept, decline) live in `auth/application/`, alongside `ChangePasswordRequestUseCase` and `BlockMemberUseCase` — the established home for membership-lifecycle use cases that need `AUTH_EMAIL_SENDER`/`MEMBER_NOTIFICATION_SENDER`. A new `OwnershipTransferController` (in `auth/presentation/`) exposes `organizations/:id/ownership-transfers...` routes, matching `InvitesController`'s shape. The OTP-confirmation step reuses `ChangePasswordRequestUseCase`'s exact mechanism (6-digit OTP, SHA-256 hash, 5-minute TTL, via the already-existing `generateOtp()`/`hashOtp()` helpers in `token-hasher.ts`). The target's accept/decline step has no secret token (ADR-0025) — it's authorized purely by `req.user.userId` matching the request's `toUserId`. Expiry is lazy, reclaimed at the next access to a request (ADR-0015's `IdempotencyKey` pattern), not a cron.

**Tech Stack:** NestJS 11, TypeORM 1.1 (raw-SQL migration), class-validator, React 19 + TanStack Query + shadcn/ui (`Dialog`), Jest 30 (backend), Vitest (frontend).

**Spec:** `CONTEXT.md` Business Rule 16 and `docs/adr/0025-ownership-transfer-no-secret-token.md` record the design settled via the `superpowers:grilling` + `superpowers:domain-modeling` sessions for issue #322. `docs/adr/0024-organization-single-owner-invariant.md` and `CONTEXT.md` Business Rule 15 record the prerequisite (issue #314, shipped PR #323) this flow depends on.

## Global Constraints

- State machine: `PENDING_OTP_CONFIRMATION` → `PENDING_ACCEPTANCE` → `ACCEPTED` \| `DECLINED` \| `CANCELLED` \| `EXPIRED`.
- OTP: 6-digit, SHA-256 hash, 5-minute TTL — reuse `generateOtp()`/`hashOtp()` from `apps/backend/src/modules/auth/application/token-hasher.ts`, do not hand-roll `randomInt`/`createHash` again.
- Acceptance window: 48 hours from the moment OTP is confirmed.
- Only one non-terminal (`PENDING_OTP_CONFIRMATION` or `PENDING_ACCEPTANCE`) request may exist per organization — enforced at the DB layer with a partial unique index, not just an application check (matches the #314 code-review lesson: DTO/app-layer checks alone are not enough).
- No secret token for accept/decline — authorization is `req.user.userId === request.toUserId`, nothing else.
- No new `ErrorCode`: reuse `VALIDATION_ERROR` (bad input / target ineligible at request time), `UNAUTHORIZED` (bad/expired OTP, matching `ChangePasswordConfirmUseCase`'s convention), `FORBIDDEN` (wrong actor), `NOT_FOUND` (request doesn't exist), `CONFLICT` (already-pending request, or acting on a request that's no longer actionable).
- `Permission.OWNERSHIP_TRANSFER_MANAGE` is OWNER-only (added to `Permission` enum + `ROLE_PERMISSIONS[Role.OWNER]` only) — gates request/confirm/cancel. Accept/decline/pending-for-me need only `JwtAuthGuard` (object-level auth, any authenticated org member).
- Every POST route with a side effect is wrapped in `IdempotencyService.execute(...)` per `.claude/rules/api.md`.
- Money is not involved in this feature; the usual VND-integer rule doesn't apply here.
- TDD throughout: RED → GREEN → REFACTOR per task, migrations are the stated TDD exception (still get a spec here, matching the `#314` PR's precedent of testing migrations via a mocked `QueryRunner`).

---

### Task 1: `Permission.OWNERSHIP_TRANSFER_MANAGE` + `OwnershipTransferStatus`

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Modify: `packages/shared-types/src/role-permissions.ts`
- Create: `packages/shared-types/src/ownership-transfer-status.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts` (add a case)

**Interfaces:**
- Produces: `Permission.OWNERSHIP_TRANSFER_MANAGE` (OWNER-only), `OwnershipTransferStatus` type (`'PENDING_OTP_CONFIRMATION' | 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'`), both exported from `@casso-ledger/shared-types`.

- [ ] **Step 1: Write the failing test**

Add to `packages/shared-types/src/role-permissions.spec.ts` (inside the existing `describe('ROLE_PERMISSIONS', ...)` block):

```typescript
it('grants OWNERSHIP_TRANSFER_MANAGE only to OWNER', () => {
  expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
    Permission.OWNERSHIP_TRANSFER_MANAGE,
  );
  expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
    Permission.OWNERSHIP_TRANSFER_MANAGE,
  );
  expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
    Permission.OWNERSHIP_TRANSFER_MANAGE,
  );
  expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
    Permission.OWNERSHIP_TRANSFER_MANAGE,
  );
  expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
    Permission.OWNERSHIP_TRANSFER_MANAGE,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/shared-types`): `npx jest --testPathPattern role-permissions.spec.ts`
Expected: FAIL — `Permission.OWNERSHIP_TRANSFER_MANAGE` doesn't exist yet (TS compile error).

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared-types/src/permission.ts — add as the last member
export enum Permission {
  RECEIVABLE_READ = 'RECEIVABLE_READ',
  RECEIVABLE_AUDIT_READ = 'RECEIVABLE_AUDIT_READ',
  RECEIVABLE_WRITE = 'RECEIVABLE_WRITE',
  RECEIVABLE_WRITE_OFF = 'RECEIVABLE_WRITE_OFF',
  RECEIVABLE_DISPUTE = 'RECEIVABLE_DISPUTE',
  RECEIVABLE_IMPORT = 'RECEIVABLE_IMPORT',
  PAYMENT_ALLOCATE = 'PAYMENT_ALLOCATE',
  PAYMENT_ALLOCATE_UNDO = 'PAYMENT_ALLOCATE_UNDO',
  EMAIL_TEMPLATE_READ = 'EMAIL_TEMPLATE_READ',
  REMINDER_POLICY_WRITE = 'REMINDER_POLICY_WRITE',
  REMINDER_SEND_MANUAL = 'REMINDER_SEND_MANUAL',
  BANK_CONNECTION_READ = 'BANK_CONNECTION_READ',
  BANK_CONNECTION_MANAGE = 'BANK_CONNECTION_MANAGE',
  BANK_CONNECTION_REVEAL_KEY = 'BANK_CONNECTION_REVEAL_KEY',
  SUBSCRIPTION_MANAGE = 'SUBSCRIPTION_MANAGE',
  USER_MANAGE = 'USER_MANAGE',
  ORGANIZATION_MANAGE = 'ORGANIZATION_MANAGE',
  INTERNAL_TASK_MANAGE = 'INTERNAL_TASK_MANAGE',
  REPORT_READ = 'REPORT_READ',
  AUDIT_LOG_READ = 'AUDIT_LOG_READ',
  WEBHOOK_INBOX_READ = 'WEBHOOK_INBOX_READ',
  SWITCH_ORGANIZATION = 'SWITCH_ORGANIZATION',
  CUSTOMER_READ = 'CUSTOMER_READ',
  ORGANIZATION_READ = 'ORGANIZATION_READ',
  CUSTOMER_BANK_ACCOUNT_MANAGE = 'CUSTOMER_BANK_ACCOUNT_MANAGE',
  ORGANIZATION_SMTP_MANAGE = 'ORGANIZATION_SMTP_MANAGE',
  ALERT_READ = 'ALERT_READ',
  MEMBER_BLOCK = 'MEMBER_BLOCK',
  OWNERSHIP_TRANSFER_MANAGE = 'OWNERSHIP_TRANSFER_MANAGE',
}
```

`ROLE_PERMISSIONS[Role.OWNER]` is already `Object.values(Permission)`, so it automatically picks up the new value — no edit needed there. Every other role's array in `role-permissions.ts` is an explicit list that simply never mentions it, so no edit needed for them either.

```typescript
// packages/shared-types/src/ownership-transfer-status.ts
export type OwnershipTransferStatus =
  | 'PENDING_OTP_CONFIRMATION'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';
```

```typescript
// packages/shared-types/src/index.ts
export { type InvoiceSourceType, InvoiceStatus } from './invoice-status';
export type { MembershipStatus } from './membership-status';
export type { OwnershipTransferStatus } from './ownership-transfer-status';
export { PeriodChargeStatus } from './period-charge-status';
export { Permission } from './permission';
export { PlanId } from './plan-id';
export { PlanUpgradeOrderStatus } from './plan-upgrade-order-status';
export { ReceivableStatus } from './receivable-status';
export { INVITABLE_ROLES, Role } from './role';
export { ROLE_PERMISSIONS } from './role-permissions';
export { SubscriptionStatus } from './subscription-status';
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `packages/shared-types`): `npx jest --testPathPattern role-permissions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/permission.ts packages/shared-types/src/role-permissions.spec.ts packages/shared-types/src/ownership-transfer-status.ts packages/shared-types/src/index.ts
git commit -m "feat: add OWNERSHIP_TRANSFER_MANAGE permission and OwnershipTransferStatus"
```

---

### Task 2: `OwnershipTransferRequest` domain entity + repository port

**Files:**
- Create: `apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.ts`
- Create: `apps/backend/src/modules/ownership-transfer/application/ownership-transfer-request-repository.port.ts`
- Test: `apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.spec.ts`

**Interfaces:**
- Consumes: `OwnershipTransferStatus` from `@casso-ledger/shared-types` (Task 1).
- Produces: `OwnershipTransferRequest` class with props `{ id, organizationId, fromUserId, toUserId, status, otpHash, otpExpiresAt, acceptanceExpiresAt, resolvedAt, createdAt }`; methods `isNonTerminal()`, `isOtpExpired(now?)`, `isAcceptanceExpired(now?)`, `isExpired(now?)`, `confirm(acceptanceExpiresAt)`, `accept()`, `decline()`, `cancel()`, `expire()`. `IOwnershipTransferRequestRepository` port with `save`, `findById`, `findNonTerminalByOrganization`, and DI token `OWNERSHIP_TRANSFER_REQUEST_REPOSITORY`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.spec.ts
import { OwnershipTransferRequest } from './ownership-transfer-request';

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('OwnershipTransferRequest', () => {
  it('is non-terminal while pending OTP confirmation or acceptance', () => {
    expect(buildRequest({ status: 'PENDING_OTP_CONFIRMATION' }).isNonTerminal()).toBe(true);
    expect(buildRequest({ status: 'PENDING_ACCEPTANCE' }).isNonTerminal()).toBe(true);
    expect(buildRequest({ status: 'ACCEPTED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'DECLINED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'CANCELLED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'EXPIRED' }).isNonTerminal()).toBe(false);
  });

  it('is OTP-expired only while PENDING_OTP_CONFIRMATION and past otpExpiresAt', () => {
    const request = buildRequest({
      status: 'PENDING_OTP_CONFIRMATION',
      otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    });
    expect(request.isOtpExpired(new Date('2026-08-23T00:04:59.000Z'))).toBe(false);
    expect(request.isOtpExpired(new Date('2026-08-23T00:05:01.000Z'))).toBe(true);
    expect(
      buildRequest({
        status: 'PENDING_ACCEPTANCE',
        otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
      }).isOtpExpired(new Date('2026-08-23T00:05:01.000Z')),
    ).toBe(false);
  });

  it('is acceptance-expired only while PENDING_ACCEPTANCE and past acceptanceExpiresAt', () => {
    const request = buildRequest({
      status: 'PENDING_ACCEPTANCE',
      acceptanceExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(request.isAcceptanceExpired(new Date('2026-08-24T23:59:59.000Z'))).toBe(false);
    expect(request.isAcceptanceExpired(new Date('2026-08-25T00:00:01.000Z'))).toBe(true);
  });

  it('confirm() moves to PENDING_ACCEPTANCE and sets the acceptance window', () => {
    const request = buildRequest({ status: 'PENDING_OTP_CONFIRMATION' });
    const acceptanceExpiresAt = new Date('2026-08-25T00:00:00.000Z');
    const confirmed = request.confirm(acceptanceExpiresAt);
    expect(confirmed.status).toBe('PENDING_ACCEPTANCE');
    expect(confirmed.acceptanceExpiresAt).toBe(acceptanceExpiresAt);
  });

  it('accept()/decline()/cancel()/expire() set status and resolvedAt', () => {
    const base = buildRequest({ status: 'PENDING_ACCEPTANCE' });
    expect(base.accept().status).toBe('ACCEPTED');
    expect(base.accept().resolvedAt).not.toBeNull();
    expect(base.decline().status).toBe('DECLINED');
    expect(base.cancel().status).toBe('CANCELLED');
    expect(base.expire().status).toBe('EXPIRED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns ownership-transfer-request.spec.ts`
Expected: FAIL — `Cannot find module './ownership-transfer-request'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.ts
import type { OwnershipTransferStatus } from '@casso-ledger/shared-types';

export type { OwnershipTransferStatus };

export interface OwnershipTransferRequestProps {
  id: string;
  organizationId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferStatus;
  otpHash: string;
  otpExpiresAt: Date;
  acceptanceExpiresAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export class OwnershipTransferRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly status: OwnershipTransferStatus;
  readonly otpHash: string;
  readonly otpExpiresAt: Date;
  readonly acceptanceExpiresAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: OwnershipTransferRequestProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.fromUserId = props.fromUserId;
    this.toUserId = props.toUserId;
    this.status = props.status;
    this.otpHash = props.otpHash;
    this.otpExpiresAt = props.otpExpiresAt;
    this.acceptanceExpiresAt = props.acceptanceExpiresAt;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
  }

  isNonTerminal(): boolean {
    return (
      this.status === 'PENDING_OTP_CONFIRMATION' ||
      this.status === 'PENDING_ACCEPTANCE'
    );
  }

  isOtpExpired(now: Date = new Date()): boolean {
    return this.status === 'PENDING_OTP_CONFIRMATION' && now > this.otpExpiresAt;
  }

  isAcceptanceExpired(now: Date = new Date()): boolean {
    return (
      this.status === 'PENDING_ACCEPTANCE' &&
      this.acceptanceExpiresAt !== null &&
      now > this.acceptanceExpiresAt
    );
  }

  isExpired(now: Date = new Date()): boolean {
    return this.isOtpExpired(now) || this.isAcceptanceExpired(now);
  }

  confirm(acceptanceExpiresAt: Date): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'PENDING_ACCEPTANCE',
      acceptanceExpiresAt,
    });
  }

  accept(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'ACCEPTED',
      resolvedAt: new Date(),
    });
  }

  decline(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'DECLINED',
      resolvedAt: new Date(),
    });
  }

  cancel(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'CANCELLED',
      resolvedAt: new Date(),
    });
  }

  expire(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'EXPIRED',
      resolvedAt: new Date(),
    });
  }
}
```

```typescript
// apps/backend/src/modules/ownership-transfer/application/ownership-transfer-request-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { OwnershipTransferRequest } from '../domain/ownership-transfer-request';

export interface IOwnershipTransferRequestRepository {
  save(
    request: OwnershipTransferRequest,
    manager?: EntityManager,
  ): Promise<void>;
  findById(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null>;
  findNonTerminalByOrganization(
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null>;
}

export const OWNERSHIP_TRANSFER_REQUEST_REPOSITORY = Symbol(
  'OWNERSHIP_TRANSFER_REQUEST_REPOSITORY',
);
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPatterns ownership-transfer-request.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.ts apps/backend/src/modules/ownership-transfer/domain/ownership-transfer-request.spec.ts apps/backend/src/modules/ownership-transfer/application/ownership-transfer-request-repository.port.ts
git commit -m "feat: add OwnershipTransferRequest domain entity and repository port"
```

---

### Task 3: Infrastructure — ORM entity, TypeORM repository, migration, `OwnershipTransferModule`

**Files:**
- Create: `apps/backend/src/modules/ownership-transfer/infrastructure/ownership-transfer-request.orm-entity.ts`
- Create: `apps/backend/src/modules/ownership-transfer/infrastructure/typeorm-ownership-transfer-request.repository.ts`
- Create: `apps/backend/src/modules/ownership-transfer/infrastructure/typeorm-ownership-transfer-request.repository.spec.ts`
- Create: `apps/backend/src/modules/ownership-transfer/ownership-transfer.module.ts`
- Create: `apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.ts`
- Create: `apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.spec.ts`

**Interfaces:**
- Consumes: `OwnershipTransferRequest`, `IOwnershipTransferRequestRepository`, `OWNERSHIP_TRANSFER_REQUEST_REPOSITORY` from Task 2.
- Produces: `OwnershipTransferModule` exporting `OWNERSHIP_TRANSFER_REQUEST_REPOSITORY` for `AuthModule` to import (Task 6).

- [ ] **Step 1: Write the failing test (migration)**

```typescript
// apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddOwnershipTransferRequestsTable20260904000000 } from './20260904000000-add-ownership-transfer-requests-table';

describe('AddOwnershipTransferRequestsTable20260904000000', () => {
  it('creates the table and the one-non-terminal-per-org partial unique index', async () => {
    const migration = new AddOwnershipTransferRequestsTable20260904000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "ownership_transfer_requests"',
    );
    expect(sql).toContain('"fromUserId" character varying NOT NULL');
    expect(sql).toContain('"toUserId" character varying NOT NULL');
    expect(sql).toContain('"status" character varying NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    expect(sql).toContain(
      `WHERE "status" IN ('PENDING_OTP_CONFIRMATION', 'PENDING_ACCEPTANCE')`,
    );
  });

  it('reverts by dropping the indexes and table', async () => {
    const migration = new AddOwnershipTransferRequestsTable20260904000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_ownership_transfer_requests_organization"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "ownership_transfer_requests"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns add-ownership-transfer-requests-table`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnershipTransferRequestsTable20260904000000
  implements MigrationInterface
{
  name = 'AddOwnershipTransferRequestsTable20260904000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ownership_transfer_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "fromUserId" character varying NOT NULL,
        "toUserId" character varying NOT NULL,
        "status" character varying NOT NULL,
        "otpHash" character varying NOT NULL,
        "otpExpiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "acceptanceExpiresAt" TIMESTAMP WITH TIME ZONE,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ownership_transfer_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ownership_transfer_requests_organization" ON "ownership_transfer_requests" ("organizationId")',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"
      ON "ownership_transfer_requests" ("organizationId")
      WHERE "status" IN ('PENDING_OTP_CONFIRMATION', 'PENDING_ACCEPTANCE')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_ownership_transfer_requests_one_non_terminal_per_org"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ownership_transfer_requests_organization"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "ownership_transfer_requests"',
    );
  }
}
```

```typescript
// apps/backend/src/modules/ownership-transfer/infrastructure/ownership-transfer-request.orm-entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { OwnershipTransferStatus } from '../domain/ownership-transfer-request';

@Entity({ name: 'ownership_transfer_requests' })
@Index(['organizationId'])
export class OwnershipTransferRequestOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  fromUserId: string;

  @Column({ type: 'varchar' })
  toUserId: string;

  @Column({ type: 'varchar' })
  status: OwnershipTransferStatus;

  @Column({ type: 'varchar' })
  otpHash: string;

  @Column({ type: 'timestamptz' })
  otpExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptanceExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

```typescript
// apps/backend/src/modules/ownership-transfer/infrastructure/typeorm-ownership-transfer-request.repository.ts
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource, In, Not } from 'typeorm';
import type { IOwnershipTransferRequestRepository } from '../application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { OwnershipTransferRequestOrmEntity } from './ownership-transfer-request.orm-entity';

const TERMINAL_STATUSES = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'];

function toDomain(
  row: OwnershipTransferRequestOrmEntity,
): OwnershipTransferRequest {
  return new OwnershipTransferRequest({
    id: row.id,
    organizationId: row.organizationId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status,
    otpHash: row.otpHash,
    otpExpiresAt: row.otpExpiresAt,
    acceptanceExpiresAt: row.acceptanceExpiresAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  });
}

function toOrm(
  request: OwnershipTransferRequest,
): OwnershipTransferRequestOrmEntity {
  const row = new OwnershipTransferRequestOrmEntity();
  row.id = request.id;
  row.organizationId = request.organizationId;
  row.fromUserId = request.fromUserId;
  row.toUserId = request.toUserId;
  row.status = request.status;
  row.otpHash = request.otpHash;
  row.otpExpiresAt = request.otpExpiresAt;
  row.acceptanceExpiresAt = request.acceptanceExpiresAt;
  row.resolvedAt = request.resolvedAt;
  row.createdAt = request.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOwnershipTransferRequestRepository
  implements IOwnershipTransferRequestRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async save(
    request: OwnershipTransferRequest,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity)
    ).save(toOrm(request));
  }

  async findById(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null> {
    const repository = manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.id = :id', { id })
          .andWhere('request.organizationId = :organizationId', {
            organizationId,
          })
          .getOne()
      : await repository.findOne({ where: { id, organizationId } });
    return row ? toDomain(row) : null;
  }

  async findNonTerminalByOrganization(
    organizationId: string,
    manager?: EntityManager,
  ): Promise<OwnershipTransferRequest | null> {
    const repository = manager
      ? manager.getRepository(OwnershipTransferRequestOrmEntity)
      : this.dataSource.getRepository(OwnershipTransferRequestOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.organizationId = :organizationId', {
            organizationId,
          })
          .andWhere('request.status NOT IN (:...terminal)', {
            terminal: TERMINAL_STATUSES,
          })
          .getOne()
      : await repository.findOne({
          where: {
            organizationId,
            status: Not(In(TERMINAL_STATUSES)),
          },
        });
    return row ? toDomain(row) : null;
  }
}
```

```typescript
// apps/backend/src/modules/ownership-transfer/ownership-transfer.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OWNERSHIP_TRANSFER_REQUEST_REPOSITORY } from './application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequestOrmEntity } from './infrastructure/ownership-transfer-request.orm-entity';
import { TypeOrmOwnershipTransferRequestRepository } from './infrastructure/typeorm-ownership-transfer-request.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OwnershipTransferRequestOrmEntity])],
  providers: [
    {
      provide: OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
      useClass: TypeOrmOwnershipTransferRequestRepository,
    },
  ],
  exports: [OWNERSHIP_TRANSFER_REQUEST_REPOSITORY],
})
export class OwnershipTransferModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

```typescript
// apps/backend/src/modules/ownership-transfer/infrastructure/typeorm-ownership-transfer-request.repository.spec.ts
import { DataSource } from 'typeorm';
import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { TypeOrmOwnershipTransferRequestRepository } from './typeorm-ownership-transfer-request.repository';

function buildRequest() {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
  });
}

describe('TypeOrmOwnershipTransferRequestRepository', () => {
  it('saves a request via the ORM repository', async () => {
    const save = jest.fn();
    const ormRepo = { save };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(ormRepo),
    } as unknown as DataSource;
    const repo = new TypeOrmOwnershipTransferRequestRepository(dataSource);

    await repo.save(buildRequest());

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1', status: 'PENDING_OTP_CONFIRMATION' }),
    );
  });

  it('findById scopes by organizationId', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const ormRepo = { findOne };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(ormRepo),
    } as unknown as DataSource;
    const repo = new TypeOrmOwnershipTransferRequestRepository(dataSource);

    await repo.findById('req-1', 'org-1');

    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'req-1', organizationId: 'org-1' },
    });
  });
});
```

Run (from `apps/backend`): `npx jest --testPathPatterns "ownership-transfer|add-ownership-transfer-requests-table"`
Expected: PASS (domain spec from Task 2, migration spec, and repository spec).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/ownership-transfer/infrastructure apps/backend/src/modules/ownership-transfer/ownership-transfer.module.ts apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.ts apps/backend/src/database/migrations/20260904000000-add-ownership-transfer-requests-table.spec.ts
git commit -m "feat: add ownership_transfer_requests table and TypeORM repository"
```

---

### Task 4: Email port — OTP + target-notification emails

**Files:**
- Modify: `apps/backend/src/modules/auth/application/member-notification.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts` (add cases to the existing file)

**Interfaces:**
- Produces: `IMemberNotificationSender.sendOwnershipTransferOtpEmail(to: string, otp: string): Promise<void>` and `sendOwnershipTransferPendingEmail(to: string, organizationName: string): Promise<void>`, both implemented on `ResendAuthEmailSenderAdapter`.

- [ ] **Step 1: Write the failing test**

Find the existing describe block in `resend-auth-email-sender.adapter.spec.ts` (it already has cases like `sendMemberBlockedEmail`) and add:

```typescript
it('enqueues an ownership transfer OTP email', async () => {
  const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const adapter = new ResendAuthEmailSenderAdapter(emailQueue as never);

  await adapter.sendOwnershipTransferOtpEmail('owner@acme.vn', '123456');

  expect(emailQueue.add).toHaveBeenCalledWith(
    'send-auth-email',
    expect.objectContaining({
      to: 'owner@acme.vn',
      emailType: 'OWNERSHIP_TRANSFER_OTP',
    }),
  );
});

it('enqueues an ownership transfer pending notification email', async () => {
  const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const adapter = new ResendAuthEmailSenderAdapter(emailQueue as never);

  await adapter.sendOwnershipTransferPendingEmail(
    'target@acme.vn',
    'Acme Corp',
  );

  expect(emailQueue.add).toHaveBeenCalledWith(
    'send-auth-email',
    expect.objectContaining({
      to: 'target@acme.vn',
      emailType: 'OWNERSHIP_TRANSFER_PENDING',
    }),
  );
});
```

If the spec file constructs `ResendAuthEmailSenderAdapter` differently (check the file's existing setup first and match its exact pattern — e.g. it may already have a shared `emailQueue`/`adapter` built in a `beforeEach`), reuse that instead of duplicating construction.

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns resend-auth-email-sender.adapter.spec.ts`
Expected: FAIL — `adapter.sendOwnershipTransferOtpEmail is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/member-notification.port.ts
export interface IMemberNotificationSender {
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>;
  sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
  sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
  sendOwnershipTransferOtpEmail(to: string, otp: string): Promise<void>;
  sendOwnershipTransferPendingEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
}

export const MEMBER_NOTIFICATION_SENDER = Symbol('MEMBER_NOTIFICATION_SENDER');
```

In `resend-auth-email-sender.adapter.ts`, first widen the `enqueue` method's `emailType` union (find the existing union listing `'AUTH_VERIFICATION' | 'AUTH_PASSWORD_RESET' | ...` and add two members):

```typescript
      | 'ORGANIZATION_APPROVED'
      | 'ORGANIZATION_REJECTED'
      | 'OWNERSHIP_TRANSFER_OTP'
      | 'OWNERSHIP_TRANSFER_PENDING',
```

Then add the two methods (place them near `sendMemberBlockedEmail`/`sendMemberUnblockedEmail`):

```typescript
  async sendOwnershipTransferOtpEmail(to: string, otp: string): Promise<void> {
    return this.enqueue(
      to,
      'Mã OTP chuyển quyền sở hữu | Casso Ledger',
      buildCassoEmail({
        title: 'Mã OTP chuyển quyền sở hữu',
        greeting: 'Kính chào Quý khách,',
        highlight: { label: 'Mã OTP', value: otp },
        paragraphs: [
          'Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.',
        ],
      }),
      'OWNERSHIP_TRANSFER_OTP',
    );
  }

  async sendOwnershipTransferPendingEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    return this.enqueue(
      to,
      `Yêu cầu chuyển quyền sở hữu ${subjectPart(organizationName)}`,
      buildCassoEmail({
        title: 'Yêu cầu chuyển quyền sở hữu',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Quý khách được đề nghị trở thành chủ sở hữu (OWNER) của tổ chức ${organizationName} trên Casso Ledger.`,
          'Vui lòng đăng nhập và vào mục Cài đặt để chấp nhận hoặc từ chối yêu cầu này.',
        ],
      }),
      'OWNERSHIP_TRANSFER_PENDING',
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPatterns resend-auth-email-sender.adapter.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/member-notification.port.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts
git commit -m "feat: add ownership transfer OTP and pending-notification emails"
```

---

### Task 5: `RequestOwnershipTransferUseCase`

**Files:**
- Create: `apps/backend/src/modules/ownership-transfer/application/reclaim-if-expired.ts`
- Create: `apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.spec.ts`

**Interfaces:**
- Consumes: `IOwnershipTransferRequestRepository`/`OWNERSHIP_TRANSFER_REQUEST_REPOSITORY` (Task 2/3), `IMembershipRepository`/`MEMBERSHIP_REPOSITORY` (`organizations/application/membership-repository.port.ts`), `IUserRepository`/`USER_REPOSITORY` (`users/application/user-repository.port.ts`), `IMemberNotificationSender`/`MEMBER_NOTIFICATION_SENDER` (Task 4), `comparePassword` (`auth/application/password-hasher.ts`), `generateOtp` (`auth/application/token-hasher.ts`).
- Produces: `reclaimIfExpired(repo, request, manager): Promise<OwnershipTransferRequest>` (reused by every later use case). `RequestOwnershipTransferUseCase.execute(input: { organizationId: string; requestedByUserId: string; targetUserId: string; currentPassword: string }): Promise<OwnershipTransferRequest>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/ownership-transfer/application/reclaim-if-expired.spec.ts
import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { reclaimIfExpired } from './reclaim-if-expired';

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('reclaimIfExpired', () => {
  it('leaves a non-expired request untouched', async () => {
    const request = buildRequest();
    const save = jest.fn();
    const manager = {} as never;

    const result = await reclaimIfExpired(
      { save } as never,
      request,
      manager,
    );

    expect(result).toBe(request);
    expect(save).not.toHaveBeenCalled();
  });

  it('expires and saves a stale request', async () => {
    const request = buildRequest({
      otpExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const save = jest.fn();
    const manager = {} as never;

    const result = await reclaimIfExpired(
      { save } as never,
      request,
      manager,
    );

    expect(result.status).toBe('EXPIRED');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      manager,
    );
  });
});
```

```typescript
// apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { RequestOwnershipTransferUseCase } from './request-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildUser(overrides: Partial<{ id: string; email: string; passwordHash: string }> = {}) {
  return {
    id: 'owner-1',
    email: 'owner@acme.vn',
    passwordHash: 'hashed-correct-password',
    ...overrides,
  };
}

function buildMembership(
  overrides: Partial<{ role: string; joinedAt: Date | null; status: string }> = {},
) {
  return {
    role: 'ACCOUNTANT',
    joinedAt: new Date('2026-08-01'),
    status: 'ACTIVE',
    isActive: () => overrides.joinedAt !== null,
    isBlocked: () => overrides.status === 'BLOCKED',
    ...overrides,
  };
}

jest.mock('../application/password-hasher', () => ({
  comparePassword: jest.fn(),
}));

import { comparePassword } from './password-hasher';

function buildUseCase(overrides: {
  userRepo?: Record<string, jest.Mock>;
  membershipRepo?: Record<string, jest.Mock>;
  requestRepo?: Record<string, jest.Mock>;
  notificationSender?: Record<string, jest.Mock>;
} = {}) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue(buildUser()),
    ...overrides.userRepo,
  };
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(
      buildMembership({ joinedAt: new Date('2026-08-01') }),
    ),
    ...overrides.membershipRepo,
  };
  const requestRepo = {
    findNonTerminalByOrganization: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const notificationSender = {
    sendOwnershipTransferOtpEmail: jest.fn(),
    ...overrides.notificationSender,
  };
  return {
    useCase: new RequestOwnershipTransferUseCase(
      requestRepo as never,
      membershipRepo as never,
      userRepo as never,
      notificationSender as never,
      dataSource as never,
    ),
    userRepo,
    membershipRepo,
    requestRepo,
    notificationSender,
  };
}

describe('RequestOwnershipTransferUseCase', () => {
  beforeEach(() => {
    (comparePassword as jest.Mock).mockResolvedValue(true);
  });

  it('creates a PENDING_OTP_CONFIRMATION request and emails the OTP', async () => {
    const { useCase, requestRepo, notificationSender } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestedByUserId: 'owner-1',
      targetUserId: 'target-1',
      currentPassword: 'correct-password',
    });

    expect(result.status).toBe('PENDING_OTP_CONFIRMATION');
    expect(result.fromUserId).toBe('owner-1');
    expect(result.toUserId).toBe('target-1');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_OTP_CONFIRMATION' }),
      manager,
    );
    expect(notificationSender.sendOwnershipTransferOtpEmail).toHaveBeenCalledWith(
      'owner@acme.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('rejects targeting yourself', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'owner-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects an incorrect current password', async () => {
    (comparePassword as jest.Mock).mockResolvedValue(false);
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'wrong-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects a target who is already OWNER', async () => {
    const { useCase } = buildUseCase({
      membershipRepo: {
        findByUserAndOrganization: jest
          .fn()
          .mockResolvedValue(buildMembership({ role: 'OWNER', joinedAt: new Date('2026-08-01') })),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects when another non-terminal request already exists', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findNonTerminalByOrganization: jest.fn().mockResolvedValue(
          { isExpired: () => false, isNonTerminal: () => true },
        ),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestedByUserId: 'owner-1',
        targetUserId: 'target-1',
        currentPassword: 'correct-password',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns "reclaim-if-expired|request-ownership-transfer.usecase"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/ownership-transfer/application/reclaim-if-expired.ts
import type { EntityManager } from 'typeorm';
import type { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import type { IOwnershipTransferRequestRepository } from './ownership-transfer-request-repository.port';

// ADR-0015-style lazy reclaim: a request past its current stage's TTL is
// flipped to EXPIRED the next time anything touches it (create/view/confirm/
// cancel/accept/decline), not by a cron. Called from inside the caller's
// write transaction so the flip is atomic with whatever check follows it.
export async function reclaimIfExpired(
  repo: IOwnershipTransferRequestRepository,
  request: OwnershipTransferRequest,
  manager: EntityManager,
): Promise<OwnershipTransferRequest> {
  if (!request.isExpired()) return request;
  const expired = request.expire();
  await repo.save(expired, manager);
  return expired;
}
```

```typescript
// apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../users/application/user-repository.port';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from './member-notification.port';
import { comparePassword } from './password-hasher';
import { generateOtp } from './token-hasher';

export interface RequestOwnershipTransferInput {
  organizationId: string;
  requestedByUserId: string;
  targetUserId: string;
  currentPassword: string;
}

const OTP_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class RequestOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly notificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: RequestOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestedByUserId, targetUserId, currentPassword } =
      input;

    if (targetUserId === requestedByUserId) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Không thể chuyển quyền sở hữu cho chính mình.',
      );
    }

    const user = await this.userRepo.findById(requestedByUserId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
    }
    const validPassword = await comparePassword(
      currentPassword,
      user.passwordHash,
    );
    if (!validPassword) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Mật khẩu hiện tại không đúng.',
      );
    }

    const targetMembership = await this.membershipRepo.findByUserAndOrganization(
      targetUserId,
      organizationId,
    );
    if (
      !targetMembership ||
      !targetMembership.isActive() ||
      targetMembership.isBlocked()
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Người nhận phải là thành viên đang hoạt động của tổ chức.',
      );
    }
    if (targetMembership.role === Role.OWNER) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Người nhận đã là OWNER.');
    }

    const { otp, hash } = generateOtp();

    const request = await this.dataSource.transaction(async (manager) => {
      const existing = await this.requestRepo.findNonTerminalByOrganization(
        organizationId,
        manager,
      );
      if (existing) {
        const reclaimed = await reclaimIfExpired(
          this.requestRepo,
          existing,
          manager,
        );
        if (reclaimed.isNonTerminal()) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Đã có một yêu cầu chuyển quyền sở hữu đang chờ xử lý.',
          );
        }
      }

      const created = new OwnershipTransferRequest({
        id: randomUUID(),
        organizationId,
        fromUserId: requestedByUserId,
        toUserId: targetUserId,
        status: 'PENDING_OTP_CONFIRMATION',
        otpHash: hash,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        acceptanceExpiresAt: null,
        resolvedAt: null,
        createdAt: new Date(),
      });
      await this.requestRepo.save(created, manager);
      return created;
    });

    await this.notificationSender.sendOwnershipTransferOtpEmail(
      user.email,
      otp,
    );

    return request;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `npx jest --testPathPatterns "reclaim-if-expired|request-ownership-transfer.usecase"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/ownership-transfer/application/reclaim-if-expired.ts apps/backend/src/modules/ownership-transfer/application/reclaim-if-expired.spec.ts apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/request-ownership-transfer.usecase.spec.ts
git commit -m "feat: add RequestOwnershipTransferUseCase"
```

---

### Task 6: `ConfirmOwnershipTransferUseCase`

**Files:**
- Create: `apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.spec.ts`

**Interfaces:**
- Consumes: `reclaimIfExpired` (Task 5), `hashOtp` (`auth/application/token-hasher.ts`), `IOwnershipTransferRequestRepository`, `IUserRepository`, `IOrganizationRepository` (`organizations/application/organization-repository.port.ts`), `IMemberNotificationSender`.
- Produces: `ConfirmOwnershipTransferUseCase.execute(input: { organizationId: string; requestId: string; requestedByUserId: string; otp: string }): Promise<OwnershipTransferRequest>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { ConfirmOwnershipTransferUseCase } from './confirm-ownership-transfer.usecase';
import { hashOtp } from './token-hasher';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: hashOtp('123456'),
    otpExpiresAt: new Date(Date.now() + 60_000),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildUseCase(overrides: {
  requestRepo?: Record<string, jest.Mock>;
  userRepo?: Record<string, jest.Mock>;
  organizationRepo?: Record<string, jest.Mock>;
  notificationSender?: Record<string, jest.Mock>;
} = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'target-1', email: 'target@acme.vn' }),
    ...overrides.userRepo,
  };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme Corp' }),
    ...overrides.organizationRepo,
  };
  const notificationSender = {
    sendOwnershipTransferPendingEmail: jest.fn(),
    ...overrides.notificationSender,
  };
  return {
    useCase: new ConfirmOwnershipTransferUseCase(
      requestRepo as never,
      userRepo as never,
      organizationRepo as never,
      notificationSender as never,
      dataSource as never,
    ),
    requestRepo,
    userRepo,
    organizationRepo,
    notificationSender,
  };
}

describe('ConfirmOwnershipTransferUseCase', () => {
  it('moves the request to PENDING_ACCEPTANCE and emails the target', async () => {
    const { useCase, requestRepo, notificationSender } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      requestedByUserId: 'owner-1',
      otp: '123456',
    });

    expect(result.status).toBe('PENDING_ACCEPTANCE');
    expect(result.acceptanceExpiresAt).not.toBeNull();
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_ACCEPTANCE' }),
      manager,
    );
    expect(notificationSender.sendOwnershipTransferPendingEmail).toHaveBeenCalledWith(
      'target@acme.vn',
      'Acme Corp',
    );
  });

  it('rejects a wrong OTP', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
        otp: '000000',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.UNAUTHORIZED });
  });

  it('rejects an actor who did not create the request', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'someone-else',
        otp: '123456',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects confirming a request that already left PENDING_OTP_CONFIRMATION', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildRequest({ status: 'PENDING_ACCEPTANCE' })),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
        otp: '123456',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns confirm-ownership-transfer.usecase`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from '../../organizations/application/organization-repository.port';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../users/application/user-repository.port';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from './member-notification.port';
import { hashOtp } from './token-hasher';

export interface ConfirmOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  requestedByUserId: string;
  otp: string;
}

const ACCEPTANCE_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ConfirmOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly notificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: ConfirmOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, requestedByUserId, otp } = input;

    const confirmed = await this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findById(
        requestId,
        organizationId,
        manager,
      );
      if (!request) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy yêu cầu chuyển quyền sở hữu.',
        );
      }
      if (request.fromUserId !== requestedByUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Chỉ người khởi tạo yêu cầu mới có thể xác nhận.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (reclaimed.status !== 'PENDING_OTP_CONFIRMATION') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu không còn ở trạng thái chờ xác nhận OTP.',
        );
      }

      if (hashOtp(otp) !== reclaimed.otpHash) {
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          'OTP không hợp lệ hoặc đã hết hạn.',
        );
      }

      const nextRequest = reclaimed.confirm(
        new Date(Date.now() + ACCEPTANCE_TTL_MS),
      );
      await this.requestRepo.save(nextRequest, manager);
      return nextRequest;
    });

    const [targetUser, organization] = await Promise.all([
      this.userRepo.findById(confirmed.toUserId),
      this.organizationRepo.findById(confirmed.organizationId),
    ]);
    if (targetUser && organization) {
      await this.notificationSender.sendOwnershipTransferPendingEmail(
        targetUser.email,
        organization.name,
      );
    }

    return confirmed;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPatterns confirm-ownership-transfer.usecase`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/confirm-ownership-transfer.usecase.spec.ts
git commit -m "feat: add ConfirmOwnershipTransferUseCase"
```

---

### Task 7: `CancelOwnershipTransferUseCase`

**Files:**
- Create: `apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.spec.ts`

**Interfaces:**
- Consumes: `reclaimIfExpired`, `IOwnershipTransferRequestRepository`.
- Produces: `CancelOwnershipTransferUseCase.execute(input: { organizationId: string; requestId: string; requestedByUserId: string }): Promise<OwnershipTransferRequest>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { CancelOwnershipTransferUseCase } from './cancel-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildUseCase(requestRepoOverrides: Record<string, jest.Mock> = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...requestRepoOverrides,
  };
  return {
    useCase: new CancelOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    ),
    requestRepo,
  };
}

describe('CancelOwnershipTransferUseCase', () => {
  it('cancels a non-terminal request created by the caller', async () => {
    const { useCase, requestRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      requestedByUserId: 'owner-1',
    });

    expect(result.status).toBe('CANCELLED');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
      manager,
    );
  });

  it('rejects an actor who did not create the request', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'someone-else',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects cancelling an already-terminal request', async () => {
    const { useCase } = buildUseCase({
      findById: jest.fn().mockResolvedValue(buildRequest({ status: 'ACCEPTED' })),
      save: jest.fn(),
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        requestedByUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPatterns cancel-ownership-transfer.usecase`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface CancelOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  requestedByUserId: string;
}

@Injectable()
export class CancelOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: CancelOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, requestedByUserId } = input;

    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findById(
        requestId,
        organizationId,
        manager,
      );
      if (!request) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy yêu cầu chuyển quyền sở hữu.',
        );
      }
      if (request.fromUserId !== requestedByUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Chỉ người khởi tạo yêu cầu mới có thể huỷ.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (!reclaimed.isNonTerminal()) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu đã được xử lý hoặc hết hạn.',
        );
      }

      const cancelled = reclaimed.cancel();
      await this.requestRepo.save(cancelled, manager);
      return cancelled;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPatterns cancel-ownership-transfer.usecase`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/cancel-ownership-transfer.usecase.spec.ts
git commit -m "feat: add CancelOwnershipTransferUseCase"
```

---

### Task 8: `AcceptOwnershipTransferUseCase` + `DeclineOwnershipTransferUseCase`

**Files:**
- Create: `apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.ts`
- Create: `apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.spec.ts`

**Interfaces:**
- Consumes: `reclaimIfExpired`, `IOwnershipTransferRequestRepository`, `IMembershipRepository` (`countActiveByRole` not needed here — the atomic swap itself keeps the count at exactly one).
- Produces: `AcceptOwnershipTransferUseCase.execute(input: { organizationId: string; requestId: string; actingUserId: string }): Promise<OwnershipTransferRequest>` — on success, the target `Membership` is now `Role.OWNER` and the requester's `Membership` is now `Role.FINANCE_MANAGER`. `DeclineOwnershipTransferUseCase.execute(input: { organizationId: string; requestId: string; actingUserId: string }): Promise<OwnershipTransferRequest>`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { AcceptOwnershipTransferUseCase } from './accept-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildMembership(role: Role, joinedAt: Date | null = new Date('2026-08-01')) {
  return {
    role,
    joinedAt,
    isActive: () => joinedAt !== null,
    isBlocked: () => false,
    withRole: jest.fn().mockImplementation((newRole: Role) => ({
      role: newRole,
      joinedAt,
      isActive: () => joinedAt !== null,
      isBlocked: () => false,
    })),
  };
}

function buildUseCase(overrides: {
  requestRepo?: Record<string, jest.Mock>;
  membershipRepo?: Record<string, jest.Mock>;
} = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const targetMembership = buildMembership(Role.ACCOUNTANT);
  const ownerMembership = buildMembership(Role.OWNER);
  const membershipRepo = {
    findByUserAndOrganization: jest
      .fn()
      .mockImplementation((userId: string) =>
        userId === 'target-1' ? targetMembership : ownerMembership,
      ),
    save: jest.fn(),
    ...overrides.membershipRepo,
  };
  return {
    useCase: new AcceptOwnershipTransferUseCase(
      requestRepo as never,
      membershipRepo as never,
      dataSource as never,
    ),
    requestRepo,
    membershipRepo,
    targetMembership,
    ownerMembership,
  };
}

describe('AcceptOwnershipTransferUseCase', () => {
  it('promotes the target to OWNER and demotes the requester to FINANCE_MANAGER', async () => {
    const { useCase, requestRepo, membershipRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      actingUserId: 'target-1',
    });

    expect(result.status).toBe('ACCEPTED');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACCEPTED' }),
      manager,
    );
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.FINANCE_MANAGER }),
      manager,
    );
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.OWNER }),
      manager,
    );
  });

  it('rejects an actor who is not the request target', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'someone-else',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects when the target membership is no longer active', async () => {
    const { useCase } = buildUseCase({
      membershipRepo: {
        findByUserAndOrganization: jest
          .fn()
          .mockResolvedValue(buildMembership(Role.ACCOUNTANT, null)),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'target-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('rejects accepting a request that is not PENDING_ACCEPTANCE', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildRequest({ status: 'CANCELLED' })),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'target-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
```

```typescript
// apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { DeclineOwnershipTransferUseCase } from './decline-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildUseCase(requestRepoOverrides: Record<string, jest.Mock> = {}) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...requestRepoOverrides,
  };
  return {
    useCase: new DeclineOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    ),
    requestRepo,
  };
}

describe('DeclineOwnershipTransferUseCase', () => {
  it('declines a PENDING_ACCEPTANCE request targeted at the caller', async () => {
    const { useCase, requestRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      actingUserId: 'target-1',
    });

    expect(result.status).toBe('DECLINED');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DECLINED' }),
      manager,
    );
  });

  it('rejects an actor who is not the request target', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'someone-else',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects declining a request that is not PENDING_ACCEPTANCE', async () => {
    const { useCase } = buildUseCase({
      findById: jest.fn().mockResolvedValue(buildRequest({ status: 'EXPIRED' })),
      save: jest.fn(),
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'target-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/backend`): `npx jest --testPathPatterns "accept-ownership-transfer.usecase|decline-ownership-transfer.usecase"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface AcceptOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  actingUserId: string;
}

@Injectable()
export class AcceptOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: AcceptOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, actingUserId } = input;

    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findById(
        requestId,
        organizationId,
        manager,
      );
      if (!request) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy yêu cầu chuyển quyền sở hữu.',
        );
      }
      if (request.toUserId !== actingUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Bạn không phải người được đề nghị nhận quyền sở hữu.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (reclaimed.status !== 'PENDING_ACCEPTANCE') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu không còn ở trạng thái chờ chấp nhận.',
        );
      }

      // Re-validate every precondition against current state — never trust
      // what was true when the request was created or confirmed.
      const targetMembership = await this.membershipRepo.findByUserAndOrganization(
        reclaimed.toUserId,
        organizationId,
        manager,
      );
      if (
        !targetMembership ||
        !targetMembership.isActive() ||
        targetMembership.isBlocked()
      ) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Bạn không còn đủ điều kiện nhận quyền sở hữu.',
        );
      }

      const fromMembership = await this.membershipRepo.findByUserAndOrganization(
        reclaimed.fromUserId,
        organizationId,
        manager,
      );
      if (!fromMembership || fromMembership.role !== Role.OWNER) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Người chuyển quyền không còn là OWNER của tổ chức.',
        );
      }

      await this.membershipRepo.save(
        fromMembership.withRole(Role.FINANCE_MANAGER),
        manager,
      );
      await this.membershipRepo.save(
        targetMembership.withRole(Role.OWNER),
        manager,
      );

      const accepted = reclaimed.accept();
      await this.requestRepo.save(accepted, manager);
      return accepted;
    });
  }
}
```

```typescript
// apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

export interface DeclineOwnershipTransferInput {
  organizationId: string;
  requestId: string;
  actingUserId: string;
}

@Injectable()
export class DeclineOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: DeclineOwnershipTransferInput,
  ): Promise<OwnershipTransferRequest> {
    const { organizationId, requestId, actingUserId } = input;

    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findById(
        requestId,
        organizationId,
        manager,
      );
      if (!request) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy yêu cầu chuyển quyền sở hữu.',
        );
      }
      if (request.toUserId !== actingUserId) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Bạn không phải người được đề nghị nhận quyền sở hữu.',
        );
      }

      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      if (reclaimed.status !== 'PENDING_ACCEPTANCE') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Yêu cầu không còn ở trạng thái chờ chấp nhận.',
        );
      }

      const declined = reclaimed.decline();
      await this.requestRepo.save(declined, manager);
      return declined;
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `npx jest --testPathPatterns "accept-ownership-transfer.usecase|decline-ownership-transfer.usecase"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/accept-ownership-transfer.usecase.spec.ts apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/decline-ownership-transfer.usecase.spec.ts
git commit -m "feat: add AcceptOwnershipTransferUseCase and DeclineOwnershipTransferUseCase"
```

---

### Task 9: `GetCurrentOwnershipTransferUseCase` + `GetPendingOwnershipTransferForMeUseCase`

**Files:**
- Create: `apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.ts`
- Create: `apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.spec.ts`

**Interfaces:**
- Consumes: `reclaimIfExpired`, `IOwnershipTransferRequestRepository`.
- Produces: `GetCurrentOwnershipTransferUseCase.execute(organizationId: string): Promise<OwnershipTransferRequest | null>` (any non-terminal request for the org, for the OWNER's own view). `GetPendingOwnershipTransferForMeUseCase.execute(organizationId: string, userId: string): Promise<OwnershipTransferRequest | null>` (only when `PENDING_ACCEPTANCE` and targeted at `userId`).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.spec.ts
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { GetCurrentOwnershipTransferUseCase } from './get-current-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date(Date.now() + 60_000),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('GetCurrentOwnershipTransferUseCase', () => {
  it('returns the non-terminal request for the organization', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    const result = await useCase.execute('org-1');

    expect(result?.id).toBe('req-1');
  });

  it('returns null when there is none', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1')).toBeNull();
  });

  it('returns null and reclaims a stale request', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest
        .fn()
        .mockResolvedValue(buildRequest({ otpExpiresAt: new Date('2020-01-01') })),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1')).toBeNull();
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      manager,
    );
  });
});
```

```typescript
// apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.spec.ts
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { GetPendingOwnershipTransferForMeUseCase } from './get-pending-ownership-transfer-for-me.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('GetPendingOwnershipTransferForMeUseCase', () => {
  it('returns the request when it targets the caller', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    const result = await useCase.execute('org-1', 'target-1');

    expect(result?.id).toBe('req-1');
  });

  it('returns null when it targets someone else', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1', 'someone-else')).toBeNull();
  });

  it('returns null while still PENDING_OTP_CONFIRMATION (target has nothing to act on yet)', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest
        .fn()
        .mockResolvedValue(buildRequest({ status: 'PENDING_OTP_CONFIRMATION' })),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1', 'target-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/backend`): `npx jest --testPathPatterns "get-current-ownership-transfer|get-pending-ownership-transfer-for-me"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

@Injectable()
export class GetCurrentOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    organizationId: string,
  ): Promise<OwnershipTransferRequest | null> {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findNonTerminalByOrganization(
        organizationId,
        manager,
      );
      if (!request) return null;
      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      return reclaimed.isNonTerminal() ? reclaimed : null;
    });
  }
}
```

```typescript
// apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

@Injectable()
export class GetPendingOwnershipTransferForMeUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    organizationId: string,
    userId: string,
  ): Promise<OwnershipTransferRequest | null> {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findNonTerminalByOrganization(
        organizationId,
        manager,
      );
      if (!request || request.toUserId !== userId) return null;
      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      return reclaimed.status === 'PENDING_ACCEPTANCE' ? reclaimed : null;
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `npx jest --testPathPatterns "get-current-ownership-transfer|get-pending-ownership-transfer-for-me"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.ts apps/backend/src/modules/auth/application/get-current-ownership-transfer.usecase.spec.ts apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.ts apps/backend/src/modules/auth/application/get-pending-ownership-transfer-for-me.usecase.spec.ts
git commit -m "feat: add GetCurrentOwnershipTransferUseCase and GetPendingOwnershipTransferForMeUseCase"
```

---

### Task 10: Presentation — DTOs, `OwnershipTransferController`, module wiring

**Files:**
- Create: `apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.ts`
- Create: `apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.ts`
- Create: `apps/backend/src/modules/auth/presentation/dto/ownership-transfer-response.dto.ts`
- Create: `apps/backend/src/modules/auth/presentation/ownership-transfer.controller.ts`
- Test: `apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.spec.ts`
- Test: `apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.spec.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: all 7 use cases from Tasks 5-9, `IdempotencyService` (`common/idempotency/idempotency.service.ts`), `AuthRequest`/`assertOrgMatches` (`common/auth/assert-org-matches.ts`), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`.
- Produces: `organizations/:id/ownership-transfers` (POST, request), `organizations/:id/ownership-transfers/:requestId/confirm` (POST), `.../cancel` (POST), `.../accept` (POST), `.../decline` (POST), `organizations/:id/ownership-transfers/current` (GET), `organizations/:id/ownership-transfers/pending-for-me` (GET).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestOwnershipTransferDto } from './request-ownership-transfer.dto';

describe('RequestOwnershipTransferDto', () => {
  it('rejects a non-UUID targetUserId', async () => {
    const dto = plainToInstance(RequestOwnershipTransferDto, {
      targetUserId: 'not-a-uuid',
      currentPassword: 'secret',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'targetUserId')).toBe(true);
  });

  it('rejects an empty currentPassword', async () => {
    const dto = plainToInstance(RequestOwnershipTransferDto, {
      targetUserId: '11111111-1111-1111-1111-111111111111',
      currentPassword: '',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'currentPassword')).toBe(true);
  });

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(RequestOwnershipTransferDto, {
      targetUserId: '11111111-1111-1111-1111-111111111111',
      currentPassword: 'secret',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

```typescript
// apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmOwnershipTransferDto } from './confirm-ownership-transfer.dto';

describe('ConfirmOwnershipTransferDto', () => {
  it('rejects a non-6-digit otp', async () => {
    const dto = plainToInstance(ConfirmOwnershipTransferDto, { otp: '12' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'otp')).toBe(true);
  });

  it('accepts a 6-digit otp', async () => {
    const dto = plainToInstance(ConfirmOwnershipTransferDto, { otp: '123456' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/backend`): `npx jest --testPathPatterns "request-ownership-transfer.dto|confirm-ownership-transfer.dto"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.ts
import { IsString, IsUUID, MinLength } from 'class-validator';

export class RequestOwnershipTransferDto {
  @IsUUID()
  targetUserId: string;

  @IsString()
  @MinLength(1)
  currentPassword: string;
}
```

```typescript
// apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.ts
import { Matches } from 'class-validator';

export class ConfirmOwnershipTransferDto {
  @Matches(/^\d{6}$/, { message: 'OTP phải là 6 chữ số' })
  otp: string;
}
```

```typescript
// apps/backend/src/modules/auth/presentation/dto/ownership-transfer-response.dto.ts
import type { OwnershipTransferStatus } from '@casso-ledger/shared-types';
import type { OwnershipTransferRequest } from '../../../ownership-transfer/domain/ownership-transfer-request';

export class OwnershipTransferResponseDto {
  id: string;
  status: OwnershipTransferStatus;
  fromUserId: string;
  toUserId: string;
  acceptanceExpiresAt: string | null;
  createdAt: string;
}

export function toOwnershipTransferResponse(
  request: OwnershipTransferRequest,
): OwnershipTransferResponseDto {
  return {
    id: request.id,
    status: request.status,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    acceptanceExpiresAt: request.acceptanceExpiresAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}
```

```typescript
// apps/backend/src/modules/auth/presentation/ownership-transfer.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthRequest, assertOrgMatches } from '../../../common/auth/assert-org-matches';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { AcceptOwnershipTransferUseCase } from '../application/accept-ownership-transfer.usecase';
import { CancelOwnershipTransferUseCase } from '../application/cancel-ownership-transfer.usecase';
import { ConfirmOwnershipTransferUseCase } from '../application/confirm-ownership-transfer.usecase';
import { DeclineOwnershipTransferUseCase } from '../application/decline-ownership-transfer.usecase';
import { GetCurrentOwnershipTransferUseCase } from '../application/get-current-ownership-transfer.usecase';
import { GetPendingOwnershipTransferForMeUseCase } from '../application/get-pending-ownership-transfer-for-me.usecase';
import { RequestOwnershipTransferUseCase } from '../application/request-ownership-transfer.usecase';
import { ConfirmOwnershipTransferDto } from './dto/confirm-ownership-transfer.dto';
import {
  OwnershipTransferResponseDto,
  toOwnershipTransferResponse,
} from './dto/ownership-transfer-response.dto';
import { RequestOwnershipTransferDto } from './dto/request-ownership-transfer.dto';

function requireUserId(request: AuthRequest): string {
  const userId = request.user?.userId;
  if (!userId) throw new UnauthorizedException();
  return userId;
}

@ApiTags('organizations')
@Controller()
export class OwnershipTransferController {
  constructor(
    private readonly requestUseCase: RequestOwnershipTransferUseCase,
    private readonly confirmUseCase: ConfirmOwnershipTransferUseCase,
    private readonly cancelUseCase: CancelOwnershipTransferUseCase,
    private readonly acceptUseCase: AcceptOwnershipTransferUseCase,
    private readonly declineUseCase: DeclineOwnershipTransferUseCase,
    private readonly getCurrentUseCase: GetCurrentOwnershipTransferUseCase,
    private readonly getPendingForMeUseCase: GetPendingOwnershipTransferForMeUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('organizations/:id/ownership-transfers')
  @ApiOperation({ summary: 'Request an ownership transfer' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async request(
    @Param('id') id: string,
    @Body() dto: RequestOwnershipTransferDto,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers`,
      key,
      dto,
      async () =>
        toOwnershipTransferResponse(
          await this.requestUseCase.execute({
            organizationId: id,
            requestedByUserId: requireUserId(request),
            targetUserId: dto.targetUserId,
            currentPassword: dto.currentPassword,
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/confirm')
  @ApiOperation({ summary: 'Confirm an ownership transfer with an OTP' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async confirm(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ConfirmOwnershipTransferDto,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/confirm`,
      key,
      dto,
      async () =>
        toOwnershipTransferResponse(
          await this.confirmUseCase.execute({
            organizationId: id,
            requestId,
            requestedByUserId: requireUserId(request),
            otp: dto.otp,
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/cancel')
  @ApiOperation({ summary: 'Cancel a pending ownership transfer' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async cancel(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/cancel`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.cancelUseCase.execute({
            organizationId: id,
            requestId,
            requestedByUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/accept')
  @ApiOperation({ summary: 'Accept an ownership transfer targeted at you' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard)
  async accept(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/accept`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.acceptUseCase.execute({
            organizationId: id,
            requestId,
            actingUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/decline')
  @ApiOperation({ summary: 'Decline an ownership transfer targeted at you' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard)
  async decline(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/decline`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.declineUseCase.execute({
            organizationId: id,
            requestId,
            actingUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Get('organizations/:id/ownership-transfers/current')
  @ApiOperation({ summary: "Get the organization's own in-flight transfer request" })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(ErrorCode.FORBIDDEN)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async current(
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<OwnershipTransferResponseDto | null> {
    assertOrgMatches(request, id);
    const current = await this.getCurrentUseCase.execute(id);
    return current ? toOwnershipTransferResponse(current) : null;
  }

  @Get('organizations/:id/ownership-transfers/pending-for-me')
  @ApiOperation({ summary: 'Get a pending ownership transfer targeted at the caller' })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(ErrorCode.FORBIDDEN)
  @UseGuards(JwtAuthGuard)
  async pendingForMe(
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<OwnershipTransferResponseDto | null> {
    assertOrgMatches(request, id);
    const pending = await this.getPendingForMeUseCase.execute(
      id,
      requireUserId(request),
    );
    return pending ? toOwnershipTransferResponse(pending) : null;
  }
}
```

Now wire everything into `AuthModule`:

```typescript
// apps/backend/src/modules/auth/auth.module.ts
// Add these imports near the top, alongside the other application/use-case imports:
import { AcceptOwnershipTransferUseCase } from './application/accept-ownership-transfer.usecase';
import { CancelOwnershipTransferUseCase } from './application/cancel-ownership-transfer.usecase';
import { ConfirmOwnershipTransferUseCase } from './application/confirm-ownership-transfer.usecase';
import { DeclineOwnershipTransferUseCase } from './application/decline-ownership-transfer.usecase';
import { GetCurrentOwnershipTransferUseCase } from './application/get-current-ownership-transfer.usecase';
import { GetPendingOwnershipTransferForMeUseCase } from './application/get-pending-ownership-transfer-for-me.usecase';
import { RequestOwnershipTransferUseCase } from './application/request-ownership-transfer.usecase';
import { OwnershipTransferController } from './presentation/ownership-transfer.controller';
// Alongside the other module imports:
import { OwnershipTransferModule } from '../ownership-transfer/ownership-transfer.module';
```

In the `@Module({ imports: [...] })` array, add `OwnershipTransferModule` next to `OrganizationsModule`. In `providers: [...]`, add the 7 new use cases next to `ChangePasswordResendUseCase`. In `controllers: [...]`, add `OwnershipTransferController` next to `InvitesController`:

```typescript
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    TypeOrmModule.forFeature([
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      MembershipInviteOrmEntity,
      RefreshTokenOrmEntity,
    ]),
    UsersModule,
    OrganizationsModule,
    OwnershipTransferModule,
    BillingModule,
    BankConnectionsModule,
    ProfileModule,
    EmailTemplatesModule,
    NotificationsModule,
    RemindersModule,
    TaxVerificationModule,
  ],
  providers: [
    LoginUseCase,
    SignupUseCase,
    VerifyEmailUseCase,
    AcceptInviteUseCase,
    GetUserProfileUseCase,
    ForgotPasswordUseCase,
    InviteMemberUseCase,
    ListInvitesUseCase,
    DeleteInviteUseCase,
    ResendInviteUseCase,
    RemoveMemberUseCase,
    BlockMemberUseCase,
    UnblockMemberUseCase,
    LogoutUseCase,
    RefreshAccessTokenUseCase,
    ResendVerificationEmailUseCase,
    ResetPasswordUseCase,
    SwitchOrganizationUseCase,
    UpdateProfileUseCase,
    ChangePasswordRequestUseCase,
    ChangePasswordConfirmUseCase,
    ChangePasswordResendUseCase,
    RequestOwnershipTransferUseCase,
    ConfirmOwnershipTransferUseCase,
    CancelOwnershipTransferUseCase,
    AcceptOwnershipTransferUseCase,
    DeclineOwnershipTransferUseCase,
    GetCurrentOwnershipTransferUseCase,
    GetPendingOwnershipTransferForMeUseCase,
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: TypeOrmEmailVerificationTokenRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: TypeOrmPasswordResetTokenRepository,
    },
    {
      provide: MEMBERSHIP_INVITE_REPOSITORY,
      useClass: TypeOrmMembershipInviteRepository,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: TypeOrmRefreshTokenRepository,
    },
    { provide: AUTH_EMAIL_SENDER, useClass: ResendAuthEmailSenderAdapter },
    {
      provide: MEMBER_NOTIFICATION_SENDER,
      useClass: ResendAuthEmailSenderAdapter,
    },
    {
      provide: DEFAULT_ORGANIZATION_BOOTSTRAP,
      useClass: DefaultOrganizationBootstrap,
    },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
  ],
  controllers: [AuthController, InvitesController, OwnershipTransferController],
  exports: [
    AUTH_EMAIL_SENDER,
    MEMBER_NOTIFICATION_SENDER,
    MEMBERSHIP_INVITE_REPOSITORY,
  ],
})
export class AuthModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `npx jest --testPathPatterns "request-ownership-transfer.dto|confirm-ownership-transfer.dto"`
Expected: PASS

Then run the full backend suite to catch any wiring mistake in `auth.module.ts`: `npx jest` — Expected: all suites pass (Nest's DI container is exercised by the module's own existing spec/e2e coverage; a missing provider surfaces as a DI resolution error).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.ts apps/backend/src/modules/auth/presentation/dto/request-ownership-transfer.dto.spec.ts apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.ts apps/backend/src/modules/auth/presentation/dto/confirm-ownership-transfer.dto.spec.ts apps/backend/src/modules/auth/presentation/dto/ownership-transfer-response.dto.ts apps/backend/src/modules/auth/presentation/ownership-transfer.controller.ts apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat: add OwnershipTransferController and wire it into AuthModule"
```

---

### Task 11: Frontend — API functions and hooks

**Files:**
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts`
- Modify: `apps/frontend/src/features/settings/types.ts`

**Interfaces:**
- Produces: `requestOwnershipTransfer`, `confirmOwnershipTransfer`, `cancelOwnershipTransfer`, `acceptOwnershipTransfer`, `declineOwnershipTransfer`, `fetchCurrentOwnershipTransfer`, `fetchPendingOwnershipTransferForMe` (all in `settings-api.ts`); `useCurrentOwnershipTransfer`, `useRequestOwnershipTransfer`, `useConfirmOwnershipTransfer`, `useCancelOwnershipTransfer`, `usePendingOwnershipTransferForMe`, `useAcceptOwnershipTransfer`, `useDeclineOwnershipTransfer` (all in `use-settings.ts`).

- [ ] **Step 1: Write the failing test**

This task is a thin API/data-fetching layer with no independent business logic to unit-test in isolation (matches the existing `settings-api.ts` functions, none of which have their own spec file — they're exercised through the component specs in Task 12/13, per the TDD exception for "generated/glue code" — the real behavior under test is the component's use of these hooks). Skip straight to implementation; Tasks 12-13 provide the RED tests that exercise this layer end-to-end.

- [ ] **Step 2: Write the implementation**

```typescript
// apps/frontend/src/features/settings/types.ts — add at the end
export interface OwnershipTransfer {
  id: string;
  status: OwnershipTransferStatus;
  fromUserId: string;
  toUserId: string;
  acceptanceExpiresAt: string | null;
  createdAt: string;
}
```

Add `OwnershipTransferStatus` to the top `import type { MembershipStatus, Role } from '@casso-ledger/shared-types';` line:

```typescript
import type {
  MembershipStatus,
  OwnershipTransferStatus,
  Role,
} from '@casso-ledger/shared-types';
```

```typescript
// apps/frontend/src/features/settings/api/settings-api.ts — add at the end
export function requestOwnershipTransfer(
  organizationId: string,
  targetUserId: string,
  currentPassword: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/ownership-transfers`,
    { targetUserId, currentPassword },
  );
}

export function confirmOwnershipTransfer(
  organizationId: string,
  requestId: string,
  otp: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/ownership-transfers/${requestId}/confirm`,
    { otp },
  );
}

export function cancelOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/ownership-transfers/${requestId}/cancel`,
  );
}

export function acceptOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/ownership-transfers/${requestId}/accept`,
  );
}

export function declineOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/ownership-transfers/${requestId}/decline`,
  );
}

export function fetchCurrentOwnershipTransfer(
  organizationId: string,
): Promise<OwnershipTransfer | null> {
  return apiRequest<OwnershipTransfer | null>({
    url: `/api/v1/organizations/${organizationId}/ownership-transfers/current`,
    method: 'GET',
  });
}

export function fetchPendingOwnershipTransferForMe(
  organizationId: string,
): Promise<OwnershipTransfer | null> {
  return apiRequest<OwnershipTransfer | null>({
    url: `/api/v1/organizations/${organizationId}/ownership-transfers/pending-for-me`,
    method: 'GET',
  });
}
```

Add `OwnershipTransfer` to the existing `import type { ... } from '../types';` block in `settings-api.ts`.

```typescript
// apps/frontend/src/features/settings/api/use-settings.ts — add at the end
const currentOwnershipTransferKey = (organizationId: string | undefined) => [
  'ownership-transfer-current',
  organizationId,
];
const pendingOwnershipTransferForMeKey = (organizationId: string | undefined) => [
  'ownership-transfer-pending-for-me',
  organizationId,
];

export function useCurrentOwnershipTransfer(organizationId: string | undefined) {
  return useQuery({
    queryKey: currentOwnershipTransferKey(organizationId),
    queryFn: () => fetchCurrentOwnershipTransfer(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

export function usePendingOwnershipTransferForMe(
  organizationId: string | undefined,
) {
  return useQuery({
    queryKey: pendingOwnershipTransferForMeKey(organizationId),
    queryFn: () => fetchPendingOwnershipTransferForMe(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

export function useRequestOwnershipTransfer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetUserId,
      currentPassword,
    }: {
      targetUserId: string;
      currentPassword: string;
    }) =>
      requestOwnershipTransfer(organizationId ?? '', targetUserId, currentPassword),
    onSuccess: () => {
      toast.success('Đã gửi OTP xác nhận đến email của bạn.');
      void queryClient.invalidateQueries({
        queryKey: currentOwnershipTransferKey(organizationId),
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'Không thể gửi yêu cầu chuyển quyền sở hữu.')),
  });
}

export function useConfirmOwnershipTransfer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, otp }: { requestId: string; otp: string }) =>
      confirmOwnershipTransfer(organizationId ?? '', requestId, otp),
    onSuccess: () => {
      toast.success('Đã xác nhận. Người nhận sẽ nhận được thông báo.');
      void queryClient.invalidateQueries({
        queryKey: currentOwnershipTransferKey(organizationId),
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'OTP không hợp lệ hoặc đã hết hạn.')),
  });
}

export function useCancelOwnershipTransfer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      cancelOwnershipTransfer(organizationId ?? '', requestId),
    onSuccess: () => {
      toast.success('Đã huỷ yêu cầu chuyển quyền sở hữu.');
      void queryClient.invalidateQueries({
        queryKey: currentOwnershipTransferKey(organizationId),
      });
    },
    onError: () => toast.error('Không thể huỷ yêu cầu.'),
  });
}

export function useAcceptOwnershipTransfer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      acceptOwnershipTransfer(organizationId ?? '', requestId),
    onSuccess: () => {
      toast.success('Bạn đã trở thành chủ sở hữu tổ chức.');
      void queryClient.invalidateQueries({
        queryKey: pendingOwnershipTransferForMeKey(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'Không thể chấp nhận yêu cầu.')),
  });
}

export function useDeclineOwnershipTransfer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      declineOwnershipTransfer(organizationId ?? '', requestId),
    onSuccess: () => {
      toast.success('Đã từ chối yêu cầu chuyển quyền sở hữu.');
      void queryClient.invalidateQueries({
        queryKey: pendingOwnershipTransferForMeKey(organizationId),
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'Không thể từ chối yêu cầu.')),
  });
}
```

Add the 7 new imports from `./settings-api` to the existing `import { ... } from './settings-api';` block in `use-settings.ts`.

- [ ] **Step 3: Type-check**

Run (from `apps/frontend`): `npx tsc -b --noEmit`
Expected: PASS (no compile errors — this task adds no new tests of its own, so there is no RED/GREEN cycle; correctness is verified by the type checker here and by Tasks 12-13's component tests exercising these hooks).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/settings/api/settings-api.ts apps/frontend/src/features/settings/api/use-settings.ts apps/frontend/src/features/settings/types.ts
git commit -m "feat: add ownership transfer API functions and hooks"
```

---

### Task 12: Frontend UI — OWNER-side request/confirm/cancel dialog

**Files:**
- Create: `apps/frontend/src/features/settings/components/ownership-transfer-dialog.tsx`
- Test: `apps/frontend/src/features/settings/components/ownership-transfer-dialog.spec.tsx`
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/users-tab.spec.tsx` (add a case)

**Interfaces:**
- Consumes: `useCurrentOwnershipTransfer`, `useRequestOwnershipTransfer`, `useConfirmOwnershipTransfer`, `useCancelOwnershipTransfer` (Task 11); `OtpInput` (`@/components/shared/otp-input`); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (`@/components/ui/dialog`).
- Produces: `OwnershipTransferDialog` component, rendered from `UsersTab` behind a "Chuyển quyền sở hữu" button visible only to the current OWNER (`user?.role === Role.OWNER`).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/settings/components/ownership-transfer-dialog.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OwnershipTransferDialog } from './ownership-transfer-dialog';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OwnershipTransferDialog
        open
        onOpenChange={() => {}}
        organizationId="org-1"
        candidates={[
          { userId: 'user-2', name: 'Kế toán', email: 'ke-toan@congtyb.vn' },
        ]}
      />
    </QueryClientProvider>,
  );
}

describe('OwnershipTransferDialog', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('requests a transfer with the selected target and current password', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/current')) return Promise.resolve(null);
      return Promise.resolve({
        id: 'req-1',
        status: 'PENDING_OTP_CONFIRMATION',
        fromUserId: 'owner-1',
        toUserId: 'user-2',
        acceptanceExpiresAt: null,
        createdAt: '2026-08-23T00:00:00.000Z',
      });
    });
    renderDialog();

    fireEvent.click(screen.getByRole('combobox', { name: 'Người nhận' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Kế toán' }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'my-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi OTP' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/ownership-transfers',
          method: 'POST',
          data: { targetUserId: 'user-2', currentPassword: 'my-password' },
        }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/ownership-transfer-dialog.spec.tsx`
Expected: FAIL — `Cannot find module './ownership-transfer-dialog'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/features/settings/components/ownership-transfer-dialog.tsx
import { useState } from 'react';
import { OtpInput } from '@/components/shared/otp-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCancelOwnershipTransfer,
  useConfirmOwnershipTransfer,
  useCurrentOwnershipTransfer,
  useRequestOwnershipTransfer,
} from '../api/use-settings';

interface OwnershipTransferCandidate {
  userId: string;
  name: string;
  email: string;
}

interface OwnershipTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  candidates: OwnershipTransferCandidate[];
}

export function OwnershipTransferDialog({
  open,
  onOpenChange,
  organizationId,
  candidates,
}: OwnershipTransferDialogProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');

  const current = useCurrentOwnershipTransfer(organizationId);
  const requestTransfer = useRequestOwnershipTransfer(organizationId);
  const confirmTransfer = useConfirmOwnershipTransfer(organizationId);
  const cancelTransfer = useCancelOwnershipTransfer(organizationId);

  const pending = current.data;
  const step = pending?.status === 'PENDING_OTP_CONFIRMATION' ? 'confirm' : 'request';

  function submitRequest() {
    if (!targetUserId || !currentPassword) return;
    requestTransfer.mutate({ targetUserId, currentPassword });
  }

  function submitConfirm() {
    if (!pending || otp.length !== 6) return;
    confirmTransfer.mutate(
      { requestId: pending.id, otp },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Chuyển quyền sở hữu</DialogTitle>
        </DialogHeader>

        {step === 'request' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ownership-transfer-target">Người nhận</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="ownership-transfer-target" aria-label="Người nhận">
                  <SelectValue placeholder="Chọn thành viên" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership-transfer-password">Mật khẩu hiện tại</Label>
              <Input
                id="ownership-transfer-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <Button
              onClick={submitRequest}
              disabled={!targetUserId || !currentPassword || requestTransfer.isPending}
            >
              {requestTransfer.isPending ? 'Đang gửi…' : 'Gửi OTP'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mã OTP (6 chữ số)</Label>
              <OtpInput value={otp} onChange={setOtp} />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={submitConfirm}
                disabled={otp.length !== 6 || confirmTransfer.isPending}
              >
                {confirmTransfer.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
              </Button>
              <Button
                variant="outline"
                onClick={() => pending && cancelTransfer.mutate(pending.id)}
                disabled={cancelTransfer.isPending}
              >
                Huỷ yêu cầu
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Wire it into `UsersTab` (`apps/frontend/src/features/settings/components/users-tab.tsx`): add the import, a `useState` for dialog visibility, and a button rendered only for the current OWNER (near the existing invite form, gated the same way `canInvite` gates the invite block — but this must be `user?.role === Role.OWNER` specifically, not any `USER_MANAGE`-holding role, since only OWNER can transfer):

```tsx
// add to the imports
import { OwnershipTransferDialog } from './ownership-transfer-dialog';

// inside UsersTab(), alongside the other useState hooks
const [transferDialogOpen, setTransferDialogOpen] = useState(false);
const isOwner = user?.role === Role.OWNER;

// candidates: active, non-blocked members who are not already OWNER
const transferCandidates = members
  .filter(
    (member) =>
      member.role !== Role.OWNER &&
      member.status === 'ACTIVE' &&
      member.joinedAt !== null,
  )
  .map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
  }));
```

Add the button near the top of the returned JSX (after the invite block, before `SectionCard`) and render the dialog:

```tsx
{isOwner && (
  <Button variant="outline" onClick={() => setTransferDialogOpen(true)}>
    Chuyển quyền sở hữu
  </Button>
)}
{isOwner && user?.organizationId && (
  <OwnershipTransferDialog
    open={transferDialogOpen}
    onOpenChange={setTransferDialogOpen}
    organizationId={user.organizationId}
    candidates={transferCandidates}
  />
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/ownership-transfer-dialog.spec.tsx src/features/settings/components/users-tab.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/ownership-transfer-dialog.tsx apps/frontend/src/features/settings/components/ownership-transfer-dialog.spec.tsx apps/frontend/src/features/settings/components/users-tab.tsx apps/frontend/src/features/settings/components/users-tab.spec.tsx
git commit -m "feat: add ownership transfer request/confirm/cancel dialog"
```

---

### Task 13: Frontend UI — target-side pending banner (accept/decline)

**Files:**
- Create: `apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.tsx`
- Test: `apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.spec.tsx`
- Modify: `apps/frontend/src/features/settings/pages/settings-page.tsx`

**Interfaces:**
- Consumes: `usePendingOwnershipTransferForMe`, `useAcceptOwnershipTransfer`, `useDeclineOwnershipTransfer` (Task 11).
- Produces: `PendingOwnershipTransferBanner` component, rendered unconditionally (any role) at the top of `SettingsPage` — the target of a transfer may not hold `USER_MANAGE`/`ORGANIZATION_MANAGE` and would never see the Users tab, so this cannot live inside `UsersTab`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingOwnershipTransferBanner } from './pending-ownership-transfer-banner';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingOwnershipTransferBanner organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe('PendingOwnershipTransferBanner', () => {
  it('renders nothing when there is no pending transfer', async () => {
    apiRequest.mockResolvedValue(null);
    const { container } = renderBanner();

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an accept/decline prompt when a transfer is pending', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/accept') || config.url.includes('/decline')) {
        return Promise.resolve({ status: 'ACCEPTED' });
      }
      return Promise.resolve({
        id: 'req-1',
        status: 'PENDING_ACCEPTANCE',
        fromUserId: 'owner-1',
        toUserId: 'me',
        acceptanceExpiresAt: '2026-08-25T00:00:00.000Z',
        createdAt: '2026-08-23T00:00:00.000Z',
      });
    });
    renderBanner();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Chấp nhận' }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/ownership-transfers/req-1/accept',
          method: 'POST',
        }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/pending-ownership-transfer-banner.spec.tsx`
Expected: FAIL — `Cannot find module './pending-ownership-transfer-banner'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.tsx
import { Button } from '@/components/ui/button';
import {
  useAcceptOwnershipTransfer,
  useDeclineOwnershipTransfer,
  usePendingOwnershipTransferForMe,
} from '../api/use-settings';

interface PendingOwnershipTransferBannerProps {
  organizationId: string | undefined;
}

export function PendingOwnershipTransferBanner({
  organizationId,
}: PendingOwnershipTransferBannerProps) {
  const pending = usePendingOwnershipTransferForMe(organizationId);
  const accept = useAcceptOwnershipTransfer(organizationId);
  const decline = useDeclineOwnershipTransfer(organizationId);

  const request = pending.data;
  if (!request) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
    >
      <p className="text-sm">
        Bạn được đề nghị trở thành chủ sở hữu (OWNER) của tổ chức này.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => accept.mutate(request.id)}
          disabled={accept.isPending || decline.isPending}
        >
          Chấp nhận
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decline.mutate(request.id)}
          disabled={accept.isPending || decline.isPending}
        >
          Từ chối
        </Button>
      </div>
    </div>
  );
}
```

Wire it into `SettingsPage` (`apps/frontend/src/features/settings/pages/settings-page.tsx`), rendered unconditionally for any authenticated user, right after `PageHeader`:

```tsx
// add to imports
import { useAuth } from '@/contexts/auth-context';
import { PendingOwnershipTransferBanner } from '../components/pending-ownership-transfer-banner';

// inside SettingsPage(), add:
const { user } = useAuth();

// in the JSX, immediately inside the wrapping <div className="flex flex-col gap-6 p-4 sm:p-6">,
// before <Tabs ...>:
<PendingOwnershipTransferBanner organizationId={user?.organizationId} />
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/pending-ownership-transfer-banner.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.tsx apps/frontend/src/features/settings/components/pending-ownership-transfer-banner.spec.tsx apps/frontend/src/features/settings/pages/settings-page.tsx
git commit -m "feat: add pending ownership transfer banner for the target member"
```

---

### Task 14: Full verification

- [ ] **Step 1: Run backend unit tests**

Run (from `apps/backend`): `npx jest`
Expected: all suites pass, including every spec added in Tasks 2-10.

- [ ] **Step 2: Run shared-types unit tests**

Run (from `packages/shared-types`): `npx jest`
Expected: all suites pass, including the new case from Task 1.

- [ ] **Step 3: Run frontend unit tests**

Run (from `apps/frontend`): `npx vitest run`
Expected: all suites pass, including Tasks 12-13's new specs and the updated `users-tab.spec.tsx`.

- [ ] **Step 4: Type-check everything**

Run `npx tsc --noEmit` (backend) / `npx tsc -b --noEmit` (frontend) in `apps/backend`, `apps/frontend`, and `packages/shared-types`.
Expected: no errors.

- [ ] **Step 5: Lint and format**

Run (from repo root): `npx biome check --write .`
Expected: no unfixable violations.

- [ ] **Step 6: Domain check**

Run the `domain-check` skill (`/domain-check`) per AGENTS.md's "after any backend code change" rule.
Expected: no violations — every use case throws `AppError` (never `HttpException`), every write is inside a `dataSource.transaction()`, every query is scoped by `organizationId`, `ownership-transfer/domain/` imports nothing from NestJS/TypeORM.

- [ ] **Step 7: Full `pnpm verify`**

Run (from repo root): `pnpm verify`
Expected: PASS (lint + type-check + test + arch-check).

- [ ] **Step 8: Manual smoke test (documented, not automated)**

e2e coverage for this flow is deliberately out of scope for this plan (no `.e2e-spec.ts` task above) — the unit-test coverage across Tasks 2-13 exercises every branch of the state machine already. If Docker/testcontainers are available in the execution environment, consider adding `test/ownership-transfer.e2e-spec.ts` covering the full happy path (request → confirm → accept, verifying the `Membership` role swap against a real Postgres) as a follow-up, matching the depth of `test/member-management-export.e2e-spec.ts`.
