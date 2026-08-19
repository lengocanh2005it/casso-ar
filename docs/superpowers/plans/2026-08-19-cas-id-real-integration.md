# Real Cas ID Integration + Balance Hook Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MockCasIdAdapter` with a real Cas ID API adapter (grant/token, grant/exchange, identity), and fix the Balance Hook webhook receiver to match Cas ID's real product (IP-allowlist auth, real nested payload shape, `grantId`-keyed connection lookup) instead of an imagined generic "Casso" webhook.

**Architecture:** Widen `ICasIdIntegrationAdapter.exchangeToken` to also return `grantId`; thread `grantId` through `BankConnection` (domain + ORM + migration) so Balance Hook deliveries (which only ever carry `grantId`) can resolve to the right connection via a new `findByGrantId` repository method. A new `CasIdAdapter` calls the real Cas ID sandbox API with retry-with-backoff; a `useFactory` DI provider picks it over `MockCasIdAdapter` only when real credentials are configured. `WebhookAuthGuard` is rewritten from a wrong shared-secret scheme to a fail-closed source-IP allowlist; `BalanceHookDto`/`transaction-normalizer.ts` are rewritten to the real nested payload shape.

**Tech Stack:** NestJS 11, TypeORM 1.1, class-validator/class-transformer, Jest 30, testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md`

## Global Constraints

- Money: integers in VND units, never float/decimal (no money fields touched in this plan, but any new numeric field must follow this).
- Every write that changes state MUST be inside one DB transaction (already true for `ExchangeTokenUseCase`/`ReceiveWebhookUseCase` — do not weaken this).
- Tenant isolation: every query/write scoped by `organizationId`, except the documented unscoped exceptions (`findByIdUnscoped`, and the new `findByGrantId` — webhook delivery has no request tenant context).
- `application/` layer MUST NOT import concrete SDKs or throw framework exceptions — only `AppError`. `infrastructure/` (the new `CasIdAdapter`) may use `fetch`/`AbortController`/`@nestjs/common` DI decorators.
- No `any` in production code (tests may use `as never`/`as any` per this repo's existing spec style).
- Domain ↔ ORM translation: this repo's `TypeOrmBankConnectionRepository` passes domain instances directly into TypeORM's `.save()` without an explicit `as`/`as unknown as` cast, relying on structural compatibility between `BankConnectionProps` and `BankConnectionOrmEntity` — follow this existing pattern exactly (keep field names/types identical between the two) rather than introducing a new mapper style.
- TDD: RED (write test, watch it fail) → GREEN (minimal implementation) → REFACTOR, for every behavior change. Migrations follow this repo's existing migration-spec convention (`queryRunner.query` assertions), not full TDD against a real DB.
- Biome: single quotes, semicolons, 2-space indent, no trailing commas — run `npx biome check --write <files>` at the end of each task.
- Decisions from the spec are final for this plan — do not re-litigate `AccountIdentity` nullability (§2.5), the retry-helper location (§2.4/Out of scope), or the sandbox-only IP allowlist (§3.1) while implementing.

---

## Task 1: Widen `exchangeToken` to return `grantId`, update `MockCasIdAdapter`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts`

**Interfaces:**
- Produces: `ICasIdIntegrationAdapter.exchangeToken(publicToken: string): Promise<{ accessToken: string; grantId: string }>` — every later task that calls `exchangeToken` (Task 6, Task 9) relies on the `grantId` field being present.

- [ ] **Step 1: Write the failing test**

Edit `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts`, replace the `'exchanges and resolves a mock token'` test:

```ts
  it('exchanges and resolves a mock token, including a grantId', async () => {
    const adapter = new MockCasIdAdapter();
    const { accessToken, grantId } = await adapter.exchangeToken('public-token');
    expect(accessToken).toContain('mock-access-token-');
    expect(grantId).toContain('mock-grant-id-');
    await expect(adapter.getAccountIdentity(accessToken)).resolves.toEqual(
      expect.objectContaining({ bankName: 'Mock Bank' }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns mock-cas-id.adapter.spec.ts`
Expected: FAIL — `grantId` is `undefined`, `toContain` throws on a non-string.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`, change:

```ts
  exchangeToken(publicToken: string): Promise<{ accessToken: string }>;
```

to:

```ts
  exchangeToken(
    publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }>;
```

Edit `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts`, change:

```ts
  async exchangeToken(_publicToken: string): Promise<{ accessToken: string }> {
    return { accessToken: `mock-access-token-${randomUUID()}` };
  }
