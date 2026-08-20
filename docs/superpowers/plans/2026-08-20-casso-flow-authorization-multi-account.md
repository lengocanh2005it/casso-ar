# Casso Flow Authorization Multi-Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `CassoFlowAuthorization` out of `BankConnection` so one Casso Flow API Key can cover multiple linked bank accounts, add a 2-step preview/confirm connect flow, add authorization-scoped API Key rotation, surface account holder name, and fix a misleading double-toast on plan-limit errors.

**Architecture:** Clean Architecture, 4 layers per module (`domain/ → application/ → infrastructure/ → presentation/`), backend NestJS + TypeORM + Postgres, frontend React + TanStack Query. New entity `CassoFlowAuthorization` (1 API Key/business) becomes the parent of many `BankConnection` rows (1 per linked bank account). Every backend change is TDD (RED → GREEN → REFACTOR); migrations are exempt per AGENTS.md but still get a spec matching this repo's convention.

**Tech Stack:** NestJS 11, TypeORM 1.1, PostgreSQL 16, Jest 30, React 19, TanStack Query, Vitest, Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-20-casso-flow-authorization-multi-account-design.md` (read this first — it has the full reasoning; this plan only breaks it into tasks). Domain model: `CONTEXT.md` + `docs/adr/0022-cassoflowauthorization-splits-out-of-bankconnection.md`.

## Global Constraints

- Money fields: N/A, this feature has none.
- Every write that changes status/rollup MUST be inside one DB transaction (AGENTS.md).
- Domain layer (`domain/`) MUST NOT import NestJS/TypeORM.
- Application layer MUST NOT import concrete SDK/integration libraries or throw `HttpException` — throw `AppError`.
- Controllers only call use cases, no business logic.
- Every query/write MUST be scoped by `organizationId` (via `TenantContextService`) except the documented unscoped exceptions already in this module (`findByIdUnscoped`, `findByAccountNumber`) — do not add new unscoped methods without the same kind of justification comment.
- API prefix `/api/v1`, error shape `{ statusCode, errorCode, message, details? }`, POST/PATCH/DELETE side-effecting endpoints wrapped with `IdempotencyService.execute`.
- Biome: single quotes, semicolons always, 2-space indent. Run `npx biome check --write <files>` before each commit.
- Money/tenancy/error-code rules from AGENTS.md apply throughout even where not restated per-task.

---

## Task 1: Domain — `CassoFlowAuthorization` entity

**Files:**
- Create: `apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.ts`
- Test: `apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.spec.ts`

**Interfaces:**
- Produces: `CassoFlowAuthorization` class, `CassoFlowAuthorizationProps` interface — `{ id: string; organizationId: string; businessId: string | null; encryptedApiKey: string; encryptedSecureToken: string; createdAt: Date }`. Two behavior methods: `rotate(input: { businessId: string; encryptedApiKey: string; encryptedSecureToken: string }): CassoFlowAuthorization` (always allowed — an authorization has no status/state machine to gate this) and a plain getter shape (no other methods needed yet).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.spec.ts
import { CassoFlowAuthorization } from './casso-flow-authorization';

function buildAuthorization(
  overrides: Partial<
    ConstructorParameters<typeof CassoFlowAuthorization>[0]
  > = {},
): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: null,
    encryptedApiKey: 'encrypted-old-key',
    encryptedSecureToken: 'encrypted-old-secret',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('CassoFlowAuthorization', () => {
  it('rotate() replaces businessId, the API Key, and the webhook secret', () => {
    const authorization = buildAuthorization({ businessId: null });

    const rotated = authorization.rotate({
      businessId: 'biz-123',
      encryptedApiKey: 'encrypted-new-key',
      encryptedSecureToken: 'encrypted-new-secret',
    });

    expect(rotated.businessId).toBe('biz-123');
    expect(rotated.encryptedApiKey).toBe('encrypted-new-key');
    expect(rotated.encryptedSecureToken).toBe('encrypted-new-secret');
    expect(rotated.id).toBe('auth-1');
    expect(rotated.organizationId).toBe('org-1');
  });

  it('rotate() overwrites an existing businessId with a new one', () => {
    const authorization = buildAuthorization({ businessId: 'biz-old' });

    const rotated = authorization.rotate({
      businessId: 'biz-old',
      encryptedApiKey: 'encrypted-new-key',
      encryptedSecureToken: 'encrypted-new-secret',
    });

    expect(rotated.businessId).toBe('biz-old');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern casso-flow-authorization.spec.ts` (from `apps/backend`)
Expected: FAIL — `Cannot find module './casso-flow-authorization'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.ts
export interface CassoFlowAuthorizationProps {
  id: string;
  organizationId: string;
  businessId: string | null;
  encryptedApiKey: string;
  encryptedSecureToken: string;
  createdAt: Date;
}

export class CassoFlowAuthorization {
  readonly id: string;
  readonly organizationId: string;
  readonly businessId: string | null;
  readonly encryptedApiKey: string;
  readonly encryptedSecureToken: string;
  readonly createdAt: Date;

  constructor(props: CassoFlowAuthorizationProps) {
    Object.assign(this, props);
  }

  rotate(input: {
    businessId: string;
    encryptedApiKey: string;
    encryptedSecureToken: string;
  }): CassoFlowAuthorization {
    return new CassoFlowAuthorization({ ...this, ...input });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern casso-flow-authorization.spec.ts` (from `apps/backend`)
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.ts apps/backend/src/modules/bank-connections/domain/casso-flow-authorization.spec.ts
git commit -m "feat: add CassoFlowAuthorization domain entity"
```

---

## Task 2: Domain — `BankConnection` gains `cassoFlowAuthorizationId`/`accountHolderName`, `reactivate()` signature change, new `rotateApiKey()`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BankConnectionProps` gains `cassoFlowAuthorizationId: string`, `accountHolderName: string`; loses `encryptedSecureToken`, `encryptedCassoApiKey`. `reactivate(input: { accountNumber: string; bankName: string; accountHolderName: string; cassoFlowAuthorizationId: string }): BankConnection`. New `rotateApiKey(input: { bankName: string; accountHolderName: string }): BankConnection`, throws `Error` if `status !== 'ACTIVE'`. `ConnectionAuditEventType` gains `'API_KEY_ROTATED'`.

- [ ] **Step 1: Write the failing tests**

Replace the whole file `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts` with:

```ts
// apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts
import { BankConnection } from './bank-connection';

function buildConnection(
  overrides: Partial<ConstructorParameters<typeof BankConnection>[0]> = {},
): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'NGUYEN VAN A',
    status: 'ACTIVE',
    connectedAt: new Date('2026-01-01'),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('BankConnection', () => {
  describe('isUsable', () => {
    it('is usable only when ACTIVE', () => {
      expect(buildConnection({ status: 'ACTIVE' }).isUsable()).toBe(true);
      expect(buildConnection({ status: 'ERROR' }).isUsable()).toBe(false);
    });
  });

  describe('markRequiresReauthorization / markError', () => {
    it('transitions from ACTIVE to REQUIRES_REAUTHORIZATION', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(connection.markRequiresReauthorization().status).toBe(
        'REQUIRES_REAUTHORIZATION',
      );
    });

    it('throws when marking a non-ACTIVE connection as requiring reauthorization', () => {
      const connection = buildConnection({ status: 'DISCONNECTED' });
      expect(() => connection.markRequiresReauthorization()).toThrow();
    });

    it('transitions from ACTIVE to ERROR', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(connection.markError().status).toBe('ERROR');
    });
  });

  describe('reactivate', () => {
    it('reactivates a REQUIRES_REAUTHORIZATION connection with new account info', () => {
      const connection = buildConnection({
        status: 'REQUIRES_REAUTHORIZATION',
        accountNumber: 'old-number',
        bankName: 'Old Bank',
        accountHolderName: 'OLD NAME',
        cassoFlowAuthorizationId: 'auth-old',
      });

      const reactivated = connection.reactivate({
        accountNumber: 'new-number',
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
        cassoFlowAuthorizationId: 'auth-new',
      });

      expect(reactivated.status).toBe('ACTIVE');
      expect(reactivated.accountNumber).toBe('new-number');
      expect(reactivated.bankName).toBe('New Bank');
      expect(reactivated.accountHolderName).toBe('NEW NAME');
      expect(reactivated.cassoFlowAuthorizationId).toBe('auth-new');
      expect(reactivated.revokedAt).toBeNull();
    });

    it('reactivates an ERROR connection', () => {
      const connection = buildConnection({ status: 'ERROR' });
      expect(
        connection.reactivate({
          accountNumber: connection.accountNumber,
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
          cassoFlowAuthorizationId: connection.cassoFlowAuthorizationId,
        }).status,
      ).toBe('ACTIVE');
    });

    it('throws when reactivating an already-ACTIVE connection', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(() =>
        connection.reactivate({
          accountNumber: connection.accountNumber,
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
          cassoFlowAuthorizationId: connection.cassoFlowAuthorizationId,
        }),
      ).toThrow();
    });
  });

  describe('rotateApiKey', () => {
    it('updates bankName/accountHolderName on an ACTIVE connection, keeps status/connectedAt', () => {
      const connectedAt = new Date('2026-01-01');
      const connection = buildConnection({
        status: 'ACTIVE',
        bankName: 'Old Bank',
        accountHolderName: 'OLD NAME',
        connectedAt,
      });

      const rotated = connection.rotateApiKey({
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
      });

      expect(rotated.status).toBe('ACTIVE');
      expect(rotated.bankName).toBe('New Bank');
      expect(rotated.accountHolderName).toBe('NEW NAME');
      expect(rotated.connectedAt).toBe(connectedAt);
    });

    it('throws when rotating a non-ACTIVE connection', () => {
      const connection = buildConnection({ status: 'REQUIRES_REAUTHORIZATION' });
      expect(() =>
        connection.rotateApiKey({
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
        }),
      ).toThrow('Cannot rotate the API Key of a connection in status REQUIRES_REAUTHORIZATION');
    });
  });

  describe('disconnect', () => {
    it('transitions to DISCONNECTED and sets revokedAt', () => {
      const connection = buildConnection({ status: 'ACTIVE', revokedAt: null });
      const disconnected = connection.disconnect();
      expect(disconnected.status).toBe('DISCONNECTED');
      expect(disconnected.revokedAt).not.toBeNull();
    });

    it('throws when disconnecting an already-DISCONNECTED connection', () => {
      const connection = buildConnection({ status: 'DISCONNECTED' });
      expect(() => connection.disconnect()).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern bank-connection.spec.ts` (from `apps/backend`)
Expected: FAIL — `cassoFlowAuthorizationId`/`accountHolderName` not accepted by current constructor typing, `reactivate()` signature mismatch, `rotateApiKey` does not exist.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/domain/bank-connection.ts` with:

```ts
// apps/backend/src/modules/bank-connections/domain/bank-connection.ts
// REVOKED is listed in the design spec's BankConnection fields but has no
// transition in the state machine — kept for forward-compat; no code path
// produces it yet.
export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface BankConnectionProps {
  id: string;
  organizationId: string;
  cassoFlowAuthorizationId: string;
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: BankConnectionStatus;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class BankConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly cassoFlowAuthorizationId: string;
  readonly accountNumber: string;
  readonly bankName: string;
  readonly accountHolderName: string;
  readonly status: BankConnectionStatus;
  readonly connectedAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: BankConnectionProps) {
    Object.assign(this, props);
  }

  isUsable(): boolean {
    return this.status === 'ACTIVE';
  }

  markRequiresReauthorization(): BankConnection {
    if (this.status !== 'ACTIVE') {
      throw new Error(
        `Cannot mark connection as requiring reauthorization from status ${this.status}`,
      );
    }
    return new BankConnection({ ...this, status: 'REQUIRES_REAUTHORIZATION' });
  }

  markError(): BankConnection {
    if (this.status !== 'ACTIVE') {
      throw new Error(
        `Cannot mark connection as ERROR from status ${this.status}`,
      );
    }
    return new BankConnection({ ...this, status: 'ERROR' });
  }

  reactivate(input: {
    accountNumber: string;
    bankName: string;
    accountHolderName: string;
    cassoFlowAuthorizationId: string;
  }): BankConnection {
    if (this.status !== 'REQUIRES_REAUTHORIZATION' && this.status !== 'ERROR') {
      throw new Error(
        `Cannot reactivate a connection in status ${this.status}`,
      );
    }
    return new BankConnection({
      ...this,
      ...input,
      status: 'ACTIVE',
      connectedAt: new Date(),
      revokedAt: null,
    });
  }

  rotateApiKey(input: {
    bankName: string;
    accountHolderName: string;
  }): BankConnection {
    if (this.status !== 'ACTIVE') {
      throw new Error(
        `Cannot rotate the API Key of a connection in status ${this.status}`,
      );
    }
    return new BankConnection({ ...this, ...input });
  }

  disconnect(): BankConnection {
    if (this.status === 'DISCONNECTED') {
      throw new Error(
        'Cannot disconnect a connection that is already disconnected',
      );
    }
    return new BankConnection({
      ...this,
      status: 'DISCONNECTED',
      revokedAt: new Date(),
    });
  }
}
```

- [ ] **Step 4: Add `API_KEY_ROTATED` to `ConnectionAuditEventType`**

In `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`, change:

```ts
export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'API_CALL_FAILED'
  | 'MARKED_REQUIRES_REAUTH'
  | 'MARKED_ERROR'
  | 'RECONNECTED'
  | 'DISCONNECTED';
```

to:

```ts
export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'API_CALL_FAILED'
  | 'MARKED_REQUIRES_REAUTH'
  | 'MARKED_ERROR'
  | 'RECONNECTED'
  | 'DISCONNECTED'
  | 'API_KEY_ROTATED';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern bank-connection.spec.ts` (from `apps/backend`)
Expected: PASS, 10 tests

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/bank-connection.ts apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts
git commit -m "feat: BankConnection references CassoFlowAuthorization, adds rotateApiKey"
```

**Note for the next task's implementer:** this task deliberately does NOT touch `bank-connection.orm-entity.ts`, `typeorm-bank-connection.repository.ts`, or any usecase yet — those all currently construct `BankConnection`/call `reactivate()` with the old shape and will fail to compile until Task 4/8/9/11 update them. This is expected and fine mid-plan; `npx tsc --noEmit` will show errors in those other files until the plan completes them — don't try to fix them from this task.

---

## Task 3: Infrastructure — `CassoFlowAuthorization` port + ORM entity + TypeORM repository

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/casso-flow-authorization-repository.port.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.ts`
- Test: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.spec.ts`

