# Casso Flow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the merged Cas ID integration entirely and replace it with a Casso Flow integration: a business pastes their own Casso API Key, this product reads their linked account and registers a webhook on their behalf — no popup, no OAuth2 (Casso's partner-app OAuth2 registration is permanently closed).

**Architecture:** `BankConnection` is redesigned around `accountNumber` (webhook correlation key), a self-generated `encryptedSecureToken` (webhook verification secret), and `encryptedCassoApiKey` (the organization's own, non-expiring Casso API Key). A single `ConnectCassoFlowUseCase` calls Casso Flow's real `/v2/userInfo` + `/v2/webhooks` endpoints synchronously inside one request — there is no multi-step redirect flow, so no CSRF-state entity is needed. Inbound webhooks resolve by `accountNumber` then verify per-connection inside `ReceiveWebhookUseCase` itself — `WebhookAuthGuard` is removed, not repurposed.

**Tech Stack:** NestJS 11, TypeORM 1.1, React 19, class-validator/class-transformer, Jest 30/Vitest, testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-19-casso-flow-integration-design.md` §3's revision (API Key, not OAuth2 — read this section specifically, it supersedes an earlier version of the same doc). Also read `docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md`.

## Global Constraints

- Every write that changes state MUST be inside one DB transaction; tenant isolation via `organizationId` except the documented unscoped exception (webhook resolution has no request tenant context).
- `application/` layer MUST NOT import concrete SDKs or throw framework exceptions — only `AppError`. `infrastructure/` may use `fetch`/`AbortController`/`@nestjs/common` DI decorators.
- No `any` in production code. Domain ↔ ORM translation stays structural (no `as`/`as unknown as`), matching this module's existing `TypeOrmBankConnectionRepository` pattern.
- Webhook secret comparison MUST use `common/security/constant-time-compare.ts` (already exists) — never `===` on a secret.
- **Do not guess the one item the spec explicitly defers** (spec §3): whether Casso Flow's real webhook delivery uses a `secure-token` header or `X-Casso-Signature`. Task 10 calls out exactly where to verify this against real behavior instead of assuming.
- **Do not touch `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY`** — spec §3 explains these are not Casso Flow API credentials this flow uses (a Casso API Key is one string, not a client_id+secret pair); leave them exactly as they are in `.env`/`.env.example`.
- TDD: RED → GREEN → REFACTOR for every behavior change. Migrations follow this repo's existing migration-spec convention (`queryRunner.query` assertions), not full TDD against a real DB — stated exception per AGENTS.md.
- Biome: single quotes, semicolons, 2-space indent — run `npx biome check --write <files>` at the end of each task.

---

## Task 1: Migration — replace Cas ID columns/table with Casso Flow's

**Files:**
- Create: `apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.ts`
- Create: `apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.spec.ts`

Per ADR-0021 and the confirmed "no production data" state, this is a clean drop/add — no backfill. No new table needed (no `CassoOAuthState` — the connect flow is a single synchronous request, nothing to persist mid-flow).

- [ ] **Step 1: Write the failing test**

```ts
import type { QueryRunner } from 'typeorm';
import { ReplaceCasIdWithCassoFlow20260828000000 } from './20260828000000-replace-cas-id-with-casso-flow';

describe('ReplaceCasIdWithCassoFlow20260828000000', () => {
  it('drops Cas ID columns/table and adds Casso Flow columns on up', async () => {
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
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoApiKey" text NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "cas_id_connection_sessions"');
  });

  it('is destructive on down (no Cas ID data to restore)', async () => {
    const migration = new ReplaceCasIdWithCassoFlow20260828000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_bank_connections_account_number"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
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
      'ALTER TABLE "bank_connections" ADD COLUMN "encryptedCassoApiKey" text NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_bank_connections_account_number" ON "bank_connections" ("accountNumber")',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "cas_id_connection_sessions"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_bank_connections_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "encryptedCassoApiKey"',
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

- [ ] **Step 5: Delete the now-unused `CasIdConnectionSession` domain/port/ORM/repository files**

```bash
git rm apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts apps/backend/src/modules/bank-connections/application/cas-id-connection-session-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id-connection-session.orm-entity.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-cas-id-connection-session.repository.ts
```

(This leaves `bank-connections.module.ts`/`initiate-connection.usecase.ts`/`exchange-token.usecase.ts` referencing deleted files broken — expected, fixed in Task 6/7. Do not run the full suite/tsc yet.)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.ts apps/backend/src/database/migrations/20260828000000-replace-cas-id-with-casso-flow.spec.ts
git commit -m "feat: migration replacing Cas ID columns/table with Casso Flow's; remove CasIdConnectionSession"
```

---

## Task 2: Redesign `BankConnection` domain + fix every existing construction call site

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`

**Interfaces:**
- Produces: `BankConnectionProps { id, organizationId, accountNumber, bankName, encryptedSecureToken, encryptedCassoApiKey, status, connectedAt, lastSyncAt, revokedAt, createdAt }`, `reactivate(input: { accountNumber, bankName, encryptedSecureToken, encryptedCassoApiKey })`. Task 3 (repository), Task 6 (connect use case), Task 7 (response DTO) all depend on this exact shape.

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
    encryptedCassoApiKey: 'encrypted-api-key',
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
      encryptedCassoApiKey: 'new-api-key',
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
        encryptedCassoApiKey: 'new-api-key',
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
      encryptedCassoApiKey: 'new-api-key',
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
  encryptedCassoApiKey: string;
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
  readonly encryptedCassoApiKey: string;
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
    encryptedCassoApiKey: string;
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

In each of `assert-reauthorizable.spec.ts`, `disconnect-connection.usecase.spec.ts`, `mark-requires-reauthorization.usecase.spec.ts`, `sync-transactions.usecase.spec.ts`: every `connectionWithStatus`/`activeConnection` builder function currently has this shape:

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
    encryptedCassoApiKey: encryptToken('raw-api-key', encryptionKey), // keep encryptToken(...) only in the 2 files that already import/use it (disconnect-connection.usecase.spec.ts, sync-transactions.usecase.spec.ts); the other 2 files use a plain string literal 'encrypted-api-key' since they don't decrypt anything
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns "bank-connection.spec|assert-reauthorizable.spec|disconnect-connection.usecase.spec|mark-requires-reauthorization.usecase.spec|sync-transactions.usecase.spec"`
Expected: these specs still reference `CasIdUnauthorizedError` (deleted in Task 3's port file) — that import will fail. **This is expected at this point; Task 3 renames it.** Confirm the failures are ONLY `Cannot find module './cas-id-integration-adapter.port'`-shaped, not shape/field mismatches.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/bank-connection.ts apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git commit -m "feat: redesign BankConnection domain around Casso Flow's API Key model"
```

---

## Task 3: `ICassoFlowIntegrationAdapter` port + repository `findByAccountNumber`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts`
- Delete: `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify (mechanical import rename `CasIdUnauthorizedError` → `CassoFlowUnauthorizedError`, `from './cas-id-integration-adapter.port'` → `from './casso-flow-integration-adapter.port'`, and the adapter type/token in each use case's constructor): `disconnect-connection.usecase.ts`, `disconnect-connection.usecase.spec.ts`, `mark-requires-reauthorization.usecase.ts`, `mark-requires-reauthorization.usecase.spec.ts`, `sync-transactions.usecase.ts`, `sync-transactions.usecase.spec.ts`

**Interfaces:**
- Produces: `ICassoFlowIntegrationAdapter { getAccountInfo(apiKey): Promise<{accountNumber, bankName}>; registerWebhook(apiKey, secureToken): Promise<void>; invalidateToken(apiKey): Promise<void>; getTransactions(apiKey): Promise<unknown[]> }`, `CassoFlowUnauthorizedError`, `IBankConnectionRepository.findByAccountNumber(accountNumber): Promise<BankConnection | null>`. Task 4 (adapter impl), Task 6 (connect use case), Task 9 (receive-webhook use case) all consume these.

Note there is no `exchangeCodeForToken` method — no authorization-code exchange exists in this flow at all; the caller already has the API Key directly.

This task is plumbing (port + repository method), no new business logic to unit-test beyond what Task 4's adapter spec and the e2e already cover.

- [ ] **Step 1: Write the port**

Create `apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts`:

```ts
export interface CassoFlowAccountInfo {
  accountNumber: string;
  bankName: string;
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

Also add (needed by Task 6, since Casso Flow allows exactly one connection per organization and the reactivate path needs to find "the org's existing connection" under a row lock before its `accountNumber` is known):

```ts
  findActiveOrReauthorizableByOrganizationForUpdate(
    organizationId: string,
    manager: EntityManager,
  ): Promise<BankConnection | null>;
```

in the port, and in the repository:

```ts
  async findActiveOrReauthorizableByOrganizationForUpdate(
    organizationId: string,
    manager: EntityManager,
  ): Promise<BankConnection | null> {
    const row = await manager.findOne(BankConnectionOrmEntity, {
      where: { organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankConnection(row) : null;
  }
```

- [ ] **Step 3: Mechanical rename in the 3 use cases + their specs**

In `disconnect-connection.usecase.ts`, `mark-requires-reauthorization.usecase.ts`, `sync-transactions.usecase.ts` and their `.spec.ts` files: change every `import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port'` to `import { CassoFlowUnauthorizedError } from './casso-flow-integration-adapter.port'`, and every use of the class to `CassoFlowUnauthorizedError`. Change the `ICasIdIntegrationAdapter`/`CAS_ID_INTEGRATION_ADAPTER` type/token references in these 3 use cases' constructors to `ICassoFlowIntegrationAdapter`/`CASSO_FLOW_INTEGRATION_ADAPTER`.

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && npx jest --testPathPatterns "disconnect-connection.usecase|mark-requires-reauthorization.usecase|sync-transactions.usecase"`
Expected: PASS, all 3 suites.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/casso-flow-integration-adapter.port.ts apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git rm apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts
git commit -m "feat: replace ICasIdIntegrationAdapter with ICassoFlowIntegrationAdapter"
```

---

## Task 4: `CassoFlowAdapter` — real HTTP calls authenticated by API Key

**Files:**
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts`
- Delete: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`, `cas-id.adapter.spec.ts`, `mock-cas-id.adapter.ts`, `mock-cas-id.adapter.spec.ts`, `select-cas-id-adapter.ts`, `select-cas-id-adapter.spec.ts`

**Interfaces:**
- Produces: `CassoFlowAdapter implements ICassoFlowIntegrationAdapter`. No Mock/factory: `getAccountInfo`/`registerWebhook` are called with the *organization's own* API Key (a request-time argument, not a platform-level secret from `process.env`), so there is nothing environment-dependent to swap at DI time the way Cas ID's `MockCasIdAdapter` swapped in for missing platform credentials. Tests mock `fetch`, not the adapter.

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
      CASSO_FLOW_WEBHOOK_URL: 'http://localhost:3000/api/v1/webhooks/casso-balance-hook',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('getAccountInfo', () => {
    it('fetches account number and bank name with the Apikey header', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { accountNumber: '867623232', bankName: 'VPBank' } }),
        );
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      const result = await adapter.getAccountInfo('test-api-key');

      expect(result).toEqual({ accountNumber: '867623232', bankName: 'VPBank' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/userInfo');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
    });

    it('throws if accountNumber is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: { bankName: 'VPBank' } })) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('test-api-key')).rejects.toThrow(
        'Casso Flow /v2/userInfo response is missing accountNumber',
      );
    });

    it('throws CassoFlowUnauthorizedError on a 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CassoFlowAdapter();

      await expect(adapter.getAccountInfo('bad-key')).rejects.toThrow(
        'Casso Flow API Key rejected',
      );
    });
  });

  describe('registerWebhook', () => {
    it("registers this product's webhook URL with the generated secure token", async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
      global.fetch = fetchMock as never;
      const adapter = new CassoFlowAdapter();

      await adapter.registerWebhook('test-api-key', 'secure-token-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth.casso.vn/v2/webhooks');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Apikey test-api-key');
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

      const result = await adapter.getAccountInfo('test-api-key');

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
// array) — this session's implementation only covers connect+receive (see
// spec §6 "Out of scope"). Disconnect-side webhook unregistration and the
// /v2/sync reconciliation call are deliberate follow-ups, not guesses.
@Injectable()
export class CassoFlowAdapter implements ICassoFlowIntegrationAdapter {
  private readonly logger = new Logger(CassoFlowAdapter.name);
  private readonly webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.CASSO_FLOW_WEBHOOK_URL ?? '';
  }

  async getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo> {
    const data = await this.request<Record<string, unknown>>(
      '/v2/userInfo',
      { method: 'GET' },
      apiKey,
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

  async registerWebhook(apiKey: string, secureToken: string): Promise<void> {
    await this.request(
      '/v2/webhooks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: this.webhookUrl,
          secure_token: secureToken,
          income_only: true,
        }),
      },
      apiKey,
    );
  }

  async invalidateToken(_apiKey: string): Promise<void> {}

  async getTransactions(_apiKey: string): Promise<unknown[]> {
    return [];
  }

  private unwrap(data: Record<string, unknown>): Record<string, unknown> {
    if (typeof data.data === 'object' && data.data !== null) {
      return data.data as Record<string, unknown>;
    }
    return data;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    apiKey: string,
  ): Promise<T> {
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${OAUTH_BASE_URL}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            ...init.headers,
            Authorization: `Apikey ${apiKey}`,
          },
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

**Verify empirically, do not assume further:** once a real Casso API Key is available (create one via Casso's dashboard: Settings → API Keys), manually exercise `getAccountInfo`/`registerWebhook` against the real Casso Flow API before trusting this task's assumed response shapes (whether `/v2/userInfo`'s response really is wrapped in a top-level `data` key, exact field names). This is exactly the kind of assumption that broke the Cas ID work once already — and broke this plan's own first draft (which assumed OAuth2 was available at all).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns casso-flow.adapter.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/casso-flow.adapter.spec.ts
git rm apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.ts apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.spec.ts
git commit -m "feat: add CassoFlowAdapter (API Key auth), remove Cas ID adapters"
```

---

## Task 5: `ConnectCassoFlowUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts`
- Create: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts`
- Delete: `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts`, `exchange-token.usecase.ts`, `connection-usecases.spec.ts` (its `InitiateConnectionUseCase`/`ExchangeTokenUseCase` tests are fully superseded by this task's spec; if the file has nothing else in it, delete it — check first, don't assume)

**Interfaces:**
- Consumes: `ICassoFlowIntegrationAdapter` (Task 3/4), `IBankConnectionRepository` (Task 3), `token-encryption.ts` (unchanged).
- Produces: `ConnectCassoFlowUseCase.execute({ organizationId, apiKey, bankConnectionId? }): Promise<BankConnection>` — a single use case, replacing both the removed `InitiateConnectionUseCase` and `ExchangeTokenUseCase`, since there is no multi-step round trip left to split across two.

- [ ] **Step 1: Write the failing test**

```ts
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { ConnectCassoFlowUseCase } from './connect-casso-flow.usecase';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dataSource = {
  transaction: jest.fn(
    async (callback: (manager: object) => Promise<unknown>) => callback({}),
  ),
};

describe('ConnectCassoFlowUseCase', () => {
  it('reads account info, registers a webhook, and creates the connection', async () => {
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const auditEventRepo = { save: jest.fn() };
    const adapter = {
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ accountNumber: '0011002233', bankName: 'VPBank' }),
      registerWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({ organizationId: 'org-1', apiKey: 'real-api-key' });

    expect(result.status).toBe('ACTIVE');
    expect(result.accountNumber).toBe('0011002233');
    expect(adapter.getAccountInfo).toHaveBeenCalledWith('real-api-key');
    expect(adapter.registerWebhook).toHaveBeenCalledWith('real-api-key', expect.any(String));
    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', status: 'ACTIVE' }),
      expect.anything(),
    );
  });

  it('reactivates an existing REQUIRES_REAUTHORIZATION connection instead of creating a new one', async () => {
    const existing = new BankConnection({
      id: 'conn-1',
      organizationId: 'org-1',
      accountNumber: '0011002233',
      bankName: 'Old Bank',
      encryptedSecureToken: 'old-secure-token',
      encryptedCassoApiKey: 'old-api-key',
      status: 'REQUIRES_REAUTHORIZATION',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      countActiveByOrganization: jest.fn().mockResolvedValue(0),
    };
    const auditEventRepo = { save: jest.fn() };
    const adapter = {
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ accountNumber: '0011002233', bankName: 'VPBank' }),
      registerWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      auditEventRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      apiKey: 'new-api-key',
      bankConnectionId: 'conn-1',
    });

    expect(result.id).toBe('conn-1');
    expect(result.status).toBe('ACTIVE');
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'RECONNECTED' }),
      expect.anything(),
    );
  });

  it('propagates a CassoFlowUnauthorizedError for an invalid API Key without persisting anything', async () => {
    const bankConnectionRepo = {
      findActiveOrReauthorizableByOrganizationForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const adapter = {
      getAccountInfo: jest.fn().mockRejectedValue(new Error('Casso Flow API Key rejected')),
    };
    const useCase = new ConnectCassoFlowUseCase(
      adapter as never,
      bankConnectionRepo as never,
      { save: jest.fn() } as never,
      dataSource as never,
      encryptionKey,
      {} as never,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', apiKey: 'bad-key' }),
    ).rejects.toThrow('Casso Flow API Key rejected');
    expect(bankConnectionRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns connect-casso-flow.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
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
  bankConnectionId?: string;
}

@Injectable()
export class ConnectCassoFlowUseCase {
  constructor(
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

  async execute(input: ConnectCassoFlowInput): Promise<BankConnection> {
    // External calls stay outside the transaction — only the DB writes below are wrapped.
    const accountInfo = await this.adapter.getAccountInfo(input.apiKey);
    const secureToken = randomBytes(32).toString('hex');
    await this.adapter.registerWebhook(input.apiKey, secureToken);

    return this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceBankConnectionLimit(manager, () =>
        this.bankConnectionRepo.countActiveByOrganization(input.organizationId, manager),
      );

      const existing =
        await this.bankConnectionRepo.findActiveOrReauthorizableByOrganizationForUpdate(
          input.organizationId,
          manager,
        );
      const props = {
        accountNumber: accountInfo.accountNumber,
        bankName: accountInfo.bankName,
        encryptedSecureToken: encryptToken(secureToken, this.encryptionKey),
        encryptedCassoApiKey: encryptToken(input.apiKey, this.encryptionKey),
      };
      const connection =
        existing && existing.status !== 'ACTIVE'
          ? existing.reactivate(props)
          : new BankConnection({
              id: randomUUID(),
              organizationId: input.organizationId,
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
          eventType: existing ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
          metadata: { accountNumber: accountInfo.accountNumber },
          createdAt: new Date(),
        }),
        manager,
      );
      return connection;
    });
  }
}
```

Delete `initiate-connection.usecase.ts`, `exchange-token.usecase.ts`. Check `connection-usecases.spec.ts`: if it contains nothing beyond the now-superseded `InitiateConnectionUseCase`/`ExchangeTokenUseCase` tests, `git rm` it entirely rather than leaving an empty file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns connect-casso-flow.usecase.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts
git rm apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts
git add -u apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts
git commit -m "feat: add ConnectCassoFlowUseCase, replacing initiate+exchange"
```

---

## Task 6: Controller, DTOs, response mapper, module wiring

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/dto/bank-connection-response.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/connect-casso-flow.dto.ts`
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

- [ ] **Step 2: New DTO**

`connect-casso-flow.dto.ts`:

```ts
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ConnectCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
```

Delete `exchange-token.dto.ts`, `initiate-connection.dto.ts`, `initiate-connection-response.dto.ts` — all superseded by this one DTO (there's only one request now, no separate initiate/exchange pair).

- [ ] **Step 3: Controller**

Replace the `cas-id/*` routes in `bank-connections.controller.ts` with a single route:

```ts
  @Post('casso-flow/connect')
  @ApiOperation({ summary: "Connect this organization's Casso Flow account via a pasted API Key" })
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
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async connect(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConnectCassoFlowDto,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/connect',
      key,
      dto,
      async () => {
        const connection = await this.connectCassoFlowUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          apiKey: dto.apiKey,
          bankConnectionId: dto.bankConnectionId,
        });
        return { connectionId: connection.id, status: connection.status };
      },
    );
  }
```

`TenantContextService` isn't currently injected into this controller — check the constructor and add `private readonly tenantContext: TenantContextService,` (import from `../../../common/tenancy/tenant-context`) alongside the existing dependencies. Update the constructor to inject `ConnectCassoFlowUseCase` in place of `InitiateConnectionUseCase`/`ExchangeTokenUseCase`, and update imports (drop `ExchangeTokenDto`/`InitiateConnectionDto`/`InitiateConnectionResponseDto`, add `ConnectCassoFlowDto`). Remove the now-unused `AuthenticatedRequest` interface/`@Req()` param if nothing else in the controller uses it (check `findAll`/`disconnect` first — they don't reference `request.user`, so this is likely safe to remove, but confirm before deleting).

- [ ] **Step 4: Module wiring**

Rewrite `bank-connections.module.ts`'s Cas-ID-specific parts: remove `CasIdConnectionSessionOrmEntity`/`CAS_ID_CONNECTION_SESSION_REPOSITORY`/`TypeOrmCasIdConnectionSessionRepository` from `TypeOrmModule.forFeature`/providers entirely (no replacement — there is no session entity anymore), `CAS_ID_INTEGRATION_ADAPTER` provider from `useFactory: () => selectCasIdAdapter()` to `useClass: CassoFlowAdapter` under the `CASSO_FLOW_INTEGRATION_ADAPTER` token, `InitiateConnectionUseCase`/`ExchangeTokenUseCase` → `ConnectCassoFlowUseCase` in both `providers` and `exports`.

- [ ] **Step 5: Full module test suite + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns bank-connections && npx tsc --noEmit`
Expected: PASS, no type errors. This is the first point in the plan where the whole `bank-connections` module should compile clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/presentation apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: wire single Casso Flow connect route, DTO, and module providers"
```

---

## Task 7: `BalanceHookDto` — real flat Casso Flow payload shape

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

## Task 8: `transaction-normalizer.ts` — Casso Flow field mapping + date parsing

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`

**Interfaces:** `NormalizedTransaction` shape is unchanged — only what it reads from changes.

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
Expected: FAIL — current implementation reads `payload.transaction.*`, not `payload.data.*`, and Casso Flow's `"2026-08-01 10:00:00"` (space-separated, no timezone) format needs explicit `Asia/Ho_Chi_Minh` handling.

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

## Task 9: `ReceiveWebhookUseCase` — resolve by `accountNumber`, verify per-connection `secureToken` inline

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankConnectionRepository.findByAccountNumber` (Task 3), `decryptToken` (`bank-connections/application/token-encryption.ts`), `constant-time-compare.ts` (existing).
- Produces: `ReceiveWebhookInput { accountNumber: string; webhookSecret: string; organizationId?: string; transactionId: string; rawPayload: Record<string, unknown> }`.

**Verify empirically before finalizing this task's header-name assumption** (per spec §3/§4 and this plan's Global Constraints): the code below assumes the incoming secret arrives via a `secure-token` HTTP header (Casso Flow's "Legacy" scheme, matching AGENTS.md's constant-time-comparison guidance) — confirm this is really what a webhook registered via `POST /v2/webhooks` (Task 4/5) actually sends before trusting it; if it's `X-Casso-Signature` (HMAC) instead, the verification step changes shape entirely.

- [ ] **Step 1: Write the failing test**

```ts
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
    isUsable: () => true,
    encryptedSecureToken: encryptToken(realSecret, encryptionKey),
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
      encryptionKey,
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
      encryptionKey,
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
        .mockResolvedValue(connectionWith({ encryptedSecureToken: encryptToken('different-secret', encryptionKey) })),
    };
    const queue = { enqueue: jest.fn() };
    const useCase = new ReceiveWebhookUseCase(
      { insert: jest.fn() } as never,
      connectionRepo as never,
      queue as never,
      { transaction: jest.fn() } as never,
      encryptionKey,
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
      encryptionKey,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
```

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

Note the behavior: an unmatched `accountNumber` OR a wrong secret both return `{ received: true, ignored: true }` rather than throwing `TENANT_MISMATCH` — there is no "tenant mismatch" concept here since Casso Flow's payload supplies no `organizationId` to check against; a wrong secret is handled as silently-ignored, not an exception. Do not resurrect `ErrorCode.TENANT_MISMATCH`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns receive-webhook.usecase.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts
git commit -m "fix: resolve+verify ReceiveWebhookUseCase by accountNumber/secureToken"
```

---

## Task 10: `WebhooksController` — drop `WebhookAuthGuard`, wire the flat DTO; delete the IP-allowlist guard

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts`
- Delete: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`, `webhook-auth.guard.spec.ts`, `apps/backend/src/common/webhook/ip-allowlist.ts`, `ip-allowlist.spec.ts` (if these exist — they were only ever committed in an earlier iteration of this same plan; check before deleting, they may not exist yet in this codebase's current state)
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
import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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

If `webhook-auth.guard.ts`/`common/webhook/ip-allowlist.ts` exist in the codebase at this point (check first — earlier planning iterations for this same feature may or may not have reached the codebase depending on what was actually executed), delete them and their specs, and remove any reference to `WebhookAuthGuard` from `webhooks.module.ts` and the controller's `@UseGuards(...)` list. If the controller currently still checks `x-client-id`/`x-secret-key` headers against `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` (the *original*, pre-this-plan scaffold's scheme — check `webhooks.controller.ts`'s current state before assuming which variant exists), remove that too; it's superseded by the per-connection `secure-token` scheme above regardless of which prior scheme is currently in place.

- [ ] **Step 4: Run tests + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks && npx tsc --noEmit`
Expected: PASS, no type errors anywhere in the `webhooks` module.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts apps/backend/src/modules/webhooks/webhooks.module.ts
git commit -m "fix: wire WebhooksController to per-connection secure_token verification"
```

---

## Task 11: `.env.example`

**Files:**
- Modify: `apps/backend/.env.example`

Configuration-only (AGENTS.md TDD exception).

- [ ] **Step 1: Edit**

Remove any of these if present (from earlier planning iterations or the original Cas ID work): `CAS_ID_REDIRECT_BASE_URL`, `CAS_ID_LINK_BASE_URL`, `CAS_ID_CLIENT_ID`, `CAS_ID_CLIENT_SECRET`, `CAS_ID_BASE_URL`, `CAS_ID_WEBHOOK_IP_ALLOWLIST`, `CASSO_FLOW_REDIRECT_URI` (no longer needed — no redirect flow).

**Do not remove or modify** `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` — out of scope for this task, see Global Constraints.

Add, near those two lines:

```
# The webhook URL this product registers with Casso Flow via POST /v2/webhooks
# on every connect (Task 5). A platform-level constant — the API Key itself is
# per-organization and supplied through the UI, not read from process.env.
CASSO_FLOW_WEBHOOK_URL=http://localhost:3000/api/v1/webhooks/casso-balance-hook
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/.env.example
git commit -m "chore: document CASSO_FLOW_WEBHOOK_URL, remove Cas ID env vars"
```

---

## Task 12: Fix the remaining backend e2e/integration test files

**Files:**
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`
- Modify: `apps/backend/test/collection-activity-timeline.integration.spec.ts`
- Modify: `apps/backend/test/receivable-balance-history-audit.e2e-spec.ts`
- Rename+rewrite: `apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts` → `apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts` (if the old file exists at this point — check first)

- [ ] **Step 1: Fix the 2 seed-only files**

In `collection-activity-timeline.integration.spec.ts` and `receivable-balance-history-audit.e2e-spec.ts`: each has one `dataSource.getRepository(BankConnectionOrmEntity).save({...})` block. Replace whatever Cas-ID-shaped fields it currently has (`casIdConnectionSessionId`/`grantId`/`encryptedAccessToken`/`accountIdentity`/`scopes`, in whatever form the codebase currently has them) with:

```ts
        accountNumber: '99887766',
        bankName: 'Test Bank',
        encryptedSecureToken: 'encrypted-test-secure-token',
        encryptedCassoApiKey: 'encrypted-test-api-key',
        status: 'ACTIVE',
```

Neither file's test assertions reference these fields directly (they only use the connection as an FK target for other entities).

- [ ] **Step 2: Rewrite `webhook-matching.e2e-spec.ts`**

This file's 3 tests all `POST /api/v1/webhooks/casso-balance-hook`. Replace the seed's `BankConnectionOrmEntity` fields the same way as Step 1, but generate the secure token for real: import `encryptToken` from `../src/modules/bank-connections/application/token-encryption`, define `const webhookSecret = 'e2e-test-secret';` at module scope, seed `encryptedSecureToken: encryptToken(webhookSecret, /* the same ACCESS_TOKEN_ENCRYPTION_KEY value beforeAll already sets */)`.

Replace the module-level `payload` constant:

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

Every `request(app.getHttpServer()).post(endpoint)...` call: replace any existing auth header (`.set(auth)` or similar, whatever scheme the file currently has) with `.set('secure-token', webhookSecret)`.

For the third test (`'processes a high-confidence match through the queue'`), update its body to the same `{ error, data: {...} }` shape with `counterAccountName: 'Company B'`, `description: 'Thanh toan INV-2026-0012'`.

- [ ] **Step 3: Rewrite the round-trip e2e**

If `cas-id-bank-connection-flow.e2e-spec.ts` exists, rename it to `casso-flow-bank-connection-flow.e2e-spec.ts`. Rewrite its test(s), replacing whatever old initiate/exchange calls it has with:

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
    // This test cannot exercise the real /connect endpoint end-to-end without
    // either real network access to Casso Flow's API (unacceptable for CI)
    // or a fetch-mocking seam this plan hasn't designed for CassoFlowAdapter.
    // It instead seeds a BankConnection directly (mirroring what a real
    // /connect call would have persisted) and exercises only the webhook
    // resolution + verification path, which is the part this task's own
    // change actually touches. CassoFlowAdapter's real HTTP behavior is
    // covered by Task 4's unit tests, not this e2e.
    const organizationId = '00000000-0000-4000-8000-000000000301';
    const userId = '00000000-0000-4000-8000-000000000302';
    const accountNumber = '00000301';
    const webhookSecret = 'round-trip-e2e-secret';

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

    const { BankConnectionOrmEntity } = await import(
      '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity'
    );
    const { encryptToken } = await import(
      '../src/modules/bank-connections/application/token-encryption'
    );
    const connectionId = randomUUID();
    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: connectionId,
      organizationId,
      accountNumber,
      bankName: 'Round Trip Bank',
      encryptedSecureToken: encryptToken(
        webhookSecret,
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      encryptedCassoApiKey: encryptToken(
        'seeded-api-key',
        process.env.ACCESS_TOKEN_ENCRYPTION_KEY as string,
      ),
      status: 'ACTIVE',
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });

    const transactionId = `round-trip-tx-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('secure-token', webhookSecret)
      .send({
        error: 0,
        data: {
          id: transactionId,
          amount: 5_000_000,
          transactionDateTime: '2026-08-19 10:00:00',
          description: 'test balance hook transaction',
          accountNumber,
          counterAccountNumber: '1112223334',
          counterAccountName: 'Round Trip Payer',
        },
      })
      .expect(200, { received: true, duplicate: false });

    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline = Date.now() + 10_000;
    let inboxCount = 0;
    let transaction: InstanceType<typeof BankTransactionOrmEntity> | null = null;
    while (Date.now() < deadline) {
      inboxCount = await inboxRepo.countBy({ organizationId });
      transaction = await transactionRepo.findOneBy({
        providerTransactionId: transactionId,
      });
      if (inboxCount === 1 && transaction) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(inboxCount).toBe(1);
    expect(transaction).not.toBeNull();
    expect(transaction?.organizationId).toBe(organizationId);
    expect(transaction?.bankConnectionId).toBe(connectionId);
    expect(Number(transaction?.amount)).toBe(5_000_000);
  }, 15_000);
});
```

Note this test seeds `BankConnection` directly with `dataSource`, unlike the removed Cas ID version's round trip (which called real `initiate`/`exchange` endpoints) — there is no analogous "call the real connect endpoint" step here without mocking `CassoFlowAdapter`'s network calls, and this plan doesn't design that mocking seam (flag in the final PR description per Task 13, same reasoning as before, now for a different reason: not an OAuth-CI problem, but an untested-request-mocking gap).

- [ ] **Step 4: Run e2e suite**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns "webhook-matching|casso-flow-bank-connection-flow|collection-activity-timeline|receivable-balance-history-audit"`
Expected: PASS, all files present (needs Docker).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/webhook-matching.e2e-spec.ts apps/backend/test/collection-activity-timeline.integration.spec.ts apps/backend/test/receivable-balance-history-audit.e2e-spec.ts apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts
git rm --ignore-unmatch apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts
git commit -m "test: fix e2e/integration tests for Casso Flow's BankConnection shape"
```

---

## Task 13: Frontend — API Key connect form, reconnect action, copy fixes

**Files:**
- Create: `apps/frontend/src/features/bank-connections/components/casso-flow-connect-form.tsx`
- Create: `apps/frontend/src/features/bank-connections/components/casso-flow-connect-form.spec.tsx`
- Delete (if present — check first, may not exist depending on what prior iterations of this plan reached): `apps/frontend/src/lib/cas-link.ts`, `cas-link.spec.ts`, `apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.tsx`, `cas-id-callback-page.spec.tsx`, `apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.tsx`, `cas-id-connection-flow.spec.tsx`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`, `apps/frontend/src/features/bank-connections/types.ts`, `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`
- Modify: `apps/frontend/src/features/bank-connections/components/connect-dialog.tsx`, `apps/frontend/src/features/bank-connections/components/connection-table.tsx`, `connection-table.spec.tsx`
- Modify: `apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`, `apps/frontend/src/features/onboarding/pages/onboarding-page.tsx`, `apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx`
- Modify (revert to no callback route — check `App.tsx`/`routes/index.tsx` for any Cas-ID-or-earlier-Casso-Flow-plan callback route and remove it): `apps/frontend/src/routes/index.tsx`, `apps/frontend/src/App.tsx`

**Design note:** no popup, no OAuth, no callback page — the whole connect interaction is one form with one text input (the API Key) and a submit button, inside the existing `ConnectDialog`. This is simpler than every earlier iteration of this plan, not just different. Follow this repo's existing form/dialog patterns (`shadcn/ui` `Input`, `Form`/plain controlled input + `Button`, matching how other simple single-field forms in this codebase are built — check an existing one, e.g. a settings form, for the exact primitives/validation-display convention before inventing a new one).

- [ ] **Step 1: Update the API/types/hooks layer**

Replace `bank-connections-api.ts`'s Cas ID (or any earlier-plan Casso Flow OAuth) functions with:

```ts
export function connectCassoFlow(input: {
  apiKey: string;
  bankConnectionId?: string;
}): Promise<{ connectionId: string; status: string }> {
  return postWithIdempotency('/api/v1/bank-connections/casso-flow/connect', input);
}
```

Replace `types.ts`'s Cas ID/OAuth types — no `CassoFlowInitiation`/`CassoFlowExchangeInput` are needed anymore, just:

```ts
export interface CassoFlowConnectInput {
  apiKey: string;
  bankConnectionId?: string;
}
```

Replace `use-bank-connections.ts`'s Cas ID/OAuth hooks with:

```ts
export function useConnectCassoFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CassoFlowConnectInput) => connectCassoFlow(input),
    onSuccess: () => {
      toast.success('Đã kết nối Casso Flow.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Không thể kết nối Casso Flow. Kiểm tra lại API Key.'),
  });
}
```

(update the `import { ... } from './bank-connections-api'` and `from '../types'` lines accordingly.)

- [ ] **Step 2: Write the failing test for the connect form**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CassoFlowConnectForm } from './casso-flow-connect-form';

const { apiRequest, toastError } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderForm(props: { bankConnectionId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CassoFlowConnectForm {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  toastError.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('CassoFlowConnectForm', () => {
  it('submits the pasted API Key', async () => {
    apiRequest.mockResolvedValue({ connectionId: 'conn-1', status: 'ACTIVE' });

    renderForm();
    fireEvent.change(screen.getByLabelText('Casso API Key'), {
      target: { value: 'real-api-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-connections/casso-flow/connect',
          data: { apiKey: 'real-api-key' },
        }),
      ),
    );
  });

  it('includes bankConnectionId when provided, for the reconnect case', async () => {
    apiRequest.mockResolvedValue({ connectionId: 'conn-1', status: 'ACTIVE' });

    renderForm({ bankConnectionId: 'conn-1' });
    fireEvent.change(screen.getByLabelText('Casso API Key'), {
      target: { value: 'new-api-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối lại' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { apiKey: 'new-api-key', bankConnectionId: 'conn-1' },
        }),
      ),
    );
  });

  it('disables submit until a key is entered', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Kết nối' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/components/casso-flow-connect-form.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConnectCassoFlow } from '../api/use-bank-connections';

export function CassoFlowConnectForm({
  bankConnectionId,
  onCompleted,
}: {
  bankConnectionId?: string;
  onCompleted?: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const connectMutation = useConnectCassoFlow();

  function handleSubmit() {
    connectMutation.mutate(
      { apiKey, bankConnectionId },
      { onSuccess: () => onCompleted?.() },
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="casso-api-key">Casso API Key</Label>
        <Input
          id="casso-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Dán API Key từ tài khoản Casso của bạn"
        />
        <p className="text-xs text-muted-foreground">
          Lấy API Key tại Casso: Thiết lập → API Keys → Tạo API Key.
        </p>
      </div>
      <Button
        onClick={handleSubmit}
        disabled={!apiKey.trim() || connectMutation.isPending}
      >
        {connectMutation.isPending
          ? 'Đang kết nối…'
          : bankConnectionId
            ? 'Kết nối lại'
            : 'Kết nối'}
      </Button>
    </div>
  );
}
```