```

to:

```ts
  async exchangeToken(
    _publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }> {
    return {
      accessToken: `mock-access-token-${randomUUID()}`,
      grantId: `mock-grant-id-${randomUUID()}`,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns mock-cas-id.adapter.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check (this change is a compile-breaking widen — the next task fixes call sites)**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors only in `exchange-token.usecase.ts` (doesn't yet use `grantId`, that's fine — TS won't complain about an unused extra field) and possibly none at all, since `exchangeToken`'s only current caller destructures `{ accessToken }` which still works when the object has an extra `grantId` field. Confirm no errors; if there are any, they belong to Task 6, not this one — do not fix them here.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts
git commit -m "feat: widen ICasIdIntegrationAdapter.exchangeToken to return grantId"
```

---

## Task 2: Add `grantId` to the `BankConnection` domain entity and `reactivate()`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`
- Modify: `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BankConnectionProps.grantId: string`, `BankConnection.grantId: string`, `BankConnection.reactivate(input: { casIdConnectionSessionId, encryptedAccessToken, accountIdentity, scopes, grantId })` — Task 5 (`ExchangeTokenUseCase`) and Task 4 (ORM entity) rely on this exact field name.

`grantId` becomes a **required** constructor field. This breaks every existing `new BankConnection({...})` call site (there are 6, all in test files) — this task fixes every one of them in the same commit, since the domain type change and its test-site fixups are one deliverable (a partial fix leaves the suite red).

- [ ] **Step 1: Write the failing test**

Edit `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`, add `grantId: 'grant-1',` right after `casIdConnectionSessionId: 'session-1',` in `activeConnection()`, and add `grantId: 'grant-2',` to both `reactivate({...})` calls in the file, right after their `casIdConnectionSessionId: 'session-2',` line. Then add one new test at the end of the `describe` block (before the closing `});`):

```ts
  it('overwrites grantId on reactivate — grantId belongs to the current grant session, not the connection', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    const reconnected = reauth.reactivate({
      casIdConnectionSessionId: 'session-2',
      encryptedAccessToken: 'encrypted-2',
      accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
      scopes: ['identity', 'transaction'],
      grantId: 'grant-2',
    });
    expect(reconnected.grantId).toBe('grant-2');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns bank-connection.spec.ts`
Expected: FAIL — TypeScript compile error, `grantId` does not exist on `BankConnectionProps`/`reactivate`'s input type.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`:

```ts
export interface BankConnectionProps {
  id: string;
  organizationId: string;
  casIdConnectionSessionId: string;
  grantId: string;
  encryptedAccessToken: string;
  accountIdentity: AccountIdentity;
  status: BankConnectionStatus;
  scopes: string[];
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class BankConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly casIdConnectionSessionId: string;
  readonly grantId: string;
  readonly encryptedAccessToken: string;
  readonly accountIdentity: AccountIdentity;
  readonly status: BankConnectionStatus;
  readonly scopes: string[];
  readonly connectedAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
```

(insert `grantId: string;` right after `casIdConnectionSessionId: string;` in both the interface and the class field list — everything else in the file is unchanged).

Change `reactivate()`'s signature:

```ts
  reactivate(input: {
    casIdConnectionSessionId: string;
    grantId: string;
    encryptedAccessToken: string;
    accountIdentity: AccountIdentity;
    scopes: string[];
  }): BankConnection {
```

(only the parameter type gains `grantId: string;` — the method body, which does `{ ...this, ...input, status: 'ACTIVE', connectedAt: new Date(), revokedAt: null }`, needs no change: spreading `input` after `this` already overwrites `grantId` along with the other reactivated fields).

Now fix every other existing `new BankConnection({...})` call site — in each of the 5 files below, insert `grantId: 'grant-1',` (or `'grant-existing'` where noted) immediately after the `casIdConnectionSessionId: '...',` line:

`apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts` (inside `connectionWithStatus`):
```ts
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
```

`apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`:
```ts
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
```

`apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`:
```ts
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
```

`apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`:
```ts
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
```

`apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts` — this file has one `new BankConnection({...})` (the `existing` connection in the "allows re-authenticating a non-ACTIVE connection even at the ACTIVE limit" test), with `casIdConnectionSessionId: 'session-old',`:
```ts
      casIdConnectionSessionId: 'session-old',
      grantId: 'grant-existing',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns "bank-connection.spec|assert-reauthorizable.spec|connection-usecases.spec|disconnect-connection.usecase.spec|mark-requires-reauthorization.usecase.spec|sync-transactions.usecase.spec"`
Expected: PASS, all suites.

- [ ] **Step 5: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors remain only in `exchange-token.usecase.ts` (still constructs `BankConnection` without `grantId` — fixed in Task 5) and `typeorm-bank-connection.repository.ts`/`bank-connection.orm-entity.ts` (fixed in Task 4) and any `.e2e-spec.ts` files that `.save()` a `BankConnectionOrmEntity` (fixed in Task 4). Confirm no *other* unexpected errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/bank-connection.ts apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts apps/backend/src/modules/bank-connections/application/assert-reauthorizable.spec.ts apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts
git commit -m "feat: add grantId to BankConnection domain entity and reactivate()"
```

---

## Task 3: Add `grantId` ORM column + migration

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts`
- Modify: `apps/backend/test/collection-activity-timeline.integration.spec.ts`
- Modify: `apps/backend/test/receivable-balance-history-audit.e2e-spec.ts`
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`
- Create: `apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.ts`
- Create: `apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.spec.ts`

**Interfaces:**
- Consumes: `BankConnection.grantId` (Task 2).
- Produces: `bank_connections.grantId` column (`varchar`, `NOT NULL`, `UNIQUE`) — Task 4's `findByGrantId` queries this column.

- [ ] **Step 1: Write the failing migration test**

Create `apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.spec.ts`:

```ts
import type { QueryRunner } from 'typeorm';
import { AddBankConnectionGrantId20260827000000 } from './20260827000000-add-bank-connection-grant-id';

describe('AddBankConnectionGrantId20260827000000', () => {
  it('adds the required, unique grantId column', async () => {
    const migration = new AddBankConnectionGrantId20260827000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" ADD COLUMN "grantId" character varying NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "UQ_bank_connections_grant_id" ON "bank_connections" ("grantId")',
    );
  });

  it('reverts by dropping the index then the column', async () => {
    const migration = new AddBankConnectionGrantId20260827000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_bank_connections_grant_id"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns 20260827000000-add-bank-connection-grant-id`
Expected: FAIL — cannot find module `./20260827000000-add-bank-connection-grant-id`.

- [ ] **Step 3: Write the migration**

Create `apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankConnectionGrantId20260827000000
  implements MigrationInterface
{
  name = 'AddBankConnectionGrantId20260827000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // No existing production data (only MockCasIdAdapter has ever run —
    // see docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md
    // §3.3), so this ships NOT NULL directly with no backfill step.
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "grantId" character varying NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_bank_connections_grant_id" ON "bank_connections" ("grantId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_bank_connections_grant_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns 20260827000000-add-bank-connection-grant-id`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the column to the ORM entity**

Edit `apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts`, insert right after the `casIdConnectionSessionId` column:

```ts
  @Column({ type: 'uuid' })
  casIdConnectionSessionId: string;

  @Column({ unique: true })
  grantId: string;

```

- [ ] **Step 6: Fix the 3 e2e files that seed a `BankConnectionOrmEntity` row directly**

In each of the 3 files below, insert a `grantId:` line immediately after the existing `casIdConnectionSessionId:` line in the `.save({...})` call:

`apps/backend/test/collection-activity-timeline.integration.spec.ts` (uses `randomUUID()` elsewhere in the file already):
```ts
        casIdConnectionSessionId: randomUUID(),
        grantId: randomUUID(),
```

`apps/backend/test/receivable-balance-history-audit.e2e-spec.ts`:
```ts
      casIdConnectionSessionId: '00000000-0000-0000-0000-0000000000f3',
      grantId: '00000000-0000-0000-0000-0000000000f4',
```

`apps/backend/test/webhook-matching.e2e-spec.ts` — this file is rewritten more substantially in Task 12 (new payload shape); for now, just add the column so the seed insert doesn't violate the `NOT NULL` constraint:
```ts
      casIdConnectionSessionId: '00000000-0000-0000-0000-0000000000f3',
      grantId: '00000000-0000-0000-0000-0000000000f4',
```

- [ ] **Step 7: Run the full unit suite and type-check**

Run: `cd apps/backend && npx jest && npx tsc --noEmit`
Expected: unit suite PASS (e2e suites are not run by plain `npx jest` — they use a separate config, see Task 12/13 for their verification). `tsc --noEmit` should now show errors only in `exchange-token.usecase.ts` (Task 5) and `webhooks.controller.ts`/`receive-webhook.usecase.ts` (Task 9/10) if they already reference `grantId` — confirm remaining errors are only in those not-yet-touched files.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.ts apps/backend/src/database/migrations/20260827000000-add-bank-connection-grant-id.spec.ts apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts apps/backend/test/collection-activity-timeline.integration.spec.ts apps/backend/test/receivable-balance-history-audit.e2e-spec.ts apps/backend/test/webhook-matching.e2e-spec.ts
git commit -m "feat: add bank_connections.grantId column and migration"
```

---

## Task 4: Add `findByGrantId` to the bank-connections repository

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`

**Interfaces:**
- Consumes: `BankConnectionOrmEntity.grantId` (Task 3).
- Produces: `IBankConnectionRepository.findByGrantId(grantId: string): Promise<BankConnection | null>` — Task 10 (`ReceiveWebhookUseCase`) calls this directly.

No dedicated unit-test file exists for this repository (verified: `apps/backend/src/modules/bank-connections/infrastructure/` has no `typeorm-bank-connection.repository.spec.ts`) — this method is a thin `findOne` wrapper identical in shape to the existing `findByIdUnscoped`, and is exercised for real against Postgres by Task 13's new e2e test. This is a configuration/plumbing task (no new business logic to unit-test in isolation), so it's exempt from a dedicated RED/GREEN cycle per AGENTS.md's stated TDD exceptions — implement directly.

- [ ] **Step 1: Add the port method**

Edit `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`, insert right after `findByIdUnscoped`:

```ts
  // Unscoped on purpose, same reasoning as findByIdUnscoped above: called
  // from ReceiveWebhookUseCase, which handles an inbound Cas ID Balance Hook
  // delivery — there is no TenantContextService organizationId at that point,
  // only the grantId Cas ID's payload carries.
  findByGrantId(grantId: string): Promise<BankConnection | null>;
```

- [ ] **Step 2: Implement it in the TypeORM repository**

Edit `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`, insert right after `findByIdUnscoped`:

```ts
  async findByGrantId(grantId: string): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { grantId } });
    return row ? new BankConnection(row) : null;
  }
```

- [ ] **Step 3: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no new errors from this file; remaining errors (if any) are in `exchange-token.usecase.ts`, `webhooks.controller.ts`, `receive-webhook.usecase.ts` — not yet touched.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts
git commit -m "feat: add findByGrantId to bank connection repository"
```

---

## Task 5: Persist `grantId` in `ExchangeTokenUseCase` (create + reactivate)

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`
- Modify: `apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts`

**Interfaces:**
- Consumes: `adapter.exchangeToken()` returning `{ accessToken, grantId }` (Task 1); `BankConnection` constructor and `reactivate()` requiring `grantId` (Task 2).
- Produces: every `BankConnection` created/reactivated by this use case now carries the real `grantId` from the exchange response.

- [ ] **Step 1: Write the failing test**

Edit `apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts`. In the `'exchanges a public token and persists only encrypted credentials'` test, change the adapter mock's `exchangeToken` to also resolve `grantId`, and assert it lands on the saved connection:

```ts
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret', grantId: 'grant-new' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit: jest.fn() } as never,
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      publicToken: 'public',
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.grantId).toBe('grant-new');
```

(keep the rest of that test's existing assertions unchanged — only the mock's `exchangeToken` resolution and this one new `expect` line are added).

Also update the `'allows re-authenticating a non-ACTIVE connection even at the ACTIVE limit'` test's adapter mock the same way, and add an assertion that reactivation overwrites `grantId`:

```ts
    const useCase = new ExchangeTokenUseCase(
      sessionRepo as never,
      {
        exchangeToken: jest
          .fn()
          .mockResolvedValue({ accessToken: 'raw-secret', grantId: 'grant-new' }),
        getAccountIdentity: jest
          .fn()
          .mockResolvedValue({ accountNumber: '1234', bankName: 'Mock' }),
      } as never,
      bankRepo as never,
      auditRepo as never,
      dataSource as never,
      encryptionKey,
      { enforceBankConnectionLimit } as never,
    );

    const result = await useCase.execute({
      sessionId: 'session-1',
      publicToken: 'public',
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.grantId).toBe('grant-new');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns connection-usecases.spec.ts`
Expected: FAIL — `result.grantId` is `undefined` (the use case doesn't read/pass it yet), and/or a TS compile error since `BankConnection`'s constructor/`reactivate()` require `grantId` but `exchange-token.usecase.ts` doesn't supply it yet.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`:

```ts
    // External call stays outside the transaction (AGENTS.md: don't call
    // external APIs inside a transaction) — only the DB writes below are wrapped.
    const { accessToken, grantId } = await this.adapter.exchangeToken(
      input.publicToken,
    );
    const accountIdentity = await this.adapter.getAccountIdentity(accessToken);
```

and in the transaction body, add `grantId` to both branches:

```ts
      const connection = existing
        ? existing.reactivate({
            casIdConnectionSessionId: session.id,
            grantId,
            encryptedAccessToken: encryptToken(accessToken, this.encryptionKey),
            accountIdentity,
            scopes: session.scopes,
          })
        : new BankConnection({
            id: randomUUID(),
            organizationId: session.organizationId,
            casIdConnectionSessionId: session.id,
            grantId,
            encryptedAccessToken: encryptToken(accessToken, this.encryptionKey),
            accountIdentity,
            status: 'ACTIVE',
            scopes: session.scopes,
            connectedAt: new Date(),
            lastSyncAt: null,
            revokedAt: null,
            createdAt: new Date(),
          });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns connection-usecases.spec.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: remaining errors (if any) only in `webhooks.controller.ts`/`receive-webhook.usecase.ts` (Task 9/10).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts apps/backend/src/modules/bank-connections/application/connection-usecases.spec.ts
git commit -m "feat: persist grantId on connection create and reactivate"
```

---

## Task 6: `CasIdAdapter` — `createGrantToken` with retry-with-backoff

**Files:**
- Create: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`

**Interfaces:**
- Consumes: `ICasIdIntegrationAdapter` (Task 1's widened port).
- Produces: `CasIdAdapter` class, `createGrantToken(scopes: string[], redirectUri: string): Promise<{ grantToken: string; expiresAt: Date }>` — Task 7/8 add the other two methods to this same class in this same file.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`:

```ts
import { CasIdAdapter } from './cas-id.adapter';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CasIdAdapter', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CAS_ID_BASE_URL: 'https://sandbox.bankhub.dev',
      CAS_ID_CLIENT_ID: 'test-client',
      CAS_ID_CLIENT_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('creates a grant token by calling POST /grant/token with the right headers and body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { grantToken: 'real-grant', expiresAt: '2026-08-19T12:30:00.000Z' }),
      );
    global.fetch = fetchMock as never;
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken(
      ['identity', 'transaction'],
      'http://localhost:5173/bank-connections/cas-id/callback?sessionId=s1',
    );

    expect(result.grantToken).toBe('real-grant');
    expect(result.expiresAt).toEqual(new Date('2026-08-19T12:30:00.000Z'));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.bankhub.dev/grant/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-client-id': 'test-client',
          'x-secret-key': 'test-secret',
          'X-BankHub-Api-Version': '2023-01-01',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          scopes: 'identity,transaction',
          language: 'vi',
          redirectUri: 'http://localhost:5173/bank-connections/cas-id/callback?sessionId=s1',
        }),
      }),
    );
  });

  it('maps snake_case response fields as a fallback', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { grant_token: 'snake-grant', expires_at: '2026-08-19T12:30:00.000Z' }),
      ) as never;
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken([], 'http://localhost/cb');

    expect(result.grantToken).toBe('snake-grant');
  });

  it('throws if the response is missing grantToken', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {})) as never;
    const adapter = new CasIdAdapter();

    await expect(adapter.createGrantToken([], 'http://localhost/cb')).rejects.toThrow(
      'Cas ID /grant/token response is missing grantToken',
    );
  });

  it('retries on a 503 and succeeds on the second attempt', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: 'unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, { grantToken: 'after-retry' }));
    global.fetch = fetchMock as never;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as never;
    }) as never);
    const adapter = new CasIdAdapter();

    const result = await adapter.createGrantToken([], 'http://localhost/cb');

    expect(result.grantToken).toBe('after-retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-retryable 400 and throws with the mapped message', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { errorMessage: 'invalid scopes' }));
    global.fetch = fetchMock as never;
    const adapter = new CasIdAdapter();

    await expect(adapter.createGrantToken([], 'http://localhost/cb')).rejects.toThrow(
      'invalid scopes',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: FAIL — cannot find module `./cas-id.adapter`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { AccountIdentity } from '../domain/bank-connection';
import {
  type CasIdTransaction,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from '../application/cas-id-integration-adapter.port';

const DEFAULT_BASE_URL = 'https://sandbox.bankhub.dev';
const API_VERSION = '2023-01-01';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

class CasIdHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CasIdHttpError';
  }
}

// ponytail: real HTTP calls only for createGrantToken/exchangeToken/
// getAccountIdentity. invalidateToken and getTransactions keep
// MockCasIdAdapter's no-op behavior — /grant/invalidate and /transactions'
// request/response schemas are not in Cas ID's public docs (stub pages,
// checked 2026-08-19) and DisconnectConnectionUseCase rethrows any error
// from invalidateToken, so guessing the schema risks breaking the existing,
// working Disconnect feature. Upgrade once a real schema is confirmed —
// see docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §2.1.
@Injectable()
export class CasIdAdapter implements ICasIdIntegrationAdapter {
  private readonly logger = new Logger(CasIdAdapter.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly secretKey: string;

  constructor() {
    this.baseUrl = process.env.CAS_ID_BASE_URL ?? DEFAULT_BASE_URL;
    this.clientId = process.env.CAS_ID_CLIENT_ID ?? '';
    this.secretKey = process.env.CAS_ID_CLIENT_SECRET ?? '';
  }

  async createGrantToken(
    scopes: string[],
    redirectUri: string,
  ): Promise<{ grantToken: string; expiresAt: Date }> {
    const data = await this.request<Record<string, unknown>>('/grant/token', {
      method: 'POST',
      body: JSON.stringify({
        scopes: scopes.join(','),
        language: 'vi',
        redirectUri,
      }),
    });
    const grantToken = data.grantToken ?? data.grant_token;
    if (typeof grantToken !== 'string' || !grantToken) {
      throw new Error('Cas ID /grant/token response is missing grantToken');
    }
    const expiresAtRaw = data.expiresAt ?? data.expires_at;
    const expiresAt =
      typeof expiresAtRaw === 'string'
        ? new Date(expiresAtRaw)
        : new Date(Date.now() + 30 * 60 * 1000);
    return { grantToken, expiresAt };
  }

  async exchangeToken(
    _publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }> {
    throw new Error('not implemented yet — see Task 7');
  }

  async invalidateToken(_accessToken: string): Promise<void> {}

  async getAccountIdentity(_accessToken: string): Promise<AccountIdentity> {
    throw new Error('not implemented yet — see Task 8');
  }

  async getTransactions(_accessToken: string): Promise<CasIdTransaction[]> {
    return [];
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<T> {
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            'x-client-id': this.clientId,
            'x-secret-key': this.secretKey,
            'X-BankHub-Api-Version': API_VERSION,
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: accessToken } : {}),
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new CasIdUnauthorizedError();
        }
        throw new CasIdHttpError(
          this.extractErrorMessage(data, response.status),
          response.status,
        );
      }

      return this.unwrap(data) as T;
    }, path);
  }

  private unwrap(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) return data;
    const record = data as Record<string, unknown>;
    if (typeof record.data === 'object' && record.data !== null) {
      return record.data;
    }
    return record;
  }

  private extractErrorMessage(data: unknown, status: number): string {
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      const message =
        record.errorMessage ?? record.message ?? record.error ?? record.errorCode;
      if (message) return String(message);
    }
    return `Cas ID API error ${status}`;
  }

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isRetryable =
          error instanceof CasIdHttpError &&
          RETRYABLE_STATUS_CODES.has(error.status);
        if (!isRetryable || attempt === MAX_RETRIES) throw error;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `Cas ID ${context} attempt ${attempt + 1} failed (status ${(error as CasIdHttpError).status}), retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: PASS (5 tests). The two throw-`not implemented yet` stub methods are not exercised by this task's tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts
git commit -m "feat: add CasIdAdapter.createGrantToken with retry-with-backoff"
```

---

## Task 7: `CasIdAdapter` — `exchangeToken`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`

**Interfaces:**
- Consumes: `private request<T>()`/`withRetry()` from Task 6 (same file).
- Produces: `CasIdAdapter.exchangeToken(publicToken: string): Promise<{ accessToken: string; grantId: string }>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`, inside the existing `describe('CasIdAdapter', ...)` block:

```ts
  describe('exchangeToken', () => {
    it('exchanges a public token for an accessToken and grantId', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { accessToken: 'real-access', grantId: 'real-grant-id' }),
        );
      global.fetch = fetchMock as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.exchangeToken('public-token-1');

      expect(result).toEqual({ accessToken: 'real-access', grantId: 'real-grant-id' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://sandbox.bankhub.dev/grant/exchange',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ publicToken: 'public-token-1' }),
        }),
      );
    });

    it('maps snake_case response fields as a fallback', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { access_token: 'snake-access', grant_id: 'snake-grant' }),
        ) as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.exchangeToken('public-token-1');

      expect(result).toEqual({ accessToken: 'snake-access', grantId: 'snake-grant' });
    });

    it('throws if the response is missing grantId', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, { accessToken: 'real-access' })) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.exchangeToken('public-token-1')).rejects.toThrow(
        'Cas ID /grant/exchange response is missing grantId',
      );
    });

    it('throws CasIdUnauthorizedError on a 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.exchangeToken('public-token-1')).rejects.toThrow(
        'Cas ID access token rejected',
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: FAIL — `exchangeToken` currently throws `'not implemented yet — see Task 7'`.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`, replace the stub:

```ts
  async exchangeToken(
    publicToken: string,
  ): Promise<{ accessToken: string; grantId: string }> {
    const data = await this.request<Record<string, unknown>>(
      '/grant/exchange',
      { method: 'POST', body: JSON.stringify({ publicToken }) },
    );
    const accessToken = data.accessToken ?? data.access_token;
    const grantId = data.grantId ?? data.grant_id;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Cas ID /grant/exchange response is missing accessToken');
    }
    if (typeof grantId !== 'string' || !grantId) {
      throw new Error('Cas ID /grant/exchange response is missing grantId');
    }
    return { accessToken, grantId };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts
git commit -m "feat: add CasIdAdapter.exchangeToken"
```

---

## Task 8: `CasIdAdapter` — `getAccountIdentity`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`

**Interfaces:**
- Produces: `CasIdAdapter.getAccountIdentity(accessToken: string): Promise<AccountIdentity>` — completes `ICasIdIntegrationAdapter`.

- [ ] **Step 1: Write the failing test**

Append to `cas-id.adapter.spec.ts`:

```ts
  describe('getAccountIdentity', () => {
    it('fetches identity with the access token as the raw Authorization header value', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { accountNumber: '867623232', bankName: 'VietinBank' }),
        );
      global.fetch = fetchMock as never;
      const adapter = new CasIdAdapter();

      const result = await adapter.getAccountIdentity('access-token-1');

      expect(result).toEqual(
        expect.objectContaining({ accountNumber: '867623232', bankName: 'VietinBank' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://sandbox.bankhub.dev/identity',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'access-token-1' }),
        }),
      );
    });

    it('throws if accountNumber or bankName is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, { bankName: 'VietinBank' })) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.getAccountIdentity('access-token-1')).rejects.toThrow(
        'Cas ID /identity response is missing accountNumber',
      );
    });

    it('throws CasIdUnauthorizedError on a 403', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(403, {})) as never;
      const adapter = new CasIdAdapter();

      await expect(adapter.getAccountIdentity('access-token-1')).rejects.toThrow(
        'Cas ID access token rejected',
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: FAIL — `getAccountIdentity` currently throws `'not implemented yet — see Task 8'`.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`, replace the stub:

```ts
  async getAccountIdentity(accessToken: string): Promise<AccountIdentity> {
    const data = await this.request<Record<string, unknown>>(
      '/identity',
      { method: 'GET' },
      accessToken,
    );
    const accountNumber = data.accountNumber ?? data.account_number;
    const bankName = data.bankName ?? data.bank_name;
    if (typeof accountNumber !== 'string' || !accountNumber) {
      throw new Error('Cas ID /identity response is missing accountNumber');
    }
    if (typeof bankName !== 'string' || !bankName) {
      throw new Error('Cas ID /identity response is missing bankName');
    }
    return { ...data, accountNumber, bankName };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns cas-id.adapter.spec.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Full unit suite + type-check + biome**

Run: `cd apps/backend && npx jest && npx tsc --noEmit && npx biome check --write src/modules/bank-connections/infrastructure/cas-id.adapter.ts src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts`
Expected: full suite PASS, no type errors anywhere in `bank-connections/` module, biome clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.spec.ts
git commit -m "feat: add CasIdAdapter.getAccountIdentity, completing the real adapter"
```

---

## Task 9: DI factory — pick `CasIdAdapter` over `MockCasIdAdapter` when configured

**Files:**
- Create: `apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

**Interfaces:**
- Consumes: `CasIdAdapter` (Task 8), `MockCasIdAdapter`.
- Produces: `selectCasIdAdapter(env?: NodeJS.ProcessEnv): ICasIdIntegrationAdapter`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.spec.ts`:

```ts
import { CasIdAdapter } from './cas-id.adapter';
import { MockCasIdAdapter } from './mock-cas-id.adapter';
import { selectCasIdAdapter } from './select-cas-id-adapter';

describe('selectCasIdAdapter', () => {
  it('returns CasIdAdapter when both credentials are set', () => {
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_ID: 'client',
      CAS_ID_CLIENT_SECRET: 'secret',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(CasIdAdapter);
  });

  it('returns MockCasIdAdapter when neither credential is set', () => {
    const adapter = selectCasIdAdapter({} as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
  });

  it('falls back to MockCasIdAdapter and warns when only CAS_ID_CLIENT_ID is set', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_ID: 'client',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('falls back to MockCasIdAdapter and warns when only CAS_ID_CLIENT_SECRET is set', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = selectCasIdAdapter({
      CAS_ID_CLIENT_SECRET: 'secret',
    } as NodeJS.ProcessEnv);
    expect(adapter).toBeInstanceOf(MockCasIdAdapter);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns select-cas-id-adapter.spec.ts`
Expected: FAIL — cannot find module `./select-cas-id-adapter`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.ts`:

```ts
import { Logger } from '@nestjs/common';
import type { ICasIdIntegrationAdapter } from '../application/cas-id-integration-adapter.port';
import { CasIdAdapter } from './cas-id.adapter';
import { MockCasIdAdapter } from './mock-cas-id.adapter';

const logger = new Logger('CasIdAdapterFactory');

export function selectCasIdAdapter(
  env: NodeJS.ProcessEnv = process.env,
): ICasIdIntegrationAdapter {
  const hasClientId = Boolean(env.CAS_ID_CLIENT_ID);
  const hasSecretKey = Boolean(env.CAS_ID_CLIENT_SECRET);
  if (hasClientId && hasSecretKey) {
    return new CasIdAdapter();
  }
  if (hasClientId !== hasSecretKey) {
    logger.warn(
      'Cas ID credentials incomplete (CAS_ID_CLIENT_ID/CAS_ID_CLIENT_SECRET) — using MockCasIdAdapter',
    );
  }
  return new MockCasIdAdapter();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns select-cas-id-adapter.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the factory into the module**

Edit `apps/backend/src/modules/bank-connections/bank-connections.module.ts`. Find the import of `MockCasIdAdapter` and the provider entry `{ provide: CAS_ID_INTEGRATION_ADAPTER, useClass: MockCasIdAdapter }`. Change the import to also bring in the factory:

```ts
import { selectCasIdAdapter } from './infrastructure/select-cas-id-adapter';
```

(remove the now-unused `MockCasIdAdapter` import if nothing else in this file references it directly — check with a search first: `grep -n "MockCasIdAdapter" apps/backend/src/modules/bank-connections/bank-connections.module.ts`).

Change the provider entry to:

```ts
    {
      provide: CAS_ID_INTEGRATION_ADAPTER,
      useFactory: () => selectCasIdAdapter(),
    },
```

- [ ] **Step 6: Run the bank-connections module's full test suite + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns bank-connections && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.ts apps/backend/src/modules/bank-connections/infrastructure/select-cas-id-adapter.spec.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: wire CasIdAdapter into DI, falling back to Mock without credentials"
```

---

## Task 10: `.env.example` — add Cas ID adapter + webhook allowlist vars, remove the wrong webhook auth vars

**Files:**
- Modify: `apps/backend/.env.example`

This is a configuration-only change (AGENTS.md TDD exception) — no test required.

- [ ] **Step 1: Edit `.env.example`**

Find this block:

```
ACCESS_TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
# Cas Link popup flow: base callback URL (session id is appended as ?sessionId=)
# and the hosted Cas Link page the popup opens.
CAS_ID_REDIRECT_BASE_URL=http://localhost:5173/bank-connections/cas-id/callback
CAS_ID_LINK_BASE_URL=https://dev.link.bankhub.dev
SMTP_HOST_ALLOWLIST=
```

Replace it with:

```
ACCESS_TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
# Cas Link popup flow: base callback URL (session id is appended as ?sessionId=)
# and the hosted Cas Link page the popup opens.
CAS_ID_REDIRECT_BASE_URL=http://localhost:5173/bank-connections/cas-id/callback
CAS_ID_LINK_BASE_URL=https://dev.link.bankhub.dev
# Real Cas ID API (leave both blank to use MockCasIdAdapter instead).
CAS_ID_CLIENT_ID=
CAS_ID_CLIENT_SECRET=
CAS_ID_BASE_URL=https://sandbox.bankhub.dev
# Balance Hook inbound webhook: fail-closed source-IP allowlist (Cas ID has
# no signature header — see docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §3.1).
# Sandbox IP only — add the real production IP(s) once confirmed, or every
# production webhook call will be rejected.
CAS_ID_WEBHOOK_IP_ALLOWLIST=20.2.69.168
SMTP_HOST_ALLOWLIST=
```

Find and delete this line entirely (the wrong webhook auth scheme, replaced by `CAS_ID_WEBHOOK_IP_ALLOWLIST` above):

```
CASSO_WEBHOOK_CLIENT_ID=dev-client-id
CASSO_WEBHOOK_SECRET_KEY=change-me
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/.env.example
git commit -m "chore: document real Cas ID adapter and webhook IP allowlist env vars"
```

---

## Task 11: IP allowlist utility (`common/webhook/ip-allowlist.ts`)

**Files:**
- Create: `apps/backend/src/common/webhook/ip-allowlist.ts`
- Create: `apps/backend/src/common/webhook/ip-allowlist.spec.ts`

**Interfaces:**
- Produces: `parseIpAllowlist(value: string | undefined): string[]`, `isIpAllowed(ip: string, allowlist: readonly string[]): boolean` — Task 12 (`WebhookAuthGuard`) imports both.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/webhook/ip-allowlist.spec.ts`:

```ts
import { isIpAllowed, parseIpAllowlist } from './ip-allowlist';

describe('parseIpAllowlist', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseIpAllowlist(' 20.2.69.168 , 127.0.0.1')).toEqual([
      '20.2.69.168',
      '127.0.0.1',
    ]);
  });

  it('returns an empty array for undefined or empty input', () => {
    expect(parseIpAllowlist(undefined)).toEqual([]);
    expect(parseIpAllowlist('')).toEqual([]);
  });
});

describe('isIpAllowed', () => {
  it('allows an exact match', () => {
    expect(isIpAllowed('20.2.69.168', ['20.2.69.168'])).toBe(true);
  });

  it('rejects an IP not in the allowlist', () => {
    expect(isIpAllowed('1.2.3.4', ['20.2.69.168'])).toBe(false);
  });

  it('fails closed when the allowlist is empty', () => {
    expect(isIpAllowed('20.2.69.168', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns ip-allowlist.spec.ts`
Expected: FAIL — cannot find module `./ip-allowlist`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/common/webhook/ip-allowlist.ts`:

```ts
// Fail-closed source-IP allowlist for inbound webhooks. Cas ID's Balance
// Hook identifies itself by source IP only, no signature header — see
// docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §3.1.
// Exact match only, no CIDR ranges: Cas ID publishes a small fixed set of
// IPs, not ranges.
export function parseIpAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export function isIpAllowed(
  ip: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(ip);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns ip-allowlist.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/webhook/ip-allowlist.ts apps/backend/src/common/webhook/ip-allowlist.spec.ts
git commit -m "feat: add fail-closed source-IP allowlist utility for webhooks"
```

---

## Task 12: Rewrite `WebhookAuthGuard` to the real IP-allowlist scheme

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhook-rate-limit.guard.ts`

**Interfaces:**
- Consumes: `isIpAllowed`, `parseIpAllowlist` (Task 11).

- [ ] **Step 1: Write the failing test**

Replace the full contents of `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts`:

```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';

function fakeContext(ip: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookAuthGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('passes when the request IP is in the allowlist', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(guard.canActivate(fakeContext('20.2.69.168'))).toBe(true);
  });

  it('rejects when the request IP is not in the allowlist', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext('1.2.3.4'))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when the allowlist env var is unset', () => {
    delete process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST;
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext('20.2.69.168'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the request has no IP', () => {
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '20.2.69.168';
    const guard = new WebhookAuthGuard();
    expect(() => guard.canActivate(fakeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns webhook-auth.guard.spec.ts`
Expected: FAIL — the current guard reads `headers['x-client-id']`/`headers['x-secret-key']`, not `.ip`, so `fakeContext`'s shape doesn't match what it expects and every assertion fails.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  isIpAllowed,
  parseIpAllowlist,
} from '../../../common/webhook/ip-allowlist';

// Cas ID's Balance Hook has no signature header — it identifies itself by
// source IP only. See
// docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §3.1.
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const allowlist = parseIpAllowlist(process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST);
    if (!request.ip || !isIpAllowed(request.ip, allowlist)) {
      throw new UnauthorizedException('Webhook source IP not allowed');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns webhook-auth.guard.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Remove the now-dead `x-client-id` branch from `WebhookRateLimitGuard`**

Edit `apps/backend/src/modules/webhooks/presentation/webhook-rate-limit.guard.ts` — Balance Hook never sends `x-client-id` (confirmed in the spec's §3.1 housekeeping note), so this branch is unreachable dead code for this call site. Replace the file's full contents:

```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class WebhookRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return `webhook:${ip}`;
  }
}
```

- [ ] **Step 6: Run the full webhooks module unit suite + type-check**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks && npx tsc --noEmit`
Expected: PASS. (`webhooks.controller.spec.ts` and `receive-webhook.usecase.spec.ts` still reference the old flat payload shape at this point — they'll fail here and get fixed in Tasks 14/15; if this step shows failures ONLY in those two files' pre-existing assertions about `bankConnectionId`, that's expected and not a regression from this task — confirm no other webhooks-module test broke.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.spec.ts apps/backend/src/modules/webhooks/presentation/webhook-rate-limit.guard.ts
git commit -m "fix: rewrite WebhookAuthGuard to the real Balance Hook IP-allowlist scheme"
```

---

## Task 13: Rewrite `BalanceHookDto` to the real nested payload shape

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts`
- Create: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts`

**Interfaces:**
- Produces: `BalanceHookDto { grantId: string; transaction: BalanceHookTransactionDto }`, `BalanceHookTransactionDto { id: string; amount: number; transactionDateTime: string; description?: string | null; counterAccountNumber?: string | number | null; counterAccountName?: string | null }` — Task 14 (normalizer) and Task 16 (controller) both depend on these exact field names.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceHookDto } from './balance-hook.dto';

const validPayload = {
  environment: 'dev',
  webhookType: 'TRANSACTIONS',
  webhookCode: 'DEFAULT_UPDATE',
  error: null,
  grantId: '4c657924-13f3-11ee-a4bb-42010a40001b',
  transaction: {
    id: '3cacecf6935011ee952542010a400022',
    transactionCode: '993UNdEHhIgfy3I',
    reference: null,
    transactionDate: '2023-12-05',
    transactionDateTime: '2023-12-05T16:25:00+07:00',
    bookingDate: '2023-12-05',
    amount: 10000,
    description: 'test',
    runningBalance: 3330000,
    accountNumber: 867623232,
    virtualAccountNumber: null,
    virtualAccountName: null,
    paymentChannel: null,
    counterAccountNumber: null,
    counterAccountName: null,
    counterAccountBankId: null,
    counterAccountBankName: null,
    paymentMeta: null,
    fiId: '3c26a8ed-efb5-11ed-8620-0ae7e48c82d8',
    fiName: 'VietinBank',
    fiServiceId: '433f71c4-efb5-11ed-8620-0ae7e48c82d8',
    fiServiceName: 'VietinBank iPay - Official API',
    currency: 'VND',
  },
};

describe('BalanceHookDto', () => {
  it('accepts the real Balance Hook payload verbatim, including nullable counterparty fields', async () => {
    const dto = plainToInstance(BalanceHookDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.transaction.counterAccountNumber).toBeNull();
    expect(dto.transaction.counterAccountName).toBeNull();
  });

  it('accepts a populated counterAccountNumber even as a raw JSON number', async () => {
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      transaction: { ...validPayload.transaction, counterAccountNumber: 1234567 },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a payload missing grantId', async () => {
    const { grantId, ...withoutGrantId } = validPayload;
    const dto = plainToInstance(BalanceHookDto, withoutGrantId);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'grantId')).toBe(true);
  });

  it('rejects a payload missing transaction.id', async () => {
    const { id, ...transactionWithoutId } = validPayload.transaction;
    const dto = plainToInstance(BalanceHookDto, {
      ...validPayload,
      transaction: transactionWithoutId,
    });
    const errors = await validate(dto, { validationError: { target: false } });
    const transactionErrors = errors.find((e) => e.property === 'transaction');
    expect(transactionErrors?.children?.some((c) => c.property === 'id')).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns balance-hook.dto.spec.ts`
Expected: FAIL — the current flat `BalanceHookDto` has no `transaction` property, so `dto.transaction.counterAccountNumber` throws, and the "missing grantId" test finds no such property to fail on.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BalanceHookTransactionDto {
  @IsString() @IsNotEmpty() id: string;
  @IsInt() amount: number;
  @IsISO8601() transactionDateTime: string;
  @IsOptional() description?: string | null;
  @IsOptional() counterAccountNumber?: string | number | null;
  @IsOptional() counterAccountName?: string | null;
}

export class BalanceHookDto {
  @IsString() @IsNotEmpty() grantId: string;

  @ValidateNested()
  @Type(() => BalanceHookTransactionDto)
  transaction: BalanceHookTransactionDto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns balance-hook.dto.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts
git commit -m "fix: rewrite BalanceHookDto to the real nested Balance Hook payload shape"
```

---

## Task 14: Rewrite `transaction-normalizer.ts` for the nested shape

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`
- Modify: `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`

**Interfaces:**
- Produces: `normalizeBalanceHookPayload(payload: Record<string, unknown>): NormalizedTransaction` — same output shape as before (`NormalizedTransaction` is unchanged), only the input it reads from changes.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts`:

```ts
import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps the real nested Balance Hook payload into an internal transaction', () => {
    expect(
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-001',
          amount: 30_000_000,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
          counterAccountNumber: '0011002233',
          counterAccountName: 'CONG TY B',
          description: 'TT HD INV-2026-0012',
        },
      }),
    ).toEqual({
      providerTransactionId: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01T10:00:00.000Z'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    });
  });

  it('maps null counterparty fields to empty strings instead of throwing', () => {
    expect(
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-002',
          amount: 10_000,
          transactionDateTime: '2023-12-05T16:25:00+07:00',
          counterAccountNumber: null,
          counterAccountName: null,
          description: null,
        },
      }),
    ).toEqual({
      providerTransactionId: 'TX-002',
      amount: 10_000,
      transactionDateTime: new Date('2023-12-05T16:25:00+07:00'),
      counterpartyAccountNumber: '',
      counterpartyName: '',
      transferContent: '',
    });
  });

  it('coerces a numeric counterAccountNumber to a string', () => {
    const result = normalizeBalanceHookPayload({
      grantId: 'grant-1',
      transaction: {
        id: 'TX-003',
        amount: 1_000,
        transactionDateTime: '2026-08-01T10:00:00.000Z',
        counterAccountNumber: 1234567,
        counterAccountName: 'A',
        description: 'x',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('1234567');
  });

  it('throws when transaction.id is missing', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          amount: 1_000,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
        },
      }),
    ).toThrow('Webhook field transaction.id is invalid');
  });

  it('throws when transaction.amount is not an integer', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-004',
          amount: 10.5,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
        },
      }),
    ).toThrow('Webhook field transaction.amount must be an integer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns transaction-normalizer.spec.ts`
Expected: FAIL — the current implementation reads flat `payload.transactionId`/`payload.counterpartyAccountNumber` etc., which don't exist in this nested input, so every field-presence check throws `VALIDATION_ERROR` immediately.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/backend/src/modules/webhooks/application/transaction-normalizer.ts`:

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

interface BalanceHookTransactionPayload {
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

export function normalizeBalanceHookPayload(
  payload: Record<string, unknown>,
): NormalizedTransaction {
  const transaction = (payload.transaction ?? {}) as BalanceHookTransactionPayload;

  const id = transaction.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.id is invalid',
    );
  }

  const amount = transaction.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.amount must be an integer',
    );
  }

  const transactionDateTimeRaw = transaction.transactionDateTime;
  if (typeof transactionDateTimeRaw !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.transactionDateTime is invalid',
    );
  }
  const transactionDateTime = new Date(transactionDateTimeRaw);
  if (Number.isNaN(transactionDateTime.getTime())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Webhook field transaction.transactionDateTime is invalid',
    );
  }

  return {
    providerTransactionId: id,
    amount,
    transactionDateTime,
    counterpartyAccountNumber: toStringOrEmpty(transaction.counterAccountNumber),
    counterpartyName: toStringOrEmpty(transaction.counterAccountName),
    transferContent: toStringOrEmpty(transaction.description),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns transaction-normalizer.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/transaction-normalizer.ts apps/backend/src/modules/webhooks/application/transaction-normalizer.spec.ts
git commit -m "fix: read transaction-normalizer from the real nested Balance Hook shape"
```

---

## Task 15: `ReceiveWebhookUseCase` — resolve by `grantId` instead of `bankConnectionId`

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankConnectionRepository.findByGrantId` (Task 4).
- Produces: `ReceiveWebhookInput { grantId: string; organizationId?: string; transactionId: string; rawPayload: Record<string, unknown> }` — Task 16 (controller) constructs this.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`:

```ts
import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const input = {
  grantId: 'grant-1',
  transactionId: 'TX-1',
  rawPayload: {
    grantId: 'grant-1',
    transaction: { id: 'TX-1', amount: 1_000 },
  },
};

describe('ReceiveWebhookUseCase', () => {
  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const inboxRepo = {
      insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
    };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => true,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(connectionRepo.findByGrantId).toHaveBeenCalledWith('grant-1');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('returns received: true, ignored: true when no connection matches the grantId', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = { findByGrantId: jest.fn().mockResolvedValue(null) };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(inboxRepo.insert).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a tenant-mismatched organizationId even when the connection is inactive', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => false,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({ ...input, organizationId: 'other-org' }),
    ).rejects.toMatchObject({ errorCode: 'TENANT_MISMATCH' });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(inboxRepo.insert).not.toHaveBeenCalled();
  });

  it('still returns ignored for an inactive connection when the tenant matches', async () => {
    const inboxRepo = { insert: jest.fn() };
    const connectionRepo = {
      findByGrantId: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => false,
      }),
    };
    const queue = { enqueue: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({ ...input, organizationId: 'org-1' }),
    ).resolves.toEqual({ received: true, ignored: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns receive-webhook.usecase.spec.ts`
Expected: FAIL — the use case still calls `bankConnectionRepo.findByIdUnscoped(input.bankConnectionId)`, so `connectionRepo.findByGrantId` (the mock these tests configure) is never called and every assertion on it fails; `input.bankConnectionId` is also `undefined` now that the test fixture uses `grantId` instead.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`:

```ts
export interface ReceiveWebhookInput {
  grantId: string;
  organizationId?: string;
  transactionId: string;
  rawPayload: Record<string, unknown>;
}
```

and in `execute()`:

```ts
  async execute(input: ReceiveWebhookInput): Promise<ReceiveWebhookResult> {
    const connection = await this.bankConnectionRepo.findByGrantId(
      input.grantId,
    );
    if (
      connection &&
      input.organizationId &&
      input.organizationId !== connection.organizationId
    ) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Webhook organization does not match bank connection',
      );
    }
    if (!connection?.isUsable()) return { received: true, ignored: true };
```

(everything below this point in the method — constructing `WebhookInbox`, the transaction insert, duplicate handling, enqueue — is unchanged, since it already reads `connection.organizationId`/`connection.id`, not `input.bankConnectionId`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns receive-webhook.usecase.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts
git commit -m "fix: resolve ReceiveWebhookUseCase's connection by grantId, not bankConnectionId"
```

---

## Task 16: `WebhooksController` — wire the new DTO/use-case shape, fix the Swagger doc comment

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts`

**Interfaces:**
- Consumes: `BalanceHookDto` (Task 13), `ReceiveWebhookInput` (Task 15).

- [ ] **Step 1: Write the failing test**

Replace the full contents of `apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts`:

```ts
import { WebhooksController } from './webhooks.controller';

const payload = {
  grantId: 'grant-1',
  transaction: {
    id: 'TX-1',
    amount: 1_000,
    transactionDateTime: '2026-08-01T00:00:00.000Z',
    description: 'Payment',
    counterAccountNumber: '1234',
    counterAccountName: 'Payer',
  },
};

describe('WebhooksController', () => {
  it('delegates to ReceiveWebhookUseCase with grantId and transaction.id', async () => {
    const receiveWebhook = {
      execute: jest
        .fn()
        .mockResolvedValue({ received: true, duplicate: false }),
    };
    const controller = new WebhooksController(receiveWebhook as any);

    await expect(controller.receiveBalanceHook(payload as any)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(receiveWebhook.execute).toHaveBeenCalledWith({
      grantId: 'grant-1',
      transactionId: 'TX-1',
      rawPayload: payload,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks.controller.spec.ts`
Expected: FAIL — the controller still calls `execute` with `{ bankConnectionId: payload.bankConnectionId, organizationId, transactionId: payload.transactionId, rawPayload }`, none of which match the new payload shape or the expected call.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`:

```ts
  @Post('casso-balance-hook')
  @Public()
  @ApiOperation({
    summary: 'Receive a Cas ID Balance Hook notification',
    description:
      'Authenticated by source-IP allowlist (Cas ID sends no signature header); returns received/duplicate/ignored status',
  })
```

(only the `@ApiOperation` description text changes here — the wrong "Signed by Casso (X-Casso-Signature header)" claim is replaced).

```ts
  async receiveBalanceHook(@Body() payload: BalanceHookDto) {
    return this.receiveWebhook.execute({
      grantId: payload.grantId,
      transactionId: payload.transaction.id,
      rawPayload: Object.fromEntries(Object.entries(payload)),
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Full webhooks module suite + type-check + biome**

Run: `cd apps/backend && npx jest --testPathPatterns webhooks && npx tsc --noEmit && npx biome check --write src/modules/webhooks src/common/webhook`
Expected: PASS, no type errors, biome clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts
git commit -m "fix: wire WebhooksController to the real BalanceHookDto/grantId shape"
```

---

## Task 17: Fix `webhook-matching.e2e-spec.ts` for the real auth + payload shape

**Files:**
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–16 (this is an integration test exercising the whole stack against real Postgres/Redis via testcontainers).

- [ ] **Step 1: Rewrite the test's setup and payload**

Edit `apps/backend/test/webhook-matching.e2e-spec.ts`. Remove the `process.env.CASSO_WEBHOOK_CLIENT_ID`/`process.env.CASSO_WEBHOOK_SECRET_KEY` lines from `beforeAll` and replace with:

```ts
    // Loopback addresses supertest's in-process client connects from —
    // covers both IPv4 and IPv6 representations Node/Express may report as
    // req.ip depending on environment. Not a real-world Cas ID IP; this is
    // test-only, matching the real fail-closed allowlist mechanism being
    // exercised (WebhookAuthGuard), not the real sandbox IP.
    process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '127.0.0.1,::1,::ffff:127.0.0.1';
```

Change the `bankConnectionId` seed constant's block to also include a `grantId` (the seed at `dataSource.getRepository(BankConnectionOrmEntity).save({...})` around line 98) — it already got `grantId` added in Task 3 Step 6, confirm it's there; if not, add it now:

```ts
    await dataSource.getRepository(BankConnectionOrmEntity).save({
      id: bankConnectionId,
      organizationId,
      casIdConnectionSessionId: '00000000-0000-0000-0000-0000000000f3',
      grantId: '00000000-0000-0000-0000-0000000000f4',
      encryptedAccessToken: 'encrypted-test-token',
      accountIdentity: { accountNumber: '99887766', bankName: 'Test Bank' },
      status: 'ACTIVE',
      scopes: ['balances'],
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    });
```

Replace the flat `payload` constant with the real nested shape, keyed by the seeded `grantId`:

```ts
  const grantId = '00000000-0000-0000-0000-0000000000f4';
  const payload = {
    grantId,
    transaction: {
      id: firstTransactionId,
      amount: 30_000_000,
      transactionDateTime: '2026-08-05T10:00:00.000Z',
      description: 'chuyen tien',
      counterAccountNumber: '0011002233',
      counterAccountName: 'Unknown Payer',
    },
  };
```

(remove the old `organizationId`/`bankConnectionId`/`counterpartyAccountNumber`/`counterpartyName`/`transferContent` keys from this object entirely — they don't exist in the real payload).

- [ ] **Step 2: Replace every request's auth headers**

There are 2 `request(app.getHttpServer()).post(endpoint)...set(auth)` call sites in this file (one in `'accepts the hook and deduplicates the provider transaction'`, one in `'processes a high-confidence match through the queue'`). In both, remove the `.set(auth)` / `.set({ 'x-client-id': ..., 'x-secret-key': ... })` call entirely — `WebhookAuthGuard` no longer checks headers, only `req.ip`, which supertest's loopback connection already satisfies via the allowlist set in Step 1. Also remove the now-unused `const auth = { 'x-client-id': ..., 'x-secret-key': ... };` line.

For the second test (`'processes a high-confidence match through the queue'`), its request body currently spreads `{ ...payload, transactionId: matchingTransactionId, counterpartyName: 'Company B', transferContent: 'Thanh toan INV-2026-0012' }` — replace with:

```ts
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .send({
        grantId,
        transaction: {
          id: matchingTransactionId,
          amount: 30_000_000,
          transactionDateTime: '2026-08-05T10:00:00.000Z',
          description: 'Thanh toan INV-2026-0012',
          counterAccountNumber: '0011002233',
          counterAccountName: 'Company B',
        },
      })
      .expect(200, { received: true, duplicate: false });
```

- [ ] **Step 3: Run the e2e suite**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns webhook-matching`
Expected: PASS, all 3 tests (needs Docker for testcontainers).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/webhook-matching.e2e-spec.ts
git commit -m "fix: update webhook-matching e2e test for real Balance Hook auth and payload"
```

---

## Task 18: New round-trip e2e test — initiate → exchange → grantId persisted → Balance Hook → `BankTransaction`

**Files:**
- Modify: `apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–17. Runs against `MockCasIdAdapter` (no `CAS_ID_CLIENT_ID`/`CAS_ID_CLIENT_SECRET` set in this e2e's env, same as every other e2e in this repo) — deterministic, no real network calls, no new CI secrets. This is the test that proves the `grantId`-based webhook resolution gap (spec §3.3) is actually closed, per the spec's Testing section decision.

- [ ] **Step 1: Add the round-trip test**

Edit `apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts`. Add these imports at the top, alongside the existing ones:

```ts
import { WebhookInboxOrmEntity } from '../src/modules/webhooks/infrastructure/webhook-inbox.orm-entity';
import { BankTransactionOrmEntity } from '../src/modules/webhooks/infrastructure/bank-transaction.orm-entity';
```

Add `process.env.CAS_ID_WEBHOOK_IP_ALLOWLIST = '127.0.0.1,::1,::ffff:127.0.0.1';` to `beforeAll`, next to the other `process.env` assignments (same reasoning as Task 17 Step 1 — loopback addresses supertest connects from).

Add a new `it(...)` block at the end of the `describe` block (right before the final closing `});`), after the existing `'connects, exchanges the token, and disconnects a bank connection end to end'` test:

```ts
  it('resolves an inbound Balance Hook to the right connection via grantId', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000201';
    const userId = '00000000-0000-4000-8000-000000000202';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Balance Hook Test User',
      email: 'balance-hook-test@example.com',
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
      .post('/api/v1/bank-connections/cas-id/initiate')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'balance-hook-flow-initiate')
      .send({})
      .expect(201);
    const sessionId = initiateRes.body.sessionId;

    const exchangeRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/cas-id/sessions/${sessionId}/exchange`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'balance-hook-flow-exchange')
      .send({ publicToken: 'mock-public-token' })
      .expect(201);
    const connectionId = exchangeRes.body.connectionId;

    const connectionRow = await dataSource.query(
      'SELECT "grantId" FROM bank_connections WHERE id = $1',
      [connectionId],
    );
    const grantId: string = connectionRow[0].grantId;
    expect(grantId).toBeDefined();

    const transactionId = `balance-hook-tx-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .send({
        grantId,
        transaction: {
          id: transactionId,
          amount: 5_000_000,
          transactionDateTime: '2026-08-19T10:00:00.000Z',
          description: 'test balance hook transaction',
          counterAccountNumber: '1112223334',
          counterAccountName: 'Round Trip Payer',
        },
      })
      .expect(200, { received: true, duplicate: false });

    const inboxRepo = dataSource.getRepository(WebhookInboxOrmEntity);
    const transactionRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline = Date.now() + 10_000;
    let inboxCount = 0;
    let transaction: BankTransactionOrmEntity | null = null;
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
```

Add `import { randomUUID } from 'node:crypto';` at the top if it isn't already imported in this file (check first — `randomUUID` may already be imported for other uses in this file; if it is, don't duplicate the import).

- [ ] **Step 2: Run the e2e suite**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPatterns cas-id-bank-connection-flow`
Expected: PASS, both tests (the pre-existing one and this new one) — needs Docker for testcontainers.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/cas-id-bank-connection-flow.e2e-spec.ts
git commit -m "test: add round-trip e2e — initiate to exchange to grantId-resolved Balance Hook"
```

---

## Task 19: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend unit suite**

Run: `cd apps/backend && npx jest`
Expected: all suites PASS (this repo was at 304 suites / 1152 tests before this plan; expect that count to grow by roughly the number of new spec files added in Tasks 3, 6, 9, 11, 13 plus the modified-test-count deltas in every other task).

- [ ] **Step 2: Full backend e2e suite**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json`
Expected: all suites PASS, including `cas-id-bank-connection-flow.e2e-spec.ts`, `webhook-matching.e2e-spec.ts`, and every other e2e file that references `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` in its setup boilerplate (per the spec's §3.1 housekeeping note, those lines are harmless unused env vars now — confirm none of them actually fail).

- [ ] **Step 3: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Arch-check**

Run: `cd apps/backend && npm run arch-check`
Expected: passes (dependency-cruiser boundaries, application-layer exception check, cross-module infrastructure check, controller docs check — `WebhooksController`'s `@ApiOperation` was touched in Task 16, confirm it still has `@ApiTags`/`@ApiOperation` correctly placed).

- [ ] **Step 5: Domain-check skill**

Run the `domain-check` skill (see AGENTS.md "Verification before completion") and fix any violations it reports before proceeding.

- [ ] **Step 6: Biome across every touched file**

Run: `cd apps/backend && npx biome check --write src/modules/bank-connections src/modules/webhooks src/common/webhook src/database/migrations test/cas-id-bank-connection-flow.e2e-spec.ts test/webhook-matching.e2e-spec.ts test/collection-activity-timeline.integration.spec.ts test/receivable-balance-history-audit.e2e-spec.ts .env.example`
Expected: clean, no errors.

- [ ] **Step 7: Push and open a PR — do NOT merge**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: real Cas ID adapter + fix Balance Hook webhook to match the real product" --body "$(cat <<'EOF'
## Summary
- Replace MockCasIdAdapter with a real adapter (grant/token, grant/exchange, identity) against Cas ID's sandbox API, selected via a DI factory only when CAS_ID_CLIENT_ID/CAS_ID_CLIENT_SECRET are configured (falls back to Mock otherwise).
- Fix the Balance Hook webhook receiver, which previously matched neither Cas ID's real auth scheme (IP allowlist, not a signature header) nor its real payload shape (nested under `transaction`, keyed by `grantId`).
- Thread `grantId` through BankConnection (new migration) so Balance Hook deliveries can resolve to the right connection.

## Deploy follow-up required
`CAS_ID_WEBHOOK_IP_ALLOWLIST` ships with only the confirmed Cas ID sandbox IP (20.2.69.168). The allowlist is fail-closed, so **every production Balance Hook call will be rejected until the real production IP(s) are added to this env var on the deployed environment.**

## Test plan
- [x] Full backend unit suite (`npx jest`)
- [x] Full backend e2e suite (`npx jest --config ./test/jest-e2e.json`), including a new round-trip test: initiate → exchange (persists grantId) → simulated Balance Hook → BankTransaction created
- [x] `npx tsc --noEmit`
- [x] `npm run arch-check`
- [x] `domain-check` skill
- [x] `npx biome check --write`

Spec: docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back to the user and wait for review — do not merge.