**Interfaces:**
- Consumes: `CassoFlowAuthorization` (Task 1).
- Produces: `ICassoFlowAuthorizationRepository` with `findByIdUnscoped`, `findByIdForUpdate`, `findByBusinessIdForOrganization`, `save`. `CASSO_FLOW_AUTHORIZATION_REPOSITORY` DI token. `CassoFlowAuthorizationOrmEntity`. `TypeOrmCassoFlowAuthorizationRepository`.

- [ ] **Step 1: Write the port (no test needed — pure interface, same convention as every other `*-repository.port.ts` in this codebase)**

```ts
// apps/backend/src/modules/bank-connections/application/casso-flow-authorization-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { CassoFlowAuthorization } from '../domain/casso-flow-authorization';

export interface ICassoFlowAuthorizationRepository {
  // Unscoped on purpose: called from ReceiveWebhookUseCase, which handles an
  // inbound Casso Flow webhook — there is no TenantContextService
  // organizationId at that point. The connection is resolved first (by
  // accountNumber, itself unscoped for the same reason), then its
  // authorization is looked up by id from that already-resolved connection.
  findByIdUnscoped(id: string): Promise<CassoFlowAuthorization | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CassoFlowAuthorization | null>;
  findByBusinessIdForOrganization(
    businessId: string,
    organizationId: string,
  ): Promise<CassoFlowAuthorization | null>;
  save(
    authorization: CassoFlowAuthorization,
    manager?: EntityManager,
  ): Promise<void>;
}

export const CASSO_FLOW_AUTHORIZATION_REPOSITORY = Symbol(
  'CASSO_FLOW_AUTHORIZATION_REPOSITORY',
);
```

- [ ] **Step 2: Write the ORM entity**

```ts
// apps/backend/src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'casso_flow_authorizations' })
@Index(['organizationId'])
export class CassoFlowAuthorizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  businessId: string | null;

  @Column('text')
  encryptedApiKey: string;

  @Column('text')
  encryptedSecureToken: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 3: Write the failing repository test**

```ts
// apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.spec.ts
import { TypeOrmCassoFlowAuthorizationRepository } from './typeorm-casso-flow-authorization.repository';

