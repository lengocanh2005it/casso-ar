# In-App Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the OWNER of an organization an in-app, read/unread "Alert" surface (bell icon + dropdown, live via SSE) for the three owner-facing events that today only reach them by email: bank connection needs reauth/errored, SMTP config FAILED, reminder scan summary.

**Architecture:** A new `apps/backend/src/modules/alerts/` Clean Architecture module owns a persisted `Alert` entity (one row per owner-facing event, deduped while unread) and a small CRUD+SSE API. Three new listeners in `alerts/infrastructure/` react to the same domain events the existing `notifications/` email listeners react to, writing `Alert` rows instead of enqueueing email — the two channels evolve independently per ADR-0013. The frontend adds a `features/alerts/` folder (TanStack Query hooks + a pure Vietnamese message-mapping function) and a bell+popover UI wired into the sidebar footer and mobile header.

**Tech Stack:** NestJS 11, TypeORM 1.1 (Postgres 16, raw SQL for the partial-unique-index upsert), `@nestjs/event-emitter` (`EventEmitter2`), NestJS `@Sse()` + RxJS `fromEvent`, React 19 + TanStack Query, native `EventSource`, Radix `Popover` (via the already-installed `radix-ui` meta-package — no new dependency), Tailwind's existing `animate-banner-in` utility.

**Spec:** `docs/adr/0013-alert-module-separate-from-notifications-email-queue.md` (naming/module-boundary decision); this plan's own "Locked design decisions" text below carries the rest of the spec since issue #137 has no separate spec file.

## Global Constraints

- Money/integers: N/A — `Alert` has no money field.
- Every write that changes the `alerts` table happens inside a DB transaction (`DataSource.transaction()`), per AGENTS.md.
- Every `alerts` query/write is scoped by `organizationId` via `TenantContextService.getOrganizationId()`, and further scoped by `userId` (an owner only ever sees their own alerts).
- All new HTTP routes live under the existing global `/api/v1` prefix and are guarded by `JwtAuthGuard` (global) + a new `@RequirePermission(Permission.ALERT_READ)`.
- Error shape: `{ statusCode, errorCode, message, details? }` via `AppError` + `HttpExceptionFilter`; alert-not-found reuses the existing generic `ErrorCode.NOT_FOUND` (no new `ALERT_NOT_FOUND` code — mirrors `SmtpConfigController.get()`, which also has no dedicated not-found error code for its single-row-per-org resource).
- Domain/application layers never import NestJS/TypeORM concretes; `CreateAlertUseCase` (application) emits via the `IEventPublisher` port, never raw `EventEmitter2` — the raw `EventEmitter2` injection stays confined to the presentation-layer SSE controller and to `EmailQueueProcessor` (infrastructure), mirroring the codebase's existing split.
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas — run `npx biome check --write .` before each commit if the file was hand-typed outside an editor with format-on-save.
- Backend unit tests: `npx jest --testPathPattern <name>` (from `apps/backend`). Backend e2e: `pnpm --filter @casso-ledger/backend test:e2e` (Docker required). Frontend tests: `pnpm --filter frontend test` runs `vitest run` (from `apps/frontend/package.json`). Type check: `npx tsc --noEmit`.
- After any backend code change in this plan, run the `domain-check` skill and fix violations before moving to the next task's commit.

### Interpretations made because the exact codebase detail wasn't fully pinned down

These are called out again in the Self-Review section, but are recorded here since they affect every downstream task:

