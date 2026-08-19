# Casso Flow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the merged Cas ID integration entirely and replace it with a Casso Flow integration matching how that third-party provider actually works: OAuth2-read-only access + self-registered webhook, not an Open-Banking consent popup.

**Architecture:** `CassoOAuthState` (CSRF-only, replaces `CasIdConnectionSession`) tracks the OAuth2 redirect round-trip. `BankConnection` is redesigned around `accountNumber` (webhook correlation key) and a self-generated `encryptedSecureToken` (webhook verification secret) instead of `grantId`/`encryptedAccessToken`. `CassoFlowAdapter` (replaces `CasIdAdapter`) calls Casso Flow's real OAuth2 + webhook-registration endpoints. Inbound webhooks resolve by `accountNumber` then verify per-connection inside `ReceiveWebhookUseCase` itself — `WebhookAuthGuard` is removed, not repurposed.

**Tech Stack:** NestJS 11, TypeORM 1.1, React 19, class-validator/class-transformer, Jest 30/Vitest, testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-19-casso-flow-integration-design.md` (supersedes `2026-08-19-cas-id-real-integration-design.md`). Also read `docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md`.

## Global Constraints

- Every write that changes state MUST be inside one DB transaction; tenant isolation via `organizationId` except the documented unscoped exceptions (webhook resolution has no request tenant context).
- `application/` layer MUST NOT import concrete SDKs or throw framework exceptions — only `AppError`. `infrastructure/` may use `fetch`/`AbortController`/`@nestjs/common` DI decorators.
- No `any` in production code. Domain ↔ ORM translation stays structural (no `as`/`as unknown as`), matching this module's existing `TypeOrmBankConnectionRepository` pattern.
- Webhook secret comparison MUST use `common/security/constant-time-compare.ts` (already exists) — never `===` on a secret.
- **Do not guess the two items the spec explicitly defers** (§3/§4 of the spec): the OAuth2 `scope` param value, and whether Casso Flow's real webhook delivery uses a `secure-token` header or `X-Casso-Signature`. Task 5 and Task 11 call out exactly where to verify these against real behavior instead of assuming.
- TDD: RED → GREEN → REFACTOR for every behavior change. Migrations follow this repo's existing migration-spec convention (`queryRunner.query` assertions), not full TDD against a real DB — stated exception per AGENTS.md.
- Biome: single quotes, semicolons, 2-space indent — run `npx biome check --write <files>` at the end of each task.

---

## Task 1: Migration — replace Cas ID columns/tables with Casso Flow's

**Files:**
- Create: `apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.ts`
- Create: `apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.spec.ts`

Per ADR-0021 and the confirmed "no production data" state, this is a clean drop/add — no backfill.

- [ ] **Step 1: Write the failing test**

```ts
import type { QueryRunner } from 'typeorm';
import { ReplaceCasIdWithCassoFlow20260828000000 } from './20260828000000-replace-cas-id-with-casso-flow';