describe('TypeOrmCassoFlowAuthorizationRepository', () => {
  describe('findByIdUnscoped', () => {
    it('looks up by id with no organization filter', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        {} as never,
      );

      await repo.findByIdUnscoped('auth-1');

      expect(findOne).toHaveBeenCalledWith({ where: { id: 'auth-1' } });
    });
  });

  describe('findByIdForUpdate', () => {
    it('locks by id scoped to the current organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const manager = { findOne } as never;
      const tenantContext = { getOrganizationId: () => 'org-1' };
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        {} as never,
        tenantContext as never,
      );

      await repo.findByIdForUpdate('auth-1', manager);

      expect(findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { id: 'auth-1', organizationId: 'org-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });
  });

  describe('findByBusinessIdForOrganization', () => {
    it('looks up by businessId scoped to the given organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        {} as never,
      );

      await repo.findByBusinessIdForOrganization('biz-1', 'org-1');

      expect(findOne).toHaveBeenCalledWith({
        where: { businessId: 'biz-1', organizationId: 'org-1' },
      });
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPattern typeorm-casso-flow-authorization.repository.spec.ts` (from `apps/backend`)
Expected: FAIL — `Cannot find module './typeorm-casso-flow-authorization.repository'`

- [ ] **Step 5: Write minimal implementation**

```ts
// apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICassoFlowAuthorizationRepository } from '../application/casso-flow-authorization-repository.port';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowAuthorizationOrmEntity } from './casso-flow-authorization.orm-entity';

@Injectable()
export class TypeOrmCassoFlowAuthorizationRepository
  extends BaseRepository<CassoFlowAuthorizationOrmEntity>
  implements ICassoFlowAuthorizationRepository
{
  constructor(
    @InjectRepository(CassoFlowAuthorizationOrmEntity)
    repo: Repository<CassoFlowAuthorizationOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByIdUnscoped(id: string): Promise<CassoFlowAuthorization | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CassoFlowAuthorization | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(CassoFlowAuthorizationOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async findByBusinessIdForOrganization(
    businessId: string,
    organizationId: string,
  ): Promise<CassoFlowAuthorization | null> {
    const row = await this.ormRepo.findOne({
      where: { businessId, organizationId },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async save(
    authorization: CassoFlowAuthorization,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      authorization,
      manager,
      authorization.organizationId,
    );
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPattern typeorm-casso-flow-authorization.repository.spec.ts` (from `apps/backend`)
Expected: PASS, 3 tests

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/casso-flow-authorization-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.spec.ts
git commit -m "feat: add CassoFlowAuthorization repository port + TypeORM implementation"
```

---

## Task 4: Infrastructure — `BankConnection` ORM entity + port + repository changes

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts`

**Interfaces:**
- Consumes: `BankConnection` (Task 2).
- Produces: `IBankConnectionRepository` gains `findByAccountNumbers(accountNumbers: string[]): Promise<Map<string, BankConnection>>` and `countActiveByAuthorization(cassoFlowAuthorizationId: string, manager: EntityManager): Promise<number>`; loses `findActiveOrReauthorizableByOrganizationForUpdate` (no longer used by any usecase after Task 8).

- [ ] **Step 1: Update the ORM entity**

Replace `apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts` with:

```ts
// apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BankConnectionStatus } from '../domain/bank-connection';

@Entity({ name: 'bank_connections' })
@Index(['organizationId'])
export class BankConnectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  cassoFlowAuthorizationId: string;

  @Column({ unique: true })
  accountNumber: string;

  @Column()
  bankName: string;

  @Column({ type: 'varchar', default: '' })
  accountHolderName: string;

  @Column({ type: 'varchar' })
  status: BankConnectionStatus;

  @Column({ type: 'timestamp', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Update the port**

Replace `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { BankConnection } from '../domain/bank-connection';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null>;
  // Unscoped on purpose — see typeorm-bank-connection.repository.ts.
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  // Unscoped on purpose — see typeorm-bank-connection.repository.ts.
  findByAccountNumber(accountNumber: string): Promise<BankConnection | null>;
  // Unscoped on purpose, same reasoning as findByAccountNumber: used by the
  // preview/confirm connect flow to classify each Casso Flow account as
  // AVAILABLE / ALREADY_CONNECTED / TAKEN_BY_ANOTHER_ORG *before* knowing
  // which organization (if any) already owns a given accountNumber.
  findByAccountNumbers(
    accountNumbers: string[],
  ): Promise<Map<string, BankConnection>>;
  findPage(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<BankConnection[]>;
  count(organizationId: string): Promise<number>;
  hasActiveByOrganization(organizationId: string): Promise<boolean>;
  countActiveByOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<number>;
  countActiveByAuthorization(
    cassoFlowAuthorizationId: string,
    manager: EntityManager,
  ): Promise<number>;
  save(connection: BankConnection, manager?: EntityManager): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
```

- [ ] **Step 3: Write the failing repository tests**

Replace `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts` with:

```ts
// apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts
import { TypeOrmBankConnectionRepository } from './typeorm-bank-connection.repository';

describe('TypeOrmBankConnectionRepository', () => {
  describe('findByAccountNumbers', () => {
    it('returns a map keyed by accountNumber, using a single IN query', async () => {
      const find = jest.fn().mockResolvedValue([
        { id: 'conn-1', accountNumber: '111', organizationId: 'org-1' },
        { id: 'conn-2', accountNumber: '222', organizationId: 'org-2' },
      ]);
      const ormRepo = { find } as never;
      const repo = new TypeOrmBankConnectionRepository(ormRepo, {} as never);

      const result = await repo.findByAccountNumbers(['111', '222', '333']);

      expect(result.size).toBe(2);
      expect(result.get('111')?.id).toBe('conn-1');
      expect(result.get('222')?.id).toBe('conn-2');
      expect(result.has('333')).toBe(false);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('returns an empty map without querying when given no account numbers', async () => {
      const find = jest.fn();
      const ormRepo = { find } as never;
      const repo = new TypeOrmBankConnectionRepository(ormRepo, {} as never);

      const result = await repo.findByAccountNumbers([]);

      expect(result.size).toBe(0);
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('countActiveByAuthorization', () => {
    it('counts ACTIVE connections scoped to one authorization', async () => {
      const query = jest.fn().mockResolvedValue([{ count: '3' }]);
      const manager = { query } as never;
      const repo = new TypeOrmBankConnectionRepository({} as never, {} as never);

      const result = await repo.countActiveByAuthorization('auth-1', manager);

      expect(result).toBe(3);
      expect(query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM bank_connections WHERE "cassoFlowAuthorizationId" = $1 AND status = $2',
        ['auth-1', 'ACTIVE'],
      );
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPattern typeorm-bank-connection.repository.spec.ts` (from `apps/backend`)
Expected: FAIL — `findByAccountNumbers`/`countActiveByAuthorization` are not functions

- [ ] **Step 5: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts` with:

```ts
// apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type EntityManager,
  type FindOptionsWhere,
  In,
  type Repository,
} from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IBankConnectionRepository } from '../application/bank-connection-repository.port';
import { BankConnection } from '../domain/bank-connection';
import { BankConnectionOrmEntity } from './bank-connection.orm-entity';

@Injectable()
export class TypeOrmBankConnectionRepository
  extends BaseRepository<BankConnectionOrmEntity>
  implements IBankConnectionRepository
{
  constructor(
    @InjectRepository(BankConnectionOrmEntity)
    repo: Repository<BankConnectionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<BankConnection | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<BankConnectionOrmEntity>);
    return row ? new BankConnection(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(BankConnectionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankConnection(row) : null;
  }

  async findByIdUnscoped(id: string): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new BankConnection(row) : null;
  }

  async findByAccountNumber(
    accountNumber: string,
  ): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { accountNumber } });
    return row ? new BankConnection(row) : null;
  }

  async findByAccountNumbers(
    accountNumbers: string[],
  ): Promise<Map<string, BankConnection>> {
    if (accountNumbers.length === 0) return new Map();
    const rows = await this.ormRepo.find({
      where: { accountNumber: In(accountNumbers) },
    });
    return new Map(rows.map((row) => [row.accountNumber, new BankConnection(row)]));
  }

  async save(
    connection: BankConnection,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      connection,
      manager,
      connection.organizationId,
    );
  }

  async findPage(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<BankConnection[]> {
    const rows = await this.ormRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => new BankConnection(row));
  }

  async count(organizationId: string): Promise<number> {
    return this.ormRepo.count({ where: { organizationId } });
  }

  async hasActiveByOrganization(organizationId: string): Promise<boolean> {
    return (
      (await this.ormRepo.count({
        where: { organizationId, status: 'ACTIVE' },
      })) > 0
    );
  }

  async countActiveByOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM bank_connections WHERE "organizationId" = $1 AND status = $2',
      [organizationId, 'ACTIVE'],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countActiveByAuthorization(
    cassoFlowAuthorizationId: string,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM bank_connections WHERE "cassoFlowAuthorizationId" = $1 AND status = $2',
      [cassoFlowAuthorizationId, 'ACTIVE'],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPattern typeorm-bank-connection.repository.spec.ts` (from `apps/backend`)
Expected: PASS, 3 tests

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts
git commit -m "feat: BankConnection repository gains findByAccountNumbers/countActiveByAuthorization"
```

**Note:** `findActiveOrReauthorizableByOrganizationForUpdate` is removed from both the port and the implementation in this task — its only caller (`ConnectCassoFlowUseCase`) is rewritten in Task 8. Until Task 8 lands, `connect-casso-flow.usecase.ts` will fail to compile; expected mid-plan, same as Task 2's note.

---

## Task 5: Migration — `casso_flow_authorizations` table + backfill

Migrations are TDD-exempt per AGENTS.md, but this repo's convention is every migration still ships a `.spec.ts` asserting the exact SQL strings passed to `queryRunner.query` (see any file under `apps/backend/src/database/migrations/`) — follow that convention here without a RED step.

**Files:**
- Create: `apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.ts`
- Create: `apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.spec.ts`

**Interfaces:**
- Consumes: nothing (raw SQL only).
- Produces: `casso_flow_authorizations` table; `bank_connections.cassoFlowAuthorizationId` (NOT NULL, FK), `bank_connections.accountHolderName`; drops `bank_connections.encryptedCassoApiKey`/`encryptedSecureToken`.

- [ ] **Step 1: Write the migration**

```ts
// apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCassoFlowAuthorizations20260901000000
  implements MigrationInterface
{
  name = 'AddCassoFlowAuthorizations20260901000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "casso_flow_authorizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "businessId" character varying,
        "encryptedApiKey" text NOT NULL,
        "encryptedSecureToken" text NOT NULL,
        "createdAt" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_casso_flow_authorizations_organizationId" ON "casso_flow_authorizations" ("organizationId")',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "cassoFlowAuthorizationId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "accountHolderName" character varying NOT NULL DEFAULT \'\'',
    );
    // Backfill: one CassoFlowAuthorization per pre-existing BankConnection,
    // copying its encrypted key/secret verbatim (no re-encryption).
    // businessId is left NULL — unknown for connections created before this
    // feature existed; the first rotate against that authorization adopts a
    // real businessId (see application-layer RotateCassoFlowAuthorizationUseCase).
    await queryRunner.query(`
      DO $$
      DECLARE
        conn RECORD;
        new_auth_id uuid;
      BEGIN
        FOR conn IN
          SELECT "id", "organizationId", "encryptedCassoApiKey", "encryptedSecureToken"
          FROM "bank_connections"
          WHERE "cassoFlowAuthorizationId" IS NULL
        LOOP
          new_auth_id := gen_random_uuid();
          INSERT INTO "casso_flow_authorizations"
            ("id", "organizationId", "businessId", "encryptedApiKey", "encryptedSecureToken", "createdAt")
          VALUES
            (new_auth_id, conn."organizationId", NULL, conn."encryptedCassoApiKey", conn."encryptedSecureToken", now());
          UPDATE "bank_connections" SET "cassoFlowAuthorizationId" = new_auth_id WHERE "id" = conn."id";
        END LOOP;
      END $$
    `);
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ALTER COLUMN "cassoFlowAuthorizationId" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD CONSTRAINT "FK_bank_connections_casso_flow_authorization" FOREIGN KEY ("cassoFlowAuthorizationId") REFERENCES "casso_flow_authorizations" ("id")',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedCassoApiKey" text',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedSecureToken" text',
    );
    await queryRunner.query(`
      UPDATE "bank_connections" bc
      SET "encryptedCassoApiKey" = a."encryptedApiKey",
          "encryptedSecureToken" = a."encryptedSecureToken"
      FROM "casso_flow_authorizations" a
      WHERE bc."cassoFlowAuthorizationId" = a."id"
    `);
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP CONSTRAINT IF EXISTS "FK_bank_connections_casso_flow_authorization"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "cassoFlowAuthorizationId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountHolderName"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "casso_flow_authorizations"');
  }
}
```

- [ ] **Step 2: Write the matching spec**

```ts
// apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddCassoFlowAuthorizations20260901000000 } from './20260901000000-add-casso-flow-authorizations';

describe('AddCassoFlowAuthorizations20260901000000', () => {
  it('creates the table, alters bank_connections, backfills, and drops the old columns', async () => {
    const migration = new AddCassoFlowAuthorizations20260901000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "casso_flow_authorizations"'),
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE INDEX IF NOT EXISTS "IDX_casso_flow_authorizations_organizationId" ON "casso_flow_authorizations" ("organizationId")',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "cassoFlowAuthorizationId" uuid',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "accountHolderName" character varying NOT NULL DEFAULT \'\'',
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DO $$'));
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ALTER COLUMN "cassoFlowAuthorizationId" SET NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD CONSTRAINT "FK_bank_connections_casso_flow_authorization" FOREIGN KEY ("cassoFlowAuthorizationId") REFERENCES "casso_flow_authorizations" ("id")',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
  });

  it('reverts by restoring the old columns, copying values back, and dropping the new table', async () => {
    const migration = new AddCassoFlowAuthorizations20260901000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedCassoApiKey" text',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "encryptedSecureToken" text',
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "bank_connections" bc'));
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP CONSTRAINT IF EXISTS "FK_bank_connections_casso_flow_authorization"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "cassoFlowAuthorizationId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountHolderName"',
    );
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "casso_flow_authorizations"');
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npx jest --testPathPattern 20260901000000-add-casso-flow-authorizations.spec.ts` (from `apps/backend`)
Expected: PASS, 2 tests

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.ts apps/backend/src/database/migrations/20260901000000-add-casso-flow-authorizations.spec.ts
git commit -m "feat: add casso_flow_authorizations table and backfill migration"
```

**Do not run this migration against the dev database yet** — Tasks 6–13 still reference the old `BankConnection.encryptedCassoApiKey`/`encryptedSecureToken` fields and won't compile/run correctly until they're done. Run `pnpm --filter @casso-ledger/backend migration:run` (or the project's equivalent) only after Task 16 (e2e test fix) passes.

---

## Task 6: `ICassoFlowIntegrationAdapter.getAccountInfo` returns every linked account + `businessId`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts`

**Interfaces:**
- Produces: `CassoFlowBankAccount { accountNumber: string; bankName: string; accountHolderName: string }`, `CassoFlowAccountInfo { businessId: string; accounts: CassoFlowBankAccount[] }`. `getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo>` (was `Promise<{ accountNumber; bankName }>`, single account).

- [ ] **Step 1: Update the port**

```ts
// apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts
export interface CassoFlowBankAccount {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export interface CassoFlowAccountInfo {
  businessId: string;
  accounts: CassoFlowBankAccount[];
}

export interface ICassoFlowIntegrationAdapter {
  getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo>;
  registerWebhook(apiKey: string, secureToken: string): Promise<void>;
  invalidateToken(apiKey: string): Promise<void>;
  getTransactions(apiKey: string): Promise<unknown[]>;
}

export const CASSO_FLOW_INTEGRATION_ADAPTER = Symbol(
  'CASSO_FLOW_INTEGRATION_ADAPTER',
);

export class CassoFlowUnauthorizedError extends Error {
  constructor() {
    super(
      'Casso Flow API Key rejected (401/403) — connection requires reauthorization',
    );
    this.name = 'CassoFlowUnauthorizedError';
  }
}
```

- [ ] **Step 2: Write the failing tests**

Replace the `describe('getAccountInfo', ...)` block in `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts` with:

```ts
  describe('getAccountInfo', () => {
    it('reads businessId and every linked bank account from bankAccs', async () => {
      const secondBankAcc = {
        ...realBankAcc,
        id: 16609,
        bank: { ...realBankAcc.bank, fullName: 'VPBank' },
        bankAccountName: 'TRAN THI B',
        bankSubAccId: '88888888',
      };
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, userInfoResponse([realBankAcc, secondBankAcc])),
        );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result).toEqual({
        businessId: '17122',
        accounts: [
          {
            accountNumber: '0393873630',
            bankName: 'Ngân hàng TMCP Quân đội',
            accountHolderName: 'LE NGOC ANH',
          },
          {
            accountNumber: '88888888',
            bankName: 'VPBank',
            accountHolderName: 'TRAN THI B',
          },
        ],
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/userInfo');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
    });

    it('defaults accountHolderName to an empty string when Casso Flow omits it', async () => {
      const accWithoutHolderName = { ...realBankAcc, bankAccountName: undefined };
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, userInfoResponse([accWithoutHolderName])),
        ) as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result.accounts[0]?.accountHolderName).toBe('');
    });

    it('throws if bankAccs is empty (no bank account linked yet)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, userInfoResponse([]))) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'no linked bank account',
      );
    });

    it('throws if business.id is missing', async () => {
      const responseWithoutBusiness = {
        error: 0,
        message: 'success',
        data: { user: { id: 20841, email: 'test@example.com' }, bankAccs: [realBankAcc] },
      };
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, responseWithoutBusiness)) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'business.id',
      );
    });

    it('throws CassoFlowUnauthorizedError on a 401', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('bad-key')).rejects.toThrow(
        'Casso Flow API Key rejected',
      );
    });
  });
```

Also update the `retry` describe block's assertion (still exercises `getAccountInfo`, now checks the new shape):

```ts
  describe('retry', () => {
    it('retries a 503 up to 3 times with backoff', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(503, {}))
        .mockResolvedValueOnce(
          jsonResponse(200, userInfoResponse([realBankAcc])),
        );
      global.fetch = fetchMock as never;
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
        fn: () => void,
      ) => {
        fn();
        return 0 as never;
      }) as never);
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result.accounts[0]?.accountNumber).toBe('0393873630');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPattern casso-flow.adapter.spec.ts` (from `apps/backend`)
Expected: FAIL — result shape mismatch (`result.accounts` undefined, still returns flat `{ accountNumber, bankName }`)

- [ ] **Step 4: Write minimal implementation**

Replace the `getAccountInfo` method in `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts` with:

```ts
  async getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo> {
    const data = await this.request<Record<string, unknown>>(
      '/v2/userInfo',
      { method: 'GET' },
      apiKey,
    );
    const payload = this.unwrap(data);
    const business = payload.business as Record<string, unknown> | undefined;
    const businessId = business?.id;
    if (businessId === undefined || businessId === null) {
      throw new Error(
        'Casso Flow /v2/userInfo response is missing data.business.id',
      );
    }
    const bankAccs = payload.bankAccs;
    if (!Array.isArray(bankAccs) || bankAccs.length === 0) {
      throw new Error(
        'Casso Flow /v2/userInfo response has no linked bank account (bankAccs is empty)',
      );
    }
    const accounts = bankAccs.map((raw, index) => {
      const account = raw as Record<string, unknown>;
      const accountNumber = account.bankSubAccId;
      const bank = account.bank as Record<string, unknown> | undefined;
      const bankName = bank?.fullName;
      const accountHolderName = account.bankAccountName;
      if (typeof accountNumber !== 'string' || !accountNumber) {
        throw new Error(
          `Casso Flow /v2/userInfo response is missing bankAccs[${index}].bankSubAccId`,
        );
      }
      if (typeof bankName !== 'string' || !bankName) {
        throw new Error(
          `Casso Flow /v2/userInfo response is missing bankAccs[${index}].bank.fullName`,
        );
      }
      return {
        accountNumber,
        bankName,
        accountHolderName:
          typeof accountHolderName === 'string' ? accountHolderName : '',
      };
    });
    return { businessId: String(businessId), accounts };
  }
```

Also update the import at the top of `casso-flow.adapter.ts`:

```ts
import {
  type CassoFlowAccountInfo,
  CassoFlowUnauthorizedError,
  type ICassoFlowIntegrationAdapter,
} from '../application/casso-flow-integration-adapter.port';
```

(unchanged import statement — only the type `CassoFlowAccountInfo` it refers to changed shape in Step 1; no edit needed here beyond confirming it still compiles.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern casso-flow.adapter.spec.ts` (from `apps/backend`)
Expected: PASS, 7 tests (`getAccountInfo`: 5, `registerWebhook`: 1, `retry`: 1)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts
git commit -m "feat: CassoFlowAdapter.getAccountInfo returns every linked bank account + businessId"
```

**Note:** every current caller of `getAccountInfo` (`ConnectCassoFlowUseCase`, `SyncTransactionsUseCase` — the latter doesn't call it today but will need updating once callers of the old shape are fixed) breaks after this task until Tasks 8–13 update them. Expected mid-plan.

---

## Task 7: Application — `PreviewCassoFlowAccountsUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowIntegrationAdapter.getAccountInfo` (Task 6), `IBankConnectionRepository.findByAccountNumbers` (Task 4).
- Produces: `PreviewCassoFlowAccountsUseCase.execute(input: { organizationId: string; apiKey: string }): Promise<{ businessId: string; accounts: Array<{ accountNumber: string; bankName: string; accountHolderName: string; status: 'ALREADY_CONNECTED' | 'TAKEN_BY_ANOTHER_ORG' | 'AVAILABLE' }> }>`. No DB writes, no `registerWebhook` call.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.spec.ts
import { PreviewCassoFlowAccountsUseCase } from './preview-casso-flow-accounts.usecase';

describe('PreviewCassoFlowAccountsUseCase', () => {
  it('classifies each account as AVAILABLE / ALREADY_CONNECTED / TAKEN_BY_ANOTHER_ORG', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
          { accountNumber: '222', bankName: 'Bank B', accountHolderName: 'B' },
          { accountNumber: '333', bankName: 'Bank C', accountHolderName: 'C' },
        ],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest.fn().mockResolvedValue(
        new Map([
          ['111', { organizationId: 'org-1' }],
          ['222', { organizationId: 'org-2' }],
        ]),
      ),
    };
    const useCase = new PreviewCassoFlowAccountsUseCase(
      adapter as never,
      bankConnectionRepo as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'key-1',
    });

    expect(result.businessId).toBe('biz-1');
    expect(result.accounts).toEqual([
      {
        accountNumber: '111',
        bankName: 'Bank A',
        accountHolderName: 'A',
        status: 'ALREADY_CONNECTED',
      },
      {
        accountNumber: '222',
        bankName: 'Bank B',
        accountHolderName: 'B',
        status: 'TAKEN_BY_ANOTHER_ORG',
      },
      {
        accountNumber: '333',
        bankName: 'Bank C',
        accountHolderName: 'C',
        status: 'AVAILABLE',
      },
    ]);
    expect(bankConnectionRepo.findByAccountNumbers).toHaveBeenCalledWith([
      '111',
      '222',
      '333',
    ]);
    expect(adapter.getAccountInfo).toHaveBeenCalledWith('key-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern preview-casso-flow-accounts.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — `Cannot find module './preview-casso-flow-accounts.usecase'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import type { BankConnection } from '../domain/bank-connection';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';

export type CassoFlowAccountPreviewStatus =
  | 'ALREADY_CONNECTED'
  | 'TAKEN_BY_ANOTHER_ORG'
  | 'AVAILABLE';

export interface CassoFlowAccountPreview {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: CassoFlowAccountPreviewStatus;
}

export interface PreviewCassoFlowAccountsInput {
  organizationId: string;
  apiKey: string;
}

export interface PreviewCassoFlowAccountsResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
}

@Injectable()
export class PreviewCassoFlowAccountsUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
  ) {}

  async execute(
    input: PreviewCassoFlowAccountsInput,
  ): Promise<PreviewCassoFlowAccountsResult> {
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      accounts.map((account) => account.accountNumber),
    );
    return {
      businessId,
      accounts: accounts.map((account) => ({
        ...account,
        status: this.classify(
          account.accountNumber,
          input.organizationId,
          existing,
        ),
      })),
    };
  }

  private classify(
    accountNumber: string,
    organizationId: string,
    existing: Map<string, BankConnection>,
  ): CassoFlowAccountPreviewStatus {
    const row = existing.get(accountNumber);
    if (!row) return 'AVAILABLE';
    return row.organizationId === organizationId
      ? 'ALREADY_CONNECTED'
      : 'TAKEN_BY_ANOTHER_ORG';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern preview-casso-flow-accounts.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 1 test

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.ts apps/backend/src/modules/bank-connections/application/preview-casso-flow-accounts.usecase.spec.ts
git commit -m "feat: add PreviewCassoFlowAccountsUseCase"
```

---

## Task 8: Application — rewrite `ConnectCassoFlowUseCase` as the "confirm" step

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowIntegrationAdapter` (Task 6), `IBankConnectionRepository` (Task 4), `ICassoFlowAuthorizationRepository` (Task 3), `CassoFlowAuthorization` (Task 1), `BankConnection.reactivate()`/constructor (Task 2), `PlanLimitService.enforceBankConnectionLimit` (existing, unchanged).
- Produces: `ConnectCassoFlowUseCase.execute(input: { organizationId: string; apiKey: string; selectedAccountNumbers: string[] }): Promise<{ connected: Array<{ connectionId: string; accountNumber: string }>; skipped: Array<{ accountNumber: string; reason: 'PLAN_LIMIT_EXCEEDED' | 'TAKEN_BY_ANOTHER_ORG' }> }>`. `bankConnectionId` input param is removed entirely (superseded — every connect goes through account selection now).

- [ ] **Step 1: Write the failing tests**

Replace `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { ConnectCassoFlowUseCase } from './connect-casso-flow.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildDeps(overrides: {
  getAccountInfo?: jest.Mock;
  findByAccountNumbers?: jest.Mock;
  findByBusinessIdForOrganization?: jest.Mock;
  enforceBankConnectionLimit?: jest.Mock;
} = {}) {
  const adapter = {
    getAccountInfo:
      overrides.getAccountInfo ??
      jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
    registerWebhook: jest.fn().mockResolvedValue(undefined),
  };
  const bankConnectionRepo = {
    findByAccountNumbers:
      overrides.findByAccountNumbers ?? jest.fn().mockResolvedValue(new Map()),
    save: jest.fn(),
    countActiveByOrganization: jest.fn().mockResolvedValue(0),
  };
  const authorizationRepo = {
    findByBusinessIdForOrganization:
      overrides.findByBusinessIdForOrganization ??
      jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const auditEventRepo = { save: jest.fn() };
  const planLimitService = {
    enforceBankConnectionLimit:
      overrides.enforceBankConnectionLimit ?? jest.fn().mockResolvedValue(undefined),
  };
  return { adapter, bankConnectionRepo, authorizationRepo, auditEventRepo, planLimitService };
}

describe('ConnectCassoFlowUseCase', () => {
  it('creates a new authorization, registers the webhook once, and connects the selected account', async () => {
    const deps = buildDeps();
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([
      { connectionId: expect.any(String), accountNumber: '111' },
    ]);
    expect(result.skipped).toEqual([]);
    expect(deps.adapter.registerWebhook).toHaveBeenCalledTimes(1);
    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', businessId: 'biz-1' }),
    );
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        accountNumber: '111',
        status: 'ACTIVE',
      }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TOKEN_EXCHANGED' }),
      expect.anything(),
    );
  });

  it('reuses an existing authorization for the same businessId, without re-registering the webhook', async () => {
    const existingAuthorization = new CassoFlowAuthorization({
      id: 'auth-1',
      organizationId: 'org-1',
      businessId: 'biz-1',
      encryptedApiKey: 'old',
      encryptedSecureToken: 'old',
      createdAt: new Date(),
    });
    const deps = buildDeps({
      findByBusinessIdForOrganization: jest
        .fn()
        .mockResolvedValue(existingAuthorization),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ cassoFlowAuthorizationId: 'auth-1' }),
      expect.anything(),
    );
  });

  it('skips accounts already taken by another org, without touching the authorization if none are eligible', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
      findByAccountNumbers: jest.fn().mockResolvedValue(
        new Map([['111', { organizationId: 'org-OTHER' }]]),
      ),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([]);
    expect(result.skipped).toEqual([
      { accountNumber: '111', reason: 'TAKEN_BY_ANOTHER_ORG' },
    ]);
    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
  });

  it('reactivates an existing REQUIRES_REAUTHORIZATION connection instead of creating a new one', async () => {
    const existingConnection = new BankConnection({
      id: 'conn-1',
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-old',
      accountNumber: '111',
      bankName: 'Old Bank',
      accountHolderName: 'OLD NAME',
      status: 'REQUIRES_REAUTHORIZATION',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const deps = buildDeps({
      findByAccountNumbers: jest
        .fn()
        .mockResolvedValue(new Map([['111', existingConnection]])),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111'],
    });

    expect(result.connected).toEqual([
      { connectionId: 'conn-1', accountNumber: '111' },
    ]);
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-1', status: 'ACTIVE' }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'RECONNECTED' }),
      expect.anything(),
    );
  });

  it('stops at the plan limit and reports the remaining accounts as skipped', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
          { accountNumber: '222', bankName: 'Bank B', accountHolderName: 'B' },
        ],
      }),
      enforceBankConnectionLimit: jest
        .fn()
        .mockRejectedValue(
          new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, 'Đã đạt giới hạn gói.'),
        ),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'real-api-key',
      selectedAccountNumbers: ['111', '222'],
    });

    expect(result.connected).toEqual([]);
    expect(result.skipped).toEqual([
      { accountNumber: '111', reason: 'PLAN_LIMIT_EXCEEDED' },
    ]);
  });

  it('propagates a CassoFlowUnauthorizedError for an invalid API Key without persisting anything', async () => {
    const deps = buildDeps({
      getAccountInfo: jest
        .fn()
        .mockRejectedValue(new Error('Casso Flow API Key rejected')),
    });
    const useCase = new ConnectCassoFlowUseCase(
      deps.adapter as never,
      deps.bankConnectionRepo as never,
      deps.authorizationRepo as never,
      deps.auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      deps.planLimitService as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        apiKey: 'bad-key',
        selectedAccountNumbers: ['111'],
      }),
    ).rejects.toThrow('Casso Flow API Key rejected');
    expect(deps.bankConnectionRepo.save).not.toHaveBeenCalled();
    expect(deps.authorizationRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern connect-casso-flow.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — constructor signature mismatch (old usecase takes no `authorizationRepo` param), old `execute` shape doesn't accept `selectedAccountNumbers`

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type CassoFlowBankAccount,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface ConnectCassoFlowInput {
  organizationId: string;
  apiKey: string;
  selectedAccountNumbers: string[];
}

export interface ConnectCassoFlowConnectedItem {
  connectionId: string;
  accountNumber: string;
}

export type ConnectCassoFlowSkippedReason =
  | 'PLAN_LIMIT_EXCEEDED'
  | 'TAKEN_BY_ANOTHER_ORG';

export interface ConnectCassoFlowSkippedItem {
  accountNumber: string;
  reason: ConnectCassoFlowSkippedReason;
}

export interface ConnectCassoFlowResult {
  connected: ConnectCassoFlowConnectedItem[];
  skipped: ConnectCassoFlowSkippedItem[];
}

@Injectable()
export class ConnectCassoFlowUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async execute(input: ConnectCassoFlowInput): Promise<ConnectCassoFlowResult> {
    // External call stays outside any transaction — only the DB writes below are wrapped.
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    const selected = new Set(input.selectedAccountNumbers);
    const candidates = accounts.filter((account) =>
      selected.has(account.accountNumber),
    );
    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      candidates.map((account) => account.accountNumber),
    );

    const skipped: ConnectCassoFlowSkippedItem[] = [];
    const eligible = candidates.filter((account) => {
      const row = existing.get(account.accountNumber);
      if (row && row.organizationId !== input.organizationId) {
        skipped.push({
          accountNumber: account.accountNumber,
          reason: 'TAKEN_BY_ANOTHER_ORG',
        });
        return false;
      }
      return true;
    });

    // Nothing eligible: do not touch CassoFlowAuthorization or call
    // registerWebhook. Two different orgs can hold the same real API Key
    // (Casso's own trust model) — re-registering the webhook here for a
    // request that connects nothing would silently break whichever other
    // org's webhook delivery this key already serves.
    if (eligible.length === 0) {
      return { connected: [], skipped };
    }

    const authorization = await this.findOrCreateAuthorization(
      input.organizationId,
      input.apiKey,
      businessId,
    );

    const connected: ConnectCassoFlowConnectedItem[] = [];
    for (const account of eligible) {
      const connectionId = await this.connectOne(
        input.organizationId,
        account,
        existing.get(account.accountNumber) ?? null,
        authorization.id,
      );
      if (connectionId === null) {
        skipped.push({
          accountNumber: account.accountNumber,
          reason: 'PLAN_LIMIT_EXCEEDED',
        });
        break; // once over the limit, every remaining account will be too
      }
      connected.push({ connectionId, accountNumber: account.accountNumber });
    }

    return { connected, skipped };
  }

  private async findOrCreateAuthorization(
    organizationId: string,
    apiKey: string,
    businessId: string,
  ): Promise<CassoFlowAuthorization> {
    const existingAuthorization =
      await this.authorizationRepo.findByBusinessIdForOrganization(
        businessId,
        organizationId,
      );
    if (existingAuthorization) return existingAuthorization;

    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(apiKey, secureToken);
    const authorization = new CassoFlowAuthorization({
      id: randomUUID(),
      organizationId,
      businessId,
      encryptedApiKey: encryptToken(apiKey, this.encryptionKey),
      encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
      createdAt: new Date(),
    });
    await this.authorizationRepo.save(authorization);
    return authorization;
  }

  private async connectOne(
    organizationId: string,
    account: CassoFlowBankAccount,
    existingConnection: BankConnection | null,
    cassoFlowAuthorizationId: string,
  ): Promise<string | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.planLimitService.enforceBankConnectionLimit(manager, () =>
          this.bankConnectionRepo.countActiveByOrganization(
            organizationId,
            manager,
          ),
        );
        const now = new Date();
        const connection =
          existingConnection && existingConnection.status !== 'ACTIVE'
            ? existingConnection.reactivate({
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName: account.accountHolderName,
                cassoFlowAuthorizationId,
              })
            : new BankConnection({
                id: randomUUID(),
                organizationId,
                cassoFlowAuthorizationId,
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName: account.accountHolderName,
                status: 'ACTIVE',
                connectedAt: now,
                lastSyncAt: null,
                revokedAt: null,
                createdAt: now,
              });
        await this.bankConnectionRepo.save(connection, manager);
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: existingConnection ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
            metadata: { accountNumber: account.accountNumber },
            createdAt: now,
          }),
          manager,
        );
        return connection.id;
      });
    } catch (error) {
      if (error instanceof AppError && error.errorCode === ErrorCode.PLAN_LIMIT_EXCEEDED) {
        return null;
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern connect-casso-flow.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts
git commit -m "feat: rewrite ConnectCassoFlowUseCase as the multi-account confirm step"
```

---

## Task 9: Repository extensions + `PreviewCassoFlowAuthorizationRotationUseCase`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/casso-flow-authorization-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.spec.ts`
- Create: `apps/backend/src/modules/bank-connections/application/preview-casso-flow-authorization-rotation.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/preview-casso-flow-authorization-rotation.usecase.spec.ts`

**Interfaces:**
- Produces: `IBankConnectionRepository.findByAuthorizationId(cassoFlowAuthorizationId: string): Promise<BankConnection[]>`; `ICassoFlowAuthorizationRepository.findById(id: string): Promise<CassoFlowAuthorization | null>` (org-scoped, unlocked — for preview's read-only use); `PreviewCassoFlowAuthorizationRotationUseCase.execute(input: { organizationId: string; cassoFlowAuthorizationId: string; apiKey: string }): Promise<{ businessId: string; accounts: CassoFlowAccountPreview[]; missingAccountNumbers: string[] }>`.

- [ ] **Step 1: Add `findByAuthorizationId` to `IBankConnectionRepository`**

In `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`, add this method to the interface (after `findByAccountNumbers`):

```ts
  findByAuthorizationId(
    cassoFlowAuthorizationId: string,
  ): Promise<BankConnection[]>;
```

- [ ] **Step 2: Add `findById` to `ICassoFlowAuthorizationRepository`**

In `apps/backend/src/modules/bank-connections/application/casso-flow-authorization-repository.port.ts`, add this method to the interface (after the `findByIdUnscoped` comment block, before `findByIdForUpdate`):

```ts
  findById(id: string): Promise<CassoFlowAuthorization | null>;
```

- [ ] **Step 3: Write the failing repository tests**

Add to `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.spec.ts` (inside the existing `describe('TypeOrmBankConnectionRepository', ...)` block, after `countActiveByAuthorization`):

```ts
  describe('findByAuthorizationId', () => {
    it('lists every connection under one authorization', async () => {
      const find = jest
        .fn()
        .mockResolvedValue([{ id: 'conn-1', accountNumber: '111', organizationId: 'org-1' }]);
      const ormRepo = { find } as never;
      const repo = new TypeOrmBankConnectionRepository(ormRepo, {} as never);

      const result = await repo.findByAuthorizationId('auth-1');

      expect(result).toHaveLength(1);
      expect(find).toHaveBeenCalledWith({
        where: { cassoFlowAuthorizationId: 'auth-1' },
      });
    });
  });
```

Add to `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.spec.ts` (inside the existing `describe`, after `findByIdUnscoped`):

```ts
  describe('findById', () => {
    it('looks up by id scoped to the current organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const tenantContext = { getOrganizationId: () => 'org-1' };
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        tenantContext as never,
      );

      await repo.findById('auth-1');

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'auth-1', organizationId: 'org-1' },
      });
    });
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest --testPathPattern "typeorm-bank-connection.repository.spec.ts|typeorm-casso-flow-authorization.repository.spec.ts"` (from `apps/backend`)
Expected: FAIL — `findByAuthorizationId`/`findById` are not functions

- [ ] **Step 5: Implement both repository methods**

In `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`, add (after `findByAccountNumbers`):

```ts
  async findByAuthorizationId(
    cassoFlowAuthorizationId: string,
  ): Promise<BankConnection[]> {
    const rows = await this.ormRepo.find({
      where: { cassoFlowAuthorizationId },
    });
    return rows.map((row) => new BankConnection(row));
  }
```

In `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-flow-authorization.repository.ts`, add (after `findByIdUnscoped`):

```ts
  async findById(id: string): Promise<CassoFlowAuthorization | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { id, organizationId },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --testPathPattern "typeorm-bank-connection.repository.spec.ts|typeorm-casso-flow-authorization.repository.spec.ts"` (from `apps/backend`)
Expected: PASS, 4 + 4 tests

- [ ] **Step 7: Write the failing `PreviewCassoFlowAuthorizationRotationUseCase` test**

```ts
// apps/backend/src/modules/bank-connections/application/preview-casso-flow-authorization-rotation.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { PreviewCassoFlowAuthorizationRotationUseCase } from './preview-casso-flow-authorization-rotation.usecase';

function buildAuthorization(businessId: string | null): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId,
    encryptedApiKey: 'old',
    encryptedSecureToken: 'old',
    createdAt: new Date(),
  });
}

function buildConnection(accountNumber: string): BankConnection {
  return new BankConnection({
    id: `conn-${accountNumber}`,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber,
    bankName: 'Old Bank',
    accountHolderName: 'OLD NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('PreviewCassoFlowAuthorizationRotationUseCase', () => {
  it('classifies accounts and flags currently-connected accounts missing from the new key', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'Bank A', accountHolderName: 'A' },
        ],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest.fn().mockResolvedValue(
        new Map([['111', buildConnection('111')]]),
      ),
      findByAuthorizationId: jest
        .fn()
        .mockResolvedValue([buildConnection('111'), buildConnection('222')]),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization('biz-1')),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      bankConnectionRepo as never,
      authorizationRepo as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.businessId).toBe('biz-1');
    expect(result.accounts).toEqual([
      {
        accountNumber: '111',
        bankName: 'Bank A',
        accountHolderName: 'A',
        status: 'ALREADY_CONNECTED',
      },
    ]);
    expect(result.missingAccountNumbers).toEqual(['222']);
  });

  it('rejects when the new key belongs to a different business than the target authorization', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-DIFFERENT',
        accounts: [],
      }),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization('biz-1')),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      { findByAccountNumbers: jest.fn(), findByAuthorizationId: jest.fn() } as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
    });
  });

  it('skips the businessId check when the target authorization has none yet (migration-backfilled)', async () => {
    const adapter = {
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [],
      }),
    };
    const bankConnectionRepo = {
      findByAccountNumbers: jest.fn().mockResolvedValue(new Map()),
      findByAuthorizationId: jest.fn().mockResolvedValue([]),
    };
    const authorizationRepo = {
      findById: jest.fn().mockResolvedValue(buildAuthorization(null)),
    };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      adapter as never,
      bankConnectionRepo as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
      }),
    ).resolves.toMatchObject({ businessId: 'biz-1' });
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const authorizationRepo = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new PreviewCassoFlowAuthorizationRotationUseCase(
      { getAccountInfo: jest.fn() } as never,
      { findByAccountNumbers: jest.fn(), findByAuthorizationId: jest.fn() } as never,
      authorizationRepo as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        apiKey: 'new-key',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx jest --testPathPattern preview-casso-flow-authorization-rotation.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — `Cannot find module './preview-casso-flow-authorization-rotation.usecase'`

- [ ] **Step 9: Write minimal implementation**

```ts
// apps/backend/src/modules/bank-connections/application/preview-casso-flow-authorization-rotation.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import type {
  CassoFlowAccountPreview,
  CassoFlowAccountPreviewStatus,
} from './preview-casso-flow-accounts.usecase';

export interface PreviewCassoFlowAuthorizationRotationInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  apiKey: string;
}

export interface PreviewCassoFlowAuthorizationRotationResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
  missingAccountNumbers: string[];
}

@Injectable()
export class PreviewCassoFlowAuthorizationRotationUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(
    input: PreviewCassoFlowAuthorizationRotationInput,
  ): Promise<PreviewCassoFlowAuthorizationRotationResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );

    if (authorization.businessId !== null && authorization.businessId !== businessId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã doanh nghiệp từ API Key mới không khớp với liên kết hiện tại. Dùng nút "Kết nối ngân hàng" nếu muốn thêm một liên kết mới.',
        { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
      );
    }

    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      accounts.map((account) => account.accountNumber),
    );
    const currentConnections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    const newAccountNumbers = new Set(
      accounts.map((account) => account.accountNumber),
    );
    const missingAccountNumbers = currentConnections
      .filter((connection) => !newAccountNumbers.has(connection.accountNumber))
      .map((connection) => connection.accountNumber);

    return {
      businessId,
      accounts: accounts.map((account) => ({
        ...account,
        status: this.classify(account.accountNumber, input.organizationId, existing),
      })),
      missingAccountNumbers,
    };
  }

  private classify(
    accountNumber: string,
    organizationId: string,
    existing: Map<string, BankConnection>,
  ): CassoFlowAccountPreviewStatus {
    const row = existing.get(accountNumber);
    if (!row) return 'AVAILABLE';
    return row.organizationId === organizationId
      ? 'ALREADY_CONNECTED'
      : 'TAKEN_BY_ANOTHER_ORG';
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx jest --testPathPattern preview-casso-flow-authorization-rotation.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 4 tests

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application apps/backend/src/modules/bank-connections/infrastructure
git commit -m "feat: add PreviewCassoFlowAuthorizationRotationUseCase"
```

---

## Task 10: Application — `RotateCassoFlowAuthorizationUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowAuthorizationRepository.{findById,findByIdForUpdate,save}` (Tasks 3, 9), `IBankConnectionRepository.{findByAuthorizationId,save}` (Tasks 4, 9), `CassoFlowAuthorization.rotate()` (Task 1), `BankConnection.rotateApiKey()` (Task 2).
- Produces: `RotateCassoFlowAuthorizationUseCase.execute(input: { organizationId: string; cassoFlowAuthorizationId: string; apiKey: string }): Promise<{ rotatedAccountNumbers: string[]; newlyDiscovered: Array<{ accountNumber: string; bankName: string; accountHolderName: string }> }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { RotateCassoFlowAuthorizationUseCase } from './rotate-casso-flow-authorization.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildAuthorization(
  businessId: string | null = 'biz-1',
): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId,
    encryptedApiKey: 'old-key',
    encryptedSecureToken: 'old-secret',
    createdAt: new Date(),
  });
}

function buildConnection(
  accountNumber: string,
  status: BankConnection['status'] = 'ACTIVE',
): BankConnection {
  return new BankConnection({
    id: `conn-${accountNumber}`,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber,
    bankName: 'Old Bank',
    accountHolderName: 'OLD NAME',
    status,
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function buildDeps(overrides: {
  getAccountInfo?: jest.Mock;
  authorization?: CassoFlowAuthorization | null;
  currentConnections?: BankConnection[];
} = {}) {
  const authorization =
    overrides.authorization === undefined
      ? buildAuthorization()
      : overrides.authorization;
  const adapter = {
    getAccountInfo:
      overrides.getAccountInfo ??
      jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'New Bank', accountHolderName: 'NEW NAME' },
        ],
      }),
    registerWebhook: jest.fn().mockResolvedValue(undefined),
  };
  const bankConnectionRepo = {
    findByAuthorizationId: jest
      .fn()
      .mockResolvedValue(overrides.currentConnections ?? [buildConnection('111')]),
    save: jest.fn(),
  };
  const authorizationRepo = {
    findById: jest.fn().mockResolvedValue(authorization),
    findByIdForUpdate: jest.fn().mockResolvedValue(authorization),
    save: jest.fn(),
  };
  const auditEventRepo = { save: jest.fn() };
  return { adapter, bankConnectionRepo, authorizationRepo, auditEventRepo };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new RotateCassoFlowAuthorizationUseCase(
    deps.adapter as never,
    deps.bankConnectionRepo as never,
    deps.authorizationRepo as never,
    deps.auditEventRepo as never,
    dataSource as never,
    encryptionKey,
  );
}