1. **SSE auth is not cookie-based in this codebase.** The frontend stores its JWT access token in memory and sends it as `Authorization: Bearer <token>` (`apps/frontend/src/lib/api-client.ts`); `JwtStrategy` only extracts `ExtractJwt.fromAuthHeaderAsBearerToken()`. Native `EventSource` cannot set custom headers, so `GET /alerts/stream` cannot be "cookie-authenticated, same-origin" as originally assumed. This plan extends `JwtStrategy`'s extractor to also accept `?token=` on the query string (a standard, narrowly-scoped workaround for `EventSource`), and the frontend opens `new EventSource(`${API_BASE_URL}/api/v1/alerts/stream?token=${accessToken}`)`. Token refresh mid-connection is out of scope (`ponytail: EventSource reconnects on drop but keeps the token it was created with; if the 15-minute access token expires before the tab is closed, the browser's automatic reconnect will 401 — acceptable for MVP since a `GET /alerts` fetch on any other navigation still works and this doesn't block core functionality. Upgrade path: reconnect with a freshly-refreshed token on the `error` event if this becomes a real complaint.`).
2. **`reminder.scan.completed` has no sent/failed counts available at the point it's emitted.** `ReminderSchedulerService.scanOrganization()` only *enqueues* `send-reminder` BullMQ jobs — actual SENT/FAILED outcomes are written later, asynchronously, by `EmailQueueProcessor`. There is no existing mechanism that waits for the queue to drain before emitting the scan-completed event, and building one is out of scope for this ticket. This plan instead extends the payload with `queuedCount` (jobs enqueued) and `skippedCount` (candidates skipped for `RATE_LIMITED`) — both are known synchronously inside `scanOrganization()`. The `REMINDER_SCAN_SUMMARY` alert is only created when `queuedCount > 0` (an empty scan doesn't need an alert).
3. **The `Alert` row has no numeric/count payload field** (the locked schema is fixed: `id, organizationId, userId, type, entityType, entityId, readAt, createdAt`). Combined with interpretation #2, the `REMINDER_SCAN_SUMMARY` message is therefore the generic fallback the spec itself allows: **"Có email nhắc nhở đã được lên lịch gửi hôm nay"** (worded as "scheduled", not "sent", since that's what's actually known at alert-creation time — saying "sent" would be a false claim).
4. **None of the three alert types have a per-`entityId` detail route.** `bank_connection` → static `/bank-connections` list page, `smtp_config` → static `/settings?tab=smtp`, `reminder_scan` → `/reminders` page. None of these can 404 from client-side routing (they're always-registered static routes), so the "toast on 404" fallback specified in the design has no reachable failure path for the three current entity types. The click-through helper is still written to return a route per `entityType` (extensible for a future per-id detail route), but no dead 404-detection code is added — noted here rather than faked with an unreachable branch.
5. **Radix `Popover` needs no new dependency.** This codebase already depends on the unified `radix-ui` meta-package (`apps/frontend/package.json`, `"radix-ui": "1.1.1"`), which re-exports every Radix primitive including `Popover` (see `dialog.tsx`'s `import { Dialog as DialogPrimitive } from 'radix-ui'`). `popover.tsx` imports `{ Popover as PopoverPrimitive } from 'radix-ui'` the same way — no `pnpm add`.
6. **Alerts CRUD endpoints skip `IdempotencyService`.** `PATCH .../read`, `PATCH .../read-all`, `DELETE ...` are naturally idempotent (repeating them is a no-op or the same result), unlike `POST /smtp-config` (creates a side effect — a real SMTP test email) or `POST /bank-transactions/:id/match` (allocates money) which use `IdempotencyService` to guard against double-submission of a non-idempotent action.
7. **Alerts CRUD endpoints skip `@Audited`.** Audit logging in this codebase is reserved for business-relevant state changes (money, SMTP config, bank transaction matching) — no existing "mark as read"-shaped action is audited, and personal notification bookkeeping isn't a business event worth an audit trail entry.

---

### Task 1: `Permission.ALERT_READ` in shared-types

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts` (new)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Permission.ALERT_READ` (string enum member `'ALERT_READ'`), automatically included in `ROLE_PERMISSIONS[Role.OWNER]` because that entry is `Object.values(Permission)` — no edit to `role-permissions.ts` needed, and no other role's array includes it, so it stays OWNER-only.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared-types/src/role-permissions.spec.ts
import { Permission } from './permission';
import { Role } from './role';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS', () => {
  it('grants ALERT_READ only to OWNER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.ALERT_READ);
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.ALERT_READ);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern role-permissions` (from `packages/shared-types`)
Expected: FAIL — `Property 'ALERT_READ' does not exist on type 'typeof Permission'` (TypeScript compile error surfaced by ts-jest).

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared-types/src/permission.ts
export enum Permission {
  RECEIVABLE_READ = 'RECEIVABLE_READ',
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern role-permissions` (from `packages/shared-types`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/permission.ts packages/shared-types/src/role-permissions.spec.ts
git commit -m "feat: add ALERT_READ permission (OWNER-only via existing Object.values(Permission) grant)"
```

---

### Task 2: `Alert` domain entity

**Files:**
- Create: `apps/backend/src/modules/alerts/domain/alert.ts`
- Test: `apps/backend/src/modules/alerts/domain/alert.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AlertType` enum (`BANK_CONNECTION_NEEDS_REAUTH`, `BANK_CONNECTION_ERROR`, `SMTP_FAILED`, `REMINDER_SCAN_SUMMARY`), `AlertProps` interface (`id, organizationId, userId, type: AlertType, entityType: string, entityId: string, readAt: Date | null, createdAt: Date`), `Alert` class with `.isRead(): boolean` and `.markRead(now?: Date): Alert`. Every later task imports `Alert`/`AlertType`/`AlertProps` from this exact path.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/alerts/domain/alert.spec.ts
import { Alert, AlertType } from './alert';

function buildAlert(overrides: Partial<Parameters<typeof Alert.prototype.constructor>[0]> = {}) {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.BANK_CONNECTION_ERROR,
    entityType: 'bank_connection',
    entityId: 'conn-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  });
}

describe('Alert', () => {
  it('isRead() is false when readAt is null', () => {
    expect(buildAlert().isRead()).toBe(false);
  });

  it('isRead() is true when readAt is set', () => {
    expect(buildAlert({ readAt: new Date('2026-08-13T01:00:00Z') }).isRead()).toBe(true);
  });

  it('markRead() sets readAt to the given time and returns a new instance', () => {
    const alert = buildAlert();
    const now = new Date('2026-08-13T02:00:00Z');

    const read = alert.markRead(now);

    expect(read).not.toBe(alert);
    expect(read.readAt).toEqual(now);
    expect(read.isRead()).toBe(true);
    expect(alert.isRead()).toBe(false);
  });

  it('markRead() is a no-op (same instance) when already read', () => {
    const readAt = new Date('2026-08-13T01:00:00Z');
    const alert = buildAlert({ readAt });

    const result = alert.markRead(new Date('2026-08-13T03:00:00Z'));

    expect(result).toBe(alert);
    expect(result.readAt).toEqual(readAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern alerts/domain/alert` (from `apps/backend`)
Expected: FAIL — `Cannot find module './alert'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/domain/alert.ts
export enum AlertType {
  BANK_CONNECTION_NEEDS_REAUTH = 'BANK_CONNECTION_NEEDS_REAUTH',
  BANK_CONNECTION_ERROR = 'BANK_CONNECTION_ERROR',
  SMTP_FAILED = 'SMTP_FAILED',
  REMINDER_SCAN_SUMMARY = 'REMINDER_SCAN_SUMMARY',
}

export interface AlertProps {
  id: string;
  organizationId: string;
  userId: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  readAt: Date | null;
  createdAt: Date;
}

export class Alert {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly type: AlertType;
  readonly entityType: string;
  readonly entityId: string;
  readonly readAt: Date | null;
  readonly createdAt: Date;

  constructor(props: AlertProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.type = props.type;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.readAt = props.readAt;
    this.createdAt = props.createdAt;
  }

  isRead(): boolean {
    return this.readAt !== null;
  }

  /** UNREAD -> READ, one-way. No-op (same instance) if already read. */
  markRead(now: Date = new Date()): Alert {
    if (this.readAt !== null) return this;
    return new Alert({ ...this, readAt: now });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern alerts/domain/alert` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/domain/alert.ts apps/backend/src/modules/alerts/domain/alert.spec.ts
git commit -m "feat: add Alert domain entity with one-way markRead() transition"
```

---

### Task 3: `IAlertRepository` port

**Files:**
- Create: `apps/backend/src/modules/alerts/application/alert-repository.port.ts`

**Interfaces:**
- Consumes: `Alert` from `../domain/alert` (Task 2).
- Produces: `IAlertRepository` interface with `upsertUnread(alert: Alert): Promise<void>`, `countUnread(userId: string): Promise<number>`, `findPage(userId: string, page: number, limit: number, unreadOnly: boolean): Promise<AlertPage>`, `findByIdForUser(id: string, userId: string): Promise<Alert | null>`, `markRead(id: string, userId: string): Promise<void>`, `markAllRead(userId: string): Promise<void>`, `delete(id: string, userId: string): Promise<void>`, `deleteAll(userId: string): Promise<void>`; `AlertPage` interface (`items: Alert[], total: number, unreadCount: number`); `ALERT_REPOSITORY` DI token. Every later task (repository impl, all use cases) imports these exact names from this exact path.

This is a pure interface file (no behavior), so it has no test of its own — TDD's exception for "configuration-only changes" (AGENTS.md) applies; the port is exercised through the repository implementation's tests in Task 5/6 and the use cases' tests in Tasks 10-13.

- [ ] **Step 1: Write the file**

```typescript
// apps/backend/src/modules/alerts/application/alert-repository.port.ts
import type { Alert } from '../domain/alert';

export interface AlertPage {
  items: Alert[];
  total: number;
  unreadCount: number;
}

export interface IAlertRepository {
  /**
   * Insert a new unread alert, or — if an unread alert already exists for
   * the same (userId, entityType, entityId, type) — refresh its createdAt
   * instead of inserting a duplicate row. Backed by a partial unique index
   * on (userId, entityType, entityId, type) WHERE "readAt" IS NULL.
   */
  upsertUnread(alert: Alert): Promise<void>;
  countUnread(userId: string): Promise<number>;
  findPage(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<AlertPage>;
  findByIdForUser(id: string, userId: string): Promise<Alert | null>;
  /** No-op if the alert is already read (idempotent). */
  markRead(id: string, userId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
}

export const ALERT_REPOSITORY = Symbol('ALERT_REPOSITORY');
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/alerts/application/alert-repository.port.ts
git commit -m "feat: add IAlertRepository port"
```

---

### Task 4: `AlertOrmEntity` + migration (table, indexes, partial unique index)

**Files:**
- Create: `apps/backend/src/modules/alerts/infrastructure/alert.orm-entity.ts`
- Create: `apps/backend/src/database/migrations/20260813010000-add-alerts-table.ts`

**Interfaces:**
- Consumes: `AlertType` from `../domain/alert` (Task 2).
- Produces: `AlertOrmEntity` class (TypeORM entity, table `alerts`) with columns `id, organizationId, userId, type, entityType, entityId, readAt, createdAt` — every later infra task maps to/from this shape.

This is configuration/schema (TDD exception per AGENTS.md — "migrations" are explicitly exempted). Correctness is verified by the e2e test in Task 23, which exercises the real partial-unique-index dedupe against Postgres.

- [ ] **Step 1: Write the ORM entity**

```typescript
// apps/backend/src/modules/alerts/infrastructure/alert.orm-entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AlertType } from '../domain/alert';

// ponytail: no retention/cleanup job for this INSERT-heavy table yet — see
// issue #118 (no retention job for INSERT-only tables) for the follow-up.
@Entity({ name: 'alerts' })
@Index('IDX_alerts_organization_user_read', [
  'organizationId',
  'userId',
  'readAt',
])
@Index(
  'UQ_alerts_user_entity_unread',
  ['userId', 'entityType', 'entityId', 'type'],
  { unique: true, where: '"readAt" IS NULL' },
)
export class AlertOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: AlertType })
  type: AlertType;

  @Column({ type: 'varchar' })
  entityType: string;

  @Column({ type: 'varchar' })
  entityId: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Write the migration (mirrors `20260814000000-add-period-charges-table.ts`'s enum-type + table + index pattern, and `20260808000000-add-invoice-unique-index.ts`'s unique-index pattern)**

```typescript
// apps/backend/src/database/migrations/20260813010000-add-alerts-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertsTable20260813010000 implements MigrationInterface {
  name = 'AddAlertsTable20260813010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "alerts_type_enum" AS ENUM (
          'BANK_CONNECTION_NEEDS_REAUTH',
          'BANK_CONNECTION_ERROR',
          'SMTP_FAILED',
          'REMINDER_SCAN_SUMMARY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alerts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "type" "alerts_type_enum" NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_alerts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_alerts_organization_user_read" ON "alerts" ("organizationId", "userId", "readAt")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_alerts_user_entity_unread" ON "alerts" ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_alerts_user_entity_unread"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_alerts_organization_user_read"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "alerts"');
    await queryRunner.query('DROP TYPE IF EXISTS "alerts_type_enum"');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/alert.orm-entity.ts apps/backend/src/database/migrations/20260813010000-add-alerts-table.ts
git commit -m "feat: add alerts table (partial unique index for unread dedupe)"
```

---

### Task 5: `TypeOrmAlertRepository` — write path (`upsertUnread`, `countUnread`)

**Files:**
- Create: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts`
- Test: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts`

**Interfaces:**
- Consumes: `IAlertRepository`, `AlertPage`, `ALERT_REPOSITORY` (Task 3); `Alert`, `AlertType`, `AlertProps` (Task 2); `AlertOrmEntity` (Task 4); `BaseRepository` (`../../../common/tenancy/base.repository.ts`); `TenantContextService` (`../../../common/tenancy/tenant-context.ts`); `AppError`/`ErrorCode` (`../../../common/errors/*`).
- Produces: `TypeOrmAlertRepository` class implementing `IAlertRepository`. Task 6 adds the remaining methods to this same class/file.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { TypeOrmAlertRepository } from './typeorm-alert.repository';

function buildAlert(overrides: Partial<ConstructorParameters<typeof Alert>[0]> = {}) {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.BANK_CONNECTION_ERROR,
    entityType: 'bank_connection',
    entityId: 'conn-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  });
}

function buildDataSource() {
  const query = jest.fn().mockResolvedValue(undefined);
  const transaction = jest.fn((callback) => callback({ query }));
  return { dataSource: { transaction } as any, query };
}

function buildTenantContext(organizationId = 'org-1') {
  return { getOrganizationId: jest.fn(() => organizationId) } as any;
}

describe('TypeOrmAlertRepository', () => {
  describe('upsertUnread', () => {
    it('runs the partial-unique-index upsert inside a transaction with the alert fields as params', async () => {
      const { dataSource, query } = buildDataSource();
      const ormRepo = {} as any;
      const repo = new TypeOrmAlertRepository(
        ormRepo,
        dataSource,
        buildTenantContext(),
      );
      const alert = buildAlert();

      await repo.upsertUnread(alert);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL'),
        [
          'alert-1',
          'org-1',
          'user-1',
          AlertType.BANK_CONNECTION_ERROR,
          'bank_connection',
          'conn-1',
          alert.createdAt,
        ],
      );
    });

    it('throws TENANT_MISMATCH when the alert organizationId does not match the tenant context', async () => {
      const { dataSource } = buildDataSource();
      const ormRepo = {} as any;
      const repo = new TypeOrmAlertRepository(
        ormRepo,
        dataSource,
        buildTenantContext('org-2'),
      );

      await expect(repo.upsertUnread(buildAlert())).rejects.toMatchObject({
        errorCode: ErrorCode.TENANT_MISMATCH,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('countUnread', () => {
    it('counts unread rows scoped by organizationId and userId', async () => {
      const ormRepo = { count: jest.fn().mockResolvedValue(3) };
      const repo = new TypeOrmAlertRepository(
        ormRepo as any,
        { transaction: jest.fn() } as any,
        buildTenantContext(),
      );

      const count = await repo.countUnread('user-1');

      expect(count).toBe(3);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', userId: 'user-1', readAt: null },
      });
    });
  });
});
```

Note: TypeORM's `IsNull()` FindOperator serializes to `readAt: null` when compared via `toHaveBeenCalledWith` only if the implementation literally passes `IsNull()` — this test asserts against the plain value `null`, so Step 3 below must call `ormRepo.count({ where: { ..., readAt: IsNull() } })`; adjust the assertion in Step 2 if `IsNull()` doesn't structurally equal `null` (it doesn't — see the actual expected matcher in the implementation step; use `expect.anything()` for that field name if this fails, but try the exact form first since Jest's `toEqual`/`toHaveBeenCalledWith` treats TypeORM's `FindOperator` instances by structural equality against another `IsNull()` instance, not `null`). Import `IsNull` from `'typeorm'` in the test alongside the assertion: replace `readAt: null` in the assertion above with `readAt: IsNull()` and add `import { IsNull } from 'typeorm';` at the top of the spec file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern typeorm-alert.repository` (from `apps/backend`)
Expected: FAIL — `Cannot find module './typeorm-alert.repository'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { AlertPage, IAlertRepository } from '../application/alert-repository.port';
import { Alert } from '../domain/alert';
import { AlertOrmEntity } from './alert.orm-entity';

@Injectable()
export class TypeOrmAlertRepository
  extends BaseRepository<AlertOrmEntity>
  implements IAlertRepository
{
  constructor(
    @InjectRepository(AlertOrmEntity) ormRepo: Repository<AlertOrmEntity>,
    private readonly dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(ormRepo, tenantContext);
  }

  async upsertUnread(alert: Alert): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (alert.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Tổ chức không khớp với ngữ cảnh hiện tại.',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "alerts" ("id", "organizationId", "userId", "type", "entityType", "entityId", "readAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
         ON CONFLICT ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL
         DO UPDATE SET "createdAt" = EXCLUDED."createdAt"`,
        [
          alert.id,
          alert.organizationId,
          alert.userId,
          alert.type,
          alert.entityType,
          alert.entityId,
          alert.createdAt,
        ],
      );
    });
  }

  async countUnread(userId: string): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.count({
      where: { organizationId, userId, readAt: IsNull() },
    });
  }

  // Task 6 adds findPage, findByIdForUser, markRead, markAllRead, delete, deleteAll here.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern typeorm-alert.repository` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts
git commit -m "feat: add TypeOrmAlertRepository upsertUnread/countUnread (partial-index dedupe upsert)"
```

---

### Task 6: `TypeOrmAlertRepository` — read/mutate path (`findPage`, `findByIdForUser`, `markRead`, `markAllRead`, `delete`, `deleteAll`)

**Files:**
- Modify: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts` (Task 5)
- Modify: `apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts` (Task 5)

**Interfaces:**
- Consumes: same as Task 5, plus `this.ormRepo.createQueryBuilder` (TypeORM `Repository`).
- Produces: the remaining `IAlertRepository` methods on `TypeOrmAlertRepository`. Task 10-13's use cases call these exact method names/signatures.

- [ ] **Step 1: Write the failing tests (append to the same spec file)**

```typescript
// append inside the existing describe('TypeOrmAlertRepository', () => { ... }) block
// in apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts

describe('findPage', () => {
  it('paginates, filters unreadOnly, and returns total + unreadCount', async () => {
    const rows = [
      {
        id: 'alert-1',
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'SMTP_FAILED',
        entityType: 'smtp_config',
        entityId: 'smtp-1',
        readAt: null,
        createdAt: new Date('2026-08-13T00:00:00Z'),
      },
    ];
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, 1]),
    };
    const ormRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      count: jest.fn().mockResolvedValue(1),
    };
    const repo = new TypeOrmAlertRepository(
      ormRepo as any,
      { transaction: jest.fn() } as any,
      buildTenantContext(),
    );

    const page = await repo.findPage('user-1', 2, 10, true);

    expect(qb.where).toHaveBeenCalledWith('alert.organizationId = :organizationId', {
      organizationId: 'org-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('alert.userId = :userId', {
      userId: 'user-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('alert.readAt IS NULL');
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(page.total).toBe(1);
    expect(page.unreadCount).toBe(1);
    expect(page.items[0].id).toBe('alert-1');
  });
});

describe('findByIdForUser', () => {
  it('scopes by organizationId and userId', async () => {
    const ormRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'alert-1',
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'SMTP_FAILED',
        entityType: 'smtp_config',
        entityId: 'smtp-1',
        readAt: null,
        createdAt: new Date('2026-08-13T00:00:00Z'),
      }),
    };
    const repo = new TypeOrmAlertRepository(
      ormRepo as any,
      { transaction: jest.fn() } as any,
      buildTenantContext(),
    );

    const alert = await repo.findByIdForUser('alert-1', 'user-1');

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'alert-1', organizationId: 'org-1', userId: 'user-1' },
    });
    expect(alert?.id).toBe('alert-1');
  });

  it('returns null when no row matches', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const repo = new TypeOrmAlertRepository(
      ormRepo as any,
      { transaction: jest.fn() } as any,
      buildTenantContext(),
    );

    expect(await repo.findByIdForUser('missing', 'user-1')).toBeNull();
  });
});

describe('markRead', () => {
  it('sets readAt only when currently unread, scoped by org/user', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const dataSource = {
      transaction: jest.fn((cb) => cb({ getRepository: () => ormRepo })),
    };
    const repo = new TypeOrmAlertRepository(
      ormRepo as any,
      dataSource as any,
      buildTenantContext(),
    );

    await repo.markRead('alert-1', 'user-1');

    expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 'alert-1' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'organizationId = :organizationId AND userId = :userId',
      { organizationId: 'org-1', userId: 'user-1' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('"readAt" IS NULL');
  });
});

describe('markAllRead', () => {
  it('bulk-updates every unread row for the user in one statement', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 4 }),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const dataSource = {
      transaction: jest.fn((cb) => cb({ getRepository: () => ormRepo })),
    };
    const repo = new TypeOrmAlertRepository(
      ormRepo as any,
      dataSource as any,
      buildTenantContext(),
    );

    await repo.markAllRead('user-1');

    expect(qb.where).toHaveBeenCalledWith(
      'organizationId = :organizationId AND userId = :userId',
      { organizationId: 'org-1', userId: 'user-1' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('"readAt" IS NULL');
  });
});

describe('delete', () => {
  it('deletes one row scoped by id/org/user', async () => {
    const ormDeleteRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    const dataSource = {
      transaction: jest.fn((cb) => cb({ getRepository: () => ormDeleteRepo })),
    };
    const repo = new TypeOrmAlertRepository(
      {} as any,
      dataSource as any,
      buildTenantContext(),
    );

    await repo.delete('alert-1', 'user-1');

    expect(ormDeleteRepo.delete).toHaveBeenCalledWith({
      id: 'alert-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});

describe('deleteAll', () => {
  it('deletes every row for the user scoped by org', async () => {
    const ormDeleteRepo = { delete: jest.fn().mockResolvedValue({ affected: 4 }) };
    const dataSource = {
      transaction: jest.fn((cb) => cb({ getRepository: () => ormDeleteRepo })),
    };
    const repo = new TypeOrmAlertRepository(
      {} as any,
      dataSource as any,
      buildTenantContext(),
    );

    await repo.deleteAll('user-1');

    expect(ormDeleteRepo.delete).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern typeorm-alert.repository` (from `apps/backend`)
Expected: FAIL — `repo.findPage is not a function` (and similarly for the other new methods).

- [ ] **Step 3: Write minimal implementation (append to the `TypeOrmAlertRepository` class body, replacing the `// Task 6 adds ...` comment)**

```typescript
  private toDomain(row: AlertOrmEntity): Alert {
    return new Alert({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      type: row.type,
      entityType: row.entityType,
      entityId: row.entityId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    });
  }

  async findPage(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<AlertPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const qb = this.ormRepo
      .createQueryBuilder('alert')
      .where('alert.organizationId = :organizationId', { organizationId })
      .andWhere('alert.userId = :userId', { userId });
    if (unreadOnly) {
      qb.andWhere('alert.readAt IS NULL');
    }
    const [rows, total] = await qb
      .orderBy('alert.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const unreadCount = await this.countUnread(userId);
    return { items: rows.map((row) => this.toDomain(row)), total, unreadCount };
  }

  async findByIdForUser(id: string, userId: string): Promise<Alert | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { id, organizationId, userId },
    });
    return row ? this.toDomain(row) : null;
  }

  async markRead(id: string, userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('id = :id', { id })
        .andWhere('organizationId = :organizationId AND userId = :userId', {
          organizationId,
          userId,
        })
        .andWhere('"readAt" IS NULL')
        .execute();
    });
  }

  async markAllRead(userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('organizationId = :organizationId AND userId = :userId', {
          organizationId,
          userId,
        })
        .andWhere('"readAt" IS NULL')
        .execute();
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .delete({ id, organizationId, userId });
    });
  }

  async deleteAll(userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AlertOrmEntity).delete({ organizationId, userId });
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern typeorm-alert.repository` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.ts apps/backend/src/modules/alerts/infrastructure/typeorm-alert.repository.spec.ts
git commit -m "feat: add TypeOrmAlertRepository read/mutate methods"
```

---

### Task 7: `CreateAlertUseCase` (shared by all 3 event listeners)

**Files:**
- Create: `apps/backend/src/modules/alerts/application/create-alert.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/create-alert.usecase.spec.ts`

**Interfaces:**
- Consumes: `IAlertRepository`, `ALERT_REPOSITORY` (Task 3); `Alert`, `AlertType` (Task 2); `IEventPublisher`, `EVENT_PUBLISHER` (`../../../common/events/event-publisher.port.ts`).
- Produces: `CreateAlertUseCase` class with `execute(input: CreateAlertInput): Promise<void>`; `CreateAlertInput` interface (`organizationId: string, userId: string, type: AlertType, entityType: string, entityId: string`); `ALERT_CREATED_FOR_USER` event-name constant (`'alert.created-for-user'`) + `AlertCreatedForUserEvent` payload interface (`{ userId: string, unreadCount: number }`) — Task 15's SSE endpoint filters on this exact event name/shape. Every listener task (8, 9, 10) calls `createAlertUseCase.execute(...)` with this exact input shape instead of touching `IAlertRepository` directly.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/alerts/application/create-alert.usecase.spec.ts
import { AlertType } from '../domain/alert';
import {
  ALERT_CREATED_FOR_USER,
  CreateAlertUseCase,
} from './create-alert.usecase';

describe('CreateAlertUseCase', () => {
  it('upserts an unread Alert and emits ALERT_CREATED_FOR_USER with the fresh unread count', async () => {
    const alertRepo = {
      upsertUnread: jest.fn().mockResolvedValue(undefined),
      countUnread: jest.fn().mockResolvedValue(2),
    };
    const eventPublisher = { emit: jest.fn(), emitAsync: jest.fn() };
    const useCase = new CreateAlertUseCase(alertRepo as any, eventPublisher as any);

    await useCase.execute({
      organizationId: 'org-1',
      userId: 'user-1',
      type: AlertType.SMTP_FAILED,
      entityType: 'smtp_config',
      entityId: 'smtp-1',
    });

    expect(alertRepo.upsertUnread).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        type: AlertType.SMTP_FAILED,
        entityType: 'smtp_config',
        entityId: 'smtp-1',
        readAt: null,
      }),
    );
    expect(alertRepo.countUnread).toHaveBeenCalledWith('user-1');
    expect(eventPublisher.emit).toHaveBeenCalledWith(ALERT_CREATED_FOR_USER, {
      userId: 'user-1',
      unreadCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern create-alert.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './create-alert.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/create-alert.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { Alert, type AlertType } from '../domain/alert';
import { ALERT_REPOSITORY, type IAlertRepository } from './alert-repository.port';

export const ALERT_CREATED_FOR_USER = 'alert.created-for-user';

export interface AlertCreatedForUserEvent {
  userId: string;
  unreadCount: number;
}

export interface CreateAlertInput {
  organizationId: string;
  userId: string;
  type: AlertType;
  entityType: string;
  entityId: string;
}

@Injectable()
export class CreateAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CreateAlertInput): Promise<void> {
    const alert = new Alert({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      readAt: null,
      createdAt: new Date(),
    });
    await this.alertRepo.upsertUnread(alert);
    const unreadCount = await this.alertRepo.countUnread(input.userId);
    this.eventPublisher.emit(ALERT_CREATED_FOR_USER, {
      userId: input.userId,
      unreadCount,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern create-alert.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/application/create-alert.usecase.ts apps/backend/src/modules/alerts/application/create-alert.usecase.spec.ts
git commit -m "feat: add CreateAlertUseCase shared by all alert-producing listeners"
```

---

### Task 8: `BankConnectionAlertListener`

**Files:**
- Create: `apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.ts`
- Test: `apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.spec.ts`

**Interfaces:**
- Consumes: `BANK_CONNECTION_STATUS_CHANGED`, `BankConnectionStatusChangedEvent` (`../../bank-connections/application/mark-requires-reauthorization.usecase.ts`, already exists — status is `'REQUIRES_REAUTHORIZATION' | 'ERROR'`); `IMembershipRepository`, `MEMBERSHIP_REPOSITORY` (`../../organizations/application/membership-repository.port.ts`); `Role` (`../../organizations/domain/membership.ts`); `TenantContextService`; `CreateAlertUseCase` (Task 7); `AlertType` (Task 2).
- Produces: `BankConnectionAlertListener` class, `@OnEvent(BANK_CONNECTION_STATUS_CHANGED)` handler `handle(payload)`. Mirrors `BankConnectionStatusListener` (`notifications/infrastructure/bank-connection-status.listener.ts`) — same OWNER-resolution pattern, different delivery (Alert row instead of email job).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.spec.ts
import { AlertType } from '../domain/alert';
import { BankConnectionAlertListener } from './bank-connection-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: {
      run: (_user: unknown, cb: () => unknown) => cb(),
    },
  };
}