describe('ReplaceCasIdWithCassoFlow20260828000000', () => {
  it('drops Cas ID columns/table and adds Casso Flow columns/table on up', async () => {
    const migration = new ReplaceCasIdWithCassoFlow20260828000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "casIdConnectionSessionId"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedAccessToken"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountIdentity"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "scopes"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "accountNumber" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "bankName" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedSecureToken" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoAccessToken" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoRefreshToken" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "cas_id_connection_sessions"');
    expect(query).toHaveBeenCalledWith(
      'CREATE TABLE "casso_oauth_states" (' +
        '"id" uuid PRIMARY KEY, ' +
        '"organizationId" uuid NOT NULL, ' +
        '"initiatedByUserId" uuid NOT NULL, ' +
        '"expiresAt" timestamptz NOT NULL, ' +
        '"createdAt" timestamptz NOT NULL)',
    );
  });

  it('is destructive on down (no Cas ID data to restore)', async () => {
    const migration = new ReplaceCasIdWithCassoFlow20260828000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "casso_oauth_states"');
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountNumber"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns 20260828000000-replace-cas-id-with-casso-flow`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceCasIdWithCassoFlow20260828000000
  implements MigrationInterface
{
  name = 'ReplaceCasIdWithCassoFlow20260828000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "casIdConnectionSessionId"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedAccessToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountIdentity"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "scopes"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "accountNumber" character varying NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "bankName" character varying NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedSecureToken" text NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoAccessToken" text NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoRefreshToken" text NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "cas_id_connection_sessions"');
    await queryRunner.query(
      'CREATE TABLE "casso_oauth_states" (' +
        '"id" uuid PRIMARY KEY, ' +
        '"organizationId" uuid NOT NULL, ' +
        '"initiatedByUserId" uuid NOT NULL, ' +
        '"expiresAt" timestamptz NOT NULL, ' +
        '"createdAt" timestamptz NOT NULL)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "casso_oauth_states"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_bank_connections_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoRefreshToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoAccessToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedSecureToken"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "bankName"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accountNumber"',
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns 20260828000000-replace-cas-id-with-casso-flow`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.ts apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.spec.ts
git commit -m "feat: migration replacing Cas ID columns/tables with Casso Flow's"
```

---

## Task 2: `CassoOAuthState` domain + port + ORM + repository (replaces `CasIdConnectionSession`)

**Files:**
- Create: `apps/backend/src/modules/bank-connections/domain/casso-oauth-state.ts`
- Create: `apps/backend/src/modules/bank-connections/domain/casso-oauth-state.spec.ts`
- Create: `apps/backend/src/modules/bank-connections/application/casso-oauth-state-repository.port.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-oauth-state.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-oauth-state.repository.ts`
- Delete: `apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts`
- Delete: `apps/backend/src/modules/bank-connections/application/cas-id-connection-session-repository.port.ts`
- Delete: `apps/backend/src/modules/bank-connections/infrastructure/cas-id-connection-session.orm-entity.ts`
- Delete: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-cas-id-connection-session.repository.ts`

**Interfaces:**
- Produces: `CassoOAuthState { id, organizationId, initiatedByUserId, expiresAt, createdAt }`, `isExpired(now: Date): boolean`; `ICassoOAuthStateRepository { findById, save }`; DI token `CASSO_OAUTH_STATE_REPOSITORY`. Task 6/7 consume these.

- [ ] **Step 1: Write the failing test**

```ts
import { CassoOAuthState } from './casso-oauth-state';

function buildState(expiresAt: Date): CassoOAuthState {
  return new CassoOAuthState({
    id: 'state-1',
    organizationId: 'org-1',
    initiatedByUserId: 'user-1',
    expiresAt,
    createdAt: new Date(),
  });
}

describe('CassoOAuthState', () => {
  it('is not expired before expiresAt', () => {
    const state = buildState(new Date(Date.now() + 60_000));
    expect(state.isExpired(new Date())).toBe(false);
  });

  it('is expired at or after expiresAt', () => {
    const state = buildState(new Date(Date.now() - 1));
    expect(state.isExpired(new Date())).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns casso-oauth-state.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/modules/bank-connections/domain/casso-oauth-state.ts`:

```ts
export interface CassoOAuthStateProps {
  id: string;
  organizationId: string;
  initiatedByUserId: string;
  expiresAt: Date;
  createdAt: Date;
}

// CSRF-protection record for the Casso Flow OAuth2 redirect round-trip only
// — not a multi-step "grant session". Casso Flow's OAuth2 is standard
// authorization-code, so there is nothing between "redirected" and
// "callback received" that needs its own status/state machine.
export class CassoOAuthState {
  readonly id: string;
  readonly organizationId: string;
  readonly initiatedByUserId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(props: CassoOAuthStateProps) {
    Object.assign(this, props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }
}
```

`apps/backend/src/modules/bank-connections/application/casso-oauth-state-repository.port.ts`:

```ts
import type { CassoOAuthState } from '../domain/casso-oauth-state';

export interface ICassoOAuthStateRepository {
  findById(id: string): Promise<CassoOAuthState | null>;
  save(state: CassoOAuthState): Promise<void>;
  delete(id: string): Promise<void>;
}

export const CASSO_OAUTH_STATE_REPOSITORY = Symbol('CASSO_OAUTH_STATE_REPOSITORY');
```

`apps/backend/src/modules/bank-connections/infrastructure/casso-oauth-state.orm-entity.ts`:

```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'casso_oauth_states' })
export class CassoOAuthStateOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  initiatedByUserId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

`apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-oauth-state.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { ICassoOAuthStateRepository } from '../application/casso-oauth-state-repository.port';
import { CassoOAuthState } from '../domain/casso-oauth-state';
import { CassoOAuthStateOrmEntity } from './casso-oauth-state.orm-entity';

@Injectable()
export class TypeOrmCassoOAuthStateRepository
  implements ICassoOAuthStateRepository
{
  constructor(
    @InjectRepository(CassoOAuthStateOrmEntity)
    private readonly ormRepo: Repository<CassoOAuthStateOrmEntity>,
  ) {}

  async findById(id: string): Promise<CassoOAuthState | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new CassoOAuthState(row) : null;
  }

  async save(state: CassoOAuthState): Promise<void> {
    await this.ormRepo.save(state);
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete({ id });
  }
}
```

Delete the 4 Cas ID files listed above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns casso-oauth-state.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/casso-oauth-state.ts apps/backend/src/modules/bank-connections/domain/casso-oauth-state.spec.ts apps/backend/src/modules/bank-connections/application/casso-oauth-state-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/casso-oauth-state.orm-entity.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-casso-oauth-state.repository.ts
git rm apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts apps/backend/src/modules/bank-connections/application/cas-id-connection-session-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id-connection-session.orm-entity.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-cas-id-connection-session.repository.ts
git commit -m "feat: replace CasIdConnectionSession with CassoOAuthState"
```

(This task leaves `initiate-connection.usecase.ts`/`exchange-token.usecase.ts` and the module wiring referencing the deleted files broken — expected, fixed in Task 6/7/8. Do not run the full suite/tsc yet; that happens at the end of Task 8.)

---

## Task 3: Redesign `BankConnection` domain + fix every existing construction call site

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`

**Interfaces:**
- Produces: `BankConnectionProps { id, organizationId, accountNumber, bankName, encryptedSecureToken, encryptedCassoAccessToken, encryptedCassoRefreshToken, status, connectedAt, lastSyncAt, revokedAt, createdAt }`, `reactivate(input: { accountNumber, bankName, encryptedSecureToken, encryptedCassoAccessToken, encryptedCassoRefreshToken })`. Task 4 (repository), Task 7 (exchange use case), Task 8 (response DTO) all depend on this exact shape.

- [ ] **Step 1: Write the failing test**

Replace `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts` in full:

```ts
import { BankConnection } from './bank-connection';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    encryptedSecureToken: 'encrypted-secure-token',
    encryptedCassoAccessToken: 'encrypted-access-token',
    encryptedCassoRefreshToken: 'encrypted-refresh-token',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('BankConnection', () => {
  it('supports the required connection state transitions', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    expect(reauth.status).toBe('REQUIRES_REAUTHORIZATION');
    expect(reauth.isUsable()).toBe(false);

    const reconnected = reauth.reactivate({
      accountNumber: '0044005566',
      bankName: 'New Bank',
      encryptedSecureToken: 'new-secure-token',
      encryptedCassoAccessToken: 'new-access-token',
      encryptedCassoRefreshToken: 'new-refresh-token',
    });
    expect(reconnected.status).toBe('ACTIVE');
    expect(reconnected.id).toBe('conn-1');
    expect(reconnected.isUsable()).toBe(true);
    expect(reconnected.accountNumber).toBe('0044005566');

    const disconnected = reconnected.disconnect();
    expect(disconnected.status).toBe('DISCONNECTED');
    expect(disconnected.revokedAt).not.toBeNull();
  });

  it('rejects disconnecting a connection that is already disconnected', () => {
    const disconnected = activeConnection().disconnect();
    expect(() => disconnected.disconnect()).toThrow(
      'Cannot disconnect a connection that is already disconnected',
    );
  });

  it('rejects marking a non-ACTIVE connection as requiring reauthorization', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    expect(() => reauth.markRequiresReauthorization()).toThrow(
      'Cannot mark connection as requiring reauthorization from status REQUIRES_REAUTHORIZATION',
    );
  });

  it('rejects reactivating a connection that is not awaiting reauthorization', () => {
    const active = activeConnection();
    expect(() =>
      active.reactivate({
        accountNumber: '0044005566',
        bankName: 'New Bank',
        encryptedSecureToken: 'new-secure-token',
        encryptedCassoAccessToken: 'new-access-token',
        encryptedCassoRefreshToken: 'new-refresh-token',
      }),
    ).toThrow('Cannot reactivate a connection in status ACTIVE');
  });

  it('marks an ACTIVE connection as ERROR on a non-authentication failure', () => {
    const errored = activeConnection().markError();
    expect(errored.status).toBe('ERROR');
    expect(errored.isUsable()).toBe(false);
  });

  it('rejects marking a non-ACTIVE connection as ERROR', () => {
    const errored = activeConnection().markError();
    expect(() => errored.markError()).toThrow(
      'Cannot mark connection as ERROR from status ERROR',
    );
  });

  it('reactivates a connection that was marked ERROR', () => {
    const errored = activeConnection().markError();
    const reconnected = errored.reactivate({
      accountNumber: '0044005566',
      bankName: 'New Bank',
      encryptedSecureToken: 'new-secure-token',
      encryptedCassoAccessToken: 'new-access-token',
      encryptedCassoRefreshToken: 'new-refresh-token',
    });
    expect(reconnected.status).toBe('ACTIVE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns bank-connection.spec.ts`
Expected: FAIL — TS compile error, old `BankConnectionProps` shape doesn't have `accountNumber`/etc.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/modules/bank-connections/domain/bank-connection.ts` in full:

```ts
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
  accountNumber: string;
  bankName: string;
  encryptedSecureToken: string;
  encryptedCassoAccessToken: string;
  encryptedCassoRefreshToken: string;
  status: BankConnectionStatus;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class BankConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly accountNumber: string;
  readonly bankName: string;
  readonly encryptedSecureToken: string;
  readonly encryptedCassoAccessToken: string;
  readonly encryptedCassoRefreshToken: string;
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
    encryptedSecureToken: string;
    encryptedCassoAccessToken: string;
    encryptedCassoRefreshToken: string;
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

In each of `assert-reauthorizable.spec.ts`, `disconnect-connection.usecase.spec.ts`, `mark-requires-reauthorization.usecase.spec.ts`, `sync-transactions.usecase.spec.ts`: replace the `connectionWithStatus`/`activeConnection` builder function's body — every one currently has this shape:

```ts
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
    encryptedAccessToken: 'encrypted', // or encryptToken('raw-access-token', encryptionKey) in the 2 files that use it
    accountIdentity: { accountNumber: '0011002233', bankName: 'Mock Bank' },
```

Replace with:

```ts
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    encryptedSecureToken: 'encrypted-secure-token',
    encryptedCassoAccessToken: encryptToken('raw-access-token', encryptionKey), // keep encryptToken(...) only in the 2 files that already import/use it (disconnect-connection.usecase.spec.ts, sync-transactions.usecase.spec.ts); the other 2 files use a plain string literal 'encrypted-access-token' since they don't decrypt anything
    encryptedCassoRefreshToken: 'encrypted-refresh-token',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns "bank-connection.spec|assert-reauthorizable.spec|disconnect-connection.usecase.spec|mark-requires-reauthorization.usecase.spec|sync-transactions.usecase.spec"`
Expected: these specs still reference `CasIdUnauthorizedError` (deleted in Task 2's port file) — that import will now fail. **This is expected at this point in the plan; Task 4 renames it.** Confirm the failures are ONLY `Cannot find module './cas-id-integration-adapter.port'`-shaped, not shape/field mismatches — that confirms Step 3's domain change itself is correct even though the suite isn't green yet.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/bank-connection.ts apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git commit -m "feat: redesign BankConnection domain around Casso Flow's model"
```

---

## Task 4: `ICassoFlowIntegrationAdapter` port + repository `findByAccountNumber`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts`
- Delete: `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify (mechanical import rename `CasIdUnauthorizedError` → `CassoFlowUnauthorizedError`, `from './cas-id-integration-adapter.port'` → `from './casso-flow-integration-adapter.port'`): `disconnect-connection.usecase.ts`, `disconnect-connection.usecase.spec.ts`, `mark-requires-reauthorization.usecase.ts`, `mark-requires-reauthorization.usecase.spec.ts`, `sync-transactions.usecase.ts`, `sync-transactions.usecase.spec.ts`

**Interfaces:**
- Produces: `ICassoFlowIntegrationAdapter { exchangeCodeForToken(code): Promise<{accessToken, refreshToken}>; getAccountInfo(accessToken): Promise<{accountNumber, bankName}>; registerWebhook(accessToken, secureToken): Promise<void>; invalidateToken(accessToken): Promise<void>; getTransactions(accessToken): Promise<[]> }`, `CassoFlowUnauthorizedError`, `IBankConnectionRepository.findByAccountNumber(accountNumber): Promise<BankConnection | null>` (replaces `findByGrantId`). Task 5 (adapter impl), Task 7 (exchange use case), Task 11 (receive-webhook use case) all consume these.

This task is plumbing (port + repository method), no new business logic to unit-test beyond what Task 5's adapter spec and the e2e (Task 14) already cover — same exception reasoning as the prior plan's `findByGrantId` task.

- [ ] **Step 1: Write the port**

```ts
import type { AccountIdentity } from '../domain/bank-connection';
```

Wait — `AccountIdentity` no longer exists (removed in Task 3). Create `apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts`:

```ts
export interface CassoFlowAccountInfo {
  accountNumber: string;
  bankName: string;
}

export interface ICassoFlowIntegrationAdapter {
  exchangeCodeForToken(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }>;
  getAccountInfo(accessToken: string): Promise<CassoFlowAccountInfo>;
  registerWebhook(accessToken: string, secureToken: string): Promise<void>;
  invalidateToken(accessToken: string): Promise<void>;
  getTransactions(accessToken: string): Promise<unknown[]>;
}

export const CASSO_FLOW_INTEGRATION_ADAPTER = Symbol(
  'CASSO_FLOW_INTEGRATION_ADAPTER',
);

export class CassoFlowUnauthorizedError extends Error {
  constructor() {
    super(
      'Casso Flow access token rejected (401/403) — connection requires reauthorization',
    );
    this.name = 'CassoFlowUnauthorizedError';
  }
}
```

Delete `cas-id-integration-adapter.port.ts`.

- [ ] **Step 2: Repository port + implementation**

Edit `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`, replace the `findByGrantId` method:

```ts
  // Unscoped on purpose, same reasoning as findByIdUnscoped above: called
  // from ReceiveWebhookUseCase, which handles an inbound Casso Flow webhook
  // — there is no TenantContextService organizationId at that point, only
  // the accountNumber the payload carries.
  findByAccountNumber(accountNumber: string): Promise<BankConnection | null>;
```

Edit `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`, replace `findByGrantId`:

```ts
  async findByAccountNumber(
    accountNumber: string,
  ): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { accountNumber } });
    return row ? new BankConnection(row) : null;
  }
```

- [ ] **Step 3: Mechanical rename in the 3 use cases + their specs**

In `disconnect-connection.usecase.ts`, `mark-requires-reauthorization.usecase.ts`, `sync-transactions.usecase.ts` and their `.spec.ts` files: change every `import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port'` to `import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port'`, and every use of `CasIdUnauthorizedError` (both the class reference and any `'401/403 from getTransactions'`/`'401/403 from invalidateToken'` string literals stay as-is — those describe the HTTP failure, not the error class name) to `CassoFlowUnauthorizedError`. Also change the `ICasIdIntegrationAdapter`/`CAS_ID_INTEGRATION_ADAPTER` type/token references in these 3 use cases' constructors to `ICassoFlowIntegrationAdapter`/`CASSO_FLOW_INTEGRATION_ADAPTER` from the new port file.

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && npx jest --testPathPatterns "disconnect-connection.usecase|mark-requires-reauthorization.usecase|sync-transactions.usecase"`
Expected: PASS, all 3 suites (the domain/field changes from Task 3 plus this rename together make them green).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git rm apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts
git commit -m "feat: replace ICasIdIntegrationAdapter with ICassoFlowIntegrationAdapter"
```

---

## Task 5: `CassoFlowAdapter` — real HTTP calls to Casso Flow's OAuth2 + webhook APIs

**Files:**
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts`
- Delete: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`, `cas-id.adapter.spec.ts`, `mock-cas-id.adapter.ts`, `mock-cas-id.adapter.spec.ts`, `select-cas-id-adapter.ts`, `select-cas-id-adapter.spec.ts`

**Interfaces:**
- Produces: `CassoFlowAdapter implements ICassoFlowIntegrationAdapter`. No Mock/factory this time — see rationale below.

**No mock adapter this time.** The prior Cas ID work had `MockCasIdAdapter` because real credentials didn't exist yet. Real Casso Flow credentials (`CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY`) already exist (the user provided them). Build `CassoFlowAdapter` as the only implementation; tests mock `fetch`, not the adapter. If a later environment genuinely needs a no-network stand-in (e.g. a fresh contributor with no credentials), that's a new, separately-justified need — do not speculatively rebuild the Mock/factory pattern now.

- [ ] **Step 1: Write the failing test**

```ts
import { CassoFlowAdapter } from './casso-flow.adapter';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CassoFlowAdapter', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CASSO_WEBHOOK_CLIENT_ID: 'test-client-id',
      CASSO_WEBHOOK_SECRET_KEY: 'test-secret-key',
      CASSO_FLOW_REDIRECT_URI: 'http://localhost:5173/bank-connections/casso-flow/callback',
      CASSO_FLOW_WEBHOOK_URL: 'http://localhost:3000/api/v1/webhooks/casso-balance-hook',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('exchanges an authorization code for an access/refresh token pair', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { access_token: 'real-access', refresh_token: 'real-refresh' }),
        );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.exchangeCodeForToken('auth-code-1');

      expect(result).toEqual({ accessToken: 'real-access', refreshToken: 'real-refresh' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/auth/token');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('test-client-id:test-secret-key').toString('base64')}`,
      );
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.body).toBe(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'auth-code-1',
          redirect_uri: 'http://localhost:5173/bank-connections/casso-flow/callback',
        }).toString(),
      );
    });

    it('throws CassoFlowUnauthorizedError on a 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Casso Flow access token rejected',
      );
    });
  });

  describe('getAccountInfo', () => {
    it('fetches account number and bank name with a Bearer token', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { accountNumber: '867623232', bankName: 'VPBank' } }),
        );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('access-token-1');

      expect(result).toEqual({ accountNumber: '867623232', bankName: 'VPBank' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/userInfo');
      expect(init.headers.Authorization).toBe('Bearer access-token-1');
    });

    it('throws if accountNumber is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: { bankName: 'VPBank' } })) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('access-token-1')).rejects.toThrow(
        'Casso Flow /v2/userInfo response is missing accountNumber',
      );
    });
  });

  describe('registerWebhook', () => {
    it('registers this product\'s webhook URL with the generated secure token', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      await adapter.registerWebhook('access-token-1', 'secure-token-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/webhooks');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer access-token-1');
      expect(JSON.parse(init.body)).toEqual({
        webhook: 'http://localhost:3000/api/v1/webhooks/casso-balance-hook',
        secure_token: 'secure-token-1',
        income_only: true,
      });
    });
  });

  describe('retry', () => {
    it('retries a 503 up to 3 times with backoff', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(503, {}))
        .mockResolvedValueOnce(jsonResponse(200, { data: { accountNumber: '1', bankName: 'B' } }));
      global.fetch = fetchMock as never;
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0 as never;
      }) as never);
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('access-token-1');

      expect(result.accountNumber).toBe('1');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns casso-flow.adapter.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Injectable, Logger } from '@nestjs/common';
