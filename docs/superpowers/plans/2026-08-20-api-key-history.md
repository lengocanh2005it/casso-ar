# API Key History (issue #284) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Owner/Finance Manager see the API Key event history (connected, reconnected, rotated, disconnected, revealed) for a Casso Flow authorization, including who did it and a masked view of the key at each point.

**Architecture:** Extend the existing `ConnectionAuditEvent` write paths (connect/rotate/disconnect/reveal use cases, already in `apps/backend/src/modules/bank-connections`) to also record `actorUserId` and a masked API key snapshot in the flexible `metadata` JSON column — no schema migration. Add one new read-side use case + repository method that aggregates events for every `BankConnection` under a `CassoFlowAuthorization`, exposed via a new paginated `GET` endpoint. Frontend adds a `Dialog`-based history view triggered from the existing connections table, grouped by authorization (matching the table's existing grouping).

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL (jsonb metadata column), React 19, TanStack Query, shadcn/ui Dialog.

**Spec:** GitHub issue https://github.com/lengocanh2005it/casso-ledger/issues/284, refined via a grilling session in this conversation. Key decisions locked in:
- History is shown at the `CassoFlowAuthorization` level (aggregating every `BankConnection` under it), matching how the FE connections table already groups rows.
- Only 5 lifecycle event types are shown: `TOKEN_EXCHANGED`, `RECONNECTED`, `DISCONNECTED`, `API_KEY_ROTATED`, `API_KEY_REVEALED` — internal/error event types (`SESSION_CREATED`, `API_CALL_FAILED*`, `MARKED_*`) are excluded.
- Each event shows a **masked** API key (`••••` + last 4 chars), snapshotted into `metadata` at write time — it cannot be derived later since the key rotates.
- `API_KEY_ROTATED` shows both old and new masked key, and old/new bank name + account holder name.
- Every relevant event records `actorUserId` (who did it) in `metadata`.
- New dedicated endpoint `GET /api/v1/bank-connections/authorizations/:id/audit-events`, permission `BANK_CONNECTION_REVEAL_KEY` (the existing OWNER+FINANCE_MANAGER-only permission — matches the issue's stated audience exactly).
- Frontend uses `Dialog` (not `Sheet` — the app's `sheet.tsx` is hardcoded for the mobile nav menu's a11y title and isn't reusable as a generic drawer).
- Historical events written before this feature ships simply lack the new metadata fields — DTO fields are nullable, no backfill.

## Global Constraints

- Money: N/A (no money fields touched).
- Every write stays inside the existing DB transaction pattern already used by each use case — do not introduce new transactions.
- `organizationId` scoping: unchanged, reuse each use case's existing scoping.
- No `any`, no `as unknown as` casts. No new NPM dependencies.
- Every new/changed endpoint needs `@ApiOperation` + `@ApiOkResponse`/`@ApiCreatedResponse` + `@ApiErrorResponse(...)` (see `AGENTS.md` API Docs rules).
- TDD: RED → GREEN → REFACTOR for every application-layer and infrastructure-layer change below.
- FE: hide the "Lịch sử" button when the user lacks `BANK_CONNECTION_REVEAL_KEY` (never disable).

---

## Task 1: `maskApiKey` utility

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/mask-api-key.ts`
- Test: `apps/backend/src/modules/bank-connections/application/mask-api-key.spec.ts`

**Interfaces:**
- Produces: `maskApiKey(apiKey: string): string` — used by Tasks 3, 4, 6.

- [ ] **Step 1: Write the failing test**

```typescript
import { maskApiKey } from './mask-api-key';

describe('maskApiKey', () => {
  it('keeps the last 4 characters and masks the rest', () => {
    expect(maskApiKey('AK_CS.abcd1234')).toBe('••••1234');
  });

  it('fully masks a key no longer than 4 characters', () => {
    expect(maskApiKey('abc')).toBe('••••');
    expect(maskApiKey('abcd')).toBe('••••');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern mask-api-key -v`
Expected: FAIL — `Cannot find module './mask-api-key'`

- [ ] **Step 3: Write minimal implementation**

```typescript
const VISIBLE_SUFFIX_LENGTH = 4;
const MASK = '••••';

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= VISIBLE_SUFFIX_LENGTH) return MASK;
  return MASK + apiKey.slice(-VISIBLE_SUFFIX_LENGTH);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern mask-api-key -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/mask-api-key.ts apps/backend/src/modules/bank-connections/application/mask-api-key.spec.ts
git commit -m "feat: add maskApiKey utility for API key history"
```

---

## Task 2: `CONNECTION_HISTORY_EVENT_TYPES` domain constant

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`

**Interfaces:**
- Produces: `CONNECTION_HISTORY_EVENT_TYPES: ConnectionAuditEventType[]` — consumed by Task 8's use case.

This is a plain data constant (no branching logic), covered indirectly by Task 8's use case test — no standalone unit test needed (YAGNI).

- [ ] **Step 1: Add the constant**

Append to `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`:

```typescript
// The subset of ConnectionAuditEventType shown in the user-facing "API Key
// history" timeline — excludes internal/error event types (SESSION_CREATED,
// API_CALL_FAILED*, MARKED_*) which are operational signals, not history.
export const CONNECTION_HISTORY_EVENT_TYPES: ConnectionAuditEventType[] = [
  'TOKEN_EXCHANGED',
  'RECONNECTED',
  'DISCONNECTED',
  'API_KEY_ROTATED',
  'API_KEY_REVEALED',
];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts
git commit -m "feat: add CONNECTION_HISTORY_EVENT_TYPES constant"
```

---

## Task 3: Record actor + masked key on connect/reconnect

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts`

**Interfaces:**
- Consumes: `maskApiKey(apiKey: string): string` (Task 1)
- Produces: `ConnectCassoFlowInput` gains required field `userId: string`. `ConnectionAuditEvent.metadata` for `TOKEN_EXCHANGED`/`RECONNECTED` gains `actorUserId: string` and `maskedApiKey: string`.

- [ ] **Step 1: Write the failing test**

Add to `connect-casso-flow.usecase.spec.ts` (inside the existing `describe('ConnectCassoFlowUseCase', ...)` block — check the existing `buildDeps`/`execute` calls in that file already pass an `apiKey` on input; add `userId: 'user-1'` to every `execute(...)` call in the file as part of this step, then add this new test):

```typescript
it('records the actor and a masked API key on the audit event', async () => {
  const deps = buildDeps();
  const useCase = buildUseCase(deps);

  await useCase.execute({
    organizationId: 'org-1',
    apiKey: 'AK_CS.secret1234',
    selectedAccountNumbers: ['111'],
    userId: 'user-1',
  });

  expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'TOKEN_EXCHANGED',
      metadata: expect.objectContaining({
        actorUserId: 'user-1',
        maskedApiKey: '••••1234',
      }),
    }),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern connect-casso-flow.usecase -v`
Expected: FAIL — `userId` missing from input type / `actorUserId`/`maskedApiKey` not in metadata

- [ ] **Step 3: Write minimal implementation**

In `connect-casso-flow.usecase.ts`:

1. Add the import:
```typescript
import { maskApiKey } from './mask-api-key';
```

2. Extend the input interface:
```typescript
export interface ConnectCassoFlowInput {
  organizationId: string;
  apiKey: string;
  selectedAccountNumbers: string[];
  userId: string;
}
```

3. In `execute()`, compute the masked key once and thread it (and `userId`) into `connectOne`:
```typescript
  async execute(input: ConnectCassoFlowInput): Promise<ConnectCassoFlowResult> {
    // External call stays outside any transaction — only the DB writes below are wrapped.
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    const maskedApiKey = maskApiKey(input.apiKey);
    const selected = new Set(input.selectedAccountNumbers);
```
(keep the rest of the method body unchanged down to the `connected.push` loop, then change the call site:)
```typescript
    const connected: ConnectCassoFlowConnectedItem[] = [];
    for (const account of eligible) {
      const connectionId = await this.connectOne(
        input.organizationId,
        account,
        existing.get(account.accountNumber) ?? null,
        authorization.id,
        input.userId,
        maskedApiKey,
      );
```

4. Update `connectOne`'s signature and metadata:
```typescript
  private async connectOne(
    organizationId: string,
    account: CassoFlowBankAccount,
    existingConnection: BankConnection | null,
    cassoFlowAuthorizationId: string,
    userId: string,
    maskedApiKey: string,
  ): Promise<string | null> {
```
and inside, change the audit event save:
```typescript
        await this.auditEventRepo.save(
          new ConnectionAuditEvent({
            id: randomUUID(),
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: existingConnection ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
            metadata: {
              accountNumber: account.accountNumber,
              actorUserId: userId,
              maskedApiKey,
            },
            createdAt: now,
          }),
          manager,
        );
```

5. Add `userId: 'user-1'` to every existing `execute({...})` call in `connect-casso-flow.usecase.spec.ts` (the pre-existing tests will otherwise fail TypeScript compilation once `userId` is required).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern connect-casso-flow.usecase -v`
Expected: PASS (all tests in the file, including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.ts apps/backend/src/modules/bank-connections/application/connect-casso-flow.usecase.spec.ts
git commit -m "feat: record actor and masked API key on connect/reconnect audit events"
```

---

## Task 4: Record actor + old/new masked key + old/new bank details on rotate

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.spec.ts`

**Interfaces:**
- Consumes: `maskApiKey` (Task 1), `decryptToken` (already exists in `./token-encryption.ts`)
- Produces: `RotateCassoFlowAuthorizationInput` gains required `userId: string`. `API_KEY_ROTATED` metadata gains `actorUserId`, `oldMaskedApiKey`, `newMaskedApiKey`, `oldBankName`, `newBankName`, `oldAccountHolderName`, `newAccountHolderName`.

- [ ] **Step 1: Write the failing test**

Add to `rotate-casso-flow-authorization.usecase.spec.ts` (add `userId: 'user-1'` to every existing `execute({...})` call in the file as part of this step, then add):

```typescript
it('records the actor, old/new masked key, and old/new bank details on rotate', async () => {
  const deps = buildDeps();
  const useCase = buildUseCase(deps);

  await useCase.execute({
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    apiKey: 'AK_CS.newkey5678',
    userId: 'user-1',
  });

  expect(deps.auditEventRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'API_KEY_ROTATED',
      metadata: expect.objectContaining({
        actorUserId: 'user-1',
        newMaskedApiKey: '••••5678',
        oldBankName: 'Old Bank',
        newBankName: 'New Bank',
        oldAccountHolderName: 'OLD NAME',
        newAccountHolderName: 'NEW NAME',
      }),
    }),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern rotate-casso-flow-authorization.usecase -v`
Expected: FAIL — `userId` missing from input type / new metadata keys absent

- [ ] **Step 3: Write minimal implementation**

In `rotate-casso-flow-authorization.usecase.ts`:

1. Update the `token-encryption` import to also pull in `decryptToken`, and add the `maskApiKey` import:
```typescript
import { decryptToken, encryptToken } from './token-encryption';
import { maskApiKey } from './mask-api-key';
```

2. Extend the input interface:
```typescript
export interface RotateCassoFlowAuthorizationInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  apiKey: string;
  userId: string;
}
```

3. Inside the `dataSource.transaction` callback, right after `locked` is fetched and validated (before `rotatedAuthorization` is built), compute the masked keys:
```typescript
      this.assertBusinessIdMatches(locked.businessId, businessId);

      const oldMaskedApiKey = maskApiKey(
        decryptToken(locked.encryptedApiKey, this.encryptionKey),
      );
      const newMaskedApiKey = maskApiKey(input.apiKey);

      const rotatedAuthorization = locked.rotate({
```

4. Update the audit event metadata inside the `for (const connection of currentConnections)` loop:
```typescript
        await recordConnectionAuditEvent(
          this.auditEventRepo,
          {
            organizationId: connection.organizationId,
            bankConnectionId: connection.id,
            eventType: 'API_KEY_ROTATED',
            metadata: {
              accountNumber: connection.accountNumber,
              actorUserId: input.userId,
              oldMaskedApiKey,
              newMaskedApiKey,
              oldBankName: connection.bankName,
              newBankName: matched.bankName,
              oldAccountHolderName: connection.accountHolderName,
              newAccountHolderName: matched.accountHolderName,
            },
          },
          manager,
        );
```

5. Add `userId: 'user-1'` to every existing `execute({...})` call in `rotate-casso-flow-authorization.usecase.spec.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern rotate-casso-flow-authorization.usecase -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.ts apps/backend/src/modules/bank-connections/application/rotate-casso-flow-authorization.usecase.spec.ts
git commit -m "feat: record actor, old/new masked key and bank details on rotate audit events"
```

---

## Task 5: Record actor on disconnect

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`

**Interfaces:**
- Produces: `DisconnectConnectionUseCase.execute(connectionId: string, userId: string): Promise<void>` (was `execute(connectionId: string)`). `DISCONNECTED` metadata gains `actorUserId`.

- [ ] **Step 1: Write the failing test**

The existing file defines one `buildUseCase(overrides)` helper (not a separate `buildDeps`) that returns `{ useCase, bankConnectionRepo, authorizationRepo, adapter, auditEventRepo, markRequiresReauthorization, auditContext }`. Change every existing `await useCase.execute('conn-1')` / `useCase.execute('missing')` call in the file to pass `'user-1'` as a second argument (5 call sites), then add:

```typescript
it('records the actor on the DISCONNECTED audit event', async () => {
  const { useCase, auditEventRepo } = buildUseCase({});

  await useCase.execute('conn-1', 'user-1');

  expect(auditEventRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'DISCONNECTED',
      metadata: { actorUserId: 'user-1' },
    }),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern disconnect-connection.usecase -v`
Expected: FAIL — `execute` takes 1 argument, or `actorUserId` missing from metadata

- [ ] **Step 3: Write minimal implementation**

In `disconnect-connection.usecase.ts`, change the method signature and the metadata:

```typescript
  async execute(connectionId: string, userId: string): Promise<void> {
```

and:

```typescript
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: locked.organizationId,
          bankConnectionId: connectionId,
          eventType: 'DISCONNECTED',
          metadata: { actorUserId: userId },
          createdAt: new Date(),
        }),
        manager,
      );
```

Add `'user-1'` as a second argument to every existing `.execute(...)` call in `disconnect-connection.usecase.spec.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern disconnect-connection.usecase -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts
git commit -m "feat: record actor on disconnect audit events"
```

---

## Task 6: Record masked key on reveal

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.spec.ts`

**Interfaces:**
- Consumes: `maskApiKey` (Task 1)
- Produces: `API_KEY_REVEALED` metadata gains `maskedApiKey` alongside the existing `revealedByUserId`.

- [ ] **Step 1: Write the failing test**

The existing file's `buildAuthorization()` helper encrypts `'AK_CS.real-key'` as the stored key (so `maskApiKey('AK_CS.real-key')` is `'••••-key'`). Add to `reveal-casso-flow-api-key.usecase.spec.ts`, inside the `describe('RevealCassoFlowApiKeyUseCase', ...)` block:

```typescript
it('records a masked API key alongside the actor on reveal', async () => {
  const { useCase, auditEventRepo } = await buildDeps({
    userPassword: 'correct',
  });

  await useCase.execute({
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    userId: 'user-1',
    password: 'correct',
  });

  expect(auditEventRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'API_KEY_REVEALED',
      metadata: {
        revealedByUserId: 'user-1',
        maskedApiKey: '••••-key',
      },
    }),
    undefined,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern reveal-casso-flow-api-key.usecase -v`
Expected: FAIL — `maskedApiKey` missing from metadata

- [ ] **Step 3: Write minimal implementation**

In `reveal-casso-flow-api-key.usecase.ts`:

1. Add the import:
```typescript
import { maskApiKey } from './mask-api-key';
```

2. Update the metadata in the `for (const connection of connections)` loop:
```typescript
    for (const connection of connections) {
      await recordConnectionAuditEvent(this.auditEventRepo, {
        organizationId: input.organizationId,
        bankConnectionId: connection.id,
        eventType: 'API_KEY_REVEALED',
        metadata: {
          revealedByUserId: input.userId,
          maskedApiKey: maskApiKey(apiKey),
        },
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern reveal-casso-flow-api-key.usecase -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.spec.ts
git commit -m "feat: record masked API key on reveal audit events"
```

---

## Task 7: `findByBankConnectionIds` on the audit event repository

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/connection-audit-event-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.ts`
- Test: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.spec.ts` (new file)

**Interfaces:**
- Produces: `IConnectionAuditEventRepository.findByBankConnectionIds(bankConnectionIds: string[], eventTypes: ConnectionAuditEventType[], page: number, limit: number): Promise<{ items: ConnectionAuditEvent[]; total: number }>` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.spec.ts`:

```typescript
import { TypeOrmConnectionAuditEventRepository } from './typeorm-connection-audit-event.repository';

describe('TypeOrmConnectionAuditEventRepository', () => {
  describe('findByBankConnectionIds', () => {
    it('returns matching rows newest-first with a total count, paginated', async () => {
      const rows = [
        {
          id: 'evt-2',
          organizationId: 'org-1',
          bankConnectionId: 'conn-1',
          eventType: 'API_KEY_ROTATED',
          metadata: {},
          createdAt: new Date('2026-01-02'),
        },
      ];
      const findAndCount = jest.fn().mockResolvedValue([rows, 5]);
      const ormRepo = { findAndCount } as never;
      const repo = new TypeOrmConnectionAuditEventRepository(
        ormRepo,
        {} as never,
      );

      const result = await repo.findByBankConnectionIds(
        ['conn-1'],
        ['API_KEY_ROTATED', 'DISCONNECTED'],
        2,
        20,
      );

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('evt-2');
      expect(findAndCount).toHaveBeenCalledWith({
        where: {
          bankConnectionId: expect.anything(),
          eventType: expect.anything(),
        },
        order: { createdAt: 'DESC' },
        skip: 20,
        take: 20,
      });
    });

    it('returns an empty page without querying when given no connection ids', async () => {
      const findAndCount = jest.fn();
      const ormRepo = { findAndCount } as never;
      const repo = new TypeOrmConnectionAuditEventRepository(
        ormRepo,
        {} as never,
      );

      const result = await repo.findByBankConnectionIds([], [], 1, 20);

      expect(result).toEqual({ items: [], total: 0 });
      expect(findAndCount).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern typeorm-connection-audit-event.repository -v`
Expected: FAIL — `repo.findByBankConnectionIds is not a function`

- [ ] **Step 3: Write minimal implementation**

Update the port `apps/backend/src/modules/bank-connections/application/connection-audit-event-repository.port.ts`:

```typescript
import type { EntityManager } from 'typeorm';
import type {
  ConnectionAuditEvent,
  ConnectionAuditEventType,
} from '../domain/connection-audit-event';

export interface IConnectionAuditEventRepository {
  save(event: ConnectionAuditEvent, manager?: EntityManager): Promise<void>;
  findByBankConnectionIds(
    bankConnectionIds: string[],
    eventTypes: ConnectionAuditEventType[],
    page: number,
    limit: number,
  ): Promise<{ items: ConnectionAuditEvent[]; total: number }>;
}

export const CONNECTION_AUDIT_EVENT_REPOSITORY = Symbol(
  'CONNECTION_AUDIT_EVENT_REPOSITORY',
);
```

Update `apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, type Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IConnectionAuditEventRepository } from '../application/connection-audit-event-repository.port';
import {
  ConnectionAuditEvent,
  type ConnectionAuditEventType,
} from '../domain/connection-audit-event';
import { ConnectionAuditEventOrmEntity } from './connection-audit-event.orm-entity';

@Injectable()
export class TypeOrmConnectionAuditEventRepository
  extends BaseRepository<ConnectionAuditEventOrmEntity>
  implements IConnectionAuditEventRepository
{
  constructor(
    @InjectRepository(ConnectionAuditEventOrmEntity)
    repo: Repository<ConnectionAuditEventOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  // organizationId always comes from the event itself (already resolved by
  // the caller, which may be a background job with no TenantContextService)
  // rather than from ambient tenant context — see bank-connection-repository.port.ts.
  async save(
    event: ConnectionAuditEvent,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(event, manager, event.organizationId);
  }

  // Unscoped by organizationId on purpose, same reasoning as
  // findByAuthorizationId on the bank connection repository: the caller
  // (ListAuthorizationAuditEventsUseCase) has already verified the
  // authorization — and therefore every bankConnectionId passed in — belongs
  // to the caller's organization.
  async findByBankConnectionIds(
    bankConnectionIds: string[],
    eventTypes: ConnectionAuditEventType[],
    page: number,
    limit: number,
  ): Promise<{ items: ConnectionAuditEvent[]; total: number }> {
    if (bankConnectionIds.length === 0) return { items: [], total: 0 };
    const [rows, total] = await this.ormRepo.findAndCount({
      where: {
        bankConnectionId: In(bankConnectionIds),
        eventType: In(eventTypes),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => new ConnectionAuditEvent(row)),
      total,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern typeorm-connection-audit-event.repository -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/connection-audit-event-repository.port.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.ts apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.spec.ts
git commit -m "feat: add findByBankConnectionIds to connection audit event repository"
```

---

## Task 8: `ListAuthorizationAuditEventsUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowAuthorizationRepository.findById` (existing), `IBankConnectionRepository.findByAuthorizationId` (existing), `IConnectionAuditEventRepository.findByBankConnectionIds` (Task 7), `CONNECTION_HISTORY_EVENT_TYPES` (Task 2)
- Produces: `ListAuthorizationAuditEventsUseCase.execute(input: ListAuthorizationAuditEventsInput): Promise<ListAuthorizationAuditEventsResult>` — consumed by Task 9's controller.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.spec.ts`:

```typescript
import { AppError } from '../../../common/errors/app-error';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { ListAuthorizationAuditEventsUseCase } from './list-authorization-audit-events.usecase';

function buildAuthorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: 'enc-key',
    encryptedSecureToken: 'enc-token',
    createdAt: new Date(),
  });
}

function buildConnection(id: string): BankConnection {
  return new BankConnection({
    id,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '111',
    bankName: 'Bank',
    accountHolderName: 'NAME',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

function buildEvent(id: string): ConnectionAuditEvent {
  return new ConnectionAuditEvent({
    id,
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    eventType: 'API_KEY_ROTATED',
    metadata: {},
    createdAt: new Date(),
  });
}

function buildDeps(
  overrides: {
    authorization?: CassoFlowAuthorization | null;
    connections?: BankConnection[];
  } = {},
) {
  const authorizationRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.authorization === undefined
          ? buildAuthorization()
          : overrides.authorization,
      ),
  };
  const bankConnectionRepo = {
    findByAuthorizationId: jest
      .fn()
      .mockResolvedValue(overrides.connections ?? [buildConnection('conn-1')]),
  };
  const auditEventRepo = {
    findByBankConnectionIds: jest
      .fn()
      .mockResolvedValue({ items: [buildEvent('evt-1')], total: 1 }),
  };
  return { authorizationRepo, bankConnectionRepo, auditEventRepo };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new ListAuthorizationAuditEventsUseCase(
    deps.authorizationRepo as never,
    deps.bankConnectionRepo as never,
    deps.auditEventRepo as never,
  );
}

describe('ListAuthorizationAuditEventsUseCase', () => {
  it('lists audit events across every connection under the authorization', async () => {
    const deps = buildDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'evt-1' })],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(deps.auditEventRepo.findByBankConnectionIds).toHaveBeenCalledWith(
      ['conn-1'],
      ['TOKEN_EXCHANGED', 'RECONNECTED', 'DISCONNECTED', 'API_KEY_ROTATED', 'API_KEY_REVEALED'],
      1,
      20,
    );
  });

  it('returns an empty page without querying events when the authorization has no connections', async () => {
    const deps = buildDeps({ connections: [] });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(deps.auditEventRepo.findByBankConnectionIds).not.toHaveBeenCalled();
  });

  it('throws AppError when the authorization cannot be found', async () => {
    const deps = buildDeps({ authorization: null });
    const useCase = buildUseCase(deps);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'missing',
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern list-authorization-audit-events -v`
Expected: FAIL — `Cannot find module './list-authorization-audit-events.usecase'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.ts`:

```typescript
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
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';
import {
  CONNECTION_HISTORY_EVENT_TYPES,
  type ConnectionAuditEvent,
} from '../domain/connection-audit-event';

export interface ListAuthorizationAuditEventsInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  page: number;
  limit: number;
}

export interface ListAuthorizationAuditEventsResult {
  items: ConnectionAuditEvent[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListAuthorizationAuditEventsUseCase {
  constructor(
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
  ) {}

  async execute(
    input: ListAuthorizationAuditEventsInput,
  ): Promise<ListAuthorizationAuditEventsResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const connections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    if (connections.length === 0) {
      return { items: [], total: 0, page: input.page, limit: input.limit };
    }

    const { items, total } =
      await this.auditEventRepo.findByBankConnectionIds(
        connections.map((connection) => connection.id),
        CONNECTION_HISTORY_EVENT_TYPES,
        input.page,
        input.limit,
      );
    return { items, total, page: input.page, limit: input.limit };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern list-authorization-audit-events -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.ts apps/backend/src/modules/bank-connections/application/list-authorization-audit-events.usecase.spec.ts
git commit -m "feat: add ListAuthorizationAuditEventsUseCase"
```

---

## Task 9: Response DTO

**Files:**
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/connection-audit-event-response.dto.ts`

**Interfaces:**
- Consumes: `ConnectionAuditEvent` (domain)
- Produces: `ConnectionAuditEventResponseDto`, `ListConnectionAuditEventsResponseDto`, `toConnectionAuditEventResponse(event: ConnectionAuditEvent): ConnectionAuditEventResponseDto` — consumed by Task 10's controller.

This is a pure mapper with no branching worth a dedicated unit test (mirrors `toBankConnectionResponse`, which also has none) — it is exercised end-to-end by Task 10's controller wiring. Config/DTO-only change, TDD exception per `AGENTS.md`.

- [ ] **Step 1: Create the DTO file**

```typescript
import type {
  ConnectionAuditEvent,
  ConnectionAuditEventType,
} from '../../domain/connection-audit-event';

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

export class ConnectionAuditEventResponseDto {
  id: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  actorUserId: string | null;
  maskedApiKey: string | null;
  oldMaskedApiKey: string | null;
  newMaskedApiKey: string | null;
  accountNumber: string | null;
  oldBankName: string | null;
  newBankName: string | null;
  oldAccountHolderName: string | null;
  newAccountHolderName: string | null;
  createdAt: Date;
}

export class ListConnectionAuditEventsResponseDto {
  items: ConnectionAuditEventResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toConnectionAuditEventResponse(
  event: ConnectionAuditEvent,
): ConnectionAuditEventResponseDto {
  const dto = new ConnectionAuditEventResponseDto();
  dto.id = event.id;
  dto.bankConnectionId = event.bankConnectionId;
  dto.eventType = event.eventType;
  dto.actorUserId =
    metadataString(event.metadata, 'actorUserId') ??
    metadataString(event.metadata, 'revealedByUserId');
  dto.maskedApiKey = metadataString(event.metadata, 'maskedApiKey');
  dto.oldMaskedApiKey = metadataString(event.metadata, 'oldMaskedApiKey');
  dto.newMaskedApiKey = metadataString(event.metadata, 'newMaskedApiKey');
  dto.accountNumber = metadataString(event.metadata, 'accountNumber');
  dto.oldBankName = metadataString(event.metadata, 'oldBankName');
  dto.newBankName = metadataString(event.metadata, 'newBankName');
  dto.oldAccountHolderName = metadataString(
    event.metadata,
    'oldAccountHolderName',
  );
  dto.newAccountHolderName = metadataString(
    event.metadata,
    'newAccountHolderName',
  );
  dto.createdAt = event.createdAt;
  return dto;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/bank-connections/presentation/dto/connection-audit-event-response.dto.ts
git commit -m "feat: add ConnectionAuditEventResponseDto"
```

---

## Task 10: Wire the new endpoint and thread `userId` through existing endpoints

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

**Interfaces:**
- Consumes: `ListAuthorizationAuditEventsUseCase` (Task 8), `toConnectionAuditEventResponse`/`ListConnectionAuditEventsResponseDto` (Task 9)

No new unit test in this task — it is pure wiring (DI + route registration + threading an already-validated `userId` from the request), covered by the existing `audited-metadata.spec.ts` permission-guard sweep (which runs unmodified against the whole controller class) and by e2e coverage in Task 11. Config/wiring-only change, TDD exception per `AGENTS.md`.

- [ ] **Step 1: Update the controller**

In `bank-connections.controller.ts`:

1. Add the new imports:
```typescript
import { ListAuthorizationAuditEventsUseCase } from '../application/list-authorization-audit-events.usecase';
```
```typescript
import {
  ListConnectionAuditEventsResponseDto,
  toConnectionAuditEventResponse,
} from './dto/connection-audit-event-response.dto';
```

2. Add the constructor param (after `disconnectConnectionUseCase`):
```typescript
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
    private readonly listAuthorizationAuditEventsUseCase: ListAuthorizationAuditEventsUseCase,
```

3. Update `confirm` to thread `userId`:
```typescript
  async confirm(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConfirmCassoFlowDto,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/confirm',
      key,
      dto,
      () =>
        this.connectCassoFlowUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          apiKey: dto.apiKey,
          selectedAccountNumbers: dto.selectedAccountNumbers,
          userId,
        }),
    );
  }
```

4. Update `rotate` to thread `userId`:
```typescript
  async rotate(
    @Param('id') authorizationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RotateCassoFlowDto,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      `POST /bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
      key,
      dto,
      () =>
        this.rotateCassoFlowAuthorizationUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          cassoFlowAuthorizationId: authorizationId,
          apiKey: dto.apiKey,
          userId,
        }),
    );
  }
```

5. Update `disconnect` to thread `userId`:
```typescript
  async disconnect(
    @Param('id') connectionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      `POST /bank-connections/${connectionId}/disconnect`,
      key,
      { connectionId },
      async () => {
        await this.disconnectConnectionUseCase.execute(connectionId, userId);
        return { success: true };
      },
    );
  }
```

6. Add the new endpoint at the end of the class, before the closing brace:
```typescript
  @Get('authorizations/:id/audit-events')
  @ApiOperation({
    summary:
      "List a CassoFlowAuthorization's API Key history (audit events)",
  })
  @ApiOkResponse({ type: ListConnectionAuditEventsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.BANK_CONNECTION_REVEAL_KEY)
  async listAuditEvents(
    @Param('id') authorizationId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.listAuthorizationAuditEventsUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      cassoFlowAuthorizationId: authorizationId,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: result.items.map(toConnectionAuditEventResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
```

- [ ] **Step 2: Wire the module**

In `bank-connections.module.ts`:

1. Add the import:
```typescript
import { ListAuthorizationAuditEventsUseCase } from './application/list-authorization-audit-events.usecase';
```

2. Add to `providers` (after `ListBankConnectionsUseCase`, keeping the existing use-case ordering):
```typescript
    ListBankConnectionsUseCase,
    ListAuthorizationAuditEventsUseCase,
```

- [ ] **Step 3: Run the full bank-connections test suite**

Run: `npx jest --testPathPattern bank-connections -v`
Expected: PASS (all existing + new tests)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: add GET audit-events endpoint and thread userId into connect/rotate/disconnect"
```

---

## Task 11: Backend e2e coverage for the new endpoint

**Files:**
- Modify: an existing bank-connections e2e spec under `apps/backend/test/` (find it first — run `Glob` for `apps/backend/test/**/bank-connection*` or `apps/backend/test/**/*casso-flow*` to locate the right file; if none exists, create `apps/backend/test/bank-connections-audit-events.e2e-spec.ts` following the structure of a sibling `*.e2e-spec.ts` file in the same directory, e.g. copy its `beforeAll`/`afterAll` testcontainers setup and auth-header helper).

**Interfaces:**
- Consumes: the full HTTP stack (real Postgres via testcontainers), exercising Tasks 3–10 together.

- [ ] **Step 1: Locate the existing e2e setup**

Run: `Glob` for `apps/backend/test/**/*.e2e-spec.ts` and open one bank-connections-related file to copy its app bootstrap (`Test.createTestingModule`, testcontainers Postgres setup, auth token helper, tenant/org seeding helper) verbatim into the new spec — do not re-derive this bootstrap from scratch.

- [ ] **Step 2: Write the failing test**

Add a test that: connects a Casso Flow account (via the existing confirm flow helper already used in sibling e2e specs), rotates it once, disconnects it, then calls `GET /api/v1/bank-connections/authorizations/:id/audit-events` as an OWNER, and asserts:
- response status 200
- `items` contains events with `eventType` in `['TOKEN_EXCHANGED', 'API_KEY_ROTATED', 'DISCONNECTED']`, ordered newest-first
- the `API_KEY_ROTATED` item has non-null `oldMaskedApiKey`/`newMaskedApiKey`/`actorUserId`

Also add a test that a user without `BANK_CONNECTION_REVEAL_KEY` (e.g. ACCOUNTANT role) gets a 403.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern <new-file-name>`
Expected: FAIL (endpoint/route not yet reachable if this is a fresh file with a typo, or assertions fail against real data) — confirm the failure reason matches "not implemented yet", not a setup error.

- [ ] **Step 4: Run test to verify it passes**

Since Tasks 3–10 already implement the feature, this step should pass without further production code changes — it is a verification-only step. If it fails for a reason other than test setup, fix the specific gap found (do not skip past a real failure).

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern <new-file-name>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/<new-or-modified-file>.e2e-spec.ts
git commit -m "test: add e2e coverage for authorization audit-events endpoint"
```

---

## Task 12: Frontend types + API function + hook

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/types.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`
- Test: `apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts`

**Interfaces:**
- Produces: `ConnectionAuditEventType`, `ConnectionAuditEvent`, `ConnectionAuditEventList` (types); `fetchAuthorizationAuditEvents(authorizationId: string): Promise<ConnectionAuditEventList>`; `useAuthorizationAuditEvents(authorizationId: string, enabled: boolean)` — consumed by Task 13.

- [ ] **Step 1: Write the failing test**

The file mocks `@/lib/api-client` with module-level `apiRequest`/`postWithIdempotency` `vi.fn()`s (see the top of the file) and imports the functions it tests by name from `./bank-connections-api`. Add `fetchAuthorizationAuditEvents` to that import list, then add:

```typescript
describe('fetchAuthorizationAuditEvents', () => {
  it('gets the first page of an authorization audit-event history', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });

    await fetchAuthorizationAuditEvents('auth-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/bank-connections/authorizations/auth-1/audit-events?page=1&limit=50',
      method: 'GET',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bank-connections-api`
Expected: FAIL — `fetchAuthorizationAuditEvents is not defined`

- [ ] **Step 3: Write minimal implementation**

Add to `types.ts`:

```typescript
export type ConnectionAuditEventType =
  | 'TOKEN_EXCHANGED'
  | 'RECONNECTED'
  | 'DISCONNECTED'
  | 'API_KEY_ROTATED'
  | 'API_KEY_REVEALED';

export interface ConnectionAuditEvent {
  id: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  actorUserId: string | null;
  maskedApiKey: string | null;
  oldMaskedApiKey: string | null;
  newMaskedApiKey: string | null;
  accountNumber: string | null;
  oldBankName: string | null;
  newBankName: string | null;
  oldAccountHolderName: string | null;
  newAccountHolderName: string | null;
  createdAt: string;
}

export interface ConnectionAuditEventList {
  items: ConnectionAuditEvent[];
  total: number;
  page: number;
  limit: number;
}
```

Add to `bank-connections-api.ts` (extend the existing `type` import block with `ConnectionAuditEventList`, then add the function):

```typescript
export function fetchAuthorizationAuditEvents(
  authorizationId: string,
): Promise<ConnectionAuditEventList> {
  return apiRequest<ConnectionAuditEventList>({
    url: `/api/v1/bank-connections/authorizations/${authorizationId}/audit-events?page=1&limit=50`,
    method: 'GET',
  });
}
```

Add to `use-bank-connections.ts` (extend the existing import from `./bank-connections-api` to include `fetchAuthorizationAuditEvents`):

```typescript
export function useAuthorizationAuditEvents(
  authorizationId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['bank-connections', 'audit-events', authorizationId],
    queryFn: () => fetchAuthorizationAuditEvents(authorizationId),
    enabled,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bank-connections-api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/bank-connections/types.ts apps/frontend/src/features/bank-connections/api/bank-connections-api.ts apps/frontend/src/features/bank-connections/api/use-bank-connections.ts apps/frontend/src/features/bank-connections/api/bank-connections-api.spec.ts
git commit -m "feat: add frontend types/api/hook for authorization audit-event history"
```

---

## Task 13: `AuthorizationHistoryDialog` component

**Files:**
- Create: `apps/frontend/src/features/bank-connections/components/authorization-history-dialog.tsx`
- Test: `apps/frontend/src/features/bank-connections/components/authorization-history-dialog.spec.tsx`

**Interfaces:**
- Consumes: `useAuthorizationAuditEvents` (Task 12), `ConnectionAuditEvent`/`ConnectionAuditEventType` (Task 12), `formatDate` from `@/lib/format`
- Produces: `AuthorizationHistoryDialog({ authorizationId }: { authorizationId: string })` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationHistoryDialog } from './authorization-history-dialog';

const { useAuthorizationAuditEvents } = vi.hoisted(() => ({
  useAuthorizationAuditEvents: vi.fn(),
}));

vi.mock('../api/use-bank-connections', () => ({ useAuthorizationAuditEvents }));

describe('AuthorizationHistoryDialog', () => {
  it('shows the rotate event with old/new masked key and bank name once opened', () => {
    useAuthorizationAuditEvents.mockReturnValue({
      data: {
        items: [
          {
            id: 'evt-1',
            bankConnectionId: 'conn-1',
            eventType: 'API_KEY_ROTATED',
            actorUserId: 'user-1',
            maskedApiKey: null,
            oldMaskedApiKey: '••••1111',
            newMaskedApiKey: '••••2222',
            accountNumber: '111',
            oldBankName: 'Old Bank',
            newBankName: 'New Bank',
            oldAccountHolderName: 'OLD NAME',
            newAccountHolderName: 'NEW NAME',
            createdAt: '2026-08-10T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isPending: false,
      isError: false,
    });

    render(<AuthorizationHistoryDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /lịch sử/i }));

    expect(screen.getByText('Đổi API Key')).toBeInTheDocument();
    expect(screen.getByText(/••••1111.*••••2222/)).toBeInTheDocument();
    expect(screen.getByText(/Old Bank.*New Bank/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', () => {
    useAuthorizationAuditEvents.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 50 },
      isPending: false,
      isError: false,
    });

    render(<AuthorizationHistoryDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /lịch sử/i }));

    expect(screen.getByText('Chưa có lịch sử.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run authorization-history-dialog`
Expected: FAIL — `Cannot find module './authorization-history-dialog'`

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';
import { useAuthorizationAuditEvents } from '../api/use-bank-connections';
import type { ConnectionAuditEvent, ConnectionAuditEventType } from '../types';

const eventTypeLabels: Record<ConnectionAuditEventType, string> = {
  TOKEN_EXCHANGED: 'Kết nối lần đầu',
  RECONNECTED: 'Kết nối lại',
  DISCONNECTED: 'Ngắt kết nối',
  API_KEY_ROTATED: 'Đổi API Key',
  API_KEY_REVEALED: 'Xem API Key',
};

function EventDetails({ event }: { event: ConnectionAuditEvent }) {
  if (event.eventType === 'API_KEY_ROTATED') {
    return (
      <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
        {event.oldMaskedApiKey && event.newMaskedApiKey && (
          <p>
            API Key: {event.oldMaskedApiKey} → {event.newMaskedApiKey}
          </p>
        )}
        {event.oldBankName &&
          event.newBankName &&
          event.oldBankName !== event.newBankName && (
            <p>
              Ngân hàng: {event.oldBankName} → {event.newBankName}
            </p>
          )}
        {event.oldAccountHolderName &&
          event.newAccountHolderName &&
          event.oldAccountHolderName !== event.newAccountHolderName && (
            <p>
              Chủ tài khoản: {event.oldAccountHolderName} →{' '}
              {event.newAccountHolderName}
            </p>
          )}
      </div>
    );
  }
  if (event.maskedApiKey) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        API Key: {event.maskedApiKey}
      </p>
    );
  }
  return null;
}

export function AuthorizationHistoryDialog({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useAuthorizationAuditEvents(
    authorizationId,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Lịch sử
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lịch sử API Key</DialogTitle>
          <DialogDescription>
            Các sự kiện kết nối, đổi và ngắt API Key Casso Flow cho nhóm tài
            khoản này.
          </DialogDescription>
        </DialogHeader>
        {isPending && (
          <p role="status" aria-live="polite">
            Đang tải…
          </p>
        )}
        {isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải lịch sử.
          </p>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p>
        )}
        {data && data.items.length > 0 && (
          <ol className="max-h-96 space-y-4 overflow-y-auto">
            {data.items.map((event) => (
              <li key={event.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">
                    {eventTypeLabels[event.eventType]}
                  </span>
                  <time className="text-sm text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </div>
                <EventDetails event={event} />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run authorization-history-dialog`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/bank-connections/components/authorization-history-dialog.tsx apps/frontend/src/features/bank-connections/components/authorization-history-dialog.spec.tsx
git commit -m "feat: add AuthorizationHistoryDialog component"
```

---

## Task 14: Wire the history button into `ConnectionTable`

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/components/connection-table.tsx`
- Modify: `apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx`

**Interfaces:**
- Consumes: `AuthorizationHistoryDialog` (Task 13)

- [ ] **Step 1: Write the failing test**

Add to `connection-table.spec.tsx` (extend the existing `vi.mock` block with a stub for the new component, matching the existing `RevealApiKeyDialog` stub pattern):

```typescript
vi.mock('./authorization-history-dialog', () => ({
  AuthorizationHistoryDialog: ({
    authorizationId,
  }: {
    authorizationId: string;
  }) => <button type="button">Lịch sử ({authorizationId})</button>,
}));
```

Add a new test in the `describe('ConnectionTable', ...)` block:

```typescript
it('shows the history action for a user who can reveal the API key', () => {
  useAuth.mockReturnValue({ user: { role: 'FINANCE_MANAGER' } });

  render(<ConnectionTable connections={[connection]} />);

  expect(
    screen.getByRole('button', { name: /lịch sử \(authorization-1\)/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run connection-table`
Expected: FAIL — button not found (component not yet wired in)

- [ ] **Step 3: Write minimal implementation**

In `connection-table.tsx`:

1. Add the import:
```typescript
import { AuthorizationHistoryDialog } from './authorization-history-dialog';
```

2. In the group action row (the `TableRow` with `colSpan={5}`), add the dialog next to `RevealApiKeyDialog`:
```tsx
                <TableCell
                  colSpan={5}
                  className="flex justify-end gap-2 text-right"
                >
                  {canRevealKey && (
                    <>
                      <AuthorizationHistoryDialog
                        authorizationId={authorizationId}
                      />
                      <RevealApiKeyDialog authorizationId={authorizationId} />
                    </>
                  )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run connection-table`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/bank-connections/components/connection-table.tsx apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx
git commit -m "feat: wire API Key history action into the connections table"
```

---

## Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend unit suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: PASS

- [ ] **Step 2: Run backend e2e (if Docker is available)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 3: Type-check everything**

Run: `npx tsc --noEmit` (run once from `apps/backend`, once from `apps/frontend`, per each package's own tsconfig)
Expected: PASS

- [ ] **Step 4: Lint + format**

Run: `npx biome check --write .`
Expected: no remaining issues after auto-fix; review the diff for anything unexpected

- [ ] **Step 5: Domain check**

Run the `/domain-check` skill per `AGENTS.md` ("after any backend code change") and fix any violations it reports.

- [ ] **Step 6: Full `pnpm verify`**

Run: `pnpm verify`
Expected: PASS (lint + type-check + test)

- [ ] **Step 7: Frontend tests**

Run: `/fe-test` (or `pnpm --filter @casso-ledger/frontend test` if that skill maps to a different command — confirm the exact command from `package.json` scripts first)
Expected: PASS

- [ ] **Step 8: Manual smoke check (per AGENTS.md — start the app and click through the golden path)**

Start backend (`pnpm dev:backend`) and frontend, connect a Casso Flow account, rotate its key once, disconnect one connection, then open "Lịch sử" from the connections table as an OWNER and confirm the timeline shows all three events with masked keys and the old/new bank name diff on the rotate entry. Also confirm the "Lịch sử" button is absent for a role without `BANK_CONNECTION_REVEAL_KEY` (e.g. ACCOUNTANT).

- [ ] **Step 9: Update the feature map**

Per `AGENTS.md` workflow rules, update `docs/wayfinder/feature-map.md`: mark this ticket's status → `done`, add `Shipped:` date + PR reference once the PR is opened.