describe('BankConnectionAlertListener', () => {
  it('maps REQUIRES_REAUTHORIZATION to BANK_CONNECTION_NEEDS_REAUTH', async () => {
    const deps = buildDeps();
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'REQUIRES_REAUTHORIZATION',
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.BANK_CONNECTION_NEEDS_REAUTH,
      entityType: 'bank_connection',
      entityId: 'conn-1',
    });
  });

  it('maps ERROR to BANK_CONNECTION_ERROR', async () => {
    const deps = buildDeps();
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: AlertType.BANK_CONNECTION_ERROR }),
    );
  });

  it('does nothing when the organization has no OWNER membership', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findOwnerByOrganization.mockResolvedValue(null);
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });

  it('swallows errors from CreateAlertUseCase (never lets a listener crash the emitter)', async () => {
    const deps = buildDeps();
    deps.createAlert.execute.mockRejectedValue(new Error('db down'));
    const listener = new BankConnectionAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await expect(
      listener.handle({
        bankConnectionId: 'conn-1',
        organizationId: 'org-1',
        status: 'ERROR',
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern bank-connection-alert.listener` (from `apps/backend`)
Expected: FAIL — `Cannot find module './bank-connection-alert.listener'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  BANK_CONNECTION_STATUS_CHANGED,
  type BankConnectionStatusChangedEvent,
} from '../../bank-connections/application/mark-requires-reauthorization.usecase';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

@Injectable()
export class BankConnectionAlertListener {
  private readonly logger = new Logger(BankConnectionAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(BANK_CONNECTION_STATUS_CHANGED)
  async handle(payload: BankConnectionStatusChangedEvent): Promise<void> {
    try {
      await this.tenantContext.run(
        { userId: 'system', organizationId: payload.organizationId, role: Role.OWNER },
        async () => {
          const membership = await this.membershipRepo.findOwnerByOrganization(
            payload.organizationId,
          );
          if (!membership) return;

          await this.createAlert.execute({
            organizationId: payload.organizationId,
            userId: membership.userId,
            type:
              payload.status === 'ERROR'
                ? AlertType.BANK_CONNECTION_ERROR
                : AlertType.BANK_CONNECTION_NEEDS_REAUTH,
            entityType: 'bank_connection',
            entityId: payload.bankConnectionId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'Bank connection alert could not be created',
        bankConnectionId: payload.bankConnectionId,
        organizationId: payload.organizationId,
        status: payload.status,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern bank-connection-alert.listener` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.ts apps/backend/src/modules/alerts/infrastructure/bank-connection-alert.listener.spec.ts
git commit -m "feat: create an in-app Alert on bank connection status change"
```

---

### Task 9: `SMTP_CONFIG_FAILED` emit point + `SmtpConfigAlertListener`

**Files:**
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts:217-222` (the `transitioned` branch inside `onFailed()`)
- Test: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`
- Create: `apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.ts`
- Test: `apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.spec.ts`

**Interfaces:**
- Consumes: `EmailQueueProcessor`'s existing `private readonly eventEmitter: EventEmitter2` field (already injected, already used for `'reminder.execution.completed'` — this task reuses the same field, not a new `IEventPublisher` injection, to stay consistent with this file's existing pattern per Global Constraints); `CreateAlertUseCase` (Task 7); `AlertType` (Task 2); `IMembershipRepository`/`MEMBERSHIP_REPOSITORY`, `IUserRepository`/`USER_REPOSITORY`, `TenantContextService`, `Role`.
- Produces: `SMTP_CONFIG_FAILED` event-name constant (`'smtp-config.failed'`) + `SmtpConfigFailedEvent` interface (`{ organizationId: string, smtpConfigId: string }`), exported from `email-queue.processor.ts` (co-located with the emitting code, mirroring `mark-requires-reauthorization.usecase.ts`'s `BANK_CONNECTION_STATUS_CHANGED` pattern). `SmtpConfigAlertListener` class, `@OnEvent(SMTP_CONFIG_FAILED)` handler.

- [ ] **Step 1: Write the failing test for the emit point (add to the existing `describe('onFailed', ...)`-style block in `email-queue.processor.spec.ts`)**

First read the existing `'flips the SMTP config from CONNECTED to FAILED...'`-style test in that file to match its exact `buildDeps()`/harness shape, then add:

```typescript
// apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts
// (added within the existing describe block that covers onFailed() + SMTP exhaustion)
it('emits SMTP_CONFIG_FAILED with the org and config id when the SMTP config transitions to FAILED', async () => {
  const deps = buildDeps();
  deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
    id: 'smtp-1',
    organizationId: 'org-1',
    isConnected: () => true,
    markFailed: () => ({ id: 'smtp-1', organizationId: 'org-1', status: 'FAILED' }),
  });
  deps.smtpConfigRepo.markFailedIfVersionMatches.mockResolvedValue(true);
  const processor = buildProcessor(deps);

  await processor.onFailed(buildExhaustedReminderJob());

  expect(deps.eventEmitter.emit).toHaveBeenCalledWith('smtp-config.failed', {
    organizationId: 'org-1',
    smtpConfigId: 'smtp-1',
  });
});
```

(`buildDeps`, `buildProcessor`, and `buildExhaustedReminderJob` are the existing helpers already defined at the top of `email-queue.processor.spec.ts` — reuse them exactly as the neighboring tests in that file do; do not redefine them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern email-queue.processor` (from `apps/backend`)
Expected: FAIL — `expect(jest.fn()).toHaveBeenCalledWith(...)` received 0 calls with `'smtp-config.failed'`.

- [ ] **Step 3: Write the minimal implementation — modify `email-queue.processor.ts`**

Add near the top of the file, after the existing `EMAIL_QUEUE` import:

```typescript
export const SMTP_CONFIG_FAILED = 'smtp-config.failed';

export interface SmtpConfigFailedEvent {
  organizationId: string;
  smtpConfigId: string;
}
```

Inside `onFailed()`, right after the existing `if (transitioned) { ... }` block that sends the warning email (i.e. immediately after that block's closing `}`, still inside `if (transitioned)`, before the trailing `await this.emailQueue.add(...)` call that already follows it), add:

```typescript
            if (transitioned) {
              // ...existing owner-membership lookup + warning email send stays exactly as-is...

              this.eventEmitter.emit(SMTP_CONFIG_FAILED, {
                organizationId,
                smtpConfigId: config.id,
              });
            }
```

(This reuses the `transitioned` boolean and `config` variable already in scope at that point in `onFailed()` — no new lookups.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern email-queue.processor` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit the emit point**

```bash
git add apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts
git commit -m "feat: emit SMTP_CONFIG_FAILED when the SMTP config transitions CONNECTED -> FAILED"
```

- [ ] **Step 6: Write the failing test for `SmtpConfigAlertListener`**

```typescript
// apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.spec.ts
import { AlertType } from '../domain/alert';
import { SmtpConfigAlertListener } from './smtp-config-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: { run: (_user: unknown, cb: () => unknown) => cb() },
  };
}

describe('SmtpConfigAlertListener', () => {
  it('creates a SMTP_FAILED alert for the org OWNER', async () => {
    const deps = buildDeps();
    const listener = new SmtpConfigAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({ organizationId: 'org-1', smtpConfigId: 'smtp-1' });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.SMTP_FAILED,
      entityType: 'smtp_config',
      entityId: 'smtp-1',
    });
  });

  it('does nothing when the organization has no OWNER membership', async () => {
    const deps = buildDeps();
    deps.membershipRepo.findOwnerByOrganization.mockResolvedValue(null);
    const listener = new SmtpConfigAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({ organizationId: 'org-1', smtpConfigId: 'smtp-1' });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest --testPathPattern smtp-config-alert.listener` (from `apps/backend`)
Expected: FAIL — `Cannot find module './smtp-config-alert.listener'`

- [ ] **Step 8: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  SMTP_CONFIG_FAILED,
  type SmtpConfigFailedEvent,
} from '../../notifications/infrastructure/email-queue.processor';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

@Injectable()
export class SmtpConfigAlertListener {
  private readonly logger = new Logger(SmtpConfigAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(SMTP_CONFIG_FAILED)
  async handle(payload: SmtpConfigFailedEvent): Promise<void> {
    try {
      await this.tenantContext.run(
        { userId: 'system', organizationId: payload.organizationId, role: Role.OWNER },
        async () => {
          const membership = await this.membershipRepo.findOwnerByOrganization(
            payload.organizationId,
          );
          if (!membership) return;

          await this.createAlert.execute({
            organizationId: payload.organizationId,
            userId: membership.userId,
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: payload.smtpConfigId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'SMTP config alert could not be created',
        organizationId: payload.organizationId,
        smtpConfigId: payload.smtpConfigId,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest --testPathPattern smtp-config-alert.listener` (from `apps/backend`)
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.ts apps/backend/src/modules/alerts/infrastructure/smtp-config-alert.listener.spec.ts
git commit -m "feat: create an in-app Alert when the org's SMTP config fails"
```

---

### Task 10: Extend `reminder.scan.completed` with `queuedCount`/`skippedCount` + `ReminderScanAlertListener`

**Files:**
- Modify: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts:91-179` (`scanOrganization`)
- Modify: `apps/backend/src/modules/reminders/application/reminder-scheduler.service.spec.ts`
- Create: `apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.ts`
- Test: `apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.spec.ts`

**Interfaces:**
- Consumes: existing `ReminderSchedulerService.scanOrganization()` internals (`this.sendQueue.add(...)` call sites, `RATE_LIMITED` skip branch); `CreateAlertUseCase` (Task 7); `IOrganizationRepository`-adjacent `IMembershipRepository`/`MEMBERSHIP_REPOSITORY`; `AlertType` (Task 2).
- Produces: `'reminder.scan.completed'` payload gains `queuedCount: number` and `skippedCount: number` fields (payload becomes `{ organizationId: string, scanDate: string, queuedCount: number, skippedCount: number }`). `ReminderScanAlertListener` class, `@OnEvent('reminder.scan.completed')` handler that only creates an alert when `queuedCount > 0`. `ReminderScanCompletedListener` (`internal-tasks/infrastructure/reminder-scan-completed.listener.ts`) is untouched — it destructures only `organizationId` from the payload today and keeps working unchanged since the new fields are additive.

- [ ] **Step 1: Write the failing test — extend the existing `'emits reminder.scan.completed after organization evaluation'` test in `reminder-scheduler.service.spec.ts`**

Locate the existing test (around line 118 in the current file) and extend its assertion:

```typescript
// apps/backend/src/modules/reminders/application/reminder-scheduler.service.spec.ts
it('emits reminder.scan.completed with queuedCount and skippedCount', async () => {
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  const queueAdd = jest.fn();
  const scheduler = new ReminderSchedulerService(
    buildPolicyRepoMock() as any,
    { findByPolicyId: jest.fn().mockResolvedValue([rule]) } as any,
    {
      findLatestSentByReceivableIds: jest.fn().mockResolvedValue(
        new Map([['rec-1', { sentAt: new Date('2026-08-02') }]]),
      ),
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    } as any,
    {
      findOpenCandidates: jest
        .fn()
        .mockResolvedValue([makeCandidate(), makeCandidate({ receivableId: 'rec-2' })]),
    } as any,
    { add: queueAdd } as any,
    { run: async (_user: unknown, cb: () => Promise<void>) => await cb() } as any,
    eventEmitter as any,
    { findAllIds: jest.fn().mockResolvedValue(['org-1']) } as any,
  );

  await scheduler.scan(new Date('2026-08-03'));

  expect(eventEmitter.emitAsync).toHaveBeenCalledWith('reminder.scan.completed', {
    organizationId: 'org-1',
    scanDate: '2026-08-03',
    queuedCount: 1,
    skippedCount: 1,
  });
});
```

(`rec-1`'s last send was `2026-08-02`, one day before the `2026-08-03` scan, which is inside `rule.minIntervalDays` = 7 — so `rec-1` is rate-limited/skipped and `rec-2` is queued, giving `queuedCount: 1, skippedCount: 1`. This exercises both counters in one test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern reminder-scheduler.service` (from `apps/backend`)
Expected: FAIL — received `{ organizationId: 'org-1', scanDate: '2026-08-03' }`, missing `queuedCount`/`skippedCount`.

- [ ] **Step 3: Write minimal implementation — modify `scanOrganization()` in `reminder-scheduler.service.ts`**

```typescript
  private async scanOrganization(
    organizationId: string,
    today: Date,
  ): Promise<void> {
    const candidates = await this.candidateReader.findOpenCandidates();
    const executionDate = calendarDate(today);
    const eligible = candidates.filter((candidate) => !candidate.isDisputed);
    let queuedCount = 0;
    let skippedCount = 0;
    const emitScanCompleted = () =>
      this.eventEmitter.emitAsync('reminder.scan.completed', {
        organizationId,
        scanDate: executionDate,
        queuedCount,
        skippedCount,
      });
    if (eligible.length === 0) {
      await emitScanCompleted();
      return;
    }

    const policies = await this.policyRepo.findAll();
    const policyByGroup = new Map(
      policies
        .filter((policy) => policy.isActive)
        .map((policy) => [policy.customerGroup, policy]),
    );
    const rulesByPolicyId = new Map<string, ReminderRule[]>();
    for (const policy of policyByGroup.values()) {
      rulesByPolicyId.set(
        policy.id,
        await this.ruleRepo.findByPolicyId(policy.id),
      );
    }
    const latestSentByReceivable =
      await this.executionRepo.findLatestSentByReceivableIds(
        eligible.map((candidate) => candidate.receivableId),
      );

    for (const candidate of eligible) {
      const policy = policyByGroup.get(candidate.customerGroup);
      if (!policy) continue;

      const rules = rulesByPolicyId.get(policy.id) ?? [];
      const offsetDays = calculateOffsetDays(candidate.dueDate, today);
      const matchingRule = findMatchingRule(rules, offsetDays);
      if (!matchingRule) continue;

      const latestSent = latestSentByReceivable.get(candidate.receivableId);
      if (latestSent) {
        const daysSinceLastSend = Math.round(
          (today.getTime() - latestSent.sentAt.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysSinceLastSend < matchingRule.minIntervalDays) {
          await this.executionRepo.insertIfAbsent({
            id: randomUUID(),
            organizationId,
            receivableId: candidate.receivableId,
            reminderRuleId: matchingRule.id,
            executionDate: new Date(executionDate),
            sentAt: null,
            status: ReminderExecutionStatus.SKIPPED,
            skipReason: ReminderSkipReason.RATE_LIMITED,
            providerMessageId: null,
            failureReason: null,
            createdAt: new Date(),
          });
          skippedCount += 1;
          continue;
        }
      }

      await this.sendQueue.add(
        'send-reminder',
        {
          organizationId,
          receivableId: candidate.receivableId,
          reminderRuleId: matchingRule.id,
          executionDate,
        },
        {
          jobId: `reminder-${candidate.receivableId}-${matchingRule.id}-${executionDate}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      queuedCount += 1;
    }

    await emitScanCompleted();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern reminder-scheduler.service` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit the payload extension**

```bash
git add apps/backend/src/modules/reminders/application/reminder-scheduler.service.ts apps/backend/src/modules/reminders/application/reminder-scheduler.service.spec.ts
git commit -m "feat: extend reminder.scan.completed with queuedCount/skippedCount"
```

- [ ] **Step 6: Write the failing test for `ReminderScanAlertListener`**

```typescript
// apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.spec.ts
import { AlertType } from '../domain/alert';
import { ReminderScanAlertListener } from './reminder-scan-alert.listener';

function buildDeps() {
  return {
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    },
    createAlert: { execute: jest.fn().mockResolvedValue(undefined) },
    tenantContext: { run: (_user: unknown, cb: () => unknown) => cb() },
  };
}

describe('ReminderScanAlertListener', () => {
  it('creates a REMINDER_SCAN_SUMMARY alert when queuedCount > 0', async () => {
    const deps = buildDeps();
    const listener = new ReminderScanAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      organizationId: 'org-1',
      scanDate: '2026-08-13',
      queuedCount: 3,
      skippedCount: 1,
    });

    expect(deps.createAlert.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'owner-1',
      type: AlertType.REMINDER_SCAN_SUMMARY,
      entityType: 'reminder_scan',
      entityId: 'org-1',
    });
  });

  it('does not create an alert when queuedCount is 0', async () => {
    const deps = buildDeps();
    const listener = new ReminderScanAlertListener(
      deps.membershipRepo as any,
      deps.createAlert as any,
      deps.tenantContext as any,
    );

    await listener.handle({
      organizationId: 'org-1',
      scanDate: '2026-08-13',
      queuedCount: 0,
      skippedCount: 0,
    });

    expect(deps.createAlert.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest --testPathPattern reminder-scan-alert.listener` (from `apps/backend`)
Expected: FAIL — `Cannot find module './reminder-scan-alert.listener'`

- [ ] **Step 8: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { ReminderScanCompletedPayload } from '../../internal-tasks/infrastructure/reminder-scan-completed.listener';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

interface ReminderScanCompletedWithCountsPayload extends ReminderScanCompletedPayload {
  queuedCount: number;
  skippedCount: number;
}

@Injectable()
export class ReminderScanAlertListener {
  private readonly logger = new Logger(ReminderScanAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('reminder.scan.completed')
  async handle(payload: ReminderScanCompletedWithCountsPayload): Promise<void> {
    if (payload.queuedCount <= 0) return;
    try {
      await this.tenantContext.run(
        { userId: 'system', organizationId: payload.organizationId, role: Role.OWNER },
        async () => {
          const membership = await this.membershipRepo.findOwnerByOrganization(
            payload.organizationId,
          );
          if (!membership) return;

          await this.createAlert.execute({
            organizationId: payload.organizationId,
            userId: membership.userId,
            type: AlertType.REMINDER_SCAN_SUMMARY,
            entityType: 'reminder_scan',
            entityId: payload.organizationId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'Reminder scan summary alert could not be created',
        organizationId: payload.organizationId,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest --testPathPattern reminder-scan-alert.listener` (from `apps/backend`)
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.ts apps/backend/src/modules/alerts/infrastructure/reminder-scan-alert.listener.spec.ts
git commit -m "feat: create an in-app Alert summarizing each org's reminder scan"
```

---

### Task 11: `GET /alerts` — `ListAlertsUseCase` + DTOs + controller

**Files:**
- Create: `apps/backend/src/modules/alerts/application/list-alerts.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/list-alerts.usecase.spec.ts`
- Create: `apps/backend/src/modules/alerts/presentation/dto/alerts-pagination.dto.ts`
- Create: `apps/backend/src/modules/alerts/presentation/dto/alert-response.dto.ts`
- Create: `apps/backend/src/modules/alerts/presentation/alerts.controller.ts`
- Test: `apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts`

**Interfaces:**
- Consumes: `IAlertRepository`, `ALERT_REPOSITORY`, `AlertPage` (Task 3); `TenantContextService`; `AppError`/`ErrorCode`; `Permission` (`@casso-ledger/shared-types`); `PermissionGuard`, `RequirePermission`.
- Produces: `ListAlertsUseCase.execute(page: number, limit: number, unreadOnly: boolean): Promise<AlertPage>`; `AlertsPaginationDto` (`page`, `limit`, `unreadOnly`); `AlertResponseDto` (`id, type, entityType, entityId, isRead, createdAt`) + `toAlertResponse(alert: Alert): AlertResponseDto` + `toAlertsPageResponse(page: AlertPage): { items: AlertResponseDto[], total: number, unreadCount: number }`; `AlertsController` class routed at `/alerts` with `@Get()`. Tasks 12/13/15 add more handlers to this same controller class.

- [ ] **Step 1: Write the failing test for `ListAlertsUseCase`**

```typescript
// apps/backend/src/modules/alerts/application/list-alerts.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { ListAlertsUseCase } from './list-alerts.usecase';

describe('ListAlertsUseCase', () => {
  it('delegates to the repository with the current user id', async () => {
    const alertRepo = {
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0, unreadCount: 0 }),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new ListAlertsUseCase(alertRepo as any, tenantContext as any);

    await useCase.execute(2, 10, true);

    expect(alertRepo.findPage).toHaveBeenCalledWith('user-1', 2, 10, true);
  });

  it('throws UNAUTHORIZED when there is no authenticated user', async () => {
    const alertRepo = { findPage: jest.fn() };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue(undefined) };
    const useCase = new ListAlertsUseCase(alertRepo as any, tenantContext as any);

    await expect(useCase.execute(1, 20, false)).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern list-alerts.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './list-alerts.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/list-alerts.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ALERT_REPOSITORY, type AlertPage, type IAlertRepository } from './alert-repository.port';

@Injectable()
export class ListAlertsUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(page: number, limit: number, unreadOnly: boolean): Promise<AlertPage> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return this.alertRepo.findPage(user.userId, page, limit, unreadOnly);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern list-alerts.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Write the DTOs (no test — pure data shape + validation, exercised by the controller test in Step 6)**

```typescript
// apps/backend/src/modules/alerts/presentation/dto/alerts-pagination.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AlertsPaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly = false;
}
```

```typescript
// apps/backend/src/modules/alerts/presentation/dto/alert-response.dto.ts
import type { Alert, AlertType } from '../../domain/alert';
import type { AlertPage } from '../../application/alert-repository.port';

export interface AlertResponseDto {
  id: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertsPageResponseDto {
  items: AlertResponseDto[];
  total: number;
  unreadCount: number;
}

export function toAlertResponse(alert: Alert): AlertResponseDto {
  return {
    id: alert.id,
    type: alert.type,
    entityType: alert.entityType,
    entityId: alert.entityId,
    isRead: alert.isRead(),
    createdAt: alert.createdAt.toISOString(),
  };
}

export function toAlertsPageResponse(page: AlertPage): AlertsPageResponseDto {
  return {
    items: page.items.map(toAlertResponse),
    total: page.total,
    unreadCount: page.unreadCount,
  };
}
```

- [ ] **Step 6: Write the failing test for `AlertsController`'s `GET /alerts`**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
import { AlertType } from '../domain/alert';
import { AlertsController } from './alerts.controller';

function buildController() {
  const listAlerts = { execute: jest.fn() };
  const controller = new AlertsController(listAlerts as any);
  return { controller, listAlerts };
}

describe('AlertsController', () => {
  describe('GET /alerts', () => {
    it('maps query params to ListAlertsUseCase and the page to AlertsPageResponseDto', async () => {
      const { controller, listAlerts } = buildController();
      listAlerts.execute.mockResolvedValue({
        items: [
          {
            id: 'alert-1',
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: 'smtp-1',
            isRead: () => false,
            createdAt: new Date('2026-08-13T00:00:00Z'),
          },
        ],
        total: 1,
        unreadCount: 1,
      });

      const result = await controller.list({ page: 2, limit: 10, unreadOnly: true });

      expect(listAlerts.execute).toHaveBeenCalledWith(2, 10, true);
      expect(result).toEqual({
        items: [
          {
            id: 'alert-1',
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: 'smtp-1',
            isRead: false,
            createdAt: '2026-08-13T00:00:00.000Z',
          },
        ],
        total: 1,
        unreadCount: 1,
      });
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: FAIL — `Cannot find module './alerts.controller'`

- [ ] **Step 8: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';
import { toAlertsPageResponse } from './dto/alert-response.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(private readonly listAlerts: ListAlertsUseCase) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/alerts/application/list-alerts.usecase.ts apps/backend/src/modules/alerts/application/list-alerts.usecase.spec.ts apps/backend/src/modules/alerts/presentation/dto/alerts-pagination.dto.ts apps/backend/src/modules/alerts/presentation/dto/alert-response.dto.ts apps/backend/src/modules/alerts/presentation/alerts.controller.ts apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
git commit -m "feat: add GET /alerts (paginated, unreadOnly filter, unreadCount)"
```

---

### Task 12: `PATCH /alerts/:id/read` + `PATCH /alerts/read-all`

**Files:**
- Create: `apps/backend/src/modules/alerts/application/mark-alert-read.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/mark-alert-read.usecase.spec.ts`
- Create: `apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.spec.ts`
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.ts` (Task 11)
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts` (Task 11)

**Interfaces:**
- Consumes: `IAlertRepository.findByIdForUser/markRead/markAllRead` (Task 3/6); `TenantContextService`; `AppError`/`ErrorCode`.
- Produces: `MarkAlertReadUseCase.execute(id: string): Promise<void>` (throws `ErrorCode.NOT_FOUND` if the alert doesn't exist or isn't owned by the current user); `MarkAllAlertsReadUseCase.execute(): Promise<void>`. `AlertsController` gains `@Patch(':id/read')` and `@Patch('read-all')`.

- [ ] **Step 1: Write the failing test for `MarkAlertReadUseCase`**

```typescript
// apps/backend/src/modules/alerts/application/mark-alert-read.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { MarkAlertReadUseCase } from './mark-alert-read.usecase';

function buildAlert() {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.SMTP_FAILED,
    entityType: 'smtp_config',
    entityId: 'smtp-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
  });
}

describe('MarkAlertReadUseCase', () => {
  it('marks the alert read when it exists and belongs to the current user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(buildAlert()),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new MarkAlertReadUseCase(alertRepo as any, tenantContext as any);

    await useCase.execute('alert-1');

    expect(alertRepo.findByIdForUser).toHaveBeenCalledWith('alert-1', 'user-1');
    expect(alertRepo.markRead).toHaveBeenCalledWith('alert-1', 'user-1');
  });

  it('throws NOT_FOUND when the alert does not exist or is not owned by the user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(null),
      markRead: jest.fn(),
    };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new MarkAlertReadUseCase(alertRepo as any, tenantContext as any);

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(alertRepo.markRead).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern mark-alert-read.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './mark-alert-read.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/mark-alert-read.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ALERT_REPOSITORY, type IAlertRepository } from './alert-repository.port';

@Injectable()
export class MarkAlertReadUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(id: string): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const alert = await this.alertRepo.findByIdForUser(id, user.userId);
    if (!alert) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thông báo.');
    }
    await this.alertRepo.markRead(id, user.userId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern mark-alert-read.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Write the failing test for `MarkAllAlertsReadUseCase`**

```typescript
// apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.spec.ts
import { MarkAllAlertsReadUseCase } from './mark-all-alerts-read.usecase';

describe('MarkAllAlertsReadUseCase', () => {
  it('marks every unread alert for the current user read in one call', async () => {
    const alertRepo = { markAllRead: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new MarkAllAlertsReadUseCase(alertRepo as any, tenantContext as any);

    await useCase.execute();

    expect(alertRepo.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest --testPathPattern mark-all-alerts-read.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './mark-all-alerts-read.usecase'`

- [ ] **Step 7: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ALERT_REPOSITORY, type IAlertRepository } from './alert-repository.port';

@Injectable()
export class MarkAllAlertsReadUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    await this.alertRepo.markAllRead(user.userId);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --testPathPattern mark-all-alerts-read.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 9: Write the failing controller tests (append to `alerts.controller.spec.ts`, update `buildController()` to pass the two new use cases)**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
// Update buildController() to also construct the new use cases:
function buildController() {
  const listAlerts = { execute: jest.fn() };
  const markAlertRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const markAllAlertsRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const controller = new AlertsController(
    listAlerts as any,
    markAlertRead as any,
    markAllAlertsRead as any,
  );
  return { controller, listAlerts, markAlertRead, markAllAlertsRead };
}

// New tests:
describe('PATCH /alerts/:id/read', () => {
  it('delegates to MarkAlertReadUseCase', async () => {
    const { controller, markAlertRead } = buildController();

    const result = await controller.read('alert-1');

    expect(markAlertRead.execute).toHaveBeenCalledWith('alert-1');
    expect(result).toEqual({ success: true });
  });
});

describe('PATCH /alerts/read-all', () => {
  it('delegates to MarkAllAlertsReadUseCase', async () => {
    const { controller, markAllAlertsRead } = buildController();

    const result = await controller.readAll();

    expect(markAllAlertsRead.execute).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
```

(Update the existing `GET /alerts` test's `buildController()` call sites if it constructed `AlertsController` inline instead of via the shared helper — use the updated `buildController()` everywhere in the file.)

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: FAIL — `controller.read is not a function`

- [ ] **Step 11: Write minimal implementation — modify `alerts.controller.ts`**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { MarkAlertReadUseCase } from '../application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from '../application/mark-all-alerts-read.usecase';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';
import { toAlertsPageResponse } from './dto/alert-response.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly markAlertRead: MarkAlertReadUseCase,
    private readonly markAllAlertsRead: MarkAllAlertsReadUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }

  @Patch(':id/read')
  @RequirePermission(Permission.ALERT_READ)
  async read(@Param('id') id: string) {
    await this.markAlertRead.execute(id);
    return { success: true };
  }

  @Patch('read-all')
  @RequirePermission(Permission.ALERT_READ)
  async readAll() {
    await this.markAllAlertsRead.execute();
    return { success: true };
  }
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/modules/alerts/application/mark-alert-read.usecase.ts apps/backend/src/modules/alerts/application/mark-alert-read.usecase.spec.ts apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.ts apps/backend/src/modules/alerts/application/mark-all-alerts-read.usecase.spec.ts apps/backend/src/modules/alerts/presentation/alerts.controller.ts apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
git commit -m "feat: add PATCH /alerts/:id/read and PATCH /alerts/read-all"
```

---

### Task 13: `DELETE /alerts/:id` + `DELETE /alerts`

**Files:**
- Create: `apps/backend/src/modules/alerts/application/delete-alert.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/delete-alert.usecase.spec.ts`
- Create: `apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.ts`
- Test: `apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.spec.ts`
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.ts` (Task 12)
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts` (Task 12)

**Interfaces:**
- Consumes: `IAlertRepository.findByIdForUser/delete/deleteAll` (Task 3/6).
- Produces: `DeleteAlertUseCase.execute(id: string): Promise<void>` (throws `ErrorCode.NOT_FOUND` if missing/not owned, mirroring `MarkAlertReadUseCase`); `DeleteAllAlertsUseCase.execute(): Promise<void>`. `AlertsController` gains `@Delete(':id')` and `@Delete()`.

- [ ] **Step 1: Write the failing test for `DeleteAlertUseCase`**

```typescript
// apps/backend/src/modules/alerts/application/delete-alert.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Alert, AlertType } from '../domain/alert';
import { DeleteAlertUseCase } from './delete-alert.usecase';

function buildAlert() {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.SMTP_FAILED,
    entityType: 'smtp_config',
    entityId: 'smtp-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
  });
}

describe('DeleteAlertUseCase', () => {
  it('deletes the alert when it exists and belongs to the current user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(buildAlert()),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new DeleteAlertUseCase(alertRepo as any, tenantContext as any);

    await useCase.execute('alert-1');

    expect(alertRepo.delete).toHaveBeenCalledWith('alert-1', 'user-1');
  });

  it('throws NOT_FOUND when the alert does not exist or is not owned by the user', async () => {
    const alertRepo = {
      findByIdForUser: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new DeleteAlertUseCase(alertRepo as any, tenantContext as any);

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(alertRepo.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern delete-alert.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './delete-alert.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/delete-alert.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ALERT_REPOSITORY, type IAlertRepository } from './alert-repository.port';

@Injectable()
export class DeleteAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(id: string): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const alert = await this.alertRepo.findByIdForUser(id, user.userId);
    if (!alert) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thông báo.');
    }
    await this.alertRepo.delete(id, user.userId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern delete-alert.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Write the failing test for `DeleteAllAlertsUseCase`**

```typescript
// apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.spec.ts
import { DeleteAllAlertsUseCase } from './delete-all-alerts.usecase';

describe('DeleteAllAlertsUseCase', () => {
  it('deletes every alert for the current user in one call', async () => {
    const alertRepo = { deleteAll: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }) };
    const useCase = new DeleteAllAlertsUseCase(alertRepo as any, tenantContext as any);

    await useCase.execute();

    expect(alertRepo.deleteAll).toHaveBeenCalledWith('user-1');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest --testPathPattern delete-all-alerts.usecase` (from `apps/backend`)
Expected: FAIL — `Cannot find module './delete-all-alerts.usecase'`

- [ ] **Step 7: Write minimal implementation**

```typescript
// apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ALERT_REPOSITORY, type IAlertRepository } from './alert-repository.port';

@Injectable()
export class DeleteAllAlertsUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    await this.alertRepo.deleteAll(user.userId);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --testPathPattern delete-all-alerts.usecase` (from `apps/backend`)
Expected: PASS

- [ ] **Step 9: Write the failing controller tests (append to `alerts.controller.spec.ts`, extend `buildController()` again)**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
// Update buildController() to also construct the two new use cases:
function buildController() {
  const listAlerts = { execute: jest.fn() };
  const markAlertRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const markAllAlertsRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAlert = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAllAlerts = { execute: jest.fn().mockResolvedValue(undefined) };
  const controller = new AlertsController(
    listAlerts as any,
    markAlertRead as any,
    markAllAlertsRead as any,
    deleteAlert as any,
    deleteAllAlerts as any,
  );
  return {
    controller,
    listAlerts,
    markAlertRead,
    markAllAlertsRead,
    deleteAlert,
    deleteAllAlerts,
  };
}

// New tests:
describe('DELETE /alerts/:id', () => {
  it('delegates to DeleteAlertUseCase', async () => {
    const { controller, deleteAlert } = buildController();

    const result = await controller.remove('alert-1');

    expect(deleteAlert.execute).toHaveBeenCalledWith('alert-1');
    expect(result).toEqual({ success: true });
  });
});

describe('DELETE /alerts', () => {
  it('delegates to DeleteAllAlertsUseCase', async () => {
    const { controller, deleteAllAlerts } = buildController();

    const result = await controller.removeAll();

    expect(deleteAllAlerts.execute).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: FAIL — `controller.remove is not a function`

- [ ] **Step 11: Write minimal implementation — modify `alerts.controller.ts`**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { DeleteAlertUseCase } from '../application/delete-alert.usecase';
import { DeleteAllAlertsUseCase } from '../application/delete-all-alerts.usecase';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { MarkAlertReadUseCase } from '../application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from '../application/mark-all-alerts-read.usecase';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';
import { toAlertsPageResponse } from './dto/alert-response.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly markAlertRead: MarkAlertReadUseCase,
    private readonly markAllAlertsRead: MarkAllAlertsReadUseCase,
    private readonly deleteAlert: DeleteAlertUseCase,
    private readonly deleteAllAlerts: DeleteAllAlertsUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }

  @Patch(':id/read')
  @RequirePermission(Permission.ALERT_READ)
  async read(@Param('id') id: string) {
    await this.markAlertRead.execute(id);
    return { success: true };
  }

  @Patch('read-all')
  @RequirePermission(Permission.ALERT_READ)
  async readAll() {
    await this.markAllAlertsRead.execute();
    return { success: true };
  }

  @Delete(':id')
  @RequirePermission(Permission.ALERT_READ)
  async remove(@Param('id') id: string) {
    await this.deleteAlert.execute(id);
    return { success: true };
  }

  @Delete()
  @RequirePermission(Permission.ALERT_READ)
  async removeAll() {
    await this.deleteAllAlerts.execute();
    return { success: true };
  }
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/modules/alerts/application/delete-alert.usecase.ts apps/backend/src/modules/alerts/application/delete-alert.usecase.spec.ts apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.ts apps/backend/src/modules/alerts/application/delete-all-alerts.usecase.spec.ts apps/backend/src/modules/alerts/presentation/alerts.controller.ts apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
git commit -m "feat: add DELETE /alerts/:id and DELETE /alerts"
```

---

### Task 14: `JwtStrategy` accepts `?token=` query param (native `EventSource` cannot set headers)

**Files:**
- Modify: `apps/backend/src/common/auth/jwt.strategy.ts`
- Test: `apps/backend/src/common/auth/jwt.strategy.spec.ts` (new)

**Interfaces:**
- Consumes: `ExtractJwt` from `passport-jwt` (already imported); `Request` from `express`.
- Produces: exported `extractJwtFromRequest(request: Request): string | null` function — Bearer header takes priority, falls back to `?token=` query string. Task 15's SSE client (frontend) relies on this query-param fallback existing.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/common/auth/jwt.strategy.spec.ts
import type { Request } from 'express';
import { extractJwtFromRequest } from './jwt.strategy';

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as Request;
}

describe('extractJwtFromRequest', () => {
  it('extracts from the Authorization Bearer header when present', () => {
    const request = fakeRequest({
      headers: { authorization: 'Bearer header-token' },
    });

    expect(extractJwtFromRequest(request)).toBe('header-token');
  });

  it('falls back to the ?token= query param when there is no Bearer header (native EventSource cannot set headers)', () => {
    const request = fakeRequest({ query: { token: 'query-token' } });

    expect(extractJwtFromRequest(request)).toBe('query-token');
  });

  it('prefers the Bearer header over the query param when both are present', () => {
    const request = fakeRequest({
      headers: { authorization: 'Bearer header-token' },
      query: { token: 'query-token' },
    });

    expect(extractJwtFromRequest(request)).toBe('header-token');
  });

  it('returns null when neither is present', () => {
    expect(extractJwtFromRequest(fakeRequest())).toBeNull();
  });

  it('returns null when the query token is not a string (e.g. ?token[]=a&token[]=b)', () => {
    const request = fakeRequest({ query: { token: ['a', 'b'] as never } });

    expect(extractJwtFromRequest(request)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern jwt.strategy` (from `apps/backend`)
Expected: FAIL — `extractJwtFromRequest is not exported` / `Cannot find export`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/common/auth/jwt.strategy.ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../config/jwt.config';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../modules/organizations/application/membership-repository.port';
import { ErrorCode } from '../errors/error-code';
import type { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
}

/**
 * Bearer header first (the normal path — every axios request in the
 * frontend sends it). Falls back to `?token=` on the query string only
 * because native `EventSource` (used by GET /alerts/stream) cannot set
 * custom headers — there is no cookie-based session in this codebase to
 * fall back to instead.
 */
export function extractJwtFromRequest(request: Request): string | null {
  const header = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
  if (header) return header;
  const token = request.query?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: extractJwtFromRequest,
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: getJwtSecret(config),
      algorithms: ['HS256'],
    });
  }

  async validate(
    request: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const organizationId =
      request.header('X-Organization-Id')?.trim() || payload.organizationId;
    const membership = await this.membershipRepo.findByUserAndOrganization(
      payload.userId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }
    return {
      userId: payload.userId,
      organizationId,
      role: membership.role,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern jwt.strategy` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Run the full auth test suite to confirm the header path still works for every existing route**

Run: `npx jest --testPathPattern "jwt-auth|auth-flow"` (from `apps/backend`)
Expected: PASS (no regression — the Bearer-header branch is unchanged, just extracted into a named function)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/auth/jwt.strategy.ts apps/backend/src/common/auth/jwt.strategy.spec.ts
git commit -m "feat: accept JWT via ?token= query param as a fallback for EventSource"
```

---

### Task 15: `GET /alerts/stream` (SSE)

**Files:**
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.ts` (Task 13)
- Modify: `apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts` (Task 13)

**Interfaces:**
- Consumes: `EventEmitter2` (raw, presentation-layer — allowed per Global Constraints); `ALERT_CREATED_FOR_USER`, `AlertCreatedForUserEvent` (Task 7); `TenantContextService`; `fromEvent`/`filter`/`map` from `rxjs`; `MessageEvent` from `@nestjs/common`.
- Produces: `AlertsController.stream(): Observable<MessageEvent>`, routed `@Sse('stream')`, filtered to the connected user's own `userId`. Task 23 (frontend `useAlertsStream`) connects to this exact path with `?token=`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
// Update buildController() once more to accept an EventEmitter2 + TenantContextService:
import { firstValueFrom } from 'rxjs';
// ...(keep existing imports)

function buildController() {
  const listAlerts = { execute: jest.fn() };
  const markAlertRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const markAllAlertsRead = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAlert = { execute: jest.fn().mockResolvedValue(undefined) };
  const deleteAllAlerts = { execute: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = new EventEmitter2();
  const tenantContext = {
    getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
  };
  const controller = new AlertsController(
    listAlerts as any,
    markAlertRead as any,
    markAllAlertsRead as any,
    deleteAlert as any,
    deleteAllAlerts as any,
    eventEmitter,
    tenantContext as any,
  );
  return {
    controller,
    listAlerts,
    markAlertRead,
    markAllAlertsRead,
    deleteAlert,
    deleteAllAlerts,
    eventEmitter,
    tenantContext,
  };
}

// New tests:
describe('GET /alerts/stream', () => {
  it('emits an SSE message only for ALERT_CREATED_FOR_USER events matching the connected userId', async () => {
    const { controller, eventEmitter } = buildController();

    const messagePromise = firstValueFrom(controller.stream());
    eventEmitter.emit('alert.created-for-user', { userId: 'someone-else', unreadCount: 9 });
    eventEmitter.emit('alert.created-for-user', { userId: 'user-1', unreadCount: 3 });

    const message = await messagePromise;

    expect(message).toEqual({ data: { type: 'alert.created', unreadCount: 3 } });
  });
});
```

(Add `import { EventEmitter2 } from '@nestjs/event-emitter';` to the top of the spec file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: FAIL — `controller.stream is not a function`

- [ ] **Step 3: Write minimal implementation — modify `alerts.controller.ts`**

```typescript
// apps/backend/src/modules/alerts/presentation/alerts.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Delete,
  Get,
  type MessageEvent,
  Param,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { filter, fromEvent, map, type Observable } from 'rxjs';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALERT_CREATED_FOR_USER,
  type AlertCreatedForUserEvent,
} from '../application/create-alert.usecase';
import { DeleteAlertUseCase } from '../application/delete-alert.usecase';
import { DeleteAllAlertsUseCase } from '../application/delete-all-alerts.usecase';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { MarkAlertReadUseCase } from '../application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from '../application/mark-all-alerts-read.usecase';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';
import { toAlertsPageResponse } from './dto/alert-response.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly markAlertRead: MarkAlertReadUseCase,
    private readonly markAllAlertsRead: MarkAllAlertsReadUseCase,
    private readonly deleteAlert: DeleteAlertUseCase,
    private readonly deleteAllAlerts: DeleteAllAlertsUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }

  @Patch(':id/read')
  @RequirePermission(Permission.ALERT_READ)
  async read(@Param('id') id: string) {
    await this.markAlertRead.execute(id);
    return { success: true };
  }

  @Patch('read-all')
  @RequirePermission(Permission.ALERT_READ)
  async readAll() {
    await this.markAllAlertsRead.execute();
    return { success: true };
  }

  @Delete(':id')
  @RequirePermission(Permission.ALERT_READ)
  async remove(@Param('id') id: string) {
    await this.deleteAlert.execute(id);
    return { success: true };
  }

  @Delete()
  @RequirePermission(Permission.ALERT_READ)
  async removeAll() {
    await this.deleteAllAlerts.execute();
    return { success: true };
  }

  @Sse('stream')
  @RequirePermission(Permission.ALERT_READ)
  stream(): Observable<MessageEvent> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const userId = user.userId;
    return fromEvent(this.eventEmitter, ALERT_CREATED_FOR_USER).pipe(
      filter((payload) => (payload as AlertCreatedForUserEvent).userId === userId),
      map(
        (payload): MessageEvent => ({
          data: {
            type: 'alert.created',
            unreadCount: (payload as AlertCreatedForUserEvent).unreadCount,
          },
        }),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern alerts.controller` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/presentation/alerts.controller.ts apps/backend/src/modules/alerts/presentation/alerts.controller.spec.ts
git commit -m "feat: add GET /alerts/stream (SSE, per-user filtered)"
```

---

### Task 16: `AlertsModule` + `app.module.ts` registration

**Files:**
- Create: `apps/backend/src/modules/alerts/alerts.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: every class/token from Tasks 2-15 (`AlertOrmEntity`, `TypeOrmAlertRepository`, `ALERT_REPOSITORY`, `CreateAlertUseCase`, `ListAlertsUseCase`, `MarkAlertReadUseCase`, `MarkAllAlertsReadUseCase`, `DeleteAlertUseCase`, `DeleteAllAlertsUseCase`, `AlertsController`, `BankConnectionAlertListener`, `SmtpConfigAlertListener`, `ReminderScanAlertListener`); `EVENT_PUBLISHER`/`NestEventPublisherAdapter` (`../../common/events/*`); `OrganizationsModule` (for `MEMBERSHIP_REPOSITORY`).
- Produces: `AlertsModule` registered in `AppModule.imports`. No test — this is DI wiring (AGENTS.md's "configuration-only changes" TDD exception); correctness is verified by Task 23's e2e test, which boots the full `AppModule`.

- [ ] **Step 1: Write `alerts.module.ts`**

```typescript
// apps/backend/src/modules/alerts/alerts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EVENT_PUBLISHER,
} from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ALERT_REPOSITORY } from './application/alert-repository.port';
import { CreateAlertUseCase } from './application/create-alert.usecase';
import { DeleteAlertUseCase } from './application/delete-alert.usecase';
import { DeleteAllAlertsUseCase } from './application/delete-all-alerts.usecase';
import { ListAlertsUseCase } from './application/list-alerts.usecase';
import { MarkAlertReadUseCase } from './application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from './application/mark-all-alerts-read.usecase';
import { AlertOrmEntity } from './infrastructure/alert.orm-entity';
import { BankConnectionAlertListener } from './infrastructure/bank-connection-alert.listener';
import { ReminderScanAlertListener } from './infrastructure/reminder-scan-alert.listener';
import { SmtpConfigAlertListener } from './infrastructure/smtp-config-alert.listener';
import { TypeOrmAlertRepository } from './infrastructure/typeorm-alert.repository';
import { AlertsController } from './presentation/alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AlertOrmEntity]), OrganizationsModule],
  controllers: [AlertsController],
  providers: [
    { provide: ALERT_REPOSITORY, useClass: TypeOrmAlertRepository },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    CreateAlertUseCase,
    ListAlertsUseCase,
    MarkAlertReadUseCase,
    MarkAllAlertsReadUseCase,
    DeleteAlertUseCase,
    DeleteAllAlertsUseCase,
    BankConnectionAlertListener,
    SmtpConfigAlertListener,
    ReminderScanAlertListener,
  ],
})
export class AlertsModule {}
```

- [ ] **Step 2: Register `AlertsModule` in `app.module.ts`**

```typescript
// apps/backend/src/app.module.ts
// add to the imports at the top:
import { AlertsModule } from './modules/alerts/alerts.module';

// add AlertsModule to the @Module({ imports: [...] }) array, after SmtpConfigModule:
    SmtpConfigModule,
    AlertsModule,
```

- [ ] **Step 3: Compile-check the whole backend**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: no new errors — this confirms every DI wiring (constructor param types, provider tokens) lines up across the 15 preceding tasks.

- [ ] **Step 4: Run the full backend unit suite**

Run: `npx jest` (from `apps/backend`)
Expected: PASS — every `*.spec.ts` from Tasks 1-15 plus the pre-existing suite (in particular `email-queue.processor.spec.ts`, `reminder-scheduler.service.spec.ts`, `jwt.strategy.spec.ts` covering the modified files).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/alerts/alerts.module.ts apps/backend/src/app.module.ts
git commit -m "feat: wire AlertsModule into AppModule"
```

---

### Task 17: `popover.tsx` shadcn primitive

**Files:**
- Create: `apps/frontend/src/components/ui/popover.tsx`

**Interfaces:**
- Consumes: `Popover` from the already-installed `radix-ui` meta-package (see Global Constraints interpretation #5 — no `pnpm add` needed).
- Produces: `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` — Task 22's `AlertPanel` imports these exact names.

No dedicated test file: this is a direct structural port of `dialog.tsx`'s existing pattern (that file also has no `.spec.tsx`) — a shadcn primitive with no behavior of its own beyond what Radix already tests upstream. Exercised indirectly by Task 22's `AlertPanel` component test.

- [ ] **Step 1: Write the file**

```typescript
// apps/frontend/src/components/ui/popover.tsx
import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  className,
  align = 'end',
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-80 rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (from `apps/frontend`)
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ui/popover.tsx
git commit -m "feat: add Popover shadcn primitive (no new dependency — radix-ui already includes it)"
```

---

### Task 18: `features/alerts/api/` — fetch functions + TanStack Query hooks

**Files:**
- Create: `apps/frontend/src/features/alerts/api/alerts-api.ts`
- Create: `apps/frontend/src/features/alerts/api/use-alerts.ts`
- Test: `apps/frontend/src/features/alerts/api/use-alerts.spec.tsx`
- Create: `apps/frontend/src/features/alerts/types.ts`

**Interfaces:**
- Consumes: `apiRequest`, `postWithIdempotency` (`@/lib/api-client`) — note: `PATCH`/`DELETE` calls use plain `apiRequest` (no idempotency key needed, per Global Constraints interpretation #6, so this feature does NOT use `postWithIdempotency`).
- Produces: `AlertDto` type (`{ id: string, type: AlertType, entityType: string, entityId: string, isRead: boolean, createdAt: string }`), `AlertType` string union (`'BANK_CONNECTION_NEEDS_REAUTH' | 'BANK_CONNECTION_ERROR' | 'SMTP_FAILED' | 'REMINDER_SCAN_SUMMARY'`), `AlertsPage` type (`{ items: AlertDto[], total: number, unreadCount: number }`); `fetchAlerts(page, limit, unreadOnly): Promise<AlertsPage>`, `markAlertRead(id): Promise<void>`, `markAllAlertsRead(): Promise<void>`, `deleteAlert(id): Promise<void>`, `deleteAllAlerts(): Promise<void>`; `useAlerts(page?, unreadOnly?)`, `useMarkAlertRead()`, `useMarkAllAlertsRead()`, `useDeleteAlert()`, `useDeleteAllAlerts()` — every hook invalidates `queryKey: ['alerts']`. Task 21/22/23 import these hook names exactly.

- [ ] **Step 1: Write `types.ts` (no test — pure type declarations)**

```typescript
// apps/frontend/src/features/alerts/types.ts
export type AlertType =
  | 'BANK_CONNECTION_NEEDS_REAUTH'
  | 'BANK_CONNECTION_ERROR'
  | 'SMTP_FAILED'
  | 'REMINDER_SCAN_SUMMARY';

export interface AlertDto {
  id: string;
  type: AlertType;
  entityType: string;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertsPage {
  items: AlertDto[];
  total: number;
  unreadCount: number;
}
```

- [ ] **Step 2: Write `alerts-api.ts` (no dedicated test — thin wrappers around `apiRequest`, exercised by the hook tests below)**

```typescript
// apps/frontend/src/features/alerts/api/alerts-api.ts
import { apiRequest } from '@/lib/api-client';
import type { AlertsPage } from '../types';

export function fetchAlerts(
  page: number,
  limit: number,
  unreadOnly: boolean,
): Promise<AlertsPage> {
  return apiRequest<AlertsPage>({
    url: '/api/v1/alerts',
    method: 'GET',
    params: { page, limit, unreadOnly },
  });
}

export function markAlertRead(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/alerts/${id}/read`,
    method: 'PATCH',
  });
}

export function markAllAlertsRead(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/alerts/read-all',
    method: 'PATCH',
  });
}

export function deleteAlert(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/alerts/${id}`,
    method: 'DELETE',
  });
}

export function deleteAllAlerts(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/alerts',
    method: 'DELETE',
  });
}
```

- [ ] **Step 3: Write the failing test for the hooks**

```typescript
// apps/frontend/src/features/alerts/api/use-alerts.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  useAlerts,
  useDeleteAlert,
  useDeleteAllAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from './use-alerts';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAlerts', () => {
  it('fetches the first page with unreadOnly=false by default', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderHook(() => useAlerts(), { wrapper });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts',
        method: 'GET',
        params: { page: 1, limit: 20, unreadOnly: false },
      }),
    );
  });
});

describe('useMarkAlertRead', () => {
  it('PATCHes /alerts/:id/read', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMarkAlertRead(), { wrapper });

    result.current.mutate('alert-1');

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1/read',
        method: 'PATCH',
      }),
    );
  });
});

describe('useMarkAllAlertsRead', () => {
  it('PATCHes /alerts/read-all', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMarkAllAlertsRead(), { wrapper });

    result.current.mutate();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/read-all',
        method: 'PATCH',
      }),
    );
  });
});

describe('useDeleteAlert', () => {
  it('DELETEs /alerts/:id', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteAlert(), { wrapper });

    result.current.mutate('alert-1');

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1',
        method: 'DELETE',
      }),
    );
  });
});

describe('useDeleteAllAlerts', () => {
  it('DELETEs /alerts', async () => {
    apiRequest.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteAllAlerts(), { wrapper });

    result.current.mutate();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts',
        method: 'DELETE',
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter frontend test -- use-alerts` (from repo root) — or `npx vitest run use-alerts` from `apps/frontend`
Expected: FAIL — `Cannot find module './use-alerts'`

- [ ] **Step 5: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/api/use-alerts.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAlert,
  deleteAllAlerts,
  fetchAlerts,
  markAlertRead,
  markAllAlertsRead,
} from './alerts-api';

export function useAlerts(page = 1, unreadOnly = false) {
  return useQuery({
    queryKey: ['alerts', page, unreadOnly],
    queryFn: () => fetchAlerts(page, 20, unreadOnly),
  });
}

function useAlertsMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useMarkAlertRead() {
  return useAlertsMutation<string>(markAlertRead);
}

export function useMarkAllAlertsRead() {
  return useAlertsMutation<void>(markAllAlertsRead);
}

export function useDeleteAlert() {
  return useAlertsMutation<string>(deleteAlert);
}

export function useDeleteAllAlerts() {
  return useAlertsMutation<void>(deleteAllAlerts);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter frontend test -- use-alerts` (from repo root)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/alerts/types.ts apps/frontend/src/features/alerts/api/alerts-api.ts apps/frontend/src/features/alerts/api/use-alerts.ts apps/frontend/src/features/alerts/api/use-alerts.spec.tsx
git commit -m "feat: add alerts API client + TanStack Query hooks"
```

---

### Task 19: `alert-message.ts` — pure Vietnamese message mapping

**Files:**
- Create: `apps/frontend/src/features/alerts/lib/alert-message.ts`
- Test: `apps/frontend/src/features/alerts/lib/alert-message.spec.ts`

**Interfaces:**
- Consumes: `AlertType` (Task 18).
- Produces: `alertMessage(type: AlertType): string`. Task 22's `AlertPanel` calls this exact function for each row.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/alerts/lib/alert-message.spec.ts
import { describe, expect, it } from 'vitest';
import { alertMessage } from './alert-message';

describe('alertMessage', () => {
  it('maps BANK_CONNECTION_NEEDS_REAUTH', () => {
    expect(alertMessage('BANK_CONNECTION_NEEDS_REAUTH')).toBe(
      'Kết nối ngân hàng cần xác thực lại',
    );
  });

  it('maps BANK_CONNECTION_ERROR', () => {
    expect(alertMessage('BANK_CONNECTION_ERROR')).toBe(
      'Kết nối ngân hàng đang gặp sự cố',
    );
  });

  it('maps SMTP_FAILED', () => {
    expect(alertMessage('SMTP_FAILED')).toBe(
      'Máy chủ email của bạn gửi thất bại',
    );
  });

  it('maps REMINDER_SCAN_SUMMARY (no count field on Alert — generic scheduled-not-sent wording)', () => {
    expect(alertMessage('REMINDER_SCAN_SUMMARY')).toBe(
      'Có email nhắc nhở đã được lên lịch gửi hôm nay',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run alert-message` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './alert-message'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/lib/alert-message.ts
import type { AlertType } from '../types';

const MESSAGES: Record<AlertType, string> = {
  BANK_CONNECTION_NEEDS_REAUTH: 'Kết nối ngân hàng cần xác thực lại',
  BANK_CONNECTION_ERROR: 'Kết nối ngân hàng đang gặp sự cố',
  SMTP_FAILED: 'Máy chủ email của bạn gửi thất bại',
  // Alert carries no count field (id/organizationId/userId/type/entityType/
  // entityId/readAt/createdAt only), and queuedCount is only known
  // synchronously at scan time on the backend — not persisted onto the
  // Alert row — so this is the generic fallback, worded as "scheduled"
  // rather than "sent" since sends happen later, asynchronously.
  REMINDER_SCAN_SUMMARY: 'Có email nhắc nhở đã được lên lịch gửi hôm nay',
};

export function alertMessage(type: AlertType): string {
  return MESSAGES[type];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run alert-message` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/alerts/lib/alert-message.ts apps/frontend/src/features/alerts/lib/alert-message.spec.ts
git commit -m "feat: add pure alertMessage() Vietnamese message mapping"
```

---

### Task 20: `alert-route.ts` — click-through route mapping

**Files:**
- Create: `apps/frontend/src/features/alerts/lib/alert-route.ts`
- Test: `apps/frontend/src/features/alerts/lib/alert-route.spec.ts`

**Interfaces:**
- Consumes: `AlertDto` (Task 18, only the `entityType` field is used).
- Produces: `alertRoute(entityType: string): string | null` — returns the static route for a known `entityType`, `null` for an unknown one (defensive default; none of the three current types hit this branch, see Global Constraints interpretation #4). Task 22's `AlertPanel` calls this to build the `navigate()` target for a row click.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/alerts/lib/alert-route.spec.ts
import { describe, expect, it } from 'vitest';
import { alertRoute } from './alert-route';

describe('alertRoute', () => {
  it('maps bank_connection to the bank connections settings page', () => {
    expect(alertRoute('bank_connection')).toBe('/bank-connections');
  });

  it('maps smtp_config to the SMTP settings tab', () => {
    expect(alertRoute('smtp_config')).toBe('/settings?tab=smtp');
  });

  it('maps reminder_scan to the reminders page', () => {
    expect(alertRoute('reminder_scan')).toBe('/reminders');
  });

  it('returns null for an unrecognized entityType', () => {
    expect(alertRoute('something_new')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run alert-route` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './alert-route'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/lib/alert-route.ts
const ROUTES: Record<string, string> = {
  bank_connection: '/bank-connections',
  smtp_config: '/settings?tab=smtp',
  reminder_scan: '/reminders',
};

// None of the three current entityType values are per-id detail routes
// (all three targets are static pages), so there is no reachable 404 case
// today — this stays a plain lookup rather than faking a not-found check.
// A future per-id detail route can extend this map without changing the
// caller's contract (still string | null).
export function alertRoute(entityType: string): string | null {
  return ROUTES[entityType] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run alert-route` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/alerts/lib/alert-route.ts apps/frontend/src/features/alerts/lib/alert-route.spec.ts
git commit -m "feat: add alertRoute() click-through mapping"
```

---

### Task 21: `formatRelativeTime()` + `AlertPanel` component

**Files:**
- Create: `apps/frontend/src/features/alerts/lib/format-relative-time.ts`
- Test: `apps/frontend/src/features/alerts/lib/format-relative-time.spec.ts`
- Create: `apps/frontend/src/features/alerts/components/alert-panel.tsx`
- Test: `apps/frontend/src/features/alerts/components/alert-panel.spec.tsx`

**Interfaces:**
- Consumes: `useAlerts`, `useMarkAlertRead`, `useMarkAllAlertsRead`, `useDeleteAlert`, `useDeleteAllAlerts` (Task 18); `alertMessage` (Task 19); `alertRoute` (Task 20); `AlertDto` (Task 18); `Skeleton` (`@/components/ui/skeleton`); `AlertDialog`+parts (`@/components/ui/alert-dialog`); `useNavigate` (`react-router-dom`); `toast` (`sonner`).
- Produces: `formatRelativeTime(iso: string, now?: Date): string` (native `Intl.RelativeTimeFormat`, no new dependency — per AGENTS.md's "check whether the standard library can do it" before adding one); `AlertPanel` component (no props — reads everything from the hooks). Task 22's `AlertBell` renders `<AlertPanel />` inside `PopoverContent`.

- [ ] **Step 1: Write the failing test for `formatRelativeTime`**

```typescript
// apps/frontend/src/features/alerts/lib/format-relative-time.spec.ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  it('formats a few minutes ago in Vietnamese', () => {
    const now = new Date('2026-08-13T10:30:00Z');
    const createdAt = new Date('2026-08-13T10:25:00Z').toISOString();

    expect(formatRelativeTime(createdAt, now)).toBe('5 phút trước');
  });

  it('formats a few hours ago in Vietnamese', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    const createdAt = new Date('2026-08-13T10:00:00Z').toISOString();

    expect(formatRelativeTime(createdAt, now)).toBe('2 giờ trước');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run format-relative-time` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './format-relative-time'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/lib/format-relative-time.ts
const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'always' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run format-relative-time` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Write the failing test for `AlertPanel`**

```typescript
// apps/frontend/src/features/alerts/components/alert-panel.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlertPanel } from './alert-panel';

const apiRequest = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AlertPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AlertPanel', () => {
  it('shows the empty state when there are no alerts', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Không có thông báo mới.')).toBeInTheDocument(),
    );
  });

  it('renders each alert with its mapped Vietnamese message and an unread indicator', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'alert-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      unreadCount: 1,
    });

    renderPanel();

    expect(
      await screen.findByText('Máy chủ email của bạn gửi thất bại'),
    ).toBeInTheDocument();
    expect(screen.getByText('Đánh dấu đã đọc tất cả')).toBeInTheDocument();
  });

  it('hides "Đánh dấu đã đọc tất cả" when unreadCount is 0', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'alert-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          isRead: true,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      unreadCount: 0,
    });

    renderPanel();

    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    expect(screen.queryByText('Đánh dấu đã đọc tất cả')).not.toBeInTheDocument();
  });

  it('clicking a row body marks it read and navigates to its mapped route', async () => {
    apiRequest.mockImplementation(({ url, method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    const row = await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(row);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1/read',
        method: 'PATCH',
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/settings?tab=smtp');
  });

  it('clicking the per-row [x] deletes it without a confirmation dialog', async () => {
    apiRequest.mockImplementation(({ url, method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá thông báo' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1',
        method: 'DELETE',
      }),
    );
  });

  it('"Xoá tất cả" opens a confirmation dialog before calling DELETE /alerts', async () => {
    apiRequest.mockImplementation(({ url, method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tất cả' }));

    expect(
      await screen.findByText('Xoá tất cả thông báo?'),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/alerts', method: 'DELETE' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xoá tất cả', hidden: false }));
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run alert-panel` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './alert-panel'`

- [ ] **Step 7: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/components/alert-panel.tsx
import { BellOff, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAlerts,
  useDeleteAlert,
  useDeleteAllAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from '../api/use-alerts';
import { alertMessage } from '../lib/alert-message';
import { alertRoute } from '../lib/alert-route';
import { formatRelativeTime } from '../lib/format-relative-time';
import type { AlertDto } from '../types';

function AlertRow({ alert }: { alert: AlertDto }) {
  const navigate = useNavigate();
  const markRead = useMarkAlertRead();
  const deleteAlert = useDeleteAlert();

  function handleRowClick() {
    if (!alert.isRead) markRead.mutate(alert.id);
    const route = alertRoute(alert.entityType);
    if (route) {
      navigate(route);
    } else {
      toast.error('Không tìm thấy trang cho thông báo này.');
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleRowClick();
      }}
      className={cn(
        'flex animate-banner-in items-start gap-2 rounded-md p-3 text-left text-sm hover:bg-accent',
        !alert.isRead && 'bg-primary/5',
      )}
    >
      {!alert.isRead && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
      <div className={cn('min-w-0 flex-1', alert.isRead && 'ml-4')}>
        <p className={cn(!alert.isRead ? 'font-medium' : 'text-muted-foreground')}>
          {alertMessage(alert.type)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(alert.createdAt)}
        </p>
      </div>
      <button
        type="button"
        aria-label="Xoá thông báo"
        onClick={(event) => {
          event.stopPropagation();
          deleteAlert.mutate(alert.id);
        }}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function AlertPanel() {
  const [page] = useState(1);
  const { data, isLoading } = useAlerts(page, false);
  const markAllRead = useMarkAllAlertsRead();
  const deleteAllAlerts = useDeleteAllAlerts();

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="flex max-h-[28rem] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Thông báo</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Không có thông báo mới.</p>
          </div>
        ) : (
          items.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-border p-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="w-full rounded-md p-1.5 text-center text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Xoá tất cả
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá tất cả thông báo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hành động này không thể hoàn tác. Toàn bộ thông báo sẽ bị xoá vĩnh viễn.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAllAlerts.mutate()}>
                  Xoá tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run alert-panel` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/alerts/lib/format-relative-time.ts apps/frontend/src/features/alerts/lib/format-relative-time.spec.ts apps/frontend/src/features/alerts/components/alert-panel.tsx apps/frontend/src/features/alerts/components/alert-panel.spec.tsx
git commit -m "feat: add AlertPanel dropdown (list, mark-all, per-row/all delete, empty/loading states)"
```

---

### Task 22: `AlertBell` component (bell + badge + `Popover`, OWNER-only)

**Files:**
- Create: `apps/frontend/src/features/alerts/components/alert-bell.tsx`
- Test: `apps/frontend/src/features/alerts/components/alert-bell.spec.tsx`

**Interfaces:**
- Consumes: `Popover`, `PopoverTrigger`, `PopoverContent` (Task 17); `AlertPanel` (Task 21); `useAlerts` (Task 18); `useAuth` (`@/contexts/auth-context`); `Bell` from `lucide-react`.
- Produces: `AlertBell` component (no props — renders `null` when `user.role !== 'OWNER'`). Task 24 renders `<AlertBell />` in the sidebar footer and mobile header.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/alerts/components/alert-bell.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlertBell } from './alert-bell';

const apiRequest = vi.fn();
const useAuth = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AlertBell />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AlertBell', () => {
  it('renders nothing when the current user is not OWNER', () => {
    useAuth.mockReturnValue({ user: { role: 'FINANCE_MANAGER' } });

    const { container } = renderBell();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the bell with an aria-label including the unread count for OWNER', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 3 });

    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' }),
    ).toBeInTheDocument();
  });

  it('renders the bell without an unread suffix when unreadCount is 0', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Thông báo' }),
    ).toBeInTheDocument();
  });

  it('shows the 99+ badge cap for large unread counts', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 150 });

    renderBell();

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run alert-bell` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './alert-bell'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/components/alert-bell.tsx
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/auth-context';
import { useAlerts } from '../api/use-alerts';
import { AlertPanel } from './alert-panel';

export function AlertBell() {
  const { user } = useAuth();
  const { data } = useAlerts(1, false);
  const unreadCount = data?.unreadCount ?? 0;

  if (user?.role !== 'OWNER') return null;

  const ariaLabel = `Thông báo${unreadCount > 0 ? `, ${unreadCount} chưa đọc` : ''}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="relative rounded-md p-1.5 hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <AlertPanel />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run alert-bell` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/alerts/components/alert-bell.tsx apps/frontend/src/features/alerts/components/alert-bell.spec.tsx
git commit -m "feat: add AlertBell (badge, OWNER-only, Popover-driven dropdown)"
```

---

### Task 23: `useAlertsStream` SSE hook

**Files:**
- Create: `apps/frontend/src/features/alerts/api/use-alerts-stream.ts`
- Test: `apps/frontend/src/features/alerts/api/use-alerts-stream.spec.tsx`

**Interfaces:**
- Consumes: `authTokenManager` (`@/lib/api-client`, already exported — `getValidAccessToken()`); `API_BASE_URL` (`@/lib/api-client`); `useQueryClient` (`@tanstack/react-query`).
- Produces: `useAlertsStream(): void` — opens one `EventSource` per mount to `GET /api/v1/alerts/stream?token=<accessToken>` and calls `queryClient.invalidateQueries({ queryKey: ['alerts'] })` on every message; closes the connection on unmount. Task 24 calls this hook once at the app shell level (in `AppLayout`, gated to when `AlertBell` would render — i.e. only for an authenticated OWNER, avoiding an open SSE connection for users who can never see the bell).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/alerts/api/use-alerts-stream.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAlertsStream } from './use-alerts-stream';

const getValidAccessToken = vi.fn();

vi.mock('@/lib/api-client', () => ({
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: { getValidAccessToken: (...args: unknown[]) => getValidAccessToken(...args) },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  getValidAccessToken.mockResolvedValue('test-token');
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'invalidateQueries');
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAlertsStream', () => {
  it('opens an EventSource to /api/v1/alerts/stream with the access token as a query param', async () => {
    renderHook(() => useAlertsStream(), { wrapper });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0]?.url).toBe(
      'http://localhost:3000/api/v1/alerts/stream?token=test-token',
    );
  });

  it('invalidates the alerts query cache on every message', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useAlertsStream(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]?.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify({ type: 'alert.created', unreadCount: 2 }) }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['alerts'] });
  });

  it('closes the EventSource on unmount', async () => {
    const { unmount } = renderHook(() => useAlertsStream(), { wrapper });

    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    unmount();

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run use-alerts-stream` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './use-alerts-stream'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/alerts/api/use-alerts-stream.ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_BASE_URL, authTokenManager } from '@/lib/api-client';

export function useAlertsStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | undefined;
    let cancelled = false;

    async function connect() {
      const token = await authTokenManager.getValidAccessToken();
      if (cancelled || !token) return;
      source = new EventSource(
        `${API_BASE_URL}/api/v1/alerts/stream?token=${token}`,
      );
      source.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      };
    }

    void connect();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [queryClient]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run use-alerts-stream` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/alerts/api/use-alerts-stream.ts apps/frontend/src/features/alerts/api/use-alerts-stream.spec.tsx
git commit -m "feat: add useAlertsStream (SSE, invalidates alerts cache on new events)"
```

---

### Task 24: Wire `AlertBell` into `sidebar-footer.tsx` + `app-layout.tsx`, start the SSE stream once at the app shell

**Files:**
- Modify: `apps/frontend/src/components/layout/sidebar-footer.tsx`
- Test: `apps/frontend/src/components/layout/sidebar-footer.spec.tsx` (new)
- Modify: `apps/frontend/src/components/layout/app-layout.tsx`
- Test: `apps/frontend/src/components/layout/app-layout.spec.tsx` (new)

**Interfaces:**
- Consumes: `AlertBell` (Task 22), `useAlertsStream` (Task 23).
- Produces: `AlertBell` rendered next to `ThemeToggle` in both the desktop sidebar footer and the mobile header; `useAlertsStream()` called once in `AppLayout` (the shared shell both desktop and mobile render inside).

- [ ] **Step 1: Write the failing test for `sidebar-footer.tsx`**

```typescript
// apps/frontend/src/components/layout/sidebar-footer.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarFooter } from './sidebar-footer';

const apiRequest = vi.fn();
const useAuth = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

describe('SidebarFooter', () => {
  it('renders AlertBell next to ThemeToggle for an OWNER', async () => {
    useAuth.mockReturnValue({
      user: {
        name: 'Chủ sở hữu',
        email: 'owner@congtyb.vn',
        organizationName: 'Công ty B',
        subscriptionPlan: 'BUSINESS',
        role: 'OWNER',
      },
      logout: vi.fn(),
    });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SidebarFooter collapsed={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Thông báo' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sidebar-footer` (from `apps/frontend`)
Expected: FAIL — no element with `aria-label="Thông báo"` found.

- [ ] **Step 3: Write minimal implementation — modify `sidebar-footer.tsx`**

```typescript
// apps/frontend/src/components/layout/sidebar-footer.tsx
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { AlertBell } from '@/features/alerts/components/alert-bell';
import { ThemeToggle } from './theme-toggle';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPlanLabel(plan: string): string {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Đã đăng xuất.');
    navigate('/login');
  }

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {getInitials(user.name)}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.organizationName} · {getPlanLabel(user.subscriptionPlan)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.role}</p>
        </div>
      )}
      <AlertBell />
      <ThemeToggle />
      <button
        type="button"
        aria-label="Đăng xuất"
        onClick={() => void handleLogout()}
        className="rounded-md p-1.5 hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sidebar-footer` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 5: Write the failing test for `app-layout.tsx`**

```typescript
// apps/frontend/src/components/layout/app-layout.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppLayout } from './app-layout';

const apiRequest = vi.fn();
const useAuth = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

describe('AppLayout', () => {
  it('renders AlertBell in the mobile header for an OWNER', async () => {
    useAuth.mockReturnValue({
      user: {
        name: 'Chủ sở hữu',
        email: 'owner@congtyb.vn',
        organizationName: 'Công ty B',
        subscriptionPlan: 'BUSINESS',
        role: 'OWNER',
      },
      logout: vi.fn(),
    });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(
      (await screen.findAllByRole('button', { name: 'Thông báo' })).length,
    ).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run app-layout` (from `apps/frontend`)
Expected: FAIL — no element with `aria-label="Thông báo"` found in the mobile header.

- [ ] **Step 7: Write minimal implementation — modify `app-layout.tsx`**

```typescript
// apps/frontend/src/components/layout/app-layout.tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertBell } from '@/features/alerts/components/alert-bell';
import { useAlertsStream } from '@/features/alerts/api/use-alerts-stream';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  useAlertsStream();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Đi tới nội dung
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <div className="hidden md:block">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <MobileSidebarWrapper />
            <span className="text-base font-semibold">Casso Ledger</span>
            <div className="ml-auto flex items-center gap-1">
              <AlertBell />
              <ThemeToggle className="hover:bg-accent" />
            </div>
          </header>

          <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run app-layout` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 9: Run the full frontend suite**

Run: `pnpm --filter frontend test` (from repo root)
Expected: PASS — including the pre-existing `sidebar.spec.tsx`, since `AlertBell`'s own gating (`user?.role !== 'OWNER'` → `null`) means non-OWNER fixtures in that file keep rendering exactly as before.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/components/layout/sidebar-footer.tsx apps/frontend/src/components/layout/sidebar-footer.spec.tsx apps/frontend/src/components/layout/app-layout.tsx apps/frontend/src/components/layout/app-layout.spec.tsx
git commit -m "feat: place AlertBell in the sidebar footer and mobile header, start the SSE stream in AppLayout"
```

---

### Task 25: Backend e2e test — real Postgres, real partial-unique-index dedupe, full API surface

**Files:**
- Create: `apps/backend/test/alerts.e2e-spec.ts`

**Interfaces:**
- Consumes: the full `AppModule` (Task 16); `AlertOrmEntity` (Task 4); `BANK_CONNECTION_STATUS_CHANGED` (`../src/modules/bank-connections/application/mark-requires-reauthorization.usecase`); `EventEmitter2` (`@nestjs/event-emitter`). Mirrors `test/smtp-config.e2e-spec.ts`'s testcontainers harness pattern exactly.
- Produces: no new exports — this is the final proof the whole vertical slice (migration/index, listener, API) works against a real database.

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/backend/test/alerts.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { BANK_CONNECTION_STATUS_CHANGED } from '../src/modules/bank-connections/application/mark-requires-reauthorization.usecase';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

jest.setTimeout(60_000);

describe('In-app Alerts (e2e)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'alerts-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'alerts-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'alerts-e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'alerts-e2e-secret';

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
    eventEmitter = moduleRef.get(EventEmitter2);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, 60_000);

  async function setUpOwner() {
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const now = new Date();

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Alerts Test Organization',
      createdAt: now,
    });
    await dataSource.getRepository(UserOrmEntity).save({
      id: ownerId,
      name: 'Alerts Owner',
      email: `alerts-owner-${organizationId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      organizationId,
      userId: ownerId,
      role: Role.OWNER,
      status: 'ACTIVE',
      createdAt: now,
    });

    const accessToken = jwtService.sign({
      userId: ownerId,
      organizationId,
      role: Role.OWNER,
    });
    return { organizationId, ownerId, accessToken };
  }

  it('creates an Alert on bank-connection.status.changed, dedupes a repeat unread event, and supports the full read/delete surface', async () => {
    const { organizationId, accessToken } = await setUpOwner();
    const bankConnectionId = randomUUID();

    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });

    const firstList = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(firstList.body.total).toBe(1);
    expect(firstList.body.unreadCount).toBe(1);
    expect(firstList.body.items[0]).toMatchObject({
      type: 'BANK_CONNECTION_ERROR',
      entityType: 'bank_connection',
      entityId: bankConnectionId,
      isRead: false,
    });
    const alertId = firstList.body.items[0].id;

    // Repeat event for the same still-unread alert must dedupe (upsert),
    // not insert a second row — this exercises the real partial unique
    // index against Postgres.
    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });

    const afterRepeat = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRepeat.body.total).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${alertId}/read`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterRead = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRead.body.unreadCount).toBe(0);
    expect(afterRead.body.items[0].isRead).toBe(true);

    // A repeat event after the alert is READ must insert a NEW row (the
    // partial index only covers WHERE "readAt" IS NULL).
    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId,
      organizationId,
      status: 'ERROR',
    });
    const afterReadThenRepeat = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterReadThenRepeat.body.total).toBe(2);

    await request(app.getHttpServer())
      .delete('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterDeleteAll = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterDeleteAll.body.total).toBe(0);
  });

  it('returns 404 when marking read an alert that does not belong to the caller', async () => {
    const { accessToken: ownerAAccessToken } = await setUpOwner();
    const { organizationId: orgB, ownerId: ownerB } = await setUpOwner();
    await eventEmitter.emitAsync(BANK_CONNECTION_STATUS_CHANGED, {
      bankConnectionId: randomUUID(),
      organizationId: orgB,
      status: 'ERROR',
    });
    const orgBList = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${jwtService.sign({ userId: ownerB, organizationId: orgB, role: Role.OWNER })}`)
      .expect(200);
    const orgBAlertId = orgBList.body.items[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${orgBAlertId}/read`)
      .set('Authorization', `Bearer ${ownerAAccessToken}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- alerts.e2e-spec` (from repo root, Docker required)
Expected: FAIL — `Cannot find module '../src/modules/bank-connections/application/mark-requires-reauthorization.usecase'` if any earlier task's file/export name drifted, or a 404 on `/api/v1/alerts` if `AlertsModule` isn't registered yet. If every prior task was completed and committed in order, this test should already be very close to passing — treat any remaining failure as a real integration bug (e.g. a route mismatch or a DI wiring gap between the mocked unit tests and real Nest DI) and fix it before proceeding, per `systematic-debugging`.

- [ ] **Step 3: Fix whatever the e2e run surfaces**

There is no "minimal implementation" step here — this task's purpose is integration verification of Tasks 1-24, not new production code. If it fails, the fix belongs in whichever earlier task's file is actually wrong (most likely: a provider not exported/imported correctly in `alerts.module.ts`, or a route path typo) — fix it there, re-run this e2e test, and repeat until it passes. Do not add production code that only exists to satisfy this test; every behavior it exercises should already exist from Tasks 1-24.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- alerts.e2e-spec` (from repo root, Docker required)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/alerts.e2e-spec.ts
git commit -m "test: add e2e coverage for the in-app alerts vertical slice"
```

---

### Task 26: `domain-check` + `verification-before-completion`

**Files:** none (verification only).

**Interfaces:** none — this task consumes the finished state of Tasks 1-25 and produces no new code.

- [ ] **Step 1: Run the `domain-check` skill**

Invoke the `domain-check` skill (`/domain-check`; see `.claude/skills/domain-check.md`) against every backend file touched in Tasks 1-16 and Task 25. Fix any violation it reports (e.g. a stray `HttpException` in application code, a domain import of TypeORM) before proceeding — per AGENTS.md, this is required after any backend code change.

- [ ] **Step 2: Run the full backend unit suite**

Run: `npx jest` (from `apps/backend`)
Expected: PASS (all specs from Tasks 1-16)

- [ ] **Step 3: Run the full backend e2e suite**

Run: `pnpm --filter @casso-ledger/backend test:e2e` (from repo root, Docker required)
Expected: PASS (including the new `alerts.e2e-spec.ts` and every pre-existing e2e spec — confirms the `JwtStrategy` extractor change in Task 14 didn't regress any other authenticated route)

- [ ] **Step 4: Run the full frontend suite**

Run: `pnpm --filter frontend test` (from repo root)
Expected: PASS (all specs from Tasks 17-24, plus the pre-existing suite — confirms `sidebar.spec.tsx` and any other test that renders `SidebarFooter`/`AppLayout` still passes with `AlertBell` in the tree)

- [ ] **Step 5: Type-check both apps**

Run: `npx tsc --noEmit` (from `apps/backend`), then `npx tsc --noEmit` (from `apps/frontend`), then `npx tsc --noEmit` (from `packages/shared-types`)
Expected: no errors in any of the three

- [ ] **Step 6: Lint + format**

Run: `npx biome check --write .` (from repo root)
Expected: no unresolved lint errors; any auto-fixable formatting is applied — re-run the affected test suites if Biome rewrote any file

- [ ] **Step 7: Run `pnpm verify`**

Run: `pnpm verify` (from repo root)
Expected: PASS (this is the repo's combined lint + type-check + test gate, run as the final check before claiming completion per `superpowers:verification-before-completion`)

- [ ] **Step 8: Update the feature map**

Use the `update-feature-map` skill to mark issue #137's entry in `docs/wayfinder/feature-map.md` as `done`, with a `Shipped:` date and this branch/PR reference, per AGENTS.md's "Workflow: Starting a new ticket" step 3 requirement to update the feature map on completion.

---

## Self-Review

### 1. Spec coverage — every "Locked design decision" mapped to a task

**Backend:**
- New `alerts/` module, separate from `notifications/`, Clean Architecture layering → Tasks 2, 3, 4, 5-6, 7, 16.
- `Alert` domain entity with all 8 fields, one-way `markRead()` → Task 2.
- Composite index `(organizationId, userId, readAt)` → Task 4.
- Partial unique index `(userId, entityType, entityId, type) WHERE readAt IS NULL`, upsert-on-conflict dedupe → Task 4 (schema), Task 5 (repository upsert), Task 25 (e2e proof against real Postgres).
- No soft-delete, hard delete only → Task 6 (`delete`/`deleteAll` use `ormRepo.delete`, not a `deletedAt` flag).
- OWNER-only resolution via `findOwnerByOrganization()`, resolved once and stored permanently → Tasks 8, 9, 10 (each listener resolves once, `CreateAlertUseCase` never re-resolves).
- 3 event listeners: bank connection → Task 8; SMTP CONNECTED→FAILED (new emit point) → Task 9; reminder scan summary (extended payload) → Task 10.
- API: `GET /alerts` → Task 11; `PATCH /alerts/:id/read` + `PATCH /alerts/read-all` → Task 12; `DELETE /alerts/:id` + `DELETE /alerts` → Task 13; `GET /alerts/stream` SSE → Tasks 14-15.
- Out of scope: no retention job, comment pointing to #118 → Task 4 (`ponytail:` comment on the ORM entity).
- Every write in a transaction, every query org+user scoped → Tasks 5, 6 (every method uses `dataSource.transaction()` or is scoped by both ids).

**Frontend:**
- Bell next to `ThemeToggle` in both locations, same visibility rules → Task 24.
- OWNER-only rendering → Task 22 (`AlertBell` returns `null` otherwise).
- `popover.tsx` primitive (no new dependency) → Task 17.
- Badge: red-500 pill, absolute-positioned, 99+ cap → Task 22.
- `aria-label` with unread count → Task 22.
- Dropdown: header + mark-all-read, list with unread dot/tint + relative timestamp + per-row delete, footer "Xoá tất cả" behind confirmation, empty state, loading skeleton → Task 21.
- Click-through navigation + mark-read-on-click + 404 toast fallback (documented as unreachable for the 3 current types, not faked) → Tasks 20, 21.
- `animate-banner-in` reused, no new keyframes → Task 21 (`AlertRow`'s `className`).
- Data layer: `useAlerts`/`useMarkAlertRead`/`useMarkAllAlertsRead`/`useDeleteAlert`/`useDeleteAllAlerts` → Task 18; `useAlertsStream` → Task 23; pure `alertMessage()` → Task 19.

### 2. Placeholder scan

Searched this plan's own text for `TBD`, `similar to Task`, `add appropriate`, `implement later` — none found. Task 25's Step 3 ("There is no 'minimal implementation' step here...") is deliberately a verification/fix instruction, not a content placeholder — the behavior it might need to fix already has real code in an earlier task.

### 3. Type/signature consistency across tasks

- `IAlertRepository` (Task 3) method names — `upsertUnread`, `countUnread`, `findPage`, `findByIdForUser`, `markRead`, `markAllRead`, `delete`, `deleteAll` — are used with these exact names in Tasks 5, 6, 7, 11, 12, 13 and nowhere renamed.
- `CreateAlertInput` (Task 7: `{ organizationId, userId, type, entityType, entityId }`) is the exact shape passed by Tasks 8, 9, 10.
- `AlertCreatedForUserEvent` (`{ userId, unreadCount }`, Task 7) is the exact shape read by Task 15's SSE filter/map.
- `AlertResponseDto`/`AlertsPageResponseDto` (Task 11) field names (`isRead`, not `readAt`; `createdAt` as ISO string) match the frontend's `AlertDto`/`AlertsPage` (Task 18) exactly.
- `alertRoute()`'s return type (`string | null`, Task 20) and `alertMessage()`'s signature (`(type: AlertType) => string`, Task 19) are used identically in Task 21's `AlertRow`.
- `SMTP_CONFIG_FAILED`/`SmtpConfigFailedEvent` (Task 9, exported from `email-queue.processor.ts`) is imported by that exact path in Task 9's own listener file — no separate re-declaration.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-in-app-alerts.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