import {
  type CassoFlowAccountInfo,
  CassoFlowUnauthorizedError,
  type ICassoFlowIntegrationAdapter,
} from '../application/casso-flow-integration-adapter.port';

const OAUTH_BASE_URL = 'https://oauth.casso.vn';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

class CassoFlowHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CassoFlowHttpError';
  }
}

// ponytail: invalidateToken and getTransactions are stubs (no-op / empty
// array) — this session's implementation only covers connect+receive
// (see spec §6 "Out of scope"). Disconnect-side webhook unregistration and
// the /v2/sync reconciliation call are deliberate follow-ups, not guesses.
@Injectable()
export class CassoFlowAdapter implements ICassoFlowIntegrationAdapter {
  private readonly logger = new Logger(CassoFlowAdapter.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly webhookUrl: string;

  constructor() {
    this.clientId = process.env.CASSO_WEBHOOK_CLIENT_ID ?? '';
    this.clientSecret = process.env.CASSO_WEBHOOK_SECRET_KEY ?? '';
    this.redirectUri = process.env.CASSO_FLOW_REDIRECT_URI ?? '';
    this.webhookUrl = process.env.CASSO_FLOW_WEBHOOK_URL ?? '';
  }

  async exchangeCodeForToken(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    }).toString();
    const data = await this.request<Record<string, unknown>>('/auth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Casso Flow /auth/token response is missing access_token');
    }
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new Error('Casso Flow /auth/token response is missing refresh_token');
    }
    return { accessToken, refreshToken };
  }

  async getAccountInfo(accessToken: string): Promise<CassoFlowAccountInfo> {
    const data = await this.request<Record<string, unknown>>(
      '/v2/userInfo',
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = this.unwrap(data);
    const accountNumber = payload.accountNumber;
    const bankName = payload.bankName;
    if (typeof accountNumber !== 'string' || !accountNumber) {
      throw new Error('Casso Flow /v2/userInfo response is missing accountNumber');
    }
    if (typeof bankName !== 'string' || !bankName) {
      throw new Error('Casso Flow /v2/userInfo response is missing bankName');
    }
    return { accountNumber, bankName };
  }

  async registerWebhook(accessToken: string, secureToken: string): Promise<void> {
    await this.request('/v2/webhooks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: this.webhookUrl,
        secure_token: secureToken,
        income_only: true,
      }),
    });
  }

  async invalidateToken(_accessToken: string): Promise<void> {}

  async getTransactions(_accessToken: string): Promise<unknown[]> {
    return [];
  }

  private unwrap(data: Record<string, unknown>): Record<string, unknown> {
    if (typeof data.data === 'object' && data.data !== null) {
      return data.data as Record<string, unknown>;
    }
    return data;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${OAUTH_BASE_URL}${path}`, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new CassoFlowUnauthorizedError();
        }
        throw new CassoFlowHttpError(`Casso Flow API error ${response.status}`, response.status);
      }

      return data as T;
    }, path);
  }

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isRetryable =
          error instanceof CassoFlowHttpError &&
          RETRYABLE_STATUS_CODES.has(error.status);
        if (!isRetryable || attempt === MAX_RETRIES) throw error;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `Casso Flow ${context} attempt ${attempt + 1} failed, retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }
}
```

Delete the 6 Cas ID infra files listed above.

**Verify empirically, do not assume further:** once real `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` are available in a runnable environment, manually exercise `exchangeCodeForToken`/`getAccountInfo`/`registerWebhook` against the real Casso Flow API (e.g. via a throwaway script or the actual connect flow once Task 6/7/8 exist) before trusting this task's assumed response shapes (`access_token`/`refresh_token` field names, whether `/v2/userInfo`'s response really is wrapped in a top-level `data` key). Adjust `unwrap`/field names if reality differs — this is exactly the kind of assumption that broke the Cas ID work once already.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns casso-flow.adapter.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts
git rm apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.ts apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.spec.ts
git commit -m "feat: add CassoFlowAdapter, remove Cas ID adapters"
```

---

## Task 6: `InitiateCassoFlowConnectionUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/initiate-casso-flow-connection.usecase.ts`
- Create: `apps/backend/src/modules/bank-connections/application/initiate-casso-flow-connection.usecase.spec.ts`
- Delete: `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts` (and any leftover spec coverage for it inside `connection-usecases.spec.ts` — see Task 7, which replaces that whole file)

