# Org-Branded Reminder Emails via Custom SMTP (BYO-SMTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a BUSINESS/ENTERPRISE organization configure its own SMTP server so reminder emails send from the org's own domain instead of Casso's. A new `smtp-config` module owns `OrganizationSmtpConfig` (domain entity, `CONNECTED`/`FAILED` only — a failed test-send is never persisted). `notifications` gains a new `SmtpEmailAdapter` (implements the existing `IEmailProviderAdapter` port) and a new `IEmailProviderResolver` seam so `EmailQueueProcessor` picks Resend vs. the org's own SMTP per send instead of a single DI-bound adapter. On the org's SMTP exhausting its existing 3-attempt retry, the config flips to `FAILED`, the OWNER gets one warning email via Resend, and the same reminder is requeued forced through Resend so it still goes out.

**Architecture:** New `apps/backend/src/modules/smtp-config/`, 4-layer, mirroring `email-templates` exactly (domain entity + application port/use-cases + infrastructure TypeORM repo + presentation controller/DTOs), consumed by `notifications` only through `ISmtpConfigRepository` — never a direct import of `smtp-config`'s internals (ADR-0006). `notifications` gains one new port (`IEmailProviderResolver`) and one new adapter (`SmtpEmailAdapter`) alongside the existing `ResendEmailAdapter`; `EmailQueueProcessor` is modified to resolve per-send instead of using its constructor-injected adapter directly.