describe('RotateCassoFlowAuthorizationUseCase', () => {
  it('rotates every ACTIVE connection matching the new key and updates the authorization', async () => {
    const deps = buildDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.rotatedAccountNumbers).toEqual(['111']);
    expect(deps.adapter.registerWebhook).toHaveBeenCalledTimes(1);
    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1' }),
      expect.anything(),
    );
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountNumber: '111',
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
      }),
      expect.anything(),
    );
    expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_KEY_ROTATED' }),
      expect.anything(),
    );
  });

  it('leaves a connection untouched when its account is missing from the new key', async () => {
    const deps = buildDeps({
      currentConnections: [buildConnection('111'), buildConnection('222')],
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.rotatedAccountNumbers).toEqual(['111']);
    expect(deps.bankConnectionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not rotate a matched connection that is not ACTIVE', async () => {
    const deps = buildDeps({
      currentConnections: [buildConnection('111', 'ERROR')],
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.rotatedAccountNumbers).toEqual([]);
    expect(deps.bankConnectionRepo.save).not.toHaveBeenCalled();
  });

  it('reports accounts from the new key not yet connected under this authorization', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          { accountNumber: '111', bankName: 'New Bank', accountHolderName: 'NEW NAME' },
          { accountNumber: '999', bankName: 'Bank X', accountHolderName: 'X' },
        ],
      }),
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(result.newlyDiscovered).toEqual([
      { accountNumber: '999', bankName: 'Bank X', accountHolderName: 'X' },
    ]);
  });

  it('rejects when the new key belongs to a different business', async () => {
    const deps = buildDeps({
      getAccountInfo: jest.fn().mockResolvedValue({
        businessId: 'biz-DIFFERENT',
        accounts: [],
      }),
    });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        apiKey: 'new-key',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
    });
    expect(deps.adapter.registerWebhook).not.toHaveBeenCalled();
  });

  it('adopts the businessId when the authorization has none yet', async () => {
    const deps = buildDeps({ authorization: buildAuthorization(null) });
    const useCase = buildUseCase(deps);

    await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      apiKey: 'new-key',
    });

    expect(deps.authorizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1' }),
      expect.anything(),
    );
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const deps = buildDeps({ authorization: null });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        apiKey: 'new-key',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern rotate-casso-flow-authorization.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — `Cannot find module './rotate-casso-flow-authorization.usecase'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.ts
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type CassoFlowBankAccount,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface RotateCassoFlowAuthorizationInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  apiKey: string;
}

export interface RotateCassoFlowAuthorizationResult {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowBankAccount[];
}

@Injectable()
export class RotateCassoFlowAuthorizationUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
  ) {}

  async execute(
    input: RotateCassoFlowAuthorizationInput,
  ): Promise<RotateCassoFlowAuthorizationResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    // External calls stay outside the transaction — only the DB writes below are wrapped.
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    this.assertBusinessIdMatches(authorization.businessId, businessId);

    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(input.apiKey, secureToken);

    const currentConnections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    const currentAccountNumbers = new Set(
      currentConnections.map((connection) => connection.accountNumber),
    );
    const accountsByNumber = new Map(
      accounts.map((account) => [account.accountNumber, account]),
    );

    const rotatedAccountNumbers: string[] = [];
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.authorizationRepo.findByIdForUpdate(
        input.cassoFlowAuthorizationId,
        manager,
      );
      if (!locked) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy liên kết Casso Flow.',
        );
      }
      this.assertBusinessIdMatches(locked.businessId, businessId);

      const rotatedAuthorization = locked.rotate({
        businessId,
        encryptedApiKey: encryptToken(input.apiKey, this.encryptionKey),
        encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
      });
      await this.authorizationRepo.save(rotatedAuthorization, manager);

      for (const connection of currentConnections) {
        if (connection.status !== 'ACTIVE') continue;
        const matched = accountsByNumber.get(connection.accountNumber);
        if (!matched) continue; // missing from the new key — left untouched

        const rotatedConnection = connection.rotateApiKey({
          bankName: matched.bankName,
          accountHolderName: matched.accountHolderName,
        });
        await this.bankConnectionRepo.save(rotatedConnection, manager);
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: 'API_KEY_ROTATED',
            metadata: { accountNumber: connection.accountNumber },
            createdAt: new Date(),
          }),
          manager,
        );
        rotatedAccountNumbers.push(connection.accountNumber);
      }
    });

    const newlyDiscovered = accounts.filter(
      (account) => !currentAccountNumbers.has(account.accountNumber),
    );

    return { rotatedAccountNumbers, newlyDiscovered };
  }

  private assertBusinessIdMatches(
    storedBusinessId: string | null,
    newBusinessId: string,
  ): void {
    if (storedBusinessId !== null && storedBusinessId !== newBusinessId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã doanh nghiệp từ API Key mới không khớp với liên kết hiện tại. Dùng nút "Kết nối ngân hàng" nếu muốn thêm một liên kết mới.',
        { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern rotate-casso-flow-authorization.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.ts apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.spec.ts
git commit -m "feat: add RotateCassoFlowAuthorizationUseCase"
```