Check `apps/frontend/src/components/ui/label.tsx` and `input.tsx` exist as shadcn/ui primitives before importing them (they're standard shadcn components almost certainly already present given this codebase's existing form patterns — confirm rather than assume, and if `Label` doesn't exist, use a plain `<label htmlFor="casso-api-key" className="text-sm font-medium">Casso API Key</label>` instead of introducing a new primitive for one field).

Delete the Cas-ID/earlier-Casso-Flow-OAuth files listed at the top of this task if present.

- [ ] **Step 5: Wire into `ConnectDialog` and `ConnectionTable`, fix leftover copy**

`connect-dialog.tsx`: replace whatever connection-flow component it currently renders with `<CassoFlowConnectForm onCompleted={() => setOpen(false)} />`. Update the `DialogTitle` to `"Kết nối Casso Flow"` and the `DialogDescription` to `"Dán API Key từ tài khoản Casso của bạn để bắt đầu đồng bộ giao dịch."`.

`onboarding-page.tsx`: same component swap. Update the `CardDescription` to `"Liên kết tài khoản qua Casso Flow để bắt đầu đồng bộ giao dịch vào Casso Ledger."` (keep "Casso Ledger" as-is — this product's own name, not the third party; see `CONTEXT.md`'s "Casso Flow" glossary entry).

`bank-connections-page.tsx`: update the page description to `"Kết nối Casso Flow để tự động đồng bộ giao dịch."`

`onboarding-page.spec.tsx`: remove any mock of a popup library (`cas-link`/`casso-flow-link`) and any popup-based test; replace with a form-submission test mirroring Task 13's own spec pattern (fill the API Key input, click submit, assert the mutation was called) — there is no popup to mock anymore.

**`connection-table.tsx`** — add the reconnect action for `REQUIRES_REAUTHORIZATION`/`ERROR` connections (same gap found during the `frontend-design` pass as in an earlier iteration of this plan, still applicable): render `<CassoFlowConnectForm bankConnectionId={connection.id} />` inside a small popover/dialog trigger (a "Kết nối lại" button that opens a mini form, not a full-page flow) as a sibling to the existing `{connection.status === 'ACTIVE' && (<AlertDialog>...)}` disconnect block in the same `<TableCell>`. Use this codebase's existing `Popover`/`Dialog` primitive (check `components/ui/` for what's already used elsewhere in this file's imports or nearby components) rather than inventing a new interaction pattern — the exact wrapper (`Popover` vs a small `Dialog`) is an implementation choice, not specified further here; pick whichever this codebase already uses for "a small form triggered from a table row action."

`routes/index.tsx`/`App.tsx`: remove any Casso-Flow-callback or Cas-ID-callback route/lazy import if one exists from an earlier iteration of this plan — there is no callback page in this design.

In `connection-table.spec.tsx`, add a test: seed a connection with `status: 'REQUIRES_REAUTHORIZATION'`, assert a "Kết nối lại" trigger renders and the "Ngắt kết nối" button does not (check the file's current mocking pattern for `useConnectCassoFlow`/`useDisconnectConnection` first, matching it exactly rather than guessing).

- [ ] **Step 6: Run tests; full frontend suite + type-check**

Run: `cd apps/frontend && npx vitest run src/features/bank-connections/components/casso-flow-connect-form.spec.tsx src/features/bank-connections/components/connection-table.spec.tsx`
Expected: PASS (3 tests in the form spec, plus `connection-table.spec.tsx`'s existing tests plus the new one).

Run: `cd apps/frontend && npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/bank-connections apps/frontend/src/features/onboarding/pages/onboarding-page.tsx apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx apps/frontend/src/routes/index.tsx apps/frontend/src/App.tsx
git rm --ignore-unmatch apps/frontend/src/lib/cas-link.ts apps/frontend/src/lib/cas-link.spec.ts apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.tsx apps/frontend/src/features/bank-connections/pages/cas-id-callback-page.spec.tsx apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.tsx apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.spec.tsx
git commit -m "feat: replace popup connect flow with a pasted-API-Key form"
```

---

## Task 14: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend unit suite, e2e suite, type-check, arch-check, domain-check, biome**

```bash
cd apps/backend && npx jest && npx jest --config ./test/jest-e2e.json && npx tsc --noEmit && npm run arch-check
```

Run the `domain-check` skill and fix violations.

Run from repo root: `npx biome check --write apps/backend/src apps/backend/test apps/backend/.env.example`

- [ ] **Step 2: Full frontend suite, type-check, biome**

```bash
cd apps/frontend && npx vitest run && npx tsc --noEmit
cd D:/casso-ledger && npx biome check --write apps/frontend/src
```

- [ ] **Step 3: Grep for leftover Cas ID references AND leftover OAuth2-popup references**

```bash
grep -rln "CasId\|cas-id\|CAS_ID" apps/backend/src apps/frontend/src apps/backend/test --include=*.ts --include=*.tsx 2>/dev/null
grep -rln "CassoOAuthState\|authorizeUrl\|casso-flow-link\|casso-flow/callback\|CassoFlowCallbackPage\|exchangeCodeForToken" apps/backend/src apps/frontend/src apps/backend/test --include=*.ts --include=*.tsx 2>/dev/null
```

Expected: no results for either grep (or only genuinely unrelated false positives — inspect each). The second grep catches leftovers from this plan's own earlier OAuth2-popup draft, in case any file from that draft reached the codebase before this revision and wasn't fully replaced.

- [ ] **Step 4: Push and open a PR — do NOT merge**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: replace Cas ID integration with Casso Flow (API Key connect)" --body "$(cat <<'EOF'
## Summary
Removes the Cas ID integration merged in PR #266/#268/#269 (wrong provider —
see ADR-0021) and replaces it with a Casso Flow integration: a business
pastes their own Casso API Key (Casso's OAuth2 partner-app registration is
permanently closed — confirmed against the actual registration form), this
product reads their linked account and registers a webhook on their behalf.
No popup, no redirect flow.

## Known gaps / follow-ups (see spec §6)
- The exact webhook auth header (`secure-token` vs `X-Casso-Signature`) is
  assumed from incomplete public docs — MUST be verified against real Casso
  Flow behavior before this is trusted in production (see Task 9's note).
- The round-trip e2e test (Task 12) seeds a BankConnection directly rather
  than exercising the real `/connect` endpoint against Casso Flow's network
  — `CassoFlowAdapter`'s real HTTP calls are covered only by Task 4's unit
  tests, not end-to-end.
- Token refresh doesn't apply (API Keys don't expire per Casso's docs), but
  key revocation on Casso's side is only detected reactively (a 401 on the
  next API call), not proactively.
- Force-sync reconciliation (`/v2/sync`) and disconnect-side webhook
  unregistration are deliberately out of scope.

## Test plan
- [x] Full backend unit suite
- [x] Full backend e2e suite (needs Docker)
- [x] Full frontend suite
- [x] `npx tsc --noEmit` (both apps)
- [x] `npm run arch-check`
- [x] `domain-check` skill
- [x] `npx biome check --write`
- [x] No leftover Cas ID or OAuth2-popup references (grep)

Spec: docs/superpowers/specs/2026-08-19-casso-flow-integration-design.md
ADR: docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back to the user and wait for review — do not merge.