**Tech Stack:** `nodemailer` (new dependency — the standard Node SMTP client; there is no stdlib SMTP client and `fetch` cannot speak SMTP, so this passes the "already-installed dependency" and "stdlib" rungs and is justified per AGENTS.md's dependency checklist: actively maintained, small, no existing package in the workspace does this). Reuses `encryptToken`/`decryptToken` from `apps/backend/src/modules/bank-connections/application/token-encryption.ts` (already installed, `node:crypto` only — no new crypto dependency).

**TDD exception:** Tasks 1, 5 Steps 1-2, and 9 are configuration-only (enum/DI wiring, no branching logic) — per AGENTS.md's stated TDD exceptions, these skip RED→GREEN and go straight to the change. Every task with actual branching logic (domain status transition, encryption round-trip, provider resolution, failure-fallback requeue) follows RED→GREEN→REFACTOR with a failing test written first.

## Global Constraints

- `OrganizationSmtpConfig` (domain) MUST NOT import NestJS/TypeORM (AGENTS.md domain layer rule).
- A config is persisted ONLY as `status: CONNECTED` — `TestAndSaveSmtpConfigUseCase` never writes a row before the test-send succeeds (spec §2). There is no `PENDING`/`UNTESTED` status value anywhere in `SmtpConfigStatus`.
- `encryptedPassword` is written/read ONLY through `encryptToken`/`decryptToken` — no new encryption scheme, no new env var; reuses `ACCESS_TOKEN_ENCRYPTION_KEY` (spec §3).
- `IEmailProviderAdapter`'s signature (`send(to, subject, html, metadata, replyTo?)`, email-notification-service spec §1) is NOT changed — `SmtpEmailAdapter` implements it as-is; per-organization routing lives in the new `IEmailProviderResolver`, not in the port itself.
- `application/` code (the `IEmailProviderResolver` port, the `smtp-config` use cases) MUST NOT import `nodemailer` directly — only the `infrastructure/` adapters (`SmtpEmailAdapter`, `EmailProviderResolver`, `TestAndSaveSmtpConfigUseCase`'s transporter-building helper) do (AGENTS.md application-layer rule: no concrete SDK imports).
- `email-queue` job options stay `attempts: 3, backoff: { type: 'exponential', delay: 5000 }` unchanged — no new retry mechanism is introduced (spec §5).
- `ORGANIZATION_SMTP_MANAGE` is granted ONLY to `Role.OWNER` — added to the `Permission` enum but to NO role's explicit array in `ROLE_PERMISSIONS` except via `Role.OWNER: Object.values(Permission)` (same mechanism as the existing OWNER-only `BANK_CONNECTION_MANAGE`).
- Every `smtp-config` query/write scoped by `TenantContextService.getOrganizationId()` — no hardcoded `organizationId` (AGENTS.md tenant isolation rule).
- Naming is fixed and must not be renamed: module `apps/backend/src/modules/smtp-config/`, entity `OrganizationSmtpConfig`, enum `SmtpConfigStatus` (`CONNECTED` | `FAILED`), port `ISmtpConfigRepository`/`SMTP_CONFIG_REPOSITORY`, adapter `SmtpEmailAdapter`, port `IEmailProviderResolver`/`EMAIL_PROVIDER_RESOLVER`, implementation `EmailProviderResolver`.

---

## File Structure

```
packages/shared-types/src/
  permission.ts                                             -- MODIFY: add ORGANIZATION_SMTP_MANAGE
  error-code.ts                                              -- MODIFY: add SMTP_CONNECTION_FAILED

apps/backend/
  package.json                                               -- MODIFY: add `nodemailer`, `@types/nodemailer`
  src/
    modules/
      billing/
        domain/subscription.ts                                -- MODIFY: add canUseCustomSmtp
        infrastructure/subscription.orm-entity.ts              -- MODIFY: add canUseCustomSmtp column
      smtp-config/
        domain/
          organization-smtp-config.ts
          organization-smtp-config.spec.ts
        application/
          smtp-config-repository.port.ts
          test-and-save-smtp-config.usecase.ts
          test-and-save-smtp-config.usecase.spec.ts
          get-smtp-config.usecase.ts
          delete-smtp-config.usecase.ts
        infrastructure/
          organization-smtp-config.orm-entity.ts
          typeorm-smtp-config.repository.ts
          nodemailer-smtp-transport.ts
        presentation/
          smtp-config.controller.ts
          dto/save-smtp-config.dto.ts
          dto/smtp-config-response.dto.ts
        smtp-config.module.ts
      notifications/
        application/
          email-provider-resolver.port.ts
        infrastructure/
          smtp-email.adapter.ts
          smtp-email.adapter.spec.ts
          email-provider-resolver.ts
          email-provider-resolver.spec.ts
          email-queue.processor.ts                             -- MODIFY: use IEmailProviderResolver
          email-queue.processor.spec.ts                        -- MODIFY: new resolution/fallback tests
        notifications.module.ts                                -- MODIFY: import SmtpConfigModule, bind resolver
    app.module.ts                                              -- MODIFY: register SmtpConfigModule
  test/
    smtp-config.e2e-spec.ts
```

---

### Task 1: `Permission`, `ErrorCode`, `Subscription.canUseCustomSmtp` (config-only, no TDD)

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Modify: `packages/shared-types/src/role-permissions.ts` (no change needed — `Role.OWNER: Object.values(Permission)` picks up the new value automatically; verify this in Step 3)
- Modify: `packages/shared-types/src/error-code.ts`
- Modify: `apps/backend/src/modules/billing/domain/subscription.ts`
- Modify: `apps/backend/src/modules/billing/infrastructure/subscription.orm-entity.ts`

**Interfaces:**
- Produces: `Permission.ORGANIZATION_SMTP_MANAGE`, `ErrorCode.SMTP_CONNECTION_FAILED`, `Subscription.canUseCustomSmtp: boolean`, used by every later task

- [ ] **Step 1: Add `ORGANIZATION_SMTP_MANAGE` to `packages/shared-types/src/permission.ts`**

```typescript
export enum Permission {
  // ...existing values unchanged...
  CUSTOMER_BANK_ACCOUNT_MANAGE = 'CUSTOMER_BANK_ACCOUNT_MANAGE',
  ORGANIZATION_SMTP_MANAGE = 'ORGANIZATION_SMTP_MANAGE',
}
```

- [ ] **Step 2: Add `SMTP_CONNECTION_FAILED` to the `ErrorCode` enum** (`packages/shared-types/src/error-code.ts` or wherever `ErrorCode` is defined per AGENTS.md's list)

```typescript
export enum ErrorCode {
  // ...existing values unchanged...
  SMTP_CONNECTION_FAILED = 'SMTP_CONNECTION_FAILED', // 400
}
```

- [ ] **Step 3: Confirm `ROLE_PERMISSIONS[Role.OWNER]` needs no edit**

`packages/shared-types/src/role-permissions.ts` sets `[Role.OWNER]: Object.values(Permission)` — the new enum value is picked up automatically. Do NOT add `ORGANIZATION_SMTP_MANAGE` to `FINANCE_MANAGER`/`ACCOUNTANT`/`SALES_REP`/`VIEWER`'s arrays (that would break OWNER-exclusivity, spec §7).

- [ ] **Step 4: Add `canUseCustomSmtp` to `Subscription`**

Modify `apps/backend/src/modules/billing/domain/subscription.ts`:

```typescript
export interface SubscriptionProps {
  id: string;
  organizationId: string;
  planId: PlanId;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
  canUseCustomSmtp: boolean;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  version: number;
}

const FREE_PLAN_LIMITS = {
  receivableMonthlyLimit: 50,
  bankConnectionLimit: 1,
  copilotChatMonthlyLimit: 50,
  canUseCustomSmtp: false,
};
```

Add `readonly canUseCustomSmtp: boolean;` to the class body, assign it in the constructor (`this.canUseCustomSmtp = props.canUseCustomSmtp;`), and set `canUseCustomSmtp: FREE_PLAN_LIMITS.canUseCustomSmtp` in `createFree()`. No `createBusiness()`/`createEnterprise()` factory exists yet (per the existing `ponytail:` comment) — this task only adds the field for whichever future work adds those factories or issue #90's catalog to set `true`.

- [ ] **Step 5: Add the column to `SubscriptionOrmEntity`**

Modify `apps/backend/src/modules/billing/infrastructure/subscription.orm-entity.ts`:

```typescript
  @Column('boolean', { default: false })
  canUseCustomSmtp: boolean;
```

`synchronize: true` in MVP (per CLAUDE.md Constraints) picks this up on next boot — no manual migration needed yet.

- [ ] **Step 6: Update the `toOrm()`/`toDomain()` mapper in `TypeOrmSubscriptionRepository`**

Find the repository's mapper functions (`apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts`) and add `canUseCustomSmtp` to both directions, same as every other flat field — no `as`/`as unknown as` cast (AGENTS.md forbidden pattern).

- [ ] **Step 7: Run type check and existing billing tests**

Run: `npx tsc --noEmit && pnpm --filter @casso-ledger/backend test --testPathPattern billing`
Expected: PASS (existing `Subscription.createFree()` tests still pass with the new field auto-populated as `false`)

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types/src/permission.ts packages/shared-types/src/error-code.ts apps/backend/src/modules/billing
git commit -m "feat: add ORGANIZATION_SMTP_MANAGE permission, SMTP_CONNECTION_FAILED error code, Subscription.canUseCustomSmtp"
```

---

### Task 2: `OrganizationSmtpConfig` domain entity + `SmtpConfigStatus`

**Files:**
- Create: `apps/backend/src/modules/smtp-config/domain/organization-smtp-config.ts`
- Test: `apps/backend/src/modules/smtp-config/domain/organization-smtp-config.spec.ts`

**Interfaces:**
- Produces: `OrganizationSmtpConfig`, `SmtpConfigStatus`, used by every later task in this plan

- [ ] **Step 1: Write failing test for the domain entity's state-transition method**

Create `apps/backend/src/modules/smtp-config/domain/organization-smtp-config.spec.ts`:

```typescript
import { OrganizationSmtpConfig, SmtpConfigStatus } from './organization-smtp-config';

function buildConfig(overrides: Partial<{ status: SmtpConfigStatus; version: number }> = {}) {
  return new OrganizationSmtpConfig({
    id: 'smtp-1',
    organizationId: 'org-1',
    host: 'smtp.congtyb.vn',
    port: 587,
    username: 'noreply@congtyb.vn',
    encryptedPassword: 'ciphertext',
    fromAddress: 'noreply@congtyb.vn',
    status: overrides.status ?? SmtpConfigStatus.CONNECTED,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    version: overrides.version ?? 1,
  });
}

describe('OrganizationSmtpConfig', () => {
  it('markFailed() transitions CONNECTED to FAILED', () => {
    const config = buildConfig({ status: SmtpConfigStatus.CONNECTED });
    const failed = config.markFailed();
    expect(failed.status).toBe(SmtpConfigStatus.FAILED);
  });

  it('markFailed() is a no-op (same status) when already FAILED', () => {
    const config = buildConfig({ status: SmtpConfigStatus.FAILED });
    const failed = config.markFailed();
    expect(failed.status).toBe(SmtpConfigStatus.FAILED);
  });

  it('isConnected() reflects the current status', () => {
    expect(buildConfig({ status: SmtpConfigStatus.CONNECTED }).isConnected()).toBe(true);
    expect(buildConfig({ status: SmtpConfigStatus.FAILED }).isConnected()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test organization-smtp-config.spec.ts`
Expected: FAIL — Cannot find module './organization-smtp-config'

- [ ] **Step 3: Create `apps/backend/src/modules/smtp-config/domain/organization-smtp-config.ts`**

```typescript
export enum SmtpConfigStatus {
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

export interface OrganizationSmtpConfigProps {
  id: string;
  organizationId: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  fromAddress: string;
  status: SmtpConfigStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class OrganizationSmtpConfig {
  readonly id: string;
  readonly organizationId: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly encryptedPassword: string;
  readonly fromAddress: string;
  readonly status: SmtpConfigStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;

  constructor(props: OrganizationSmtpConfigProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.host = props.host;
    this.port = props.port;
    this.username = props.username;
    this.encryptedPassword = props.encryptedPassword;
    this.fromAddress = props.fromAddress;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.version = props.version;
  }

  isConnected(): boolean {
    return this.status === SmtpConfigStatus.CONNECTED;
  }

  /** CONNECTED -> FAILED on a real send exhausting its retries (spec §5). No-op if already FAILED. */
  markFailed(): OrganizationSmtpConfig {
    if (this.status === SmtpConfigStatus.FAILED) return this;
    return new OrganizationSmtpConfig({ ...this, status: SmtpConfigStatus.FAILED, updatedAt: new Date() });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test organization-smtp-config.spec.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/smtp-config/domain
git commit -m "feat: add OrganizationSmtpConfig domain entity with CONNECTED/FAILED state transition"
```

---

### Task 3: `ISmtpConfigRepository` port + TypeORM implementation

**Files:**
- Create: `apps/backend/src/modules/smtp-config/application/smtp-config-repository.port.ts`
- Create: `apps/backend/src/modules/smtp-config/infrastructure/organization-smtp-config.orm-entity.ts`
- Create: `apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.ts`
- Test: `apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.spec.ts`

**Interfaces:**
- Produces: `ISmtpConfigRepository`/`SMTP_CONFIG_REPOSITORY`, consumed by Task 4's use cases and Task 7's resolver

- [ ] **Step 1: Create the port**

`apps/backend/src/modules/smtp-config/application/smtp-config-repository.port.ts`:

```typescript
import type { OrganizationSmtpConfig } from '../domain/organization-smtp-config';

export interface ISmtpConfigRepository {
  findByOrganizationId(organizationId: string): Promise<OrganizationSmtpConfig | null>;
  /** Upsert on organizationId — replaces any existing row (credential rotation, spec §2 step 4). */
  save(config: OrganizationSmtpConfig): Promise<void>;
  deleteByOrganizationId(organizationId: string): Promise<void>;
}

export const SMTP_CONFIG_REPOSITORY = Symbol('SMTP_CONFIG_REPOSITORY');
```

- [ ] **Step 2: Create the ORM entity**

`apps/backend/src/modules/smtp-config/infrastructure/organization-smtp-config.orm-entity.ts`:

```typescript
import { SmtpConfigStatus } from '../domain/organization-smtp-config';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'organization_smtp_configs' })
@Unique(['organizationId'])
export class OrganizationSmtpConfigOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  host: string;

  @Column('int')
  port: number;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar' })
  encryptedPassword: string;

  @Column({ type: 'varchar' })
  fromAddress: string;

  @Column({ type: 'enum', enum: SmtpConfigStatus })
  status: SmtpConfigStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
```

- [ ] **Step 3: Write failing test for the repository's mapper round-trip**

Create `apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.spec.ts` following the exact pattern of `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.spec.ts` (mocked TypeORM `Repository`, asserting `toDomain`/`toOrm` round-trip every field with no `as`/`as unknown as` cast):

```typescript
import { SmtpConfigStatus } from '../domain/organization-smtp-config';
import { TypeOrmSmtpConfigRepository } from './typeorm-smtp-config.repository';

describe('TypeOrmSmtpConfigRepository', () => {
  function buildOrmRow() {
    return {
      id: 'smtp-1',
      organizationId: 'org-1',
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      encryptedPassword: 'ciphertext',
      fromAddress: 'noreply@congtyb.vn',
      status: SmtpConfigStatus.CONNECTED,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
      version: 1,
    };
  }

  it('findByOrganizationId maps every ORM field to the domain entity', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(buildOrmRow()) };
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);

    const config = await repo.findByOrganizationId('org-1');

    expect(ormRepo.findOne).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
    expect(config?.host).toBe('smtp.congtyb.vn');
    expect(config?.status).toBe(SmtpConfigStatus.CONNECTED);
  });

  it('findByOrganizationId returns null when no row exists', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);

    expect(await repo.findByOrganizationId('org-1')).toBeNull();
  });

  it('save upserts by organizationId', async () => {
    const ormRepo = { upsert: jest.fn() };
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);
    const { OrganizationSmtpConfig } = await import('../domain/organization-smtp-config');

    await repo.save(new OrganizationSmtpConfig(buildOrmRow()));

    expect(ormRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', status: SmtpConfigStatus.CONNECTED }),
      ['organizationId'],
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test typeorm-smtp-config.repository.spec.ts`
Expected: FAIL — Cannot find module './typeorm-smtp-config.repository'

- [ ] **Step 5: Create `apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ISmtpConfigRepository } from '../application/smtp-config-repository.port';
import { OrganizationSmtpConfig } from '../domain/organization-smtp-config';
import { OrganizationSmtpConfigOrmEntity } from './organization-smtp-config.orm-entity';

@Injectable()
export class TypeOrmSmtpConfigRepository implements ISmtpConfigRepository {
  constructor(
    @InjectRepository(OrganizationSmtpConfigOrmEntity)
    private readonly repo: Repository<OrganizationSmtpConfigOrmEntity>,
  ) {}

  async findByOrganizationId(organizationId: string): Promise<OrganizationSmtpConfig | null> {
    const row = await this.repo.findOne({ where: { organizationId } });
    return row ? this.toDomain(row) : null;
  }

  async save(config: OrganizationSmtpConfig): Promise<void> {
    await this.repo.upsert(this.toOrm(config), ['organizationId']);
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await this.repo.delete({ organizationId });
  }

  private toDomain(row: OrganizationSmtpConfigOrmEntity): OrganizationSmtpConfig {
    return new OrganizationSmtpConfig({
      id: row.id,
      organizationId: row.organizationId,
      host: row.host,
      port: row.port,
      username: row.username,
      encryptedPassword: row.encryptedPassword,
      fromAddress: row.fromAddress,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  }

  private toOrm(config: OrganizationSmtpConfig): Partial<OrganizationSmtpConfigOrmEntity> {
    return {
      id: config.id,
      organizationId: config.organizationId,
      host: config.host,
      port: config.port,
      username: config.username,
      encryptedPassword: config.encryptedPassword,
      fromAddress: config.fromAddress,
      status: config.status,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test typeorm-smtp-config.repository.spec.ts`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/smtp-config/application/smtp-config-repository.port.ts apps/backend/src/modules/smtp-config/infrastructure/organization-smtp-config.orm-entity.ts apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.ts apps/backend/src/modules/smtp-config/infrastructure/typeorm-smtp-config.repository.spec.ts
git commit -m "feat: add ISmtpConfigRepository port and TypeORM implementation"
```

---

### Task 4: `TestAndSaveSmtpConfigUseCase` (test-then-save, §2) + `GetSmtpConfigUseCase` + `DeleteSmtpConfigUseCase`

**Files:**
- Create: `apps/backend/src/modules/smtp-config/infrastructure/nodemailer-smtp-transport.ts`
- Create: `apps/backend/src/modules/smtp-config/application/test-and-save-smtp-config.usecase.ts`
- Test: `apps/backend/src/modules/smtp-config/application/test-and-save-smtp-config.usecase.spec.ts`
- Create: `apps/backend/src/modules/smtp-config/application/get-smtp-config.usecase.ts`
- Create: `apps/backend/src/modules/smtp-config/application/delete-smtp-config.usecase.ts`

**Interfaces:**
- Consumes: `ISmtpConfigRepository` (Task 3), `encryptToken` (`bank-connections/application/token-encryption.ts`), `IMembershipRepository`/`findOwnerByOrganization` + `IUserRepository` (existing, same lookup `EmailService` already does), `ISubscriptionRepository` (billing module, existing) for the `canUseCustomSmtp` gate, `TenantContextService`
- Produces: `TestAndSaveSmtpConfigUseCase.execute(input): Promise<OrganizationSmtpConfig>`, used by Task 5's controller

The transporter-building helper is a thin, separately-testable wrapper so the use case itself can be unit-tested with a mocked transporter factory instead of a real network call — matching how `ResendEmailAdapter.spec.ts` mocks the `resend` package rather than hitting the real API.

- [ ] **Step 1: Create `apps/backend/src/modules/smtp-config/infrastructure/nodemailer-smtp-transport.ts`**

```typescript
import nodemailer, { Transporter } from 'nodemailer';

export interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export function createSmtpTransport(config: SmtpTransportConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: { user: config.username, pass: config.password },
  });
}
```

- [ ] **Step 2: Write failing test for `TestAndSaveSmtpConfigUseCase`**

Create `apps/backend/src/modules/smtp-config/application/test-and-save-smtp-config.usecase.spec.ts`:

```typescript
import { SmtpConfigStatus } from '../domain/organization-smtp-config';
import { TestAndSaveSmtpConfigUseCase } from './test-and-save-smtp-config.usecase';

function buildDeps() {
  return {
    smtpConfigRepo: { save: jest.fn() },
    subscriptionRepo: {
      findByOrganizationId: jest.fn().mockResolvedValue({ canUseCustomSmtp: true }),
    },
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({ userId: 'user-owner' }),
    },
    userRepo: { findById: jest.fn().mockResolvedValue({ email: 'owner@congtyb.vn' }) },
    tenantContext: { getOrganizationId: jest.fn().mockReturnValue('org-1') },
    transportFactory: jest.fn(),
    encryptionKey: 'a'.repeat(64),
  };
}

const input = {
  host: 'smtp.congtyb.vn',
  port: 587,
  username: 'noreply@congtyb.vn',
  password: 'app-password',
  fromAddress: 'noreply@congtyb.vn',
};

describe('TestAndSaveSmtpConfigUseCase', () => {
  it('verifies + sends a test email, then persists with status CONNECTED', async () => {
    const deps = buildDeps();
    const transport = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn().mockResolvedValue({}) };
    deps.transportFactory.mockReturnValue(transport);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
    );

    const config = await useCase.execute(input);

    expect(transport.verify).toHaveBeenCalled();
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'noreply@congtyb.vn', to: 'owner@congtyb.vn' }),
    );
    expect(deps.smtpConfigRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SmtpConfigStatus.CONNECTED, host: 'smtp.congtyb.vn' }),
    );
    expect(config.status).toBe(SmtpConfigStatus.CONNECTED);
  });

  it('never persists when verify() throws — AppError(SMTP_CONNECTION_FAILED)', async () => {
    const deps = buildDeps();
    const transport = { verify: jest.fn().mockRejectedValue(new Error('auth rejected')), sendMail: jest.fn() };
    deps.transportFactory.mockReturnValue(transport);

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
    );

    await expect(useCase.execute(input)).rejects.toThrow('auth rejected');
    expect(deps.smtpConfigRepo.save).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the org plan does not allow custom SMTP', async () => {
    const deps = buildDeps();
    deps.subscriptionRepo.findByOrganizationId.mockResolvedValue({ canUseCustomSmtp: false });

    const useCase = new TestAndSaveSmtpConfigUseCase(
      deps.smtpConfigRepo as any,
      deps.subscriptionRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      deps.tenantContext as any,
      deps.transportFactory,
      deps.encryptionKey,
    );

    await expect(useCase.execute(input)).rejects.toThrow();
    expect(deps.transportFactory).not.toHaveBeenCalled();
    expect(deps.smtpConfigRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test test-and-save-smtp-config.usecase.spec.ts`
Expected: FAIL — Cannot find module './test-and-save-smtp-config.usecase'

- [ ] **Step 4: Create `apps/backend/src/modules/smtp-config/application/test-and-save-smtp-config.usecase.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { encryptToken } from '../../bank-connections/application/token-encryption';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { type IUserRepository, USER_REPOSITORY } from '../../users/application/user-repository.port';
import { OrganizationSmtpConfig, SmtpConfigStatus } from '../domain/organization-smtp-config';
import { ISmtpConfigRepository, SMTP_CONFIG_REPOSITORY } from './smtp-config-repository.port';
import { createSmtpTransport } from '../infrastructure/nodemailer-smtp-transport';

export interface TestAndSaveSmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
}

export type SmtpTransportFactory = (config: {
  host: string;
  port: number;
  username: string;
  password: string;
}) => Transporter;

@Injectable()
export class TestAndSaveSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY) private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly tenantContext: TenantContextService,
    private readonly transportFactory: SmtpTransportFactory = createSmtpTransport,
    private readonly encryptionKey: string = process.env.ACCESS_TOKEN_ENCRYPTION_KEY ?? '',
  ) {}

  async execute(input: TestAndSaveSmtpConfigInput): Promise<OrganizationSmtpConfig> {
    const organizationId = this.tenantContext.getOrganizationId();

    const subscription = await this.subscriptionRepo.findByOrganizationId(organizationId);
    if (!subscription?.canUseCustomSmtp) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Gói dịch vụ hiện tại không hỗ trợ SMTP riêng.');
    }

    const ownerMembership = await this.membershipRepo.findOwnerByOrganization(organizationId);
    const owner = ownerMembership ? await this.userRepo.findById(ownerMembership.userId) : null;
    if (!owner?.email) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy chủ sở hữu tổ chức để gửi email thử.');
    }

    const transport = this.transportFactory({
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password,
    });

    try {
      await transport.verify();
      await transport.sendMail({
        from: input.fromAddress,
        to: owner.email,
        subject: 'Xác nhận kết nối SMTP thành công',
        html: '<p>Cấu hình SMTP của bạn đã được kết nối thành công với Casso.</p>',
      });
    } catch (error) {
      throw new AppError(
        ErrorCode.SMTP_CONNECTION_FAILED,
        `Không thể kết nối hoặc gửi email thử: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const now = new Date();
    const config = new OrganizationSmtpConfig({
      id: randomUUID(),
      organizationId,
      host: input.host,
      port: input.port,
      username: input.username,
      encryptedPassword: encryptToken(input.password, this.encryptionKey),
      fromAddress: input.fromAddress,
      status: SmtpConfigStatus.CONNECTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    await this.smtpConfigRepo.save(config);
    return config;
  }
}
```

`AppError(ErrorCode.SMTP_CONNECTION_FAILED, ...)` is thrown only around the `verify()`/`sendMail()` calls (matching spec §9's "distinct from `EMAIL_SEND_FAILED`" framing); the test's first failure-path assertion (`rejects.toThrow('auth rejected')`) is intentionally loose about the exact wrapper — tighten to assert on `error.errorCode === ErrorCode.SMTP_CONNECTION_FAILED` once `AppError`'s public shape is confirmed against `apps/backend/src/common/errors/app-error.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test test-and-save-smtp-config.usecase.spec.ts`
Expected: all PASS

- [ ] **Step 6: Create `GetSmtpConfigUseCase` and `DeleteSmtpConfigUseCase`** (thin, no branching logic — no dedicated spec beyond Task 8's controller e2e test, consistent with how `email-templates`' equally-thin `DeleteEmailTemplateUseCase` has no unit spec of its own)

`apps/backend/src/modules/smtp-config/application/get-smtp-config.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { OrganizationSmtpConfig } from '../domain/organization-smtp-config';
import { ISmtpConfigRepository, SMTP_CONFIG_REPOSITORY } from './smtp-config-repository.port';

@Injectable()
export class GetSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY) private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<OrganizationSmtpConfig | null> {
    return this.smtpConfigRepo.findByOrganizationId(this.tenantContext.getOrganizationId());
  }
}
```

`apps/backend/src/modules/smtp-config/application/delete-smtp-config.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ISmtpConfigRepository, SMTP_CONFIG_REPOSITORY } from './smtp-config-repository.port';

@Injectable()
export class DeleteSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY) private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<void> {
    await this.smtpConfigRepo.deleteByOrganizationId(this.tenantContext.getOrganizationId());
  }
}
```

- [ ] **Step 7: Install `nodemailer`**

Run: `pnpm --filter @casso-ledger/backend add nodemailer && pnpm --filter @casso-ledger/backend add -D @types/nodemailer`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/package.json apps/backend/src/modules/smtp-config/application apps/backend/src/modules/smtp-config/infrastructure/nodemailer-smtp-transport.ts
git commit -m "feat: add TestAndSaveSmtpConfigUseCase (test-then-save), GetSmtpConfigUseCase, DeleteSmtpConfigUseCase"
```

---

### Task 5: `SmtpConfigController` + DTOs + `SmtpConfigModule`

**Files:**
- Create: `apps/backend/src/modules/smtp-config/presentation/dto/save-smtp-config.dto.ts`
- Create: `apps/backend/src/modules/smtp-config/presentation/dto/smtp-config-response.dto.ts`
- Create: `apps/backend/src/modules/smtp-config/presentation/smtp-config.controller.ts`
- Create: `apps/backend/src/modules/smtp-config/smtp-config.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `TestAndSaveSmtpConfigUseCase`/`GetSmtpConfigUseCase`/`DeleteSmtpConfigUseCase` (Task 4), `PermissionGuard`/`RequirePermission` (existing common/rbac)
- Produces: `GET|POST|DELETE /api/v1/smtp-config`, and `SmtpConfigModule` exporting `SMTP_CONFIG_REPOSITORY` for Task 9 (`NotificationsModule` consumes it, mirroring `EmailTemplatesModule` exporting `EMAIL_TEMPLATE_REPOSITORY`)

This task is DTO/wiring only (config-only per Global Constraints) — no new branching logic, so no dedicated unit spec; correctness is proven by Task 10's e2e test.

- [ ] **Step 1: Create the DTOs**

`apps/backend/src/modules/smtp-config/presentation/dto/save-smtp-config.dto.ts`:

```typescript
import { IsEmail, IsInt, IsString, Max, Min } from 'class-validator';

export class SaveSmtpConfigDto {
  @IsString()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsEmail()
  fromAddress: string;
}
```

`apps/backend/src/modules/smtp-config/presentation/dto/smtp-config-response.dto.ts` (never exposes `encryptedPassword` — AGENTS.md validation rule):

```typescript
import type { OrganizationSmtpConfig } from '../../domain/organization-smtp-config';

export interface SmtpConfigResponseDto {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  status: string;
}

export function toSmtpConfigResponse(config: OrganizationSmtpConfig): SmtpConfigResponseDto {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    fromAddress: config.fromAddress,
    status: config.status,
  };
}
```

- [ ] **Step 2: Create the controller**

`apps/backend/src/modules/smtp-config/presentation/smtp-config.controller.ts`:

```typescript
import { Permission } from '@casso-ledger/shared-types';
import { Body, Controller, Delete, Get, Headers, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { AuditActionType, AuditEntityType } from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { DeleteSmtpConfigUseCase } from '../application/delete-smtp-config.usecase';
import { GetSmtpConfigUseCase } from '../application/get-smtp-config.usecase';
import { TestAndSaveSmtpConfigUseCase } from '../application/test-and-save-smtp-config.usecase';
import { SaveSmtpConfigDto } from './dto/save-smtp-config.dto';
import { toSmtpConfigResponse } from './dto/smtp-config-response.dto';

@Controller('smtp-config')
@UseGuards(PermissionGuard)
export class SmtpConfigController {
  constructor(
    private readonly testAndSaveUseCase: TestAndSaveSmtpConfigUseCase,
    private readonly getUseCase: GetSmtpConfigUseCase,
    private readonly deleteUseCase: DeleteSmtpConfigUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async get() {
    const config = await this.getUseCase.execute();
    if (!config) throw new NotFoundException();
    return toSmtpConfigResponse(config);
  }

  @Post()
  @Audited(AuditActionType.SMTP_CONFIG_SAVE, AuditEntityType.SMTP_CONFIG)
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async save(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: SaveSmtpConfigDto,
  ) {
    return this.idempotency.execute('POST /smtp-config', key, dto, async () => {
      const config = await this.testAndSaveUseCase.execute(dto);
      return toSmtpConfigResponse(config);
    });
  }

  @Delete()
  @Audited(AuditActionType.SMTP_CONFIG_DELETE, AuditEntityType.SMTP_CONFIG)
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async remove(@Headers('idempotency-key') key: string | undefined) {
    return this.idempotency.execute('DELETE /smtp-config', key, {}, async () => {
      await this.deleteUseCase.execute();
      return { success: true };
    });
  }
}
```

`AuditActionType.SMTP_CONFIG_SAVE`/`SMTP_CONFIG_DELETE` and `AuditEntityType.SMTP_CONFIG` need adding to `apps/backend/src/common/audit/audit.enums.ts` alongside the existing `EMAIL_TEMPLATE_*` values, following that file's exact naming convention — every other write-endpoint in this codebase is `@Audited`, and SMTP credentials are exactly the kind of sensitive-config change the audit log exists for.

- [ ] **Step 3: Create `SmtpConfigModule`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { DeleteSmtpConfigUseCase } from './application/delete-smtp-config.usecase';
import { GetSmtpConfigUseCase } from './application/get-smtp-config.usecase';
import { SMTP_CONFIG_REPOSITORY } from './application/smtp-config-repository.port';
import { TestAndSaveSmtpConfigUseCase } from './application/test-and-save-smtp-config.usecase';
import { OrganizationSmtpConfigOrmEntity } from './infrastructure/organization-smtp-config.orm-entity';
import { TypeOrmSmtpConfigRepository } from './infrastructure/typeorm-smtp-config.repository';
import { SmtpConfigController } from './presentation/smtp-config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationSmtpConfigOrmEntity]),
    IdempotencyModule,
    BillingModule,
    OrganizationsModule,
    UsersModule,
  ],
  providers: [
    { provide: SMTP_CONFIG_REPOSITORY, useClass: TypeOrmSmtpConfigRepository },
    TestAndSaveSmtpConfigUseCase,
    GetSmtpConfigUseCase,
    DeleteSmtpConfigUseCase,
  ],
  controllers: [SmtpConfigController],
  exports: [SMTP_CONFIG_REPOSITORY],
})
export class SmtpConfigModule {}
```

- [ ] **Step 4: Register in `apps/backend/src/app.module.ts`**

Add `SmtpConfigModule` to `imports`, `import { SmtpConfigModule } from './modules/smtp-config/smtp-config.module';` — same pattern as every other module registration.

- [ ] **Step 5: Verify app boots**

Run: `npx tsc --noEmit && docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/smtp-config/presentation apps/backend/src/modules/smtp-config/smtp-config.module.ts apps/backend/src/app.module.ts apps/backend/src/common/audit/audit.enums.ts
git commit -m "feat: add SmtpConfigController (OWNER-only GET/POST/DELETE /api/v1/smtp-config) and SmtpConfigModule"
```

---

### Task 6: `SmtpEmailAdapter` (notifications/infrastructure)

**Files:**
- Create: `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.spec.ts`

**Interfaces:**
- Consumes: `IEmailProviderAdapter` port (existing, unchanged), `createSmtpTransport` (Task 4), `decryptToken` (`token-encryption.ts`)
- Produces: `SmtpEmailAdapter implements IEmailProviderAdapter`, used by Task 7's resolver

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.spec.ts`:

```typescript
import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('SmtpEmailAdapter', () => {
  function buildConfig() {
    return {
      id: 'smtp-1',
      organizationId: 'org-1',
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      encryptedPassword: 'ciphertext',
      fromAddress: 'noreply@congtyb.vn',
      status: SmtpConfigStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    } as any;
  }

  it('decrypts the password, sends via the org from-address, and returns a providerMessageId', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-msg-1' });
    const transportFactory = jest.fn().mockReturnValue({ sendMail });
    const decryptFn = jest.fn().mockReturnValue('plaintext-password');

    const adapter = new SmtpEmailAdapter(buildConfig(), 'a'.repeat(64), transportFactory, decryptFn);
    const result = await adapter.send('customer@example.com', 'Reminder', '<p>Due</p>', {}, 'owner@congtyb.vn');

    expect(decryptFn).toHaveBeenCalledWith('ciphertext', 'a'.repeat(64));
    expect(transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.congtyb.vn', password: 'plaintext-password' }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'noreply@congtyb.vn', to: 'customer@example.com', replyTo: 'owner@congtyb.vn' }),
    );
    expect(result).toEqual({ providerMessageId: 'smtp-msg-1' });
  });

  it('propagates a rejected sendMail as an error (no swallowing — the caller/resolver decides fallback)', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
    const transportFactory = jest.fn().mockReturnValue({ sendMail });

    const adapter = new SmtpEmailAdapter(buildConfig(), 'a'.repeat(64), transportFactory, () => 'plaintext');

    await expect(adapter.send('c@example.com', 's', '<p>h</p>', {})).rejects.toThrow('connection refused');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test smtp-email.adapter.spec.ts`
Expected: FAIL — Cannot find module './smtp-email.adapter'

- [ ] **Step 3: Create `apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.ts`**

```typescript
import { decryptToken } from '../../bank-connections/application/token-encryption';
import type { OrganizationSmtpConfig } from '../../smtp-config/domain/organization-smtp-config';
import { createSmtpTransport, SmtpTransportConfig } from '../../smtp-config/infrastructure/nodemailer-smtp-transport';
import { EmailSendResult, IEmailProviderAdapter } from '../application/email-provider-adapter.port';

type TransportFactory = (config: SmtpTransportConfig) => { sendMail: (opts: unknown) => Promise<{ messageId: string }> };
type DecryptFn = (value: string, key: string) => string;

/** Constructed per-send from a decrypted OrganizationSmtpConfig — NOT a DI singleton (every org has different credentials). */
export class SmtpEmailAdapter implements IEmailProviderAdapter {
  constructor(
    private readonly config: OrganizationSmtpConfig,
    private readonly encryptionKey: string,
    private readonly transportFactory: TransportFactory = createSmtpTransport,
    private readonly decryptFn: DecryptFn = decryptToken,
  ) {}

  async send(
    to: string,
    subject: string,
    html: string,
    _metadata: Record<string, string>,
    replyTo?: string,
  ): Promise<EmailSendResult> {
    const password = this.decryptFn(this.config.encryptedPassword, this.encryptionKey);
    const transport = this.transportFactory({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password,
    });

    const result = await transport.sendMail({
      from: this.config.fromAddress,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    return { providerMessageId: result.messageId };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test smtp-email.adapter.spec.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.ts apps/backend/src/modules/notifications/infrastructure/smtp-email.adapter.spec.ts
git commit -m "feat: add SmtpEmailAdapter implementing IEmailProviderAdapter via the org's own SMTP server"
```

---

### Task 7: `IEmailProviderResolver` port + `EmailProviderResolver` implementation

**Files:**
- Create: `apps/backend/src/modules/notifications/application/email-provider-resolver.port.ts`
- Create: `apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.spec.ts`

**Interfaces:**
- Consumes: `ISmtpConfigRepository` (Task 3), `SmtpEmailAdapter` (Task 6), the existing `ResendEmailAdapter`
- Produces: `IEmailProviderResolver.resolve(organizationId, forceProvider?): Promise<IEmailProviderAdapter>`, used by Task 8's `EmailQueueProcessor`

- [ ] **Step 1: Create the port**

`apps/backend/src/modules/notifications/application/email-provider-resolver.port.ts`:

```typescript
import type { IEmailProviderAdapter } from './email-provider-adapter.port';

export interface IEmailProviderResolver {
  /** forceProvider: 'RESEND' bypasses SMTP config lookup entirely — used for the failure-fallback requeue and the SMTP-down warning email (spec §5). */
  resolve(organizationId: string, forceProvider?: 'RESEND'): Promise<IEmailProviderAdapter>;
}

export const EMAIL_PROVIDER_RESOLVER = Symbol('EMAIL_PROVIDER_RESOLVER');
```

- [ ] **Step 2: Write failing test**

Create `apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.spec.ts`:

```typescript
import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
import { EmailProviderResolver } from './email-provider-resolver';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('EmailProviderResolver', () => {
  function buildDeps() {
    return {
      resendAdapter: { send: jest.fn() },
      smtpConfigRepo: { findByOrganizationId: jest.fn() },
      encryptionKey: 'a'.repeat(64),
    };
  }

  it('returns the Resend adapter when forceProvider is RESEND, without consulting the SMTP config repo', async () => {
    const deps = buildDeps();
    const resolver = new EmailProviderResolver(deps.resendAdapter as any, deps.smtpConfigRepo as any, deps.encryptionKey);

    const adapter = await resolver.resolve('org-1', 'RESEND');

    expect(adapter).toBe(deps.resendAdapter);
    expect(deps.smtpConfigRepo.findByOrganizationId).not.toHaveBeenCalled();
  });

  it('returns a SmtpEmailAdapter when the org has a CONNECTED config', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.CONNECTED,
      organizationId: 'org-1',
    });
    const resolver = new EmailProviderResolver(deps.resendAdapter as any, deps.smtpConfigRepo as any, deps.encryptionKey);

    const adapter = await resolver.resolve('org-1');

    expect(adapter).toBeInstanceOf(SmtpEmailAdapter);
  });

  it('falls back to the Resend adapter when the org config is FAILED', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({ status: SmtpConfigStatus.FAILED });
    const resolver = new EmailProviderResolver(deps.resendAdapter as any, deps.smtpConfigRepo as any, deps.encryptionKey);

    expect(await resolver.resolve('org-1')).toBe(deps.resendAdapter);
  });

  it('falls back to the Resend adapter when the org has no config at all', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue(null);
    const resolver = new EmailProviderResolver(deps.resendAdapter as any, deps.smtpConfigRepo as any, deps.encryptionKey);

    expect(await resolver.resolve('org-1')).toBe(deps.resendAdapter);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test email-provider-resolver.spec.ts`
Expected: FAIL — Cannot find module './email-provider-resolver'

- [ ] **Step 4: Create `apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER_ADAPTER, type IEmailProviderAdapter } from '../application/email-provider-adapter.port';
import type { IEmailProviderResolver } from '../application/email-provider-resolver.port';
import {
  ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from '../../smtp-config/application/smtp-config-repository.port';
import { SmtpEmailAdapter } from './smtp-email.adapter';

@Injectable()
export class EmailProviderResolver implements IEmailProviderResolver {
  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER) private readonly resendAdapter: IEmailProviderAdapter,
    @Inject(SMTP_CONFIG_REPOSITORY) private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly encryptionKey: string = process.env.ACCESS_TOKEN_ENCRYPTION_KEY ?? '',
  ) {}

  async resolve(organizationId: string, forceProvider?: 'RESEND'): Promise<IEmailProviderAdapter> {
    if (forceProvider === 'RESEND') return this.resendAdapter;

    const config = await this.smtpConfigRepo.findByOrganizationId(organizationId);
    if (config?.isConnected()) {
      return new SmtpEmailAdapter(config, this.encryptionKey);
    }
    return this.resendAdapter;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test email-provider-resolver.spec.ts`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/notifications/application/email-provider-resolver.port.ts apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.ts apps/backend/src/modules/notifications/infrastructure/email-provider-resolver.spec.ts
git commit -m "feat: add IEmailProviderResolver port and EmailProviderResolver (Resend vs org SMTP per send)"
```

---

### Task 8: Wire `EmailQueueProcessor` to the resolver + CONNECTED→FAILED fallback logic

**Files:**
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts` (add optional `forceProvider` to `ReminderEmailJob`)
- Test: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`

**Interfaces:**
- Consumes: `IEmailProviderResolver` (Task 7), `ISmtpConfigRepository` (Task 3), the existing `IReminderExecutionRepository`
- Produces: reminder sends now route per-organization; SMTP failures self-heal to Resend without losing the reminder (spec §5)

This is the highest-risk task in the plan — it changes the one class every existing reminder email already flows through. Write the new tests FIRST against the current behavior, confirm the existing two tests (success, and "FAILED only when the job has exhausted all attempts") still pass unmodified, THEN add the SMTP-specific branch.

- [ ] **Step 1: Add `forceProvider` to `ReminderEmailJob`**

In `apps/backend/src/modules/notifications/application/email-queue.port.ts`, add `forceProvider?: 'RESEND';` to the `ReminderEmailJob` interface.

- [ ] **Step 2: Write failing tests for the new resolver-based send path and the fallback-on-exhaustion branch**

Add to `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts` (alongside the existing tests — do not delete them, they must keep passing unmodified since Resend-only orgs must see zero behavior change):

```typescript
import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
// ...existing imports...

describe('EmailQueueProcessor — provider resolution', () => {
  function buildDeps() {
    return {
      resolver: { resolve: jest.fn() },
      executionRepo: { getStatus: jest.fn().mockResolvedValue('PENDING'), updateSendResult: jest.fn() },
      smtpConfigRepo: { findByOrganizationId: jest.fn(), save: jest.fn() },
      tenantContext: { run: jest.fn((_u: unknown, cb: () => Promise<void>) => cb()) },
      eventEmitter: { emit: jest.fn() },
      metrics: { incrementBullmqJobFailed: jest.fn() },
      requestIdStore: { run: jest.fn((_id: string, cb: () => Promise<void>) => cb()) },
      emailQueue: { add: jest.fn() },
    };
  }

  function buildJob(overrides: Partial<{ attemptsMade: number; attempts: number; forceProvider: 'RESEND' }> = {}) {
    return {
      id: 'exec-1',
      name: 'send-reminder-email',
      data: {
        reminderExecutionId: 'exec-1',
        receivableId: 'rec-1',
        organizationId: 'org-1',
        to: 'customer@example.com',
        replyTo: 'owner@congtyb.vn',
        subject: 'Payment reminder',
        html: '<p>html</p>',
        ...(overrides.forceProvider ? { forceProvider: overrides.forceProvider } : {}),
      },
      attemptsMade: overrides.attemptsMade ?? 1,
      opts: { attempts: overrides.attempts ?? 3 },
    } as any;
  }

  it('resolves the adapter per organization via IEmailProviderResolver instead of a fixed injected adapter', async () => {
    const deps = buildDeps();
    const orgAdapter = { send: jest.fn().mockResolvedValue({ providerMessageId: 'smtp-msg-1' }) };
    deps.resolver.resolve.mockResolvedValue(orgAdapter);

    const processor = new EmailQueueProcessor(
      deps.resolver as any, deps.executionRepo as any, deps.smtpConfigRepo as any,
      deps.tenantContext as any, deps.eventEmitter as any, deps.metrics as any,
      deps.requestIdStore as any, deps.emailQueue as any,
    );

    await processor.process(buildJob());

    expect(deps.resolver.resolve).toHaveBeenCalledWith('org-1', undefined);
    expect(orgAdapter.send).toHaveBeenCalled();
  });

  it('on final exhaustion via a CONNECTED org SMTP config: flips it to FAILED, sends one warning via forced Resend, and requeues the reminder forced through Resend instead of marking the execution FAILED', async () => {
    const deps = buildDeps();
    deps.resolver.resolve.mockImplementation((_orgId: string, force?: 'RESEND') =>
      force === 'RESEND' ? { send: jest.fn().mockResolvedValue({ providerMessageId: 'warn-1' }) } : { send: jest.fn() },
    );
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.CONNECTED,
      organizationId: 'org-1',
      markFailed: jest.fn().mockReturnValue({ status: SmtpConfigStatus.FAILED, organizationId: 'org-1' }),
    });

    const processor = new EmailQueueProcessor(
      deps.resolver as any, deps.executionRepo as any, deps.smtpConfigRepo as any,
      deps.tenantContext as any, deps.eventEmitter as any, deps.metrics as any,
      deps.requestIdStore as any, deps.emailQueue as any,
    );

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3 }));

    expect(deps.smtpConfigRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SmtpConfigStatus.FAILED }),
    );
    expect(deps.executionRepo.updateSendResult).not.toHaveBeenCalled(); // NOT marked FAILED — a fallback is in flight
    expect(deps.emailQueue.add).toHaveBeenCalledWith(
      'send-reminder-email',
      expect.objectContaining({ reminderExecutionId: 'exec-1', forceProvider: 'RESEND' }),
      expect.objectContaining({ jobId: 'exec-1:resend-fallback' }),
    );
  });

  it('on final exhaustion when forceProvider was already RESEND: marks the execution FAILED for real (no infinite fallback loop)', async () => {
    const deps = buildDeps();

    const processor = new EmailQueueProcessor(
      deps.resolver as any, deps.executionRepo as any, deps.smtpConfigRepo as any,
      deps.tenantContext as any, deps.eventEmitter as any, deps.metrics as any,
      deps.requestIdStore as any, deps.emailQueue as any,
    );

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3, forceProvider: 'RESEND' }));

    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith('exec-1', 'FAILED', null);
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
    expect(deps.smtpConfigRepo.findByOrganizationId).not.toHaveBeenCalled();
  });

  it('on final exhaustion with no SMTP config for the org at all: unchanged existing behavior, marks FAILED', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue(null);

    const processor = new EmailQueueProcessor(
      deps.resolver as any, deps.executionRepo as any, deps.smtpConfigRepo as any,
      deps.tenantContext as any, deps.eventEmitter as any, deps.metrics as any,
      deps.requestIdStore as any, deps.emailQueue as any,
    );

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3 }));

    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith('exec-1', 'FAILED', null);
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });
});
```

Update the two PRE-EXISTING tests in this file (the plain success case and the plain "no SMTP config" failure case) to construct `EmailQueueProcessor` with the new constructor signature (`resolver`, `smtpConfigRepo`, `emailQueue` added) — they should otherwise assert exactly what they already assert, unchanged, confirming zero behavior change for Resend-only organizations.

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `pnpm --filter @casso-ledger/backend test email-queue.processor.spec.ts`
Expected: FAIL — `EmailQueueProcessor` constructor doesn't accept `resolver`/`smtpConfigRepo`/`emailQueue` yet

- [ ] **Step 4: Modify `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { MetricsService } from '../../../common/observability/metrics.service';
import { RequestIdStore } from '../../../common/observability/request-id.store';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from '../../smtp-config/application/smtp-config-repository.port';
import { Role } from '../../organizations/domain/membership';
import { type IReminderExecutionRepository } from '../../reminders/application/reminder-execution-repository.port';
import { ReminderExecutionStatus } from '../../reminders/domain/reminder-execution';
import {
  EMAIL_PROVIDER_RESOLVER,
  type IEmailProviderResolver,
} from '../application/email-provider-resolver.port';
import { EMAIL_QUEUE_PORT, type AuthEmailJob, type IEmailQueue, type ReminderEmailJob } from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

function getJobRequestId(job: Job): string {
  return `bullmq:${job.id ?? randomUUID()}`;
}

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(
    @Inject(EMAIL_PROVIDER_RESOLVER) private readonly resolver: IEmailProviderResolver,
    @Inject(REMINDER_EXECUTION_REPOSITORY) private readonly executionRepo: IReminderExecutionRepository,
    @Inject(SMTP_CONFIG_REPOSITORY) private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metrics: MetricsService,
    private readonly requestIdStore: RequestIdStore,
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    return this.requestIdStore.run(getJobRequestId(job), () => {
      if (job.name === 'send-auth-email') {
        return this.processAuthEmail(job as Job<AuthEmailJob>);
      }
      return this.processReminderEmail(job as Job<ReminderEmailJob>);
    });
  }

  private async processAuthEmail(job: Job<AuthEmailJob>): Promise<void> {
    // unchanged — auth emails always use the Resend adapter directly (spec: out of scope for SMTP)
    const { to, subject, html, emailType } = job.data;
    const resendAdapter = await this.resolver.resolve('__auth__', 'RESEND');
    try {
      await resendAdapter.send(to, subject, html, { emailType });
    } catch (error) {
      this.logger.error({
        message: 'Auth email send failed',
        emailType,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processReminderEmail(job: Job<ReminderEmailJob>): Promise<void> {
    const { reminderExecutionId, receivableId, organizationId, to, replyTo, subject, html, forceProvider } = job.data;

    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const status = await this.executionRepo.getStatus(reminderExecutionId);
        if (status !== ReminderExecutionStatus.PENDING) {
          this.logger.warn(
            `Skipping email send for ${reminderExecutionId}: status is already ${status ?? 'unknown'}`,
          );
          return;
        }

        const adapter = await this.resolver.resolve(organizationId, forceProvider);
        const result = await adapter.send(to, subject, html, { reminderExecutionId }, replyTo);
        await this.executionRepo.updateSendResult(reminderExecutionId, 'SENT', result.providerMessageId);
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          organizationId,
        });
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job): Promise<void> {
    return this.requestIdStore.run(getJobRequestId(job), async () => {
      this.metrics.incrementBullmqJobFailed(EMAIL_QUEUE);
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) return;

      if (job.name === 'send-auth-email') {
        this.logger.error(
          `Auth email job ${job.id ?? 'unknown'} failed permanently after ${job.attemptsMade} attempts`,
        );
        return;
      }

      const data = job.data as ReminderEmailJob;
      const { reminderExecutionId, organizationId, receivableId, to, replyTo, subject, html } = data;

      // Already the forced-Resend fallback retry and IT also failed — a real, final failure.
      if (data.forceProvider === 'RESEND') {
        await this.markExecutionFailed(reminderExecutionId, organizationId);
        return;
      }

      const config = await this.smtpConfigRepo.findByOrganizationId(organizationId);
      if (config?.isConnected()) {
        // The org's own SMTP server is what failed — not Resend. Flip status, warn once, and
        // retry the SAME reminder forced through Resend instead of losing it (spec §5).
        await this.smtpConfigRepo.save(config.markFailed());

        const warningAdapter = await this.resolver.resolve(organizationId, 'RESEND');
        await warningAdapter.send(
          replyTo ?? '',
          'Email server riêng của bạn đang gặp sự cố',
          '<p>Casso không thể gửi email nhắc nợ qua SMTP server riêng của bạn. Các email nhắc nợ tạm thời sẽ gửi qua Casso cho đến khi bạn cấu hình lại.</p>',
          { emailType: 'SMTP_CONNECTION_FAILED_WARNING' },
        );

        await this.emailQueue.add(
          'send-reminder-email',
          { reminderExecutionId, receivableId, organizationId, to, replyTo, subject, html, forceProvider: 'RESEND' },
          { jobId: `${reminderExecutionId}:resend-fallback`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );

        this.logger.warn(
          `SMTP config for org ${organizationId} exhausted retries — flipped to FAILED, requeued ${reminderExecutionId} via Resend`,
        );
        return; // execution stays PENDING — the fallback job will resolve it
      }

      // No SMTP config, or Resend itself failed with no SMTP fallback available — unchanged existing behavior.
      await this.markExecutionFailed(reminderExecutionId, organizationId);
    });
  }

  private async markExecutionFailed(reminderExecutionId: string, organizationId: string): Promise<void> {
    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        await this.executionRepo.updateSendResult(reminderExecutionId, 'FAILED', null);
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'FAILED',
          providerMessageId: null,
          organizationId,
        });
      },
    );
    this.logger.error(`Reminder execution ${reminderExecutionId} failed permanently (organizationId=${organizationId})`);
  }
}
```

Note the `replyTo ?? ''` guard on the warning email: `EmailService.sendReminderEmail` already omits `replyTo` when the org somehow has no OWNER membership (email-notification-service spec §1 edge case) — in that same rare case there is also nobody to warn, so this send would target an empty string and fail. Tighten this in code review to fetch the OWNER's email directly (`membershipRepo`/`userRepo`, same lookup Task 4's use case already does) rather than relying on the reminder job's `replyTo`, which is coincidentally the same address but not guaranteed to be present — flagged here rather than silently shipped as a latent bug.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test email-queue.processor.spec.ts`
Expected: all PASS (both new and pre-existing tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts apps/backend/src/modules/notifications/application/email-queue.port.ts
git commit -m "feat: route EmailQueueProcessor through IEmailProviderResolver; fall back to Resend and warn once when an org's SMTP config fails"
```

---

### Task 9: Final module wiring (`NotificationsModule` binds the resolver, imports `SmtpConfigModule`)

**Files:**
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Produces: fully wired `NotificationsModule` — binds `EMAIL_PROVIDER_RESOLVER` to `EmailProviderResolver`, imports `SmtpConfigModule` for `SMTP_CONFIG_REPOSITORY`

Config-only (no branching logic) — no dedicated spec; proven by Task 10's e2e test.

- [ ] **Step 1: Modify `apps/backend/src/modules/notifications/notifications.module.ts`**

```typescript
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CommonTokensModule } from '../../common/tokens/common-tokens.module';
import { CustomersModule } from '../customers/customers.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { SmtpConfigModule } from '../smtp-config/smtp-config.module';
import { UsersModule } from '../users/users.module';
import { EmailService } from './application/email.service';
import { EMAIL_PROVIDER_ADAPTER } from './application/email-provider-adapter.port';
import { EMAIL_PROVIDER_RESOLVER } from './application/email-provider-resolver.port';
import { EMAIL_QUEUE_PORT } from './application/email-queue.port';
import { BullMqEmailQueue } from './infrastructure/email-queue.adapter';
import { EMAIL_QUEUE } from './infrastructure/email-queue.constants';
import { EmailProviderResolver } from './infrastructure/email-provider-resolver';
import { EmailQueueProcessor } from './infrastructure/email-queue.processor';
import { ResendEmailAdapter } from './infrastructure/resend-email.adapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    CommonTokensModule,
    CustomersModule,
    EmailTemplatesModule,
    InvoicesModule,
    OrganizationsModule,
    ReceivablesModule,
    SmtpConfigModule,
    UsersModule,
  ],
  providers: [
    { provide: EMAIL_PROVIDER_ADAPTER, useClass: ResendEmailAdapter },
    { provide: EMAIL_PROVIDER_RESOLVER, useClass: EmailProviderResolver },
    { provide: EMAIL_QUEUE_PORT, useClass: BullMqEmailQueue },
    EmailService,
    EmailQueueProcessor,
  ],
  exports: [EMAIL_PROVIDER_ADAPTER, EMAIL_QUEUE_PORT, EmailService],
})
export class NotificationsModule {}
```

`SmtpConfigModule` exports `SMTP_CONFIG_REPOSITORY` (Task 5); importing it here is enough for `EmailProviderResolver` and `EmailQueueProcessor`'s `@Inject(SMTP_CONFIG_REPOSITORY)` to resolve, same as `EmailTemplatesModule` already does for `EMAIL_TEMPLATE_REPOSITORY`. Watch for a circular import: `SmtpConfigModule` imports `BillingModule` for the `canUseCustomSmtp` gate (Task 4) — confirm `BillingModule` does not, in turn, import `NotificationsModule`; if it ever does, use `forwardRef()` the same way `NotificationsModule`/`RemindersModule` already do.

- [ ] **Step 2: Run full backend test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 3: Run full app boot**

Run: `docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 4: Add `ACCESS_TOKEN_ENCRYPTION_KEY` note to `apps/backend/.env.example`** (if not already documented from the bank-connections plan — confirm, don't duplicate)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/notifications.module.ts
git commit -m "feat: wire EmailProviderResolver and SmtpConfigModule into NotificationsModule"
```

---

### Task 10: End-to-end test — full flow

**Files:**
- Create: `apps/backend/test/smtp-config.e2e-spec.ts`

**Interfaces:**
- Consumes: the full app (via `@nestjs/testing` + testcontainers, following `2026-08-03-webhook-matching-engine.md` Task 10's exact pattern per this module's Tech Stack line)

- [ ] **Step 1: Write the e2e test**

Create `apps/backend/test/smtp-config.e2e-spec.ts` covering, against a real Postgres + Redis testcontainer and a BUSINESS-tier org (`canUseCustomSmtp: true`):

1. `POST /api/v1/smtp-config` as a non-OWNER role (e.g. `FINANCE_MANAGER`) → `403 FORBIDDEN`.
2. `POST /api/v1/smtp-config` as OWNER with a transporter mock that fails `verify()` → `400 SMTP_CONNECTION_FAILED`, and `GET /api/v1/smtp-config` afterward still `404` (nothing persisted — spec §2).
3. `POST /api/v1/smtp-config` as OWNER with a transporter mock that succeeds → `201`/`200`, `GET /api/v1/smtp-config` returns `{ host, port, username, fromAddress, status: 'CONNECTED' }` with no `encryptedPassword` field present in the response body.
4. Trigger a reminder send for that org (reuse the reminder-automation e2e fixtures) with the SMTP adapter mocked to fail all 3 attempts → assert: `OrganizationSmtpConfig.status` becomes `FAILED` in the DB, exactly one warning email was sent via the mocked Resend adapter, `ReminderExecution.status` stays `PENDING` (not `FAILED`) immediately after exhaustion, and a `${reminderExecutionId}:resend-fallback` job exists on `email-queue`.
5. Let the fallback job process successfully (mocked Resend adapter succeeds) → `ReminderExecution.status` becomes `SENT`.
6. Repeat a reminder send for a FREE-tier org with no `canUseCustomSmtp` → confirm it still routes through Resend exactly as before this plan (zero regression for the common case).

- [ ] **Step 2: Run**

Run: `docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e --testPathPattern smtp-config`
Expected: all PASS

- [ ] **Step 3: Run the full verification suite**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e && npx tsc --noEmit && npx biome check --write .`
Expected: all PASS (per CLAUDE.local.md's pre-commit checklist)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/smtp-config.e2e-spec.ts
git commit -m "test: add end-to-end coverage for BYO-SMTP config, send routing, and failure fallback"
```

---

## After this plan

- Update `docs/wayfinder/feature-map.md`: close out issue #43 with `Shipped:` date + PR reference (AGENTS.md workflow).
- The frontend Settings-page UI for this (form + status banner) is separate Lane C work, not part of this backend plan.
- The display-name-only customization ticket (issue #43's interim-solution comment) remains open and unaffected by this plan (spec §0).