---

## Task 11: Application — `DisconnectConnectionUseCase` only invalidates the shared key when it was the last account

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankConnectionRepository.countActiveByAuthorization` (Task 4), `ICassoFlowAuthorizationRepository.findByIdUnscoped` (Task 3).
- Produces: `DisconnectConnectionUseCase` constructor gains `@Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY) authorizationRepo: ICassoFlowAuthorizationRepository` as its 8th parameter. `execute(connectionId: string): Promise<void>` signature unchanged.

- [ ] **Step 1: Write the failing tests**

Replace `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port';
import { DisconnectConnectionUseCase } from './disconnect-connection.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'MOCK NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function authorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: encryptToken('raw-api-key', encryptionKey),
    encryptedSecureToken: 'encrypted-secure-token',
    createdAt: new Date(),
  });
}

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function buildUseCase(overrides: {
  bankConnectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  adapter?: Record<string, jest.Mock>;
  markRequiresReauthorization?: Record<string, jest.Mock>;
}) {
  const connection = activeConnection();
  const bankConnectionRepo = {
    findById: jest.fn().mockResolvedValue(connection),
    findByIdForUpdate: jest.fn().mockResolvedValue(connection),
    countActiveByAuthorization: jest.fn().mockResolvedValue(0),
    save: jest.fn(),
    ...overrides.bankConnectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorization()),
    ...overrides.authorizationRepo,
  };
  const adapter = {
    invalidateToken: jest.fn().mockResolvedValue(undefined),
    ...overrides.adapter,
  };
  const auditEventRepo = { save: jest.fn() };
  const markRequiresReauthorization = {
    handleAdapterError: jest.fn(),
    ...overrides.markRequiresReauthorization,
  };
  const auditContext = { setBefore: jest.fn() };
  const useCase = new DisconnectConnectionUseCase(
    bankConnectionRepo as never,
    adapter as never,
    auditEventRepo as never,
    markRequiresReauthorization as never,
    dataSource as never,
    encryptionKey,
    auditContext as never,
    authorizationRepo as never,
  );
  return { useCase, bankConnectionRepo, authorizationRepo, adapter, auditEventRepo, markRequiresReauthorization, auditContext };
}