**Interfaces:**
- Consumes: `ICassoOAuthStateRepository` (Task 2), `IBankConnectionRepository.findById`/`assertReauthorizable` (unchanged).
- Produces: `InitiateCassoFlowConnectionUseCase.execute({ userId, bankConnectionId? }): Promise<{ authorizeUrl: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { InitiateCassoFlowConnectionUseCase } from './initiate-casso-flow-connection.usecase';

describe('InitiateCassoFlowConnectionUseCase', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CASSO_WEBHOOK_CLIENT_ID: 'test-client-id',
      CASSO_FLOW_REDIRECT_URI: 'http://localhost:5173/bank-connections/casso-flow/callback',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a CassoOAuthState and returns an authorize URL carrying its id as state', async () => {
    const stateRepo = { save: jest.fn() };
    const useCase = new InitiateCassoFlowConnectionUseCase(
      stateRepo as never,
      { findById: jest.fn() } as never,
      { getOrganizationId: () => 'org-1' } as never,
    );

    const result = await useCase.execute({ userId: 'user-1' });

    expect(stateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', initiatedByUserId: 'user-1' }),
    );
    const savedState = stateRepo.save.mock.calls[0][0];
    expect(result.authorizeUrl).toBe(
      `https://oauth.casso.vn/auth/authorize?client_id=test-client-id&redirect_uri=${encodeURIComponent('http://localhost:5173/bank-connections/casso-flow/callback')}&response_type=code&state=${savedState.id}`,
    );
  });

  it('rejects initiating when the target bankConnectionId is not reauthorizable', async () => {
    const useCase = new InitiateCassoFlowConnectionUseCase(
      { save: jest.fn() } as never,
      { findById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) } as never,
      { getOrganizationId: () => 'org-1' } as never,
    );

    await expect(
      useCase.execute({ userId: 'user-1', bankConnectionId: 'conn-1' }),
    ).rejects.toThrow('Cannot reactivate a connection in status ACTIVE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns initiate-casso-flow-connection.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CASSO_OAUTH_STATE_REPOSITORY,
  type ICassoOAuthStateRepository,
} from './casso-oauth-state-repository.port';
import { CassoOAuthState } from '../domain/casso-oauth-state';
import { assertReauthorizable } from './assert-reauthorizable';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface InitiateCassoFlowConnectionInput {
  userId: string;
  bankConnectionId?: string;
}

export interface InitiateCassoFlowConnectionResult {
  authorizeUrl: string;
}

@Injectable()
export class InitiateCassoFlowConnectionUseCase {
  constructor(
    @Inject(CASSO_OAUTH_STATE_REPOSITORY)
    private readonly stateRepo: ICassoOAuthStateRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: InitiateCassoFlowConnectionInput,
  ): Promise<InitiateCassoFlowConnectionResult> {
    const existing = input.bankConnectionId
      ? await this.bankConnectionRepo.findById(input.bankConnectionId)
      : null;
    assertReauthorizable(input.bankConnectionId, existing);

    const state = new CassoOAuthState({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      initiatedByUserId: input.userId,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      createdAt: new Date(),
    });
    await this.stateRepo.save(state);

    const params = new URLSearchParams({
      client_id: process.env.CASSO_WEBHOOK_CLIENT_ID ?? '',
      redirect_uri: process.env.CASSO_FLOW_REDIRECT_URI ?? '',
      response_type: 'code',
      state: state.id,
    });
    return {
      authorizeUrl: `https://oauth.casso.vn/auth/authorize?${params.toString()}`,
    };
  }
}
```

Delete `initiate-connection.usecase.ts`.

**Verify empirically:** the spec explicitly defers the OAuth2 `scope` param (spec §3 step 1) — this implementation omits it. Before considering the connect flow production-ready, check Casso Flow's console/docs for whether a `scope` value is required for `/auth/authorize` to succeed, and add it if so.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns initiate-casso-flow-connection.usecase.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/initiate-casso-flow-connection.usecase.ts apps/backend/src/modules/bank-connections/application/initiate-casso-flow-connection.usecase.spec.ts
git rm apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts
git commit -m "feat: add InitiateCassoFlowConnectionUseCase"
```

---

## Task 7: `ExchangeCassoFlowConnectionUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/exchange-casso-flow-connection.usecase.ts`
- Create: `apps/backend/src/modules/bank-connections/application/exchange-casso-flow-connection.usecase.spec.ts` (replaces `connection-usecases.spec.ts`'s exchange-related tests)
- Delete: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts` — remove every `InitiateConnectionUseCase`/`ExchangeTokenUseCase` test (they're superseded by Task 6's and this task's own spec files); keep only what's unrelated if anything remains (check the file after Task 6 — if nothing but exchange-token tests remain, delete the file entirely instead)

**Interfaces:**
- Consumes: `ICassoOAuthStateRepository`, `ICassoFlowIntegrationAdapter`, `IBankConnectionRepository`, `token-encryption.ts` (unchanged).
- Produces: `ExchangeCassoFlowConnectionUseCase.execute({ code, state }): Promise<BankConnection>`.

- [ ] **Step 1: Write the failing test**

```ts
import { AppError } from '../../../common/errors/app-error';
import { CassoOAuthState } from '../domain/casso-oauth-state';
import { ExchangeCassoFlowConnectionUseCase } from './exchange-casso-flow-connection.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

function pendingState(expiresAt = new Date(Date.now() + 60_000)): CassoOAuthState {
  return new CassoOAuthState({
    id: 'state-1',
    organizationId: 'org-1',
    initiatedByUserId: 'user-1',
    expiresAt,
    createdAt: new Date(),
  });
}

describe('ExchangeCassoFlowConnectionUseCase', () => {
  it('exchanges the code, fetches account info, registers a webhook, and creates the connection', async () => {
    const stateRepo = { findById: jest.fn().mockResolvedValue(pendingState()), delete: jest.fn() };
    const bankConnectionRepo = {
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const auditEventRepo = { save: jest.fn() };
    const adapter = {
      exchangeCodeForToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ accountNumber: '0011002233', bankName: 'VPBank' }),
      registerWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ExchangeCassoFlowConnectionUseCase(
      stateRepo as never,
      adapter as never,
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({ code: 'auth-code-1', state: 'state-1' });

    expect(result.status).toBe('ACTIVE');
    expect(result.accountNumber).toBe('0011002233');
    expect(adapter.registerWebhook).toHaveBeenCalledWith(
      'access-1',
      expect.any(String),
    );
    expect(stateRepo.delete).toHaveBeenCalledWith('state-1');
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', status: 'ACTIVE' }),
      expect.anything(),
    );
  });

  it('rejects an unknown state', async () => {
    const stateRepo = { findById: jest.fn().mockResolvedValue(null), delete: jest.fn() };
    const useCase = new ExchangeCassoFlowConnectionUseCase(
      stateRepo as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      encryptionKey,
      {} as never,
    );

    await expect(
      useCase.execute({ code: 'auth-code-1', state: 'unknown' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an expired state', async () => {
    const stateRepo = {
      findById: jest.fn().mockResolvedValue(pendingState(new Date(Date.now() - 1))),
      delete: jest.fn(),
    };
    const useCase = new ExchangeCassoFlowConnectionUseCase(
      stateRepo as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      encryptionKey,
      {} as never,
    );

    await expect(
      useCase.execute({ code: 'auth-code-1', state: 'state-1' }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns exchange-casso-flow-connection.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { assertReauthorizable } from './assert-reauthorizable';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import {
  CASSO_OAUTH_STATE_REPOSITORY,
  type ICassoOAuthStateRepository,
} from './casso-oauth-state-repository.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import { encryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface ExchangeCassoFlowConnectionInput {
  code: string;
  state: string;
}

@Injectable()
export class ExchangeCassoFlowConnectionUseCase {
  constructor(
    @Inject(CASSO_OAUTH_STATE_REPOSITORY)
    private readonly stateRepo: ICassoOAuthStateRepository,
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly dataSource: DataSource,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async execute(input: ExchangeCassoFlowConnectionInput): Promise<BankConnection> {
    const state = await this.stateRepo.findById(input.state);
    if (!state) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiên kết nối.');
    }
    if (state.isExpired(new Date())) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Phiên kết nối đã hết hạn hoặc đã được sử dụng.',
      );
    }

    // External calls stay outside the transaction — only the DB writes below are wrapped.
    const { accessToken, refreshToken } = await this.adapter.exchangeCodeForToken(
      input.code,
    );
    const accountInfo = await this.adapter.getAccountInfo(accessToken);
    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(accessToken, secureToken);

    return this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceBankConnectionLimit(manager, () =>
        this.bankConnectionRepo.countActiveByOrganization(
          state.organizationId,
          manager,
        ),
      );

      const existingConnection = await this.bankConnectionRepo.findByIdForUpdate(
        state.organizationId,
        manager,
      );
      const props = {
        accountNumber: accountInfo.accountNumber,
        bankName: accountInfo.bankName,
        encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
        encryptedCassoAccessToken: encryptToken(accessToken, this.encryptionKey),
        encryptedCassoRefreshToken: encryptToken(refreshToken, this.encryptionKey),
      };
      const connection =
        existingConnection && existingConnection.status !== 'ACTIVE'
          ? existingConnection.reactivate(props)
          : new BankConnection({
              id: randomUUID(),
              organizationId: state.organizationId,
              ...props,
              status: 'ACTIVE',
              connectedAt: new Date(),
              lastSyncAt: null,
              revokedAt: null,
              createdAt: new Date(),
            });

      await this.bankConnectionRepo.save(connection, manager);
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: connection.organizationId,
          bankConnectionId: connection.id,
          eventType: existingConnection ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
          metadata: { accountNumber: accountInfo.accountNumber },
          createdAt: new Date(),
        }),
        manager,
      );
      await this.stateRepo.delete(state.id);
      return connection;
    });
  }
}
```

Note: `findByIdForUpdate` is keyed by `state.organizationId` here, not a `bankConnectionId` — since Casso Flow allows exactly one account per organization (§2 of the spec: "one active connection per org"), reactivation targets "the org's existing connection, whatever its id," not a specific id the caller must already know (unlike the Cas ID flow, which threaded a specific `bankConnectionId` through `assertReauthorizable`). `findByIdForUpdate`'s signature takes an id, not an organizationId — **this is a real interface mismatch to resolve in Step 3's actual implementation, not paper over**: either add a new `findByOrganizationIdForUpdate` repository method, or look up via `findByAccountNumber` first (available once known) — since the account number is only known *after* `getAccountInfo` runs, use a new `findActiveOrReauthorizableByOrganizationForUpdate(organizationId, manager)` repository method instead. Add this method to `IBankConnectionRepository`/`TypeOrmBankConnectionRepository` as part of this task (thin `findOne({ where: { organizationId }, lock: ... })` wrapper, same pattern as `findByIdForUpdate`), and use it in place of the `findByIdForUpdate(state.organizationId, ...)` call shown above before finalizing this task's code.

Delete `exchange-token.usecase.ts`. In `connection-usecases.spec.ts`: delete every test for `InitiateConnectionUseCase`/`ExchangeTokenUseCase` (all of them, per Task 6 already covering initiate) — if nothing meaningful remains in the file, delete it entirely (`git rm`) rather than leaving an empty `describe` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns exchange-casso-flow-connection.usecase.spec.ts`
Expected: PASS (3 tests) once the `findActiveOrReauthorizableByOrganizationForUpdate` interface mismatch from Step 3 is resolved.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/exchange-casso-flow-connection.usecase.ts apps/backend/src/modules/bank-connections/application/exchange-casso-flow-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts
git rm apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts
git add apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts
git commit -m "feat: add ExchangeCassoFlowConnectionUseCase"
```

---

## Task 8: Controller, DTOs, response mapper, module wiring

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/dto/bank-connection-response.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/initiate-casso-flow-connection-response.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/exchange-casso-flow-connection.dto.ts`
- Delete: `apps/backend/src/modules/bank-connections/presentation/dto/exchange-token.dto.ts`, `initiate-connection.dto.ts`, `initiate-connection-response.dto.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

- [ ] **Step 1: Response DTO fix (flat fields, not nested `accountIdentity`)**

Edit `bank-connection-response.dto.ts`'s `toBankConnectionResponse`:

```ts
export function toBankConnectionResponse(
  connection: BankConnection,
): BankConnectionResponseDto {
  const dto = new BankConnectionResponseDto();
  dto.id = connection.id;
  dto.accountNumber = connection.accountNumber;
  dto.bankName = connection.bankName;
  dto.status = connection.status;
  dto.connectedAt = connection.connectedAt;
  dto.lastSyncAt = connection.lastSyncAt;
  dto.createdAt = connection.createdAt;
  return dto;
}
```

(`BankConnectionResponseDto`'s field declarations are unchanged — already flat.)

- [ ] **Step 2: New DTOs**

`initiate-casso-flow-connection-response.dto.ts`:

```ts
export class InitiateCassoFlowConnectionResponseDto {
  authorizeUrl: string;
}
```

`exchange-casso-flow-connection.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ExchangeCassoFlowConnectionDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  state: string;
}
```

`initiate-connection.dto.ts` (kept, unchanged shape — still just an optional `bankConnectionId` for the reauthorize case) is **not** deleted; rename its import site only. Delete `exchange-token.dto.ts` and `initiate-connection-response.dto.ts`.

- [ ] **Step 3: Controller**

Replace the `cas-id/*` routes in `bank-connections.controller.ts`:

```ts
  @Post('casso-flow/initiate')
  @ApiOperation({ summary: 'Initiate a Casso Flow bank connection' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: InitiateCassoFlowConnectionResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async initiate(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiateConnectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/initiate',
      key,
      dto,
      () => {
        const userId = request.user?.userId;
        if (!userId) {
          throw new UnauthorizedException();
        }
        return this.initiateCassoFlowConnectionUseCase.execute({
          userId,
          bankConnectionId: dto.bankConnectionId,
        });
      },
    );
  }

  @Post('casso-flow/exchange')
  @ApiOperation({ summary: 'Exchange a Casso Flow OAuth2 code for a connection' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Connection created',
    schema: {
      type: 'object',
      required: ['connectionId', 'status'],
      properties: {
        connectionId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async exchange(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ExchangeCassoFlowConnectionDto,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/exchange',
      key,
      dto,
      async () => {
        const connection = await this.exchangeCassoFlowConnectionUseCase.execute({
          code: dto.code,
          state: dto.state,
        });
        return { connectionId: connection.id, status: connection.status };
      },
    );
  }
```

Update the constructor to inject `InitiateCassoFlowConnectionUseCase`/`ExchangeCassoFlowConnectionUseCase` in place of `InitiateConnectionUseCase`/`ExchangeTokenUseCase`, and update imports accordingly (drop `ExchangeTokenDto`/`InitiateConnectionResponseDto`, add the two new DTOs).

- [ ] **Step 4: Module wiring**

Rewrite `bank-connections.module.ts`'s Cas-ID-specific parts: swap `CasIdConnectionSessionOrmEntity` → `CassoOAuthStateOrmEntity` in `TypeOrmModule.forFeature`, `CAS_ID_CONNECTION_SESSION_REPOSITORY`/`TypeOrmCasIdConnectionSessionRepository` → `CASSO_OAUTH_STATE_REPOSITORY`/`TypeOrmCassoOAuthStateRepository`, `CAS_ID_INTEGRATION_ADAPTER` provider from `useFactory: () => selectCasIdAdapter()` to `useClass: CassoFlowAdapter`, `InitiateConnectionUseCase`/`ExchangeTokenUseCase` → `InitiateCassoFlowConnectionUseCase`/`ExchangeCassoFlowConnectionUseCase` in both `providers` and `exports`.

- [ ] **Step 5: Full module test suite + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns bank-connections && npx tsc --noEmit`
Expected: PASS, no type errors. This is the first point in the plan where the whole `bank-connections` module should compile clean — if `tsc` surfaces errors outside files this task or Tasks 1–7 touched, they're pre-existing callers this plan hasn't reached yet (webhooks module, Task 9–12) — confirm errors are confined there before moving on.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/presentation apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: wire Casso Flow controller routes, DTOs, and module providers"
```

---

## Task 9: `BalanceHookDto` — real flat Casso Flow payload shape

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts`
- Create: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceHookDto } from './balance-hook.dto';

const validPayload = {
  error: 0,
  data: {
    id: 0,
    reference: 'MA_GIAO_DICH_THU_NGHIEM',
    description: 'giao dich thu nghiem',
    amount: 599000,
    runningBalance: 25000000,
    transactionDateTime: '2025-02-12 15:36:21',
    accountNumber: '88888888',
    bankName: 'VPBank',
    bankAbbreviation: 'VPB',
    virtualAccountNumber: '',
    virtualAccountName: '',
    counterAccountName: 'NGUYEN VAN A',
    counterAccountNumber: '8888888888',
    counterAccountBankId: '970415',
    counterAccountBankName: 'VietinBank',
  },
};

describe('BalanceHookDto', () => {
  it('accepts the real Casso Flow payload verbatim', async () => {
    const dto = plainToInstance(BalanceHookDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.data.accountNumber).toBe('88888888');
  });

  it('accepts empty-string counterparty fields', async () => {
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      data: { ...validPayload.data, counterAccountName: '', counterAccountNumber: '' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a payload missing data.accountNumber', async () => {
    const { accountNumber, ...dataWithoutAccountNumber } = validPayload.data;
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      data: dataWithoutAccountNumber,
    });
    const errors = await validate(dto, { validationError: { target: false } });
    const dataErrors = errors.find((e) => e.property === 'data');
    expect(
      dataErrors?.children?.some((c) => c.property === 'accountNumber'),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns balance-hook.dto.spec.ts`
Expected: FAIL — current DTO has no `data` property.

- [ ] **Step 3: Write minimal implementation**

Replace `balance-hook.dto.ts` in full:

```ts
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BalanceHookDataDto {
  @IsInt() id: number;
  @IsOptional() reference?: string | null;
  @IsOptional() description?: string;
  @IsInt() amount: number;
  @IsOptional() runningBalance?: number;
  @IsString() @IsNotEmpty() transactionDateTime: string;
  @IsString() @IsNotEmpty() accountNumber: string;
  @IsOptional() bankName?: string;
  @IsOptional() counterAccountName?: string;
  @IsOptional() counterAccountNumber?: string | number;
}

export class BalanceHookDto {
  @IsInt() error: number;

  @ValidateNested()
  @Type(() => BalanceHookDataDto)
  data: BalanceHookDataDto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns balance-hook.dto.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts
git commit -m "fix: rewrite BalanceHookDto to Casso Flow's real flat payload shape"
```

---

## Task 10: `transaction-normalizer.ts` — Casso Flow field mapping + date parsing

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`

**Interfaces:** `NormalizedTransaction` shape is unchanged (`providerTransactionId, amount, transactionDateTime, counterpartyAccountNumber, counterpartyName, transferContent`) — only what it reads from changes.

- [ ] **Step 1: Write the failing test**

Replace `transaction-normalizer.spec.ts` in full:

```ts
import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps the real Casso Flow payload into an internal transaction', () => {
    expect(
      normalizeBalanceHookPayload({
        error: 0,
        data: {
          id: 123,
          amount: 30_000_000,
          transactionDateTime: '2026-08-01 10:00:00',
          counterAccountNumber: '0011002233',
          counterAccountName: 'CONG TY B',
          description: 'TT HD INV-2026-0012',
        },
      }),
    ).toEqual({
      providerTransactionId: '123',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01T10:00:00+07:00'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    });
  });

  it('maps empty-string counterparty fields through unchanged', () => {
    const result = normalizeBalanceHookPayload({
      error: 0,
      data: {
        id: 124,
        amount: 10_000,
        transactionDateTime: '2026-08-01 10:00:00',
        counterAccountNumber: '',
        counterAccountName: '',
        description: '',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('');
    expect(result.counterpartyName).toBe('');
    expect(result.transferContent).toBe('');
  });

  it('coerces a numeric counterAccountNumber to a string', () => {
    const result = normalizeBalanceHookPayload({
      error: 0,
      data: {
        id: 125,
        amount: 1_000,
        transactionDateTime: '2026-08-01 10:00:00',
        counterAccountNumber: 8888888888,
        counterAccountName: 'A',
        description: 'x',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('8888888888');
  });

  it('throws when data.id is missing', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        error: 0,
        data: { amount: 1_000, transactionDateTime: '2026-08-01 10:00:00' },
      }),
    ).toThrow('Webhook field data.id is invalid');
  });

  it('throws when data.transactionDateTime cannot be parsed', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        error: 0,
        data: { id: 1, amount: 1_000, transactionDateTime: 'not-a-date' },
      }),
    ).toThrow('Webhook field data.transactionDateTime is invalid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns transaction-normalizer.spec.ts`
Expected: FAIL — current implementation reads `payload.transaction.*`, not `payload.data.*`, and Casso Flow's `"2026-08-01 10:00:00"` (space-separated, no timezone) format needs explicit `Asia/Ho_Chi_Minh` handling, not `new Date(...)` parsing it directly (that string is not a format `Date` reliably parses across Node versions/locales).

- [ ] **Step 3: Write minimal implementation**

Replace `transaction-normalizer.ts` in full:

```ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export interface NormalizedTransaction {
  providerTransactionId: string;
  amount: number;
  transactionDateTime: Date;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

interface BalanceHookDataPayload {
  id?: unknown;
  amount?: unknown;
  transactionDateTime?: unknown;
  description?: unknown;
  counterAccountNumber?: unknown;
  counterAccountName?: unknown;
}

function toStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

// Casso Flow sends "YYYY-MM-DD HH:mm:ss" with no timezone marker, always in
// Asia/Ho_Chi_Minh (+07:00) — this product's standard timezone (AGENTS.md).
// Appending the offset explicitly avoids relying on `new Date(...)`'s
// locale/engine-dependent parsing of a space-separated, timezone-less string.
function parseCassoFlowDateTime(value: string): Date {
  const isoLike = `${value.replace(' ', 'T')}+07:00`;
  return new Date(isoLike);
}

export function normalizeBalanceHookPayload(
  payload: Record<string, unknown>,
): NormalizedTransaction {
  const data = (payload.data ?? {}) as BalanceHookDataPayload;

  const id = data.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.id is invalid',
    );
  }

  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.amount must be an integer',
    );
  }

  const transactionDateTimeRaw = data.transactionDateTime;
  if (typeof transactionDateTimeRaw !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.transactionDateTime is invalid',
    );
  }
  const transactionDateTime = parseCassoFlowDateTime(transactionDateTimeRaw);
  if (Number.isNaN(transactionDateTime.getTime())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field data.transactionDateTime is invalid',
    );
  }

  return {
    providerTransactionId: String(id),
    amount,
    transactionDateTime,
    counterpartyAccountNumber: toStringOrEmpty(data.counterAccountNumber),
    counterpartyName: toStringOrEmpty(data.counterAccountName),
    transferContent: toStringOrEmpty(data.description),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns transaction-normalizer.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/transaction-normalizer.ts apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts
git commit -m "fix: read transaction-normalizer from Casso Flow's real flat payload"
```

---

## Task 11: `ReceiveWebhookUseCase` — resolve by `accountNumber`, verify per-connection `secureToken` inline

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankConnectionRepository.findByAccountNumber` (Task 4), `decryptToken` (`bank-connections/application/token-encryption.ts` — already exported, cross-module import same as this module already does for `BANK_CONNECTION_REPOSITORY`), `constant-time-compare.ts` (existing).
- Produces: `ReceiveWebhookInput { accountNumber: string; webhookSecret: string; organizationId?: string; transactionId: string; rawPayload: Record<string, unknown> }`.

**Verify empirically before finalizing this task's header-name assumption** (per spec §3/§4 and this plan's Global Constraints): the code below assumes the incoming secret arrives via a `secure-token` HTTP header (Casso Flow's "Legacy" scheme, matching AGENTS.md's constant-time-comparison guidance) — confirm this is really what a webhook registered via `POST /v2/webhooks` (Task 5/7) actually sends before trusting it; if it's `X-Casso-Signature` (HMAC) instead, the verification step changes shape entirely (comparing a computed HMAC, not a raw secret) and this task's Step 3 needs revising, not just a header-name swap.

- [ ] **Step 1: Write the failing test**

```ts
import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const input = {
  accountNumber: '0011002233',
  webhookSecret: 'the-real-secret',
  transactionId: 'TX-1',
  rawPayload: { error: 0, data: { id: 'TX-1', amount: 1_000 } },
};

function connectionWith(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    id: 'conn-1',
    isUsable: () => true,
    encryptedSecureToken: 'encrypted-the-real-secret',
    ...overrides,
  };
}

describe('ReceiveWebhookUseCase', () => {
  it('resolves by accountNumber, verifies the secret, and enqueues', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = { findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()) };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as never,
      connectionRepo as never,
      queue as never,
      dataSource as never,
      'test-encryption-key',
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(connectionRepo.findByAccountNumber).toHaveBeenCalledWith('0011002233');
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('ignores when accountNumber matches no connection', async () => {
    const connectionRepo = { findByAccountNumber: jest.fn().mockResolvedValue(null) };
    const useCase = new ReceiveWebhookUseCase(
      { insert: jest.fn() } as never,
      connectionRepo as never,
      { enqueue: jest.fn() } as never,
      { transaction: jest.fn() } as never,
      'test-encryption-key',
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
  });

  it('ignores when the secret does not match, without enqueueing', async () => {
    const connectionRepo = {
      findByAccountNumber: jest
        .fn()
        .mockResolvedValue(connectionWith({ encryptedSecureToken: 'encrypted-different-secret' })),
    };
    const queue = { enqueue: jest.fn() };
    const useCase = new ReceiveWebhookUseCase(
      { insert: jest.fn() } as never,
      connectionRepo as never,
      queue as never,
      { transaction: jest.fn() } as never,
      'test-encryption-key',
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const inboxRepo = { insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')) };
    const connectionRepo = { findByAccountNumber: jest.fn().mockResolvedValue(connectionWith()) };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as never,
      connectionRepo as never,
      queue as never,
      dataSource as never,
      'test-encryption-key',
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
```

Note: the test above encrypts `'the-real-secret'`/`'different-secret'` as opaque literal strings rather than real `encryptToken(...)` output — **fix this in Step 1 for real** by importing `encryptToken` from `../../bank-connections/application/token-encryption` and using it to produce `encryptedSecureToken` in `connectionWith`, with a real 64-hex-char key, so the RED/GREEN cycle exercises actual decryption, not a string that merely looks encrypted.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns receive-webhook.usecase.spec.ts`
Expected: FAIL — current implementation resolves by `grantId`, has no secret-verification step, and its constructor doesn't take an encryption key.

- [ ] **Step 3: Write minimal implementation**

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from '../../bank-connections/application/bank-connection-repository.port';
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
  ) {}

  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByAccountNumber(
      input.accountNumber,
    );
    if (!connection) return { received: true, ignored: true };

    const expectedSecret = decryptToken(
      connection.encryptedSecureToken,
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
      jobId: input.transactionId,
    });
    return { received: true, duplicate: false };
  }
}
```

Note the change from the Cas ID version's behavior: an unmatched `accountNumber` OR a wrong secret both return `{ received: true, ignored: true }` rather than throwing `TENANT_MISMATCH` — there is no "tenant mismatch" concept here since nothing external supplies an `organizationId` to check against (Casso Flow's payload has none); a wrong secret for an otherwise-valid `accountNumber` is the only "someone's lying about which org this is" case, and it's handled as silently-ignored (same fail-quiet posture a webhook receiver should have toward unverified callers) rather than an exception — do not resurrect `ErrorCode.TENANT_MISMATCH` here, it doesn't apply.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns receive-webhook.usecase.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts
git commit -m "fix: resolve+verify ReceiveWebhookUseCase by accountNumber/secureToken"
```

---

## Task 12: `WebhooksController` — drop `WebhookAuthGuard`, wire the new flat DTO; delete the IP-allowlist guard

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts`
- Delete: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`, `webhook-auth.guard.spec.ts`, `apps/backend/src/common/webhook/ip-allowlist.ts`, `ip-allowlist.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts` (remove `WebhookAuthGuard` provider/import if present)

- [ ] **Step 1: Write the failing test**

Replace `webhooks.controller.spec.ts` in full:

```ts
import { WebhooksController } from './webhooks.controller';

const payload = {
  error: 0,
  data: {
    id: 1,
    amount: 1_000,
    transactionDateTime: '2026-08-01 00:00:00',
    description: 'Payment',
    accountNumber: '0011002233',
    counterAccountNumber: '1234',
    counterAccountName: 'Payer',
  },
};

describe('WebhooksController', () => {
  it('delegates to ReceiveWebhookUseCase with accountNumber, the header secret, and data.id', async () => {
    const receiveWebhook = {
      execute: jest.fn().mockResolvedValue({ received: true, duplicate: false }),
    };
    const controller = new WebhooksController(receiveWebhook as never);

    await expect(
      controller.receiveBalanceHook(payload as never, 'the-secret'),
    ).resolves.toEqual({ received: true, duplicate: false });
    expect(receiveWebhook.execute).toHaveBeenCalledWith({
      accountNumber: '0011002233',
      webhookSecret: 'the-secret',
      transactionId: '1',
      rawPayload: payload,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks.controller.spec.ts`
Expected: FAIL — current controller signature/body doesn't match.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { Public } from '../../../common/auth/public.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ReceiveWebhookUseCase } from '../application/receive-webhook.usecase';
import { BalanceHookDto } from './dto/balance-hook.dto';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly receiveWebhook: ReceiveWebhookUseCase) {}

  @Post('casso-balance-hook')
  @Public()
  @ApiOperation({
    summary: 'Receive a Casso Flow balance-hook notification',
    description:
      "Authenticated by a per-organization secure_token this product generated and registered with Casso Flow — carried on the 'secure-token' header, verified against the resolved BankConnection inside ReceiveWebhookUseCase (not a route guard, since verification needs the resolved connection's own secret).",
  })
  @ApiOkResponse({
    description: 'Webhook accepted for processing',
    schema: {
      type: 'object',
      properties: {
        received: { type: 'boolean', example: true },
        duplicate: { type: 'boolean', example: false },
        ignored: { type: 'boolean', example: false },
      },
    },
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMIT_EXCEEDED)
  @UseGuards(WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveBalanceHook(
    @Body() payload: BalanceHookDto,
    @Headers('secure-token') secureToken: string | undefined,
  ) {
    return this.receiveWebhook.execute({
      accountNumber: payload.data.accountNumber,
      webhookSecret: secureToken ?? '',
      transactionId: String(payload.data.id),
      rawPayload: Object.fromEntries(Object.entries(payload)),
    });
  }
}
```

Delete `webhook-auth.guard.ts`, its spec, and `common/webhook/ip-allowlist.ts`/spec. In `webhooks.module.ts`, remove any `WebhookAuthGuard` import/provider entry if one exists (check first — it may already only be referenced from the controller, not the module's `providers` array, matching the original Cas ID version's wiring).

- [ ] **Step 4: Run tests + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks && npx tsc --noEmit`
Expected: PASS, no type errors anywhere in the `webhooks` module.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts apps/backend/src/modules/webhooks/webhooks.module.ts
git rm apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts apps/backend/src/common/webhook/ip-allowlist.ts apps/backend/src/common/webhook/ip-allowlist.spec.ts
git commit -m "fix: wire WebhooksController to per-connection secure_token verification"
```

---

## Task 13: `.env.example`

**Files:**
- Modify: `apps/backend/.env.example`

Configuration-only (AGENTS.md TDD exception).

- [ ] **Step 1: Edit**

Remove: `CAS_ID_REDIRECT_BASE_URL`, `CAS_ID_LINK_BASE_URL`, `CAS_ID_CLIENT_ID`, `CAS_ID_CLIENT_SECRET`, `CAS_ID_BASE_URL`, `CAS_ID_WEBHOOK_IP_ALLOWLIST`.

Add, near the existing `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` lines (keep those two — now correctly documented as this product's Casso Flow OAuth2 client credentials):

```
# Casso Flow OAuth2 (this product's own client_id/client_secret registered
# with Casso Flow — see docs/superpowers/specs/2026-08-19-casso-flow-integration-design.md)
CASSO_WEBHOOK_CLIENT_ID=
CASSO_WEBHOOK_SECRET_KEY=
CASSO_FLOW_REDIRECT_URI=http://localhost:5173/bank-connections/casso-flow/callback
# The webhook URL this product registers with Casso Flow via POST /v2/webhooks
CASSO_FLOW_WEBHOOK_URL=http://localhost:3000/api/v1/webhooks/casso-balance-hook
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/.env.example
git commit -m "chore: document Casso Flow env vars, remove Cas ID's"
```

---

## Task 14: Fix the remaining backend e2e/integration test files

**Files:**
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`
- Modify: `apps/backend/test/collection-activity-timeline.integration.spec.ts`
- Modify: `apps/backend/test/receivable-balance-history-audit.e2e-spec.ts`
- Rename+rewrite: `apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts` → `apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts`

- [ ] **Step 1: Fix the 2 seed-only files**

In `collection-activity-timeline.integration.spec.ts` and `receivable-balance-history-audit.e2e-spec.ts`: each has one `dataSource.getRepository(BankConnectionOrmEntity).save({...})` block currently shaped like:

```ts
        casIdConnectionSessionId: randomUUID(), // or a literal UUID
        grantId: randomUUID(), // or a literal UUID
        encryptedAccessToken: 'encrypted-test-token',
        accountIdentity: { accountNumber: '99887766', bankName: 'Test Bank' },
        status: 'ACTIVE',
        scopes: ['balances'],
```

Replace with:

```ts
        accountNumber: '99887766',
        bankName: 'Test Bank',
        encryptedSecureToken: 'encrypted-test-secure-token',
        encryptedCassoAccessToken: 'encrypted-test-access-token',
        encryptedCassoRefreshToken: 'encrypted-test-refresh-token',
        status: 'ACTIVE',
```

(drop the `scopes` line entirely — no longer a field). Neither file's test assertions reference these fields directly (confirmed: they only use the connection as an FK target for other entities), so no further changes needed in either file.

- [ ] **Step 2: Rewrite `webhook-matching.e2e-spec.ts`**

This file's 3 tests all `POST /api/v1/webhooks/casso-balance-hook`. Replace the seed's `BankConnectionOrmEntity` fields the same way as Step 1. Replace the module-level `payload` constant:

```ts
  const payload = {
    error: 0,
    data: {
      id: 1,
      amount: 30_000_000,
      transactionDateTime: '2026-08-05 10:00:00',
      description: 'chuyen tien',
      accountNumber: '99887766',
      counterAccountNumber: '0011002233',
      counterAccountName: 'Unknown Payer',
    },
  };
```

Every `request(app.getHttpServer()).post(endpoint)...` call: add `.set('secure-token', 'encrypted-test-secure-token' /* must equal the DECRYPTED value stored, not the encrypted DB column — see note below */)` — actually generate the real secret via `encryptToken`/store the plaintext in a test constant, matching Task 11's real-encryption requirement: define `const webhookSecret = 'e2e-test-secret';` once at module scope, seed the connection with `encryptedSecureToken: encryptToken(webhookSecret, testEncryptionKey)` (import `encryptToken` from `../src/modules/bank-connections/application/token-encryption`, use the same `ACCESS_TOKEN_ENCRYPTION_KEY` value the `beforeAll` already sets), and `.set('secure-token', webhookSecret)` on every request. Remove the old `.set(auth)`/`x-client-id` header entirely.

For the third test (`'processes a high-confidence match through the queue'`), update its body to the same `{ error, data: {...} }` shape with `counterAccountName: 'Company B'`, `description: 'Thanh toan INV-2026-0012'`.

- [ ] **Step 3: Rewrite the round-trip e2e**

Rename `cas-id-bank-connection-flow.e2e-spec.ts` to `casso-flow-bank-connection-flow.e2e-spec.ts`. Rewrite its single existing test plus add the Balance Hook round trip, replacing the old `POST cas-id/initiate` → `POST cas-id/sessions/:id/exchange` calls:

```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
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
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';

describe('Casso Flow bank connection flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client-id';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret-key';
    process.env.CASSO_FLOW_REDIRECT_URI = 'http://localhost/callback';
    process.env.CASSO_FLOW_WEBHOOK_URL = 'http://localhost/api/v1/webhooks/casso-balance-hook';

    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'casso-flow-e2e-resend-key';

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('resolves an inbound webhook to the right connection via accountNumber + secure_token', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000301';
    const userId = '00000000-0000-4000-8000-000000000302';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Casso Flow Test User',
      email: 'casso-flow-test@example.com',
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/bank-connections/casso-flow/initiate')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'casso-flow-flow-initiate')
      .send({})
      .expect(201);
    expect(initiateRes.body.authorizeUrl).toContain('https://oauth.casso.vn/auth/authorize');
    const state = new URL(initiateRes.body.authorizeUrl).searchParams.get('state');

    // Real Casso Flow API calls happen inside ExchangeCassoFlowConnectionUseCase
    // (CassoFlowAdapter's fetch calls) — this test does not mock global.fetch,
    // so it can only exercise this far without real credentials reachable in
    // CI. Assert the initiate step and stop; extend once CassoFlowAdapter has
    // an injectable seam or a recorded-fixture test double (a decision for a
    // follow-up, not this plan — see spec §7).
    expect(state).toBeTruthy();
  });
});
```

Note this test is intentionally smaller than the superseded Cas ID version's round-trip test — it cannot go further without either real network access to Casso Flow (unacceptable for CI) or a fetch-mocking seam this plan hasn't designed (no more `MockCasIdAdapter`-style DI swap exists per Task 5's decision to drop the Mock pattern). **This is a real gap, not an oversight**: flag it explicitly in this task's commit message and the final PR description as a follow-up decision needed (e.g., add a `global.fetch` mock at the e2e level, or accept that `CassoFlowAdapter`'s real-network paths are only covered by Task 5's unit tests, not an end-to-end test).

- [ ] **Step 4: Run e2e suite**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns "webhook-matching|casso-flow-bank-connection-flow|collection-activity-timeline|receivable-balance-history-audit"`
Expected: PASS, all 4 files (needs Docker).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/webhook-matching.e2e-spec.ts apps/backend/test/collection-activity-timeline.integration.spec.ts apps/backend/test/receivable-balance-history-audit.e2e-spec.ts apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts
git rm apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts
git commit -m "test: fix e2e/integration tests for Casso Flow's BankConnection shape"
```

---

## Task 15: Frontend — `lib/casso-flow-link.ts` (replaces `cas-link.ts`)

**Files:**
- Create: `apps/frontend/src/lib/casso-flow-link.ts`
- Create: `apps/frontend/src/lib/casso-flow-link.spec.ts`
- Delete: `apps/frontend/src/lib/cas-link.ts`, `cas-link.spec.ts`

**Interfaces:**
- Produces: `openCassoFlowPopup(authorizeUrl: string): Window | null`, `parseCassoFlowCallback(search: string): CassoFlowCallbackResult`, `postCassoFlowMessageToOpener(result): boolean`, `CASSO_FLOW_FAILED_TOAST`, type `CassoFlowMessage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  parseCassoFlowCallback,
  postCassoFlowMessageToOpener,
} from './casso-flow-link';