describe('DisconnectConnectionUseCase', () => {
  it('disconnects and persists without invalidating the token when sibling connections remain active', async () => {
    const { useCase, bankConnectionRepo, adapter, auditEventRepo } = buildUseCase({
      bankConnectionRepo: { countActiveByAuthorization: jest.fn().mockResolvedValue(2) },
    });

    await useCase.execute('conn-1');

    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISCONNECTED' }),
      expect.anything(),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'DISCONNECTED' }),
      expect.anything(),
    );
    expect(adapter.invalidateToken).not.toHaveBeenCalled();
  });

  it('invalidates the authorization token when this was the last active account under it', async () => {
    const { useCase, adapter } = buildUseCase({
      bankConnectionRepo: { countActiveByAuthorization: jest.fn().mockResolvedValue(0) },
    });

    await useCase.execute('conn-1');

    expect(adapter.invalidateToken).toHaveBeenCalledWith('raw-api-key');
  });

  it('marks requiring reauthorization and rethrows on a 401/403 from invalidateToken, without undoing the already-persisted disconnect', async () => {
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const { useCase, bankConnectionRepo } = buildUseCase({
      bankConnectionRepo: { countActiveByAuthorization: jest.fn().mockResolvedValue(0) },
      adapter: {
        invalidateToken: jest
          .fn()
          .mockRejectedValue(new CassoFlowUnauthorizedError()),
      },
      markRequiresReauthorization,
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(
      CassoFlowUnauthorizedError,
    );
    expect(markRequiresReauthorization.handleAdapterError).toHaveBeenCalledWith(
      'conn-1',
      '401/403 from invalidateToken',
      expect.any(CassoFlowUnauthorizedError),
    );
    // the disconnect itself already committed before invalidateToken ran
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISCONNECTED' }),
      expect.anything(),
    );
  });

  it('throws AppError when the connection cannot be found', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: { findById: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError if the connection disappears between the unlocked read and the locked re-read', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: { findByIdForUpdate: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern disconnect-connection.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — constructor arity mismatch (old usecase takes 7 args, test passes 8), `invalidateToken` currently always called before the transaction

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

@Injectable()
export class DisconnectConnectionUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly auditContext: AuditContextService,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    this.assertFound(connection);

    let cassoFlowAuthorizationId = connection.cassoFlowAuthorizationId;
    let shouldInvalidateToken = false;

    await this.dataSource.transaction(async (manager) => {
      // Re-fetch under a row lock: the connection may have changed between
      // the unlocked read above and this transaction (e.g. a concurrent
      // disconnect or a sync job marking it REQUIRES_REAUTHORIZATION).
      const locked = await this.bankConnectionRepo.findByIdForUpdate(
        connectionId,
        manager,
      );
      this.assertFound(locked);
      this.auditContext.setBefore(locked);
      cassoFlowAuthorizationId = locked.cassoFlowAuthorizationId;
      await this.bankConnectionRepo.save(locked.disconnect(), manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: locked.organizationId,
          bankConnectionId: connectionId,
          eventType: 'DISCONNECTED',
          metadata: {},
          createdAt: new Date(),
        }),
        manager,
      );
      const remainingActive = await this.bankConnectionRepo.countActiveByAuthorization(
        cassoFlowAuthorizationId,
        manager,
      );
      shouldInvalidateToken = remainingActive === 0;
    });

    if (!shouldInvalidateToken) return;

    const authorization =
      await this.authorizationRepo.findByIdUnscoped(cassoFlowAuthorizationId);
    if (!authorization) return; // defensive — should not happen, the FK guarantees it exists

    // External call stays outside the transaction, same as elsewhere in this module.
    try {
      await this.adapter.invalidateToken(
        decryptToken(authorization.encryptedApiKey, this.encryptionKey),
      );
    } catch (error) {
      await this.markRequiresReauthorization.handleAdapterError(
        connectionId,
        '401/403 from invalidateToken',
        error,
      );
    }
  }

  private assertFound(
    connection: BankConnection | null,
  ): asserts connection is BankConnection {
    if (!connection) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern disconnect-connection.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts
git commit -m "feat: DisconnectConnectionUseCase only invalidates the shared key when it was the last active account"
```

---

## Task 12: Webhooks — `ReceiveWebhookUseCase` resolves the secret via the authorization

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowAuthorizationRepository.findByIdUnscoped` (Task 3).
- Produces: `ReceiveWebhookUseCase` constructor gains `@Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY) authorizationRepo` as its 6th parameter, after `encryptionKey`. `execute()` signature unchanged.

- [ ] **Step 1: Write the failing tests**

Replace `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts` with:

```ts
// apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts
import { encryptToken } from '../../bank-connections/application/token-encryption';
import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const realSecret = 'the-real-secret';

const input = {
  accountNumber: '0011002233',
  webhookSecret: realSecret,
  transactionId: 'TX-1',
  rawPayload: { error: 0, data: { id: 'TX-1', amount: 1_000 } },
};

function connectionWith(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    id: 'conn-1',
    cassoFlowAuthorizationId: 'auth-1',
    isUsable: () => true,
    ...overrides,
  };
}

function authorizationWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'auth-1',
    encryptedSecureToken: encryptToken(realSecret, encryptionKey),
    ...overrides,
  };
}

function buildUseCase(overrides: {
  inboxRepo?: Record<string, jest.Mock>;
  connectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  queue?: Record<string, jest.Mock>;
  dataSource?: Record<string, jest.Mock>;
}) {
  const inboxRepo = { insert: jest.fn(), ...overrides.inboxRepo };
  const connectionRepo = {
    findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()),
    ...overrides.connectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorizationWith()),
    ...overrides.authorizationRepo,
  };
  const queue = { enqueue: jest.fn(), ...overrides.queue };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: object) => Promise<void>) => callback({}),
    ),
    ...overrides.dataSource,
  };
  const useCase = new ReceiveWebhookUseCase(
    inboxRepo as never,
    connectionRepo as never,
    queue as never,
    dataSource as never,
    encryptionKey,
    authorizationRepo as never,
  );
  return { useCase, inboxRepo, connectionRepo, authorizationRepo, queue };
}

describe('ReceiveWebhookUseCase', () => {
  it('resolves by accountNumber, verifies the secret via the authorization, and enqueues', async () => {
    const { useCase, connectionRepo, authorizationRepo, queue } = buildUseCase({});

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(connectionRepo.findByAccountNumber).toHaveBeenCalledWith(
      '0011002233',
    );
    expect(authorizationRepo.findByIdUnscoped).toHaveBeenCalledWith('auth-1');
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('ignores when accountNumber matches no connection', async () => {
    const { useCase } = buildUseCase({
      connectionRepo: { findByAccountNumber: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
  });

  it('ignores when the authorization cannot be found', async () => {
    const { useCase, queue } = buildUseCase({
      authorizationRepo: { findByIdUnscoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('ignores when the secret does not match, without enqueueing', async () => {
    const { useCase, queue } = buildUseCase({
      authorizationRepo: {
        findByIdUnscoped: jest
          .fn()
          .mockResolvedValue(
            authorizationWith({
              encryptedSecureToken: encryptToken('different-secret', encryptionKey),
            }),
          ),
      },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const { useCase, queue } = buildUseCase({
      inboxRepo: {
        insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
      },
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern receive-webhook.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — constructor arity mismatch, `connection.encryptedSecureToken` no longer exists

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts` with:

```ts
// apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from '../../bank-connections/application/bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from '../../bank-connections/application/casso-flow-authorization-repository.port';
import { decryptToken } from '../../bank-connections/application/token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from '../../bank-connections/application/token-encryption-key';
import { equalsConstantTime } from '../../../common/security/constant-time-compare';
import { WebhookInbox } from '../domain/webhook-inbox';
import type { IWebhookInboxRepository } from './webhook-inbox-repository.port';
import {
  DuplicateWebhookError,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';
import {
  type IWebhookJobQueue,
  WEBHOOK_JOB_QUEUE,
} from './webhook-job-queue.port';

export interface ReceiveWebhookInput {
  accountNumber: string;
  webhookSecret: string;
  organizationId?: string;
  transactionId: string;
  rawPayload: Record<string, unknown>;
}

export interface ReceiveWebhookResult {
  received: boolean;
  duplicate?: boolean;
  ignored?: boolean;
}

@Injectable()
export class ReceiveWebhookUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly inboxRepo: IWebhookInboxRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(WEBHOOK_JOB_QUEUE)
    private readonly webhookJobQueue: IWebhookJobQueue,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByAccountNumber(
      input.accountNumber,
    );
    if (!connection) return { received: true, ignored: true };

    const authorization = await this.authorizationRepo.findByIdUnscoped(
      connection.cassoFlowAuthorizationId,
    );
    if (!authorization) return { received: true, ignored: true };

    const expectedSecret = decryptToken(
      authorization.encryptedSecureToken,
      this.encryptionKey,
    );
    if (!equalsConstantTime(input.webhookSecret, expectedSecret)) {
      return { received: true, ignored: true };
    }
    if (
      connection &&
      input.organizationId &&
      input.organizationId !== connection.organizationId
    ) {
      return { received: true, ignored: true };
    }
    if (!connection.isUsable()) return { received: true, ignored: true };

    const inbox = new WebhookInbox({
      id: randomUUID(),
      organizationId: connection.organizationId,
      bankConnectionId: connection.id,
      providerTransactionId: input.transactionId,
      rawPayload: input.rawPayload,
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });
    try {
      await this.dataSource.transaction((manager) =>
        this.inboxRepo.insert(inbox, manager),
      );
    } catch (error) {
      if (error instanceof DuplicateWebhookError)
        return { received: true, duplicate: true };
      throw error;
    }
    await this.webhookJobQueue.enqueue({
      webhookInboxId: inbox.id,
      organizationId: inbox.organizationId,
      jobId: `tx-${input.transactionId}`,
    });
    return { received: true, duplicate: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern receive-webhook.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts
git commit -m "feat: ReceiveWebhookUseCase verifies the webhook secret via CassoFlowAuthorization"
```

---

## Task 13: Application — `SyncTransactionsUseCase` reads the API Key via the authorization

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowAuthorizationRepository.findByIdUnscoped` (Task 3).
- Produces: `SyncTransactionsUseCase` constructor gains `@Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY) authorizationRepo` as its 4th parameter, after `encryptionKey`. `execute(connectionId: string)` signature unchanged.

- [ ] **Step 1: Write the failing tests**

Replace `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port';
import { SyncTransactionsUseCase } from './sync-transactions.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'MOCK NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function authorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: encryptToken('raw-api-key', encryptionKey),
    encryptedSecureToken: 'encrypted-secure-token',
    createdAt: new Date(),
  });
}

function buildUseCase(overrides: {
  bankConnectionRepo?: Record<string, jest.Mock>;
  authorizationRepo?: Record<string, jest.Mock>;
  adapter?: Record<string, jest.Mock>;
  markRequiresReauthorization?: Record<string, jest.Mock>;
}) {
  const bankConnectionRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(activeConnection()),
    ...overrides.bankConnectionRepo,
  };
  const authorizationRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue(authorization()),
    ...overrides.authorizationRepo,
  };
  const adapter = { getTransactions: jest.fn().mockResolvedValue([]), ...overrides.adapter };
  const markRequiresReauthorization = {
    handleAdapterError: jest.fn(),
    ...overrides.markRequiresReauthorization,
  };
  const useCase = new SyncTransactionsUseCase(
    adapter as never,
    bankConnectionRepo as never,
    markRequiresReauthorization as never,
    encryptionKey,
    authorizationRepo as never,
  );
  return { useCase, bankConnectionRepo, authorizationRepo, adapter, markRequiresReauthorization };
}

describe('SyncTransactionsUseCase', () => {
  it('returns transactions fetched from the adapter using the authorization API Key', async () => {
    const { useCase, adapter, markRequiresReauthorization } = buildUseCase({});

    const result = await useCase.execute('conn-1');

    expect(result).toEqual([]);
    expect(adapter.getTransactions).toHaveBeenCalledWith('raw-api-key');
    expect(markRequiresReauthorization.handleAdapterError).not.toHaveBeenCalled();
  });

  it('marks the connection as requiring reauthorization and rethrows on a 401/403 from Casso Flow', async () => {
    const markRequiresReauthorization = {
      handleAdapterError: jest
        .fn()
        .mockImplementation((_id: string, _reason: string, error: unknown) => {
          throw error;
        }),
    };
    const { useCase } = buildUseCase({
      adapter: {
        getTransactions: jest.fn().mockRejectedValue(new CassoFlowUnauthorizedError()),
      },
      markRequiresReauthorization,
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(
      CassoFlowUnauthorizedError,
    );
    expect(markRequiresReauthorization.handleAdapterError).toHaveBeenCalledWith(
      'conn-1',
      '401/403 from getTransactions',
      expect.any(CassoFlowUnauthorizedError),
    );
  });

  it('throws AppError when the connection cannot be found', async () => {
    const { useCase } = buildUseCase({
      bankConnectionRepo: { findByIdUnscoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const { useCase } = buildUseCase({
      authorizationRepo: { findByIdUnscoped: jest.fn().mockResolvedValue(null) },
    });

    await expect(useCase.execute('conn-1')).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern sync-transactions.usecase.spec.ts` (from `apps/backend`)
Expected: FAIL — constructor arity mismatch, `connection.encryptedCassoApiKey` no longer exists

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts` with:

```ts
// apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

@Injectable()
export class SyncTransactionsUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  // Called by a background sync job with only a connectionId (no authenticated
  // request) — findByIdUnscoped is deliberate here, see
  // bank-connection-repository.port.ts.
  async execute(connectionId: string) {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection)
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    const authorization = await this.authorizationRepo.findByIdUnscoped(
      connection.cassoFlowAuthorizationId,
    );
    if (!authorization)
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    try {
      return await this.adapter.getTransactions(
        decryptToken(authorization.encryptedApiKey, this.encryptionKey),
      );
    } catch (error) {
      await this.markRequiresReauthorization.handleAdapterError(
        connectionId,
        '401/403 from getTransactions',
        error,
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern sync-transactions.usecase.spec.ts` (from `apps/backend`)
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git commit -m "feat: SyncTransactionsUseCase reads the API Key via CassoFlowAuthorization"
```

---

## Task 14: Presentation — DTOs for preview/confirm/rotate + response DTO updates

No test — this repo has no precedent of unit-testing plain `class-validator` DTOs directly (see the original `connect-casso-flow.dto.ts`, which has no `.spec.ts`); validation is exercised through the controller/e2e layer (Task 16).

**Files:**
- Delete: `apps/backend/src/modules/bank-connections/presentation/dto/connect-casso-flow.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/preview-casso-flow.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/confirm-casso-flow.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/rotate-casso-flow-authorization.dto.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/dto/bank-connection-response.dto.ts`

**Interfaces:**
- Produces: `PreviewCassoFlowDto`, `PreviewCassoFlowAccountsResponseDto`, `CassoFlowAccountPreviewDto`, `ConfirmCassoFlowDto`, `ConnectCassoFlowResponseDto`, `PreviewCassoFlowAuthorizationRotationResponseDto`, `RotateCassoFlowDto`, `RotateCassoFlowAuthorizationResponseDto`. `BankConnectionResponseDto` gains `accountHolderName`, `cassoFlowAuthorizationId`.

- [ ] **Step 1: Delete the old connect DTO**

```bash
rm apps/backend/src/modules/bank-connections/presentation/dto/connect-casso-flow.dto.ts
```

- [ ] **Step 2: Write the preview DTOs (request + response, shared by both preview endpoints)**

```ts
// apps/backend/src/modules/bank-connections/presentation/dto/preview-casso-flow.dto.ts
import { IsString, MinLength } from 'class-validator';

export class PreviewCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;
}

export class CassoFlowAccountPreviewDto {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: 'ALREADY_CONNECTED' | 'TAKEN_BY_ANOTHER_ORG' | 'AVAILABLE';
}

export class PreviewCassoFlowAccountsResponseDto {
  businessId: string;
  accounts: CassoFlowAccountPreviewDto[];
}

export class PreviewCassoFlowAuthorizationRotationResponseDto extends PreviewCassoFlowAccountsResponseDto {
  missingAccountNumbers: string[];
}
```

- [ ] **Step 3: Write the confirm DTOs**

```ts
// apps/backend/src/modules/bank-connections/presentation/dto/confirm-casso-flow.dto.ts
import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class ConfirmCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedAccountNumbers: string[];
}

export class ConnectCassoFlowConnectedItemDto {
  connectionId: string;
  accountNumber: string;
}

export class ConnectCassoFlowSkippedItemDto {
  accountNumber: string;
  reason: 'PLAN_LIMIT_EXCEEDED' | 'TAKEN_BY_ANOTHER_ORG';
}

export class ConnectCassoFlowResponseDto {
  connected: ConnectCassoFlowConnectedItemDto[];
  skipped: ConnectCassoFlowSkippedItemDto[];
}
```

- [ ] **Step 4: Write the rotate DTOs**

```ts
// apps/backend/src/modules/bank-connections/presentation/dto/rotate-casso-flow-authorization.dto.ts
import { IsString, MinLength } from 'class-validator';

export class RotateCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;
}

export class CassoFlowNewlyDiscoveredAccountDto {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export class RotateCassoFlowAuthorizationResponseDto {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowNewlyDiscoveredAccountDto[];
}
```

- [ ] **Step 5: Add `accountHolderName`/`cassoFlowAuthorizationId` to the connection response DTO**

Replace `apps/backend/src/modules/bank-connections/presentation/dto/bank-connection-response.dto.ts` with:

```ts
// apps/backend/src/modules/bank-connections/presentation/dto/bank-connection-response.dto.ts
import { BankConnection } from '../../domain/bank-connection';

export class BankConnectionResponseDto {
  id: string;
  cassoFlowAuthorizationId: string;
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: string;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

export class ListBankConnectionsResponseDto {
  items: BankConnectionResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toBankConnectionResponse(
  connection: BankConnection,
): BankConnectionResponseDto {
  const dto = new BankConnectionResponseDto();
  dto.id = connection.id;
  dto.cassoFlowAuthorizationId = connection.cassoFlowAuthorizationId;
  dto.accountNumber = connection.accountNumber;
  dto.bankName = connection.bankName;
  dto.accountHolderName = connection.accountHolderName;
  dto.status = connection.status;
  dto.connectedAt = connection.connectedAt;
  dto.lastSyncAt = connection.lastSyncAt;
  dto.createdAt = connection.createdAt;
  return dto;
}
```

- [ ] **Step 6: Run the full backend test suite to confirm nothing broke from the DTO rename/deletion**

Run: `npx jest` (from `apps/backend`)
Expected: only failures remaining should be in `bank-connections.controller.ts` (still imports the deleted `connect-casso-flow.dto.ts` — fixed in Task 15) and the e2e test (fixed in Task 16). Every unit test from Tasks 1–13 should still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections/presentation/dto
git commit -m "feat: add preview/confirm/rotate DTOs, drop connect-casso-flow.dto.ts"
```

---

## Task 15: Presentation — controller endpoints + module wiring

**Files:**
- Modify: `apps/backend/src/common/audit/audit.enums.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

**Interfaces:**
- Consumes: every usecase from Tasks 7–13, every DTO from Task 14.
- Produces: `POST /bank-connections/casso-flow/preview`, `POST /bank-connections/casso-flow/confirm`, `POST /bank-connections/authorizations/:id/casso-flow/preview`, `POST /bank-connections/authorizations/:id/casso-flow/confirm` endpoints. `AuditActionType.BANK_CONNECTION_API_KEY_ROTATE`, `AuditEntityType.CASSO_FLOW_AUTHORIZATION`.

- [ ] **Step 1: Add the new audit action/entity types**

In `apps/backend/src/common/audit/audit.enums.ts`, add to `AuditActionType` (after `BANK_CONNECTION_DISCONNECT`):

```ts
  BANK_CONNECTION_API_KEY_ROTATE = 'BANK_CONNECTION_API_KEY_ROTATE',
```

Add to `AuditEntityType` (after `BANK_CONNECTION`):

```ts
  CASSO_FLOW_AUTHORIZATION = 'CassoFlowAuthorization',
```

- [ ] **Step 2: Write the failing audited-metadata test additions**

Add to `apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts`, inside the existing `describe('audited metadata on write handlers (issue #104)', ...)` block (after the `bank-connection connect` test):

```ts
  it('audits bank-connection confirm as BANK_CONNECTION_CREATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      BankConnectionsController.prototype.confirm,
    );
    expect(metadata).toEqual({
      actionType: 'BANK_CONNECTION_CREATE',
      entityType: 'BankConnection',
    });
  });

  it('audits authorization rotation as BANK_CONNECTION_API_KEY_ROTATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      BankConnectionsController.prototype.rotate,
    );
    expect(metadata).toEqual({
      actionType: 'BANK_CONNECTION_API_KEY_ROTATE',
      entityType: 'CassoFlowAuthorization',
    });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPattern audited-metadata.spec.ts` (from `apps/backend`)
Expected: FAIL — `BankConnectionsController.prototype.confirm`/`.rotate` do not exist yet (`connect` still exists but the new handler names don't)

- [ ] **Step 4: Rewrite the controller**

Replace `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts` with:

```ts
// apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts
import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ConnectCassoFlowUseCase } from '../application/connect-casso-flow.usecase';
import { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import { ListBankConnectionsUseCase } from '../application/list-bank-connections.usecase';
import { PreviewCassoFlowAccountsUseCase } from '../application/preview-casso-flow-accounts.usecase';
import { PreviewCassoFlowAuthorizationRotationUseCase } from '../application/preview-casso-flow-authorization-rotation.usecase';
import { RotateCassoFlowAuthorizationUseCase } from '../application/rotate-casso-flow-authorization.usecase';
import {
  ListBankConnectionsResponseDto,
  toBankConnectionResponse,
} from './dto/bank-connection-response.dto';
import {
  ConfirmCassoFlowDto,
  ConnectCassoFlowResponseDto,
} from './dto/confirm-casso-flow.dto';
import {
  PreviewCassoFlowAccountsResponseDto,
  PreviewCassoFlowAuthorizationRotationResponseDto,
  PreviewCassoFlowDto,
} from './dto/preview-casso-flow.dto';
import {
  RotateCassoFlowAuthorizationResponseDto,
  RotateCassoFlowDto,
} from './dto/rotate-casso-flow-authorization.dto';

@ApiTags('bank-connections')
@Controller('bank-connections')
@UseGuards(PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly listBankConnectionsUseCase: ListBankConnectionsUseCase,
    private readonly previewCassoFlowAccountsUseCase: PreviewCassoFlowAccountsUseCase,
    private readonly connectCassoFlowUseCase: ConnectCassoFlowUseCase,
    private readonly previewCassoFlowAuthorizationRotationUseCase: PreviewCassoFlowAuthorizationRotationUseCase,
    private readonly rotateCassoFlowAuthorizationUseCase: RotateCassoFlowAuthorizationUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bank connections with pagination' })
  @ApiOkResponse({ type: ListBankConnectionsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.BANK_CONNECTION_READ)
  async findAll(@Query() query: PaginationDto) {
    const result = await this.listBankConnectionsUseCase.execute(
      query.page,
      query.limit,
    );
    return {
      items: result.items.map(toBankConnectionResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Post('casso-flow/preview')
  @ApiOperation({
    summary: "Preview the bank accounts a Casso Flow API Key can connect",
  })
  @ApiOkResponse({ type: PreviewCassoFlowAccountsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async preview(@Body() dto: PreviewCassoFlowDto) {
    return this.previewCassoFlowAccountsUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      apiKey: dto.apiKey,
    });
  }

  @Post('casso-flow/confirm')
  @ApiOperation({
    summary: 'Connect the selected bank accounts from a Casso Flow API Key',
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ConnectCassoFlowResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async confirm(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConfirmCassoFlowDto,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/confirm',
      key,
      dto,
      () =>
        this.connectCassoFlowUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          apiKey: dto.apiKey,
          selectedAccountNumbers: dto.selectedAccountNumbers,
        }),
    );
  }

  @Post('authorizations/:id/casso-flow/preview')
  @ApiOperation({
    summary:
      "Preview rotating one CassoFlowAuthorization's API Key against its currently connected accounts",
  })
  @ApiOkResponse({ type: PreviewCassoFlowAuthorizationRotationResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async previewRotation(
    @Param('id') authorizationId: string,
    @Body() dto: PreviewCassoFlowDto,
  ) {
    return this.previewCassoFlowAuthorizationRotationUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      cassoFlowAuthorizationId: authorizationId,
      apiKey: dto.apiKey,
    });
  }

  @Post('authorizations/:id/casso-flow/confirm')
  @ApiOperation({
    summary: "Rotate one CassoFlowAuthorization's API Key",
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: RotateCassoFlowAuthorizationResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_API_KEY_ROTATE,
    AuditEntityType.CASSO_FLOW_AUTHORIZATION,
  )
  async rotate(
    @Param('id') authorizationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RotateCassoFlowDto,
  ) {
    return this.idempotency.execute(
      `POST /bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
      key,
      dto,
      () =>
        this.rotateCassoFlowAuthorizationUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          cassoFlowAuthorizationId: authorizationId,
          apiKey: dto.apiKey,
        }),
    );
  }

  @Post(':id/disconnect')
  @ApiOperation({ summary: 'Disconnect a bank connection' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Connection disconnected',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_DISCONNECT,
    AuditEntityType.BANK_CONNECTION,
  )
  async disconnect(
    @Param('id') connectionId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /bank-connections/${connectionId}/disconnect`,
      key,
      { connectionId },
      async () => {
        await this.disconnectConnectionUseCase.execute(connectionId);
        return { success: true };
      },
    );
  }
}
```

- [ ] **Step 5: Rewire the module**

Replace `apps/backend/src/modules/bank-connections/bank-connections.module.ts` with:

```ts
// apps/backend/src/modules/bank-connections/bank-connections.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { BillingModule } from '../billing/billing.module';
import { BANK_CONNECTION_REPOSITORY } from './application/bank-connection-repository.port';
import { CASSO_FLOW_AUTHORIZATION_REPOSITORY } from './application/casso-flow-authorization-repository.port';
import { CASSO_FLOW_INTEGRATION_ADAPTER } from './application/casso-flow-integration-adapter.port';
import { ConnectCassoFlowUseCase } from './application/connect-casso-flow.usecase';
import { CONNECTION_AUDIT_EVENT_REPOSITORY } from './application/connection-audit-event-repository.port';
import { DisconnectConnectionUseCase } from './application/disconnect-connection.usecase';
import { ListBankConnectionsUseCase } from './application/list-bank-connections.usecase';
import { MarkRequiresReauthorizationUseCase } from './application/mark-requires-reauthorization.usecase';
import { PreviewCassoFlowAccountsUseCase } from './application/preview-casso-flow-accounts.usecase';
import { PreviewCassoFlowAuthorizationRotationUseCase } from './application/preview-casso-flow-authorization-rotation.usecase';
import { RotateCassoFlowAuthorizationUseCase } from './application/rotate-casso-flow-authorization.usecase';
import { SyncTransactionsUseCase } from './application/sync-transactions.usecase';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './application/token-encryption-key';
import { BankConnectionOrmEntity } from './infrastructure/bank-connection.orm-entity';
import { CassoFlowAdapter } from './infrastructure/casso-flow.adapter';
import { CassoFlowAuthorizationOrmEntity } from './infrastructure/casso-flow-authorization.orm-entity';
import { ConnectionAuditEventOrmEntity } from './infrastructure/connection-audit-event.orm-entity';
import { TypeOrmBankConnectionRepository } from './infrastructure/typeorm-bank-connection.repository';
import { TypeOrmCassoFlowAuthorizationRepository } from './infrastructure/typeorm-casso-flow-authorization.repository';
import { TypeOrmConnectionAuditEventRepository } from './infrastructure/typeorm-connection-audit-event.repository';
import { BankConnectionsController } from './presentation/bank-connections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankConnectionOrmEntity,
      CassoFlowAuthorizationOrmEntity,
      ConnectionAuditEventOrmEntity,
    ]),
    BillingModule,
  ],
  controllers: [BankConnectionsController],
  providers: [
    {
      provide: BANK_CONNECTION_REPOSITORY,
      useClass: TypeOrmBankConnectionRepository,
    },
    {
      provide: CASSO_FLOW_AUTHORIZATION_REPOSITORY,
      useClass: TypeOrmCassoFlowAuthorizationRepository,
    },
    {
      provide: CONNECTION_AUDIT_EVENT_REPOSITORY,
      useClass: TypeOrmConnectionAuditEventRepository,
    },
    {
      provide: CASSO_FLOW_INTEGRATION_ADAPTER,
      useClass: CassoFlowAdapter,
    },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    {
      provide: ACCESS_TOKEN_ENCRYPTION_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.getOrThrow<string>('ACCESS_TOKEN_ENCRYPTION_KEY');
        if (key.trim() === '') {
          throw new Error('ACCESS_TOKEN_ENCRYPTION_KEY must not be empty');
        }
        return key;
      },
    },
    PreviewCassoFlowAccountsUseCase,
    ConnectCassoFlowUseCase,
    PreviewCassoFlowAuthorizationRotationUseCase,
    RotateCassoFlowAuthorizationUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
  exports: [
    BANK_CONNECTION_REPOSITORY,
    CASSO_FLOW_AUTHORIZATION_REPOSITORY,
    CASSO_FLOW_INTEGRATION_ADAPTER,
    ACCESS_TOKEN_ENCRYPTION_KEY,
    ConnectCassoFlowUseCase,
    DisconnectConnectionUseCase,
    ListBankConnectionsUseCase,
    MarkRequiresReauthorizationUseCase,
    SyncTransactionsUseCase,
  ],
})
export class BankConnectionsModule {}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --testPathPattern audited-metadata.spec.ts` (from `apps/backend`)
Expected: PASS, 5 tests

Then run the full unit suite:

Run: `npx jest` (from `apps/backend`)
Expected: PASS everywhere except `casso-flow-bank-connection-flow.e2e-spec.ts` (fixed in Task 16 — e2e tests aren't part of the plain `npx jest` unit run anyway, this is just confirming no other unit test regressed)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/common/audit/audit.enums.ts apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: wire preview/confirm/rotate endpoints and CassoFlowAuthorization into the module"
```

---

## Task 16: Fix the e2e webhook test for the new schema

**Files:**
- Modify: `apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: `CassoFlowAuthorizationOrmEntity` (Task 3), updated `BankConnectionOrmEntity` (Task 4).

- [ ] **Step 1: Update the test to seed a `CassoFlowAuthorizationOrmEntity` and reference it**

In `apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts`, add the import:

```ts
import { CassoFlowAuthorizationOrmEntity } from '../src/modules/bank-connections/infrastructure/casso-flow-authorization.orm-entity';
```

Replace the connection-seeding block (currently seeds `encryptedSecureToken`/`encryptedCassoApiKey` directly on `BankConnectionOrmEntity`) with:

```ts
    const authorizationId = randomUUID();
    await dataSource.getRepository(CassoFlowAuthorizationOrmEntity).save({
      id: authorizationId,
      organizationId,
      businessId: 'e2e-business-1',
      encryptedApiKey: encryptToken(
        'seeded-api-key',
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      encryptedSecureToken: encryptToken(
        webhookSecret,
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      createdAt: new Date(),
    });

    const connectionId = randomUUID();
    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: connectionId,
      organizationId,
      cassoFlowAuthorizationId: authorizationId,
      accountNumber,
      bankName: 'Round Trip Bank',
      accountHolderName: 'ROUND TRIP TESTER',
      status: 'ACTIVE',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
```

- [ ] **Step 2: Run the e2e test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- casso-flow-bank-connection-flow` (needs Docker for testcontainers)
Expected: PASS, 1 test

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts
git commit -m "test: seed CassoFlowAuthorization in the bank-connection webhook e2e test"
```

**Now safe to run the migration (Task 5) against a real dev database** — every backend code path has been updated for the new schema.

---

## Task 17: Backend verify

Run the full backend verification suite before moving to the frontend.

- [ ] **Step 1: Run lint, type-check, test, arch-check**

Run: `pnpm --filter @casso-ledger/backend lint && pnpm --filter @casso-ledger/backend type-check && pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend arch-check` (or `pnpm verify` from the repo root, scoped to backend)
Expected: all pass, zero errors

- [ ] **Step 2: Run `domain-check` (per AGENTS.md — required after any backend code change)**

Invoke the `domain-check` skill and confirm no violations (money-as-float, missing `organizationId` scoping, domain importing NestJS/TypeORM, missing transactions, `console.log`, `any`, missing `@VersionColumn()`, `SELECT *`).

- [ ] **Step 3: Fix anything flagged, then commit if any fixes were needed**

If `domain-check` or verify surfaced issues, fix them with their own RED→GREEN cycle and commit separately — do not bundle unrelated fixes into a prior task's commit.

---

## Task 18: Frontend — types + API functions for preview/confirm/rotate

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/types.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts`

**Interfaces:**
- Produces: `BankConnection` gains `cassoFlowAuthorizationId`, `accountHolderName`. New types: `CassoFlowAccountPreviewStatus`, `CassoFlowAccountPreview`, `PreviewCassoFlowAccountsResult`, `PreviewCassoFlowAuthorizationRotationResult`, `ConfirmCassoFlowInput`, `ConnectCassoFlowResult`, `RotateCassoFlowInput`, `RotateCassoFlowAuthorizationResult`. New functions: `previewCassoFlowAccounts`, `confirmCassoFlow` (replaces `connectCassoFlow`), `previewCassoFlowAuthorizationRotation`, `rotateCassoFlowAuthorization`.

- [ ] **Step 1: Update `types.ts`**

Replace `apps/frontend/src/features/bank-connections/types.ts` with:

```ts
// apps/frontend/src/features/bank-connections/types.ts
export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface BankConnection {
  id: string;
  cassoFlowAuthorizationId: string;
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: BankConnectionStatus;
  connectedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface BankConnectionList {
  items: BankConnection[];
  total: number;
  page: number;
  limit: number;
}

export type CassoFlowAccountPreviewStatus =
  | 'ALREADY_CONNECTED'
  | 'TAKEN_BY_ANOTHER_ORG'
  | 'AVAILABLE';

export interface CassoFlowAccountPreview {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: CassoFlowAccountPreviewStatus;
}

export interface PreviewCassoFlowAccountsResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
}

export interface PreviewCassoFlowAuthorizationRotationResult
  extends PreviewCassoFlowAccountsResult {
  missingAccountNumbers: string[];
}

export interface ConfirmCassoFlowInput {
  apiKey: string;
  selectedAccountNumbers: string[];
}

export interface ConnectCassoFlowConnectedItem {
  connectionId: string;
  accountNumber: string;
}

export type ConnectCassoFlowSkippedReason =
  | 'PLAN_LIMIT_EXCEEDED'
  | 'TAKEN_BY_ANOTHER_ORG';

export interface ConnectCassoFlowSkippedItem {
  accountNumber: string;
  reason: ConnectCassoFlowSkippedReason;
}

export interface ConnectCassoFlowResult {
  connected: ConnectCassoFlowConnectedItem[];
  skipped: ConnectCassoFlowSkippedItem[];
}

export interface RotateCassoFlowInput {
  apiKey: string;
}

export interface CassoFlowNewlyDiscoveredAccount {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export interface RotateCassoFlowAuthorizationResult {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowNewlyDiscoveredAccount[];
}
```

- [ ] **Step 2: Write the failing API test**

Replace `apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts` with:

```ts
// apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts
import { describe, expect, it, vi } from 'vitest';
import {
  confirmCassoFlow,
  previewCassoFlowAccounts,
  previewCassoFlowAuthorizationRotation,
  rotateCassoFlowAuthorization,
} from './bank-connections-api';

const apiRequest = vi.fn();
const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

describe('previewCassoFlowAccounts', () => {
  it('posts to the top-level preview endpoint', async () => {
    apiRequest.mockResolvedValue({ businessId: 'biz-1', accounts: [] });

    await expect(
      previewCassoFlowAccounts({ apiKey: 'test-key' }),
    ).resolves.toEqual({ businessId: 'biz-1', accounts: [] });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/bank-connections/casso-flow/preview',
      method: 'POST',
      data: { apiKey: 'test-key' },
    });
  });
});

describe('confirmCassoFlow', () => {
  it('posts to the confirm endpoint', async () => {
    postWithIdempotency.mockResolvedValue({ connected: [], skipped: [] });

    await confirmCassoFlow({ apiKey: 'test-key', selectedAccountNumbers: ['111'] });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/bank-connections/casso-flow/confirm',
      { apiKey: 'test-key', selectedAccountNumbers: ['111'] },
    );
  });
});

describe('previewCassoFlowAuthorizationRotation', () => {
  it('posts to the authorization-scoped preview endpoint', async () => {
    apiRequest.mockResolvedValue({
      businessId: 'biz-1',
      accounts: [],
      missingAccountNumbers: [],
    });

    await previewCassoFlowAuthorizationRotation('auth-1', { apiKey: 'test-key' });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/bank-connections/authorizations/auth-1/casso-flow/preview',
      method: 'POST',
      data: { apiKey: 'test-key' },
    });
  });
});

describe('rotateCassoFlowAuthorization', () => {
  it('posts to the authorization-scoped confirm endpoint', async () => {
    postWithIdempotency.mockResolvedValue({
      rotatedAccountNumbers: [],
      newlyDiscovered: [],
    });

    await rotateCassoFlowAuthorization('auth-1', { apiKey: 'test-key' });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/bank-connections/authorizations/auth-1/casso-flow/confirm',
      { apiKey: 'test-key' },
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/bank-connections/api/bank-connections-api.spec.ts` (from `apps/frontend`)
Expected: FAIL — `previewCassoFlowAccounts`/`confirmCassoFlow`/`previewCassoFlowAuthorizationRotation`/`rotateCassoFlowAuthorization` are not exported

- [ ] **Step 4: Write minimal implementation**

Replace `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts` with:

```ts
// apps/frontend/src/features/bank-connections/api/bank-connections-api.ts
import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  BankConnectionList,
  ConfirmCassoFlowInput,
  ConnectCassoFlowResult,
  PreviewCassoFlowAccountsResult,
  PreviewCassoFlowAuthorizationRotationResult,
  RotateCassoFlowAuthorizationResult,
  RotateCassoFlowInput,
} from '../types';

export function fetchBankConnections(): Promise<BankConnectionList> {
  return apiRequest<BankConnectionList>({
    url: '/api/v1/bank-connections?page=1&limit=100',
    method: 'GET',
  });
}

export function previewCassoFlowAccounts(input: {
  apiKey: string;
}): Promise<PreviewCassoFlowAccountsResult> {
  return apiRequest<PreviewCassoFlowAccountsResult>({
    url: '/api/v1/bank-connections/casso-flow/preview',
    method: 'POST',
    data: input,
  });
}

export function confirmCassoFlow(
  input: ConfirmCassoFlowInput,
): Promise<ConnectCassoFlowResult> {
  return postWithIdempotency<ConnectCassoFlowResult>(
    '/api/v1/bank-connections/casso-flow/confirm',
    input,
  );
}

export function previewCassoFlowAuthorizationRotation(
  authorizationId: string,
  input: { apiKey: string },
): Promise<PreviewCassoFlowAuthorizationRotationResult> {
  return apiRequest<PreviewCassoFlowAuthorizationRotationResult>({
    url: `/api/v1/bank-connections/authorizations/${authorizationId}/casso-flow/preview`,
    method: 'POST',
    data: input,
  });
}

export function rotateCassoFlowAuthorization(
  authorizationId: string,
  input: RotateCassoFlowInput,
): Promise<RotateCassoFlowAuthorizationResult> {
  return postWithIdempotency<RotateCassoFlowAuthorizationResult>(
    `/api/v1/bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
    input,
  );
}

export function disconnectConnection(
  id: string,
): Promise<{ success: boolean }> {
  return postWithIdempotency(`/api/v1/bank-connections/${id}/disconnect`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/bank-connections/api/bank-connections-api.spec.ts` (from `apps/frontend`)
Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections/types.ts apps/frontend/src/features/bank-connections/api/bank-connections-api.ts apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts
git commit -m "feat: add preview/confirm/rotate API functions and types"
```

---

## Tasks 19–23: Frontend — remaining wiring (condensed)

Same TDD discipline (RED → GREEN → commit per task) as every task above — condensed here to the core change per task rather than full step-by-step code, since the shape now repeats patterns already fully spelled out earlier in this plan (Task 18) and in the existing codebase (`onboarding-page.tsx`, `casso-flow-connect-form.tsx`, `connection-table.tsx`, all read in full during planning).

**Task 19 — `use-bank-connections.ts`: new hooks + stop double-messaging on `PLAN_LIMIT_EXCEEDED`.**
Replace `useConnectCassoFlow` with `usePreviewCassoFlowAccounts` (mutation wrapping `previewCassoFlowAccounts`, no toast), `useConfirmCassoFlow` (wraps `confirmCassoFlow`; `onSuccess` invalidates `['bank-connections']` + calls `refreshUser()` same as the existing disconnect hook; `onError` uses `getApiErrorCode(error) === 'PLAN_LIMIT_EXCEEDED'` to skip the generic toast, since `UpgradeDialog` already reacts to the underlying `402`). Add `usePreviewCassoFlowAuthorizationRotation` and `useRotateCassoFlowAuthorization` (mirror the two connect hooks, target the authorization-scoped functions). Test: assert `useConfirmCassoFlow`'s `onError` does NOT call `toast.error` when `getApiErrorCode` returns `'PLAN_LIMIT_EXCEEDED'`, but DOES for any other code (2 tests, same mocking pattern as the existing `use-bank-connections.spec.tsx`).

**Task 20 — extract `ApiKeyInput` shared component.**
New file `apps/frontend/src/features/bank-connections/components/api-key-input.tsx`: the `Label` + `Input` + show/hide-eye-icon-toggle block already built in `casso-flow-connect-form.tsx` (this session's earlier work), lifted out as `<ApiKeyInput value={apiKey} onChange={setApiKey} disabled={...} />` so both the connect flow (Task 21) and the rotate flow (Task 23) use one implementation. Test: renders masked by default, toggles to plain text on click (same 2 assertions already proven in `casso-flow-connect-form.spec.tsx`'s toggle test — move that test here).

**Task 21 — 2-step account-picker form (replaces `CassoFlowConnectForm`).**
New file `apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.tsx`, used by both `ConnectDialog` (Task 22) and the rotate dialog (Task 23) via a prop distinguishing which preview/confirm functions to call (`onPreview`, `onConfirm` passed in, not hardcoded — keeps this component authorization-agnostic). Step 1: `ApiKeyInput` + submit calls `onPreview(apiKey)`, renders the returned `accounts[]` as a checkbox list — `AVAILABLE` pre-checked and enabled, `ALREADY_CONNECTED` checked and disabled with a "đã kết nối" label, `TAKEN_BY_ANOTHER_ORG` unchecked and disabled with a "đã được tổ chức khác kết nối" label. Step 2: submit calls `onConfirm(apiKey, selectedAccountNumbers)`; on a response with `skipped` entries, show which accounts didn't connect and why. Delete `casso-flow-connect-form.tsx`/`.spec.tsx` (fully superseded — `ApiKeyInput`'s own test now covers the toggle behavior it used to test).

**Task 22 — `ConnectDialog` uses the new picker.**
Swap `<CassoFlowConnectForm onCompleted={...} />` for `<CassoFlowAccountPicker onPreview={previewCassoFlowAccounts} onConfirm={(apiKey, selected) => confirmMutation.mutateAsync({ apiKey, selectedAccountNumbers: selected })} onCompleted={...} />`. `onboarding-page.tsx` gets the same swap (it renders the same form component).

**Task 23 — `ConnectionTable` groups by `cassoFlowAuthorizationId`, adds "Đổi API Key".**
Group `connections` by `cassoFlowAuthorizationId` before rendering (`Object.groupBy` or a `Map`-based reduce — plain JS, no new dependency). Render one "Đổi API Key" `Button` + `Dialog` per group (reusing `CassoFlowAccountPicker` from Task 21, wired to `previewCassoFlowAuthorizationRotation(authorizationId, ...)`/`rotateCassoFlowAuthorization(authorizationId, ...)`), placed once above that group's rows — not per row. Test: two connections sharing one `cassoFlowAuthorizationId` render exactly one "Đổi API Key" button, not two.

After Task 23, run the full frontend suite (`npx vitest run` from `apps/frontend`) and `npx tsc --build --noEmit`, then `npx biome check --write .` across both `apps/backend` and `apps/frontend`, then a final `pnpm verify` from the repo root before calling the feature done.