describe('parseCassoFlowCallback', () => {
  it('returns success with code and state', () => {
    expect(parseCassoFlowCallback('?code=abc&state=xyz')).toEqual({
      status: 'success',
      code: 'abc',
      state: 'xyz',
    });
  });

  it('returns cancelled for a known cancellation error code', () => {
    expect(parseCassoFlowCallback('?error=access_denied')).toEqual({
      status: 'cancelled',
    });
  });

  it('returns error with the message for an unrecognized error', () => {
    expect(
      parseCassoFlowCallback('?error=server_error&error_description=Boom'),
    ).toEqual({ status: 'error', message: 'Boom' });
  });

  it('returns cancelled when nothing is present', () => {
    expect(parseCassoFlowCallback('')).toEqual({ status: 'cancelled' });
  });
});

describe('postCassoFlowMessageToOpener', () => {
  it('returns false when there is no opener', () => {
    const originalOpener = window.opener;
    Object.defineProperty(window, 'opener', { value: null, configurable: true });

    expect(
      postCassoFlowMessageToOpener({ status: 'success', code: 'abc', state: 'xyz' }),
    ).toBe(false);

    Object.defineProperty(window, 'opener', { value: originalOpener, configurable: true });
  });

  it('posts a CASSO_FLOW_SUCCESS message with code and state', () => {
    const postMessage = vi.fn();
    const originalOpener = window.opener;
    Object.defineProperty(window, 'opener', { value: { postMessage }, configurable: true });

    postCassoFlowMessageToOpener({ status: 'success', code: 'abc', state: 'xyz' });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'CASSO_FLOW_SUCCESS', code: 'abc', state: 'xyz' },
      window.location.origin,
    );

    Object.defineProperty(window, 'opener', { value: originalOpener, configurable: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/casso-flow-link.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
const CANCEL_ERROR_CODES = new Set(['access_denied', 'user_cancelled', 'cancelled']);

export type CassoFlowCallbackResult =
  | { status: 'success'; code: string; state: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type CassoFlowMessage =
  | { type: 'CASSO_FLOW_SUCCESS'; code: string; state: string }
  | { type: 'CASSO_FLOW_CANCELLED' }
  | { type: 'CASSO_FLOW_ERROR'; message: string };

export const CASSO_FLOW_FAILED_TOAST =
  'Liên kết Casso Flow thất bại. Vui lòng thử lại.';

export function openCassoFlowPopup(authorizeUrl: string): Window | null {
  return window.open(
    authorizeUrl,
    'casso-flow',
    'width=480,height=720,scrollbars=yes,resizable=yes',
  );
}

export function parseCassoFlowCallback(search: string): CassoFlowCallbackResult {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  if (code && state) return { status: 'success', code, state };

  const error = params.get('error');
  if (error && CANCEL_ERROR_CODES.has(error)) return { status: 'cancelled' };

  const errorMessage = params.get('error_description');
  if (errorMessage) return { status: 'error', message: errorMessage };
  if (error) return { status: 'error', message: error };

  return { status: 'cancelled' };
}

export function postCassoFlowMessageToOpener(
  result: CassoFlowCallbackResult,
): boolean {
  if (!window.opener) return false;

  if (result.status === 'success') {
    window.opener.postMessage(
      { type: 'CASSO_FLOW_SUCCESS', code: result.code, state: result.state } satisfies CassoFlowMessage,
      window.location.origin,
    );
    return true;
  }
  if (result.status === 'cancelled') {
    window.opener.postMessage(
      { type: 'CASSO_FLOW_CANCELLED' } satisfies CassoFlowMessage,
      window.location.origin,
    );
    return true;
  }
  window.opener.postMessage(
    { type: 'CASSO_FLOW_ERROR', message: result.message } satisfies CassoFlowMessage,
    window.location.origin,
  );
  return true;
}
```

Delete `cas-link.ts`/`cas-link.spec.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/casso-flow-link.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/casso-flow-link.ts apps/frontend/src/lib/casso-flow-link.spec.ts
git rm apps/frontend/src/lib/cas-link.ts apps/frontend/src/lib/cas-link.spec.ts
git commit -m "feat: add casso-flow-link.ts, remove cas-link.ts"
```

---

## Task 16: Frontend — `casso-flow-callback-page.tsx` (replaces `cas-id-callback-page.tsx`)

**Files:**
- Create: `apps/frontend/src/features/bank-connections/pages/casso-flow-callback-page.tsx`
- Create: `apps/frontend/src/features/bank-connections/pages/casso-flow-callback-page.spec.tsx`
- Delete: `apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.tsx`, `cas-id-callback-page.spec.tsx`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`, `types.ts`, `api/use-bank-connections.ts`

**Interfaces:**
- Consumes: `parseCassoFlowCallback`/`postCassoFlowMessageToOpener` (Task 15).
- Produces: `useExchangeCassoFlow(code, state)` mutation hook.

- [ ] **Step 1: Update the API/types/hooks layer first (needed by the callback page and Task 17)**

Replace `bank-connections-api.ts`'s Cas ID functions:

```ts
export function initiateCassoFlow(): Promise<CassoFlowInitiation> {
  return postWithIdempotency<CassoFlowInitiation>(
    '/api/v1/bank-connections/casso-flow/initiate',
    {},
  );
}

export function exchangeCassoFlow(
  input: CassoFlowExchangeInput,
): Promise<{ connectionId: string; status: string }> {
  return postWithIdempotency('/api/v1/bank-connections/casso-flow/exchange', input);
}
```

Replace `types.ts`'s Cas ID types:

```ts
export interface CassoFlowInitiation {
  authorizeUrl: string;
}

export interface CassoFlowExchangeInput {
  code: string;
  state: string;
}
```

Replace `use-bank-connections.ts`'s Cas ID hooks:

```ts
export function useInitiateCassoFlow() {
  return useMutation({ mutationFn: initiateCassoFlow });
}

export function useExchangeCassoFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; state: string }) => exchangeCassoFlow(input),
    onSuccess: () => {
      toast.success('Đã kết nối Casso Flow.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Không thể hoàn tất kết nối Casso Flow.'),
  });
}
```

(update the `import { ... } from './bank-connections-api'` line at the top of `use-bank-connections.ts` to match the renamed functions.)

- [ ] **Step 2: Write the failing test for the callback page**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CassoFlowCallbackPage } from './casso-flow-callback-page';

const { toastSuccess, toastError, apiRequest } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderCallback(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/bank-connections/casso-flow/callback"
            element={<CassoFlowCallbackPage />}
          />
          <Route path="/bank-connections" element={<div>bank-connections</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  apiRequest.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('CassoFlowCallbackPage', () => {
  it('forwards a success result to the opener and closes itself', async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('opener', { postMessage });
    vi.stubGlobal('close', close);

    renderCallback('/bank-connections/casso-flow/callback?code=abc&state=xyz');

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'CASSO_FLOW_SUCCESS', code: 'abc', state: 'xyz' },
        window.location.origin,
      ),
    );
    expect(close).toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('exchanges the code itself and redirects when there is no opener', async () => {
    apiRequest.mockResolvedValue({ connectionId: 'conn-1', status: 'ACTIVE' });

    renderCallback('/bank-connections/casso-flow/callback?code=abc&state=xyz');

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-connections/casso-flow/exchange',
          data: { code: 'abc', state: 'xyz' },
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText('bank-connections')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/pages/casso-flow-callback-page.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```tsx
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  CASSO_FLOW_FAILED_TOAST,
  parseCassoFlowCallback,
  postCassoFlowMessageToOpener,
} from '@/lib/casso-flow-link';
import { useExchangeCassoFlow } from '../api/use-bank-connections';

export function CassoFlowCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const exchangeMutation = useExchangeCassoFlow();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const result = parseCassoFlowCallback(searchParams.toString());
    if (postCassoFlowMessageToOpener(result)) {
      window.close();
      return;
    }

    const goBack = () => navigate('/bank-connections', { replace: true });

    if (result.status !== 'success') {
      toast.error(result.status === 'error' ? result.message : CASSO_FLOW_FAILED_TOAST);
      goBack();
      return;
    }

    exchangeMutation.mutate(
      { code: result.code, state: result.state },
      { onSettled: goBack },
    );
  }, [searchParams, navigate, exchangeMutation.mutate]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đang xử lý liên kết Casso Flow</CardTitle>
          <CardDescription>Vui lòng đợi trong giây lát…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Hoàn tất callback Casso Flow
        </CardContent>
      </Card>
    </div>
  );
}
```

Delete `cas-id-callback-page.tsx`/spec.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/pages/casso-flow-callback-page.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections/pages/casso-flow-callback-page.tsx apps/frontend/src/features/bank-connections/pages/casso-flow-callback-page.spec.tsx apps/frontend/src/features/bank-connections/api/bank-connections-api.ts apps/frontend/src/features/bank-connections/types.ts apps/frontend/src/features/bank-connections/api/use-bank-connections.ts
git rm apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.tsx apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.spec.tsx
git commit -m "feat: add CassoFlowCallbackPage, remove CasIdCallbackPage"
```

---

## Task 17: Frontend — `CassoFlowConnectionFlow` + wire routes/UI text

**Files:**
- Create: `apps/frontend/src/features/bank-connections/components/casso-flow-connection-flow.tsx`
- Create: `apps/frontend/src/features/bank-connections/components/casso-flow-connection-flow.spec.tsx`
- Delete: `apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.tsx`, `cas-id-connection-flow.spec.tsx`
- Modify: `apps/frontend/src/routes/index.tsx`, `apps/frontend/src/App.tsx`, `apps/frontend/src/features/bank-connections/components/connect-dialog.tsx`, `apps/frontend/src/features/onboarding/pages/onboarding-page.tsx`, `apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CassoFlowConnectionFlow } from './casso-flow-connection-flow';

const { apiRequest, toastError, openCassoFlowPopup } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toastError: vi.fn(),
  openCassoFlowPopup: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('@/lib/casso-flow-link', async () => {
  const actual = await vi.importActual<typeof import('@/lib/casso-flow-link')>(
    '@/lib/casso-flow-link',
  );
  return { ...actual, openCassoFlowPopup };
});
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function fakePopup() {
  return { closed: false, close: vi.fn() } as unknown as Window;
}

function renderFlow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CassoFlowConnectionFlow />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  toastError.mockReset();
  openCassoFlowPopup.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('CassoFlowConnectionFlow', () => {
  it('opens the Casso Flow popup with the authorize URL from initiate', async () => {
    apiRequest.mockResolvedValue({ authorizeUrl: 'https://oauth.casso.vn/auth/authorize?state=s1' });
    openCassoFlowPopup.mockReturnValue(fakePopup());

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));

    await waitFor(() =>
      expect(openCassoFlowPopup).toHaveBeenCalledWith(
        'https://oauth.casso.vn/auth/authorize?state=s1',
      ),
    );
  });

  it('shows an error toast when the popup is blocked', async () => {
    apiRequest.mockResolvedValue({ authorizeUrl: 'https://oauth.casso.vn/auth/authorize?state=s1' });
    openCassoFlowPopup.mockReturnValue(null);

    renderFlow();
    fireEvent.click(screen.getByText('Kết nối ngân hàng'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('popup')),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/components/casso-flow-connection-flow.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { openCassoFlowPopup } from '@/lib/casso-flow-link';
import { useInitiateCassoFlow } from '../api/use-bank-connections';

export function CassoFlowConnectionFlow() {
  const [isLinking, setIsLinking] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initiateMutation = useInitiateCassoFlow();

  useEffect(() => {
    return () => {
      if (popupPollRef.current) clearInterval(popupPollRef.current);
    };
  }, []);

  function handleConnect() {
    setIsLinking(true);
    initiateMutation.mutate(undefined, {
      onSuccess: (result) => {
        const popup = openCassoFlowPopup(result.authorizeUrl);
        popupRef.current = popup;
        if (!popup) {
          toast.error('Trình duyệt đã chặn popup. Vui lòng cho phép popup và thử lại.');
          setIsLinking(false);
          return;
        }
        popupPollRef.current = setInterval(() => {
          if (popup.closed) {
            if (popupPollRef.current) clearInterval(popupPollRef.current);
            setIsLinking(false);
          }
        }, 500);
      },
      onError: () => {
        toast.error('Không thể tạo liên kết Casso Flow.');
        setIsLinking(false);
      },
    });
  }

  return (
    <Button onClick={handleConnect} disabled={isLinking}>
      {isLinking ? 'Đang mở Casso Flow…' : 'Kết nối ngân hàng'}
    </Button>
  );
}
```

Note this component is simpler than the removed `CasIdConnectionFlow`: it doesn't listen for `window.addEventListener('message', ...)` at all — the callback page (Task 16) does the exchange itself (either via `postMessage`-triggered close, in which case `BankConnection`'s list-refetch on the `/bank-connections` page picks up the new connection via `usePollConnections`'s existing 5s poll, or via its own no-opener fallback navigate). This flow component only needs to open the popup and detect if the user closes it without completing — it does not need to react to the popup's outcome directly the way the Cas ID version did, because the callback page's no-opener path already handles completion+navigation on its own, and the opener path's `postMessage` isn't consumed here at all (no listener). **Confirm this is the intended simplification** (it follows from Task 3/7's design — reactivating/creating a connection no longer needs the popup-opener page to know a `sessionId` to call exchange with, since the callback page has everything it needs from the URL) rather than a dropped feature; if a snappier UX (auto-closing the popup and refreshing the list without waiting for the poll) is wanted, add the `message` listener back here mirroring the removed component — that's a UX call, not a correctness one.

Delete `cas-id-connection-flow.tsx`/spec.

- [ ] **Step 4: Update remaining references**

`connect-dialog.tsx`: replace `<CasIdConnectionFlow onCompleted={...} />` with `<CassoFlowConnectionFlow />` (drop the `onCompleted` prop — nothing left to pass it, per Step 3's note; the dialog's `onOpenChange`/polling already handles refresh). Update the import.

`onboarding-page.tsx`: same swap.

`onboarding-page.spec.tsx`: remove the `vi.mock('@/lib/cas-link', ...)` block and the `openCasLinkPopupMock`-based test; replace with an equivalent using `@/lib/casso-flow-link`'s `openCassoFlowPopup`, mirroring the pattern already used in Task 17's own spec above.

`routes/index.tsx`: replace the `CasIdCallbackPage` lazy import with `CassoFlowCallbackPage` from `@/features/bank-connections/pages/casso-flow-callback-page`.

`App.tsx`: update the route path from `bank-connections/cas-id/callback` to `bank-connections/casso-flow/callback`, and the import/usage from `CasIdCallbackPage` to `CassoFlowCallbackPage`.

- [ ] **Step 5: Run test to verify it passes; full frontend suite + type-check**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/components/casso-flow-connection-flow.spec.tsx`
Expected: PASS (2 tests).

Run: `cd apps/frontend && npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections/components/casso-flow-connection-flow.tsx apps/frontend/src/features/bank-connections/components/casso-flow-connection-flow.spec.tsx apps/frontend/src/features/bank-connections/components/connect-dialog.tsx apps/frontend/src/features/onboarding/pages/onboarding-page.tsx apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx apps/frontend/src/routes/index.tsx apps/frontend/src/App.tsx
git rm apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.tsx apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.spec.tsx
git commit -m "feat: wire CassoFlowConnectionFlow into onboarding and connect-dialog"
```

---

## Task 18: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend unit suite, e2e suite, type-check, arch-check, domain-check, biome**

```bash
cd apps/backend && npx jest && npx jest --config ./test/jest-e2e.json && npx tsc --noEmit && npm run arch-check
```

Run the `domain-check` skill and fix violations.

Run: `cd apps/backend && npx biome check --write src apps/backend/test .env.example` (adjust path — run from repo root: `npx biome check --write apps/backend/src apps/backend/test apps/backend/.env.example`).

- [ ] **Step 2: Full frontend suite, type-check, biome**

```bash
cd apps/frontend && npx vitest run && npx tsc --noEmit
cd D:/casso-ledger && npx biome check --write apps/frontend/src
```

- [ ] **Step 3: Grep for leftover Cas ID references**

Run: `grep -rln "CasId\|cas-id\|CAS_ID" apps/backend/src apps/frontend/src apps/backend/test --include=*.ts --include=*.tsx 2>/dev/null`
Expected: no results (or only genuinely unrelated false-positive matches — inspect each). This catches anything the task-by-task removal missed.

- [ ] **Step 4: Push and open a PR — do NOT merge**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: replace Cas ID integration with Casso Flow" --body "$(cat <<'EOF'
## Summary
Removes the Cas ID integration merged in PR #266/#268/#269 (wrong provider —
see ADR-0021) and replaces it with a Casso Flow integration matching how
that provider actually works: OAuth2 read-only access + self-registered
webhook, resolved by accountNumber + a per-connection secure_token instead
of grantId/IP-allowlist.

## Known gaps / follow-ups (see spec §6, and Task 5/14's notes)
- The exact webhook auth header (`secure-token` vs `X-Casso-Signature`) and
  OAuth2 `scope` param are assumed from incomplete public docs — MUST be
  verified against real Casso Flow behavior before this is trusted in
  production (see Task 11's note).
- No mock/fetch-seam exists for `CassoFlowAdapter`'s real network calls in
  the round-trip e2e test (Task 14) — it only covers the initiate step.
- Token refresh, disconnect-side webhook unregistration, and the
  `/v2/sync` reconciliation call are deliberately out of scope.

## Test plan
- [x] Full backend unit suite
- [x] Full backend e2e suite (needs Docker)
- [x] Full frontend suite
- [x] `npx tsc --noEmit` (both apps)
- [x] `npm run arch-check`
- [x] `domain-check` skill
- [x] `npx biome check --write`
- [x] No leftover Cas ID references (grep)

Spec: docs/superpowers/specs/2026-08-19-casso-flow-integration-design.md
ADR: docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back to the user and wait for review — do not merge.
