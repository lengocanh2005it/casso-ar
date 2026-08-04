# Cas ID Integration & Bank Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Cas ID redirect-based connection flow (grant token → Cas Link → publicToken → accessToken exchange) behind a `CasIdIntegrationAdapter` interface with a `MockCasIdAdapter` for MVP, persist `BankConnection` with an encrypted `accessToken`, and enforce lazy revocation detection so the webhook pipeline stops accepting new transactions for a connection that has lost access.

**Architecture:** `CasIdIntegrationAdapter` port isolates the uncertain real Cas ID API (spec's own caveat: public docs lack full schema) from domain logic — only `MockCasIdAdapter` is implemented now; a real `CasIdAdapter` swaps in later via the same DI token. `BankConnectionService`-equivalent use cases drive session → exchange → `BankConnection`. The Webhook module (previous plan) gets a small modification: check `BankConnection.status === 'ACTIVE'` before enqueueing, since Cas ID has no revoke webhook — detection is lazy, triggered by any 401/403 from the adapter.

**Tech Stack:** Node `crypto` (AES-256-GCM for `accessToken` at rest), TypeORM, existing `BullMQ`/webhook infrastructure from the Webhook & Matching Engine plan.

## Global Constraints

- `accessToken` is encrypted at rest, never logged in plaintext anywhere, including `ConnectionAuditEvent.metadata` (spec mục 2).
- Cas Link opens in a popup/new tab, never an iframe (spec mục 1).
- Lazy revocation detection only — no scheduled polling job (spec mục 3).
- Historical `BankTransaction`/`PaymentAllocation` are never deleted when a connection loses `ACTIVE` status (spec mục 3).
- Every status change writes a `ConnectionAuditEvent` (spec mục 3).
- `ACCESS_TOKEN_ENCRYPTION_KEY` samples and validation are exactly 64 hexadecimal characters (32 decoded bytes).
- Re-authentication reactivates the existing `BankConnection` row and replaces its token/session; it never creates a second row.
- `CustomerBankAccount` mapping is not inferred from `BankConnection.accountIdentity`: the customer-owned, tenant-scoped mapping is created by bank-account management and read by Webhook Matching. Cas re-authentication preserves that separate mapping.
- Every adapter caller that uses an existing access token catches `CasIdUnauthorizedError`, calls `MarkRequiresReauthorizationUseCase`, then rethrows; `SyncTransactionsUseCase` and `DisconnectConnectionUseCase` implement this contract. The one-time public-token exchange is not such a caller.
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply.

---

## File Structure

```
apps/backend/src/
  modules/
    bank-connections/
      domain/
        cas-id-connection-session.ts
        bank-connection.ts
        connection-audit-event.ts
      infrastructure/
        cas-id-connection-session.orm-entity.ts
        bank-connection.orm-entity.ts
        connection-audit-event.orm-entity.ts
        typeorm-cas-id-connection-session.repository.ts
        typeorm-bank-connection.repository.ts
        typeorm-connection-audit-event.repository.ts
        mock-cas-id.adapter.ts
      application/
        cas-id-connection-session-repository.port.ts
        bank-connection-repository.port.ts
        connection-audit-event-repository.port.ts
        cas-id-integration-adapter.port.ts
        token-encryption.ts
        initiate-connection.usecase.ts
        exchange-token.usecase.ts
        disconnect-connection.usecase.ts
        mark-requires-reauthorization.usecase.ts
        sync-transactions.usecase.ts                 -- concrete adapter caller for lazy 401/403 handling
      presentation/
        dto/initiate-connection.dto.ts
        dto/exchange-token.dto.ts
        bank-connections.controller.ts
      bank-connections.module.ts
  modules/webhooks/presentation/webhooks.controller.ts    -- MODIFY: check BankConnection.status before enqueue
  app.module.ts                                            -- MODIFY: register BankConnectionsModule
  .env                                                      -- MODIFY: add ACCESS_TOKEN_ENCRYPTION_KEY
test/
  cas-id-connection-flow.integration.spec.ts
```

---

### Task 1: Domain entities

**Files:**
- Create: `apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts`
- Create: `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`
- Create: `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`
- Test: `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: 3 domain classes with status transition methods, used by every later task

- [ ] **Step 1: Write failing test for `BankConnection` transitions**

Create `apps/backend/src/modules/bank-connections/domain/bank-connection.spec.ts`:

```typescript
import { BankConnection } from './bank-connection';

function buildActiveConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    casIdConnectionSessionId: 'sess-1',
    encryptedAccessToken: 'encrypted-blob',
    accountIdentity: { accountNumber: '0011002233', bankName: 'ABC Bank' },
    status: 'ACTIVE',
    scopes: ['identity', 'transaction'],
    connectedAt: new Date('2026-08-01'),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date('2026-08-01'),
  });
}

describe('BankConnection domain entity', () => {
  it('transitions to REQUIRES_REAUTHORIZATION on markRequiresReauthorization', () => {
    const updated = buildActiveConnection().markRequiresReauthorization();
    expect(updated.status).toBe('REQUIRES_REAUTHORIZATION');
  });

  it('transitions REQUIRES_REAUTHORIZATION back to ACTIVE via reactivate', () => {
    const reauthNeeded = buildActiveConnection().markRequiresReauthorization();
    const reactivated = reauthNeeded.reactivate({
      casIdConnectionSessionId: 'sess-2',
      encryptedAccessToken: 'new-encrypted-blob',
      accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
      scopes: ['identity', 'transaction'],
    });
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.id).toBe('conn-1');
    expect(reactivated.casIdConnectionSessionId).toBe('sess-2');
    expect(reactivated.encryptedAccessToken).toBe('new-encrypted-blob');
  });

  it('transitions to DISCONNECTED and sets revokedAt via disconnect', () => {
    const updated = buildActiveConnection().disconnect();
    expect(updated.status).toBe('DISCONNECTED');
    expect(updated.revokedAt).not.toBeNull();
  });

  it('isUsable is true only when ACTIVE', () => {
    expect(buildActiveConnection().isUsable()).toBe(true);
    expect(buildActiveConnection().markRequiresReauthorization().isUsable()).toBe(false);
    expect(buildActiveConnection().disconnect().isUsable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test bank-connection.spec.ts`
Expected: FAIL — Cannot find module './bank-connection'

- [ ] **Step 3: Create `apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts`**

```typescript
export type CasIdConnectionSessionStatus = 'PENDING_AUTHORIZATION' | 'COMPLETED' | 'EXPIRED';

export interface CasIdConnectionSessionProps {
  id: string;
  organizationId: string;
  initiatedByUserId: string;
  /** Null for a first connection; set when the session is explicitly reauthorizing an existing row. */
  bankConnectionId: string | null;
  grantToken: string;
  scopes: string[];
  redirectUri: string;
  status: CasIdConnectionSessionStatus;
  expiresAt: Date;
  createdAt: Date;
}

export class CasIdConnectionSession {
  readonly id: string;
  readonly organizationId: string;
  readonly initiatedByUserId: string;
  readonly bankConnectionId: string | null;
  readonly grantToken: string;
  readonly scopes: string[];
  readonly redirectUri: string;
  readonly status: CasIdConnectionSessionStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(props: CasIdConnectionSessionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.initiatedByUserId = props.initiatedByUserId;
    this.bankConnectionId = props.bankConnectionId;
    this.grantToken = props.grantToken;
    this.scopes = props.scopes;
    this.redirectUri = props.redirectUri;
    this.status = props.status;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() < now.getTime();
  }

  markCompleted(): CasIdConnectionSession {
    return new CasIdConnectionSession({ ...this, status: 'COMPLETED' });
  }
}
```

- [ ] **Step 4: Create `apps/backend/src/modules/bank-connections/domain/bank-connection.ts`**

```typescript
export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface AccountIdentity {
  accountNumber: string;
  bankName: string;
  [key: string]: unknown;
}

export interface BankConnectionProps {
  id: string;
  organizationId: string;
    casIdConnectionSessionId: string;
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
  readonly encryptedAccessToken: string;
  readonly accountIdentity: AccountIdentity;
  readonly status: BankConnectionStatus;
  readonly scopes: string[];
  readonly connectedAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: BankConnectionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.casIdConnectionSessionId = props.casIdConnectionSessionId;
    this.encryptedAccessToken = props.encryptedAccessToken;
    this.accountIdentity = props.accountIdentity;
    this.status = props.status;
    this.scopes = props.scopes;
    this.connectedAt = props.connectedAt;
    this.lastSyncAt = props.lastSyncAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
  }

  isUsable(): boolean {
    return this.status === 'ACTIVE';
  }

  markRequiresReauthorization(): BankConnection {
    return new BankConnection({ ...this, status: 'REQUIRES_REAUTHORIZATION' });
  }

  markError(): BankConnection {
    return new BankConnection({ ...this, status: 'ERROR' });
  }

  reactivate(input: {
    casIdConnectionSessionId: string;
    encryptedAccessToken: string;
    accountIdentity: AccountIdentity;
    scopes: string[];
  }): BankConnection {
    return new BankConnection({
      ...this,
      ...input,
      status: 'ACTIVE',
      connectedAt: new Date(),
      revokedAt: null,
    });
  }

  disconnect(): BankConnection {
    return new BankConnection({ ...this, status: 'DISCONNECTED', revokedAt: new Date() });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test bank-connection.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 6: Create `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`**

```typescript
export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'MARKED_REQUIRES_REAUTH'
  | 'RECONNECTED'
  | 'DISCONNECTED';

export interface ConnectionAuditEventProps {
  id: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class ConnectionAuditEvent {
  readonly id: string;
  readonly bankConnectionId: string;
  readonly eventType: ConnectionAuditEventType;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;

  constructor(props: ConnectionAuditEventProps) {
    this.id = props.id;
    this.bankConnectionId = props.bankConnectionId;
    this.eventType = props.eventType;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
  }
}
```

`metadata` must never contain `accessToken`/`encryptedAccessToken` — enforced by convention at every call site in this plan (Tasks 5-7 only ever pass small descriptive objects like `{ reason: '401 from getTransactions' }`).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain
git commit -m "feat: add CasIdConnectionSession, BankConnection, ConnectionAuditEvent domain entities"
```

---

### Task 2: Access token encryption utility

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/token-encryption.ts`
- Modify: `apps/backend/.env`
- Test: `apps/backend/src/modules/bank-connections/application/token-encryption.spec.ts`

**Interfaces:**
- Consumes: `ACCESS_TOKEN_ENCRYPTION_KEY` env var
- Produces: `encryptToken(plain): string`, `decryptToken(encrypted): string`, used by Task 6 (`ExchangeTokenUseCase`)

- [ ] **Step 1: Add encryption key to `apps/backend/.env`**

```
ACCESS_TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

(32 hex-decoded bytes = 32-byte AES-256 key; production deployment must generate a real random key and inject it via secrets manager, not commit one — this dev value is for local/testcontainers only)

- [ ] **Step 2: Write failing test**

Create `apps/backend/src/modules/bank-connections/application/token-encryption.spec.ts`:

```typescript
import { encryptToken, decryptToken } from './token-encryption';

describe('token-encryption', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ACCESS_TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypts and decrypts back to the original plaintext', () => {
    const plain = 'super-secret-cas-id-access-token';
    const encrypted = encryptToken(plain);

    expect(encrypted).not.toBe(plain);
    expect(decryptToken(encrypted)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext on each call (random IV)', () => {
    const first = encryptToken('same-token');
    const second = encryptToken('same-token');
    expect(first).not.toBe(second);
  });

  it('rejects a key containing non-hex characters', () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY = 'z'.repeat(64);
    expect(() => encryptToken('token')).toThrow('64-character hex string');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test token-encryption.spec.ts`
Expected: FAIL — Cannot find module './token-encryption'

- [ ] **Step 4: Create `apps/backend/src/modules/bank-connections/application/token-encryption.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hexKey = process.env.ACCESS_TOKEN_ENCRYPTION_KEY;
  if (!hexKey || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('ACCESS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptToken(encryptedBase64: string): string {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buffer.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test token-encryption.spec.ts`
Expected: both tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/token-encryption.ts apps/backend/src/modules/bank-connections/application/token-encryption.spec.ts apps/backend/.env
git commit -m "feat: add AES-256-GCM encryption utility for Cas ID access tokens"
```

---

### Task 3: Infrastructure (ORM entities + repositories + module skeleton)

**Files:**
- Create: `apps/backend/src/modules/bank-connections/infrastructure/cas-id-connection-session.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/connection-audit-event.orm-entity.ts`
- Create: `apps/backend/src/modules/bank-connections/application/cas-id-connection-session-repository.port.ts`
- Create: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Create: `apps/backend/src/modules/bank-connections/application/connection-audit-event-repository.port.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-cas-id-connection-session.repository.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.ts`
- Create: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `BaseRepository` (Multi-tenancy plan) for `CasIdConnectionSession`/`BankConnection` (tenant-scoped); `ConnectionAuditEvent` keyed by `bankConnectionId` only (no direct tenant filter needed, always queried through an already-scoped `BankConnection`)
- Produces: 3 repositories, used by Tasks 5-7's use cases

- [ ] **Step 1: Create the 3 ORM entities**

`apps/backend/src/modules/bank-connections/infrastructure/cas-id-connection-session.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CasIdConnectionSessionStatus } from '../domain/cas-id-connection-session';

@Entity({ name: 'cas_id_connection_sessions' })
export class CasIdConnectionSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  initiatedByUserId: string;

  @Column({ nullable: true })
  bankConnectionId: string | null;

  @Column()
  grantToken: string;

  @Column('simple-array')
  scopes: string[];

  @Column()
  redirectUri: string;

  @Column()
  status: CasIdConnectionSessionStatus;

  @Column()
  expiresAt: Date;

  @Column()
  createdAt: Date;
}
```

`apps/backend/src/modules/bank-connections/infrastructure/bank-connection.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AccountIdentity, BankConnectionStatus } from '../domain/bank-connection';

@Entity({ name: 'bank_connections' })
export class BankConnectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  casIdConnectionSessionId: string;

  @Column('text')
  encryptedAccessToken: string;

  @Column({ type: 'jsonb' })
  accountIdentity: AccountIdentity;

  @Column()
  status: BankConnectionStatus;

  @Column('simple-array')
  scopes: string[];

  @Column({ nullable: true })
  connectedAt: Date | null;

  @Column({ nullable: true })
  lastSyncAt: Date | null;

  @Column({ nullable: true })
  revokedAt: Date | null;

  @Column()
  createdAt: Date;
}
```

`apps/backend/src/modules/bank-connections/infrastructure/connection-audit-event.orm-entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ConnectionAuditEventType } from '../domain/connection-audit-event';

@Entity({ name: 'connection_audit_events' })
export class ConnectionAuditEventOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bankConnectionId: string;

  @Column()
  eventType: ConnectionAuditEventType;

  @Column({ type: 'jsonb' })
  metadata: Record<string, unknown>;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 2: Create the 3 repository ports**

`apps/backend/src/modules/bank-connections/application/cas-id-connection-session-repository.port.ts`:

```typescript
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';

export interface ICasIdConnectionSessionRepository {
  findById(id: string): Promise<CasIdConnectionSession | null>;
  save(session: CasIdConnectionSession): Promise<void>;
}

export const CAS_ID_CONNECTION_SESSION_REPOSITORY = Symbol('CAS_ID_CONNECTION_SESSION_REPOSITORY');
```

`apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`:

```typescript
import { BankConnection } from '../domain/bank-connection';
import { encryptToken } from './token-encryption';

export interface IBankConnectionRepository {
  findById(id: string): Promise<BankConnection | null>;
  findByIdUnscoped(id: string): Promise<BankConnection | null>;
  save(connection: BankConnection): Promise<void>;
}

export const BANK_CONNECTION_REPOSITORY = Symbol('BANK_CONNECTION_REPOSITORY');
```

`findByIdUnscoped` exists because the Webhook module's pre-check (Task 8) runs inside the same `TenantContextService.run()` scope the `ProcessWebhookUseCase` already opens (organizationId known from `WebhookInbox`), so the scoped `findById` works there — but the WEBHOOK CONTROLLER's pre-enqueue check (Task 8) runs BEFORE any tenant context exists (same situation as `WebhookInbox`/`BankTransaction` in the previous plan), hence the unscoped variant.

`apps/backend/src/modules/bank-connections/application/connection-audit-event-repository.port.ts`:

```typescript
import { ConnectionAuditEvent } from '../domain/connection-audit-event';

export interface IConnectionAuditEventRepository {
  save(event: ConnectionAuditEvent): Promise<void>;
}

export const CONNECTION_AUDIT_EVENT_REPOSITORY = Symbol('CONNECTION_AUDIT_EVENT_REPOSITORY');
```

- [ ] **Step 3: Create the 3 repository implementations**

`apps/backend/src/modules/bank-connections/infrastructure/typeorm-cas-id-connection-session.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ICasIdConnectionSessionRepository } from '../application/cas-id-connection-session-repository.port';
import { CasIdConnectionSessionOrmEntity } from './cas-id-connection-session.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCasIdConnectionSessionRepository
  extends BaseRepository<CasIdConnectionSessionOrmEntity>
  implements ICasIdConnectionSessionRepository
{
  constructor(
    @InjectRepository(CasIdConnectionSessionOrmEntity) repo: Repository<CasIdConnectionSessionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<CasIdConnectionSession | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new CasIdConnectionSession(row) : null;
  }

  async save(session: CasIdConnectionSession): Promise<void> {
    await this.scopedSave(session as unknown as CasIdConnectionSessionOrmEntity);
  }
}
```

`apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankConnection } from '../domain/bank-connection';
import { IBankConnectionRepository } from '../application/bank-connection-repository.port';
import { BankConnectionOrmEntity } from './bank-connection.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmBankConnectionRepository
  extends BaseRepository<BankConnectionOrmEntity>
  implements IBankConnectionRepository
{
  constructor(
    @InjectRepository(BankConnectionOrmEntity) private readonly rawRepo: Repository<BankConnectionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(rawRepo, tenantContext);
  }

  async findById(id: string): Promise<BankConnection | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new BankConnection(row) : null;
  }

  async findByIdUnscoped(id: string): Promise<BankConnection | null> {
    const row = await this.rawRepo.findOne({ where: { id } });
    return row ? new BankConnection(row) : null;
  }

  async save(connection: BankConnection): Promise<void> {
    await this.scopedSave(connection as unknown as BankConnectionOrmEntity);
  }
}
```

`apps/backend/src/modules/bank-connections/infrastructure/typeorm-connection-audit-event.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { IConnectionAuditEventRepository } from '../application/connection-audit-event-repository.port';
import { ConnectionAuditEventOrmEntity } from './connection-audit-event.orm-entity';

@Injectable()
export class TypeOrmConnectionAuditEventRepository implements IConnectionAuditEventRepository {
  constructor(
    @InjectRepository(ConnectionAuditEventOrmEntity)
    private readonly repo: Repository<ConnectionAuditEventOrmEntity>,
  ) {}

  async save(event: ConnectionAuditEvent): Promise<void> {
    // Audit history is append-only: never use TypeORM save/upsert here.
    await this.repo.insert(event as unknown as ConnectionAuditEventOrmEntity);
  }
}
```

`ConnectionAuditEvent` is insert-only. Its repository exposes `save` only as the application-port name; the infrastructure implementation must call TypeORM `insert()` and must not update or delete an existing event.

- [ ] **Step 4: Create `apps/backend/src/modules/bank-connections/bank-connections.module.ts`** (skeleton)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CasIdConnectionSessionOrmEntity } from './infrastructure/cas-id-connection-session.orm-entity';
import { BankConnectionOrmEntity } from './infrastructure/bank-connection.orm-entity';
import { ConnectionAuditEventOrmEntity } from './infrastructure/connection-audit-event.orm-entity';
import { TypeOrmCasIdConnectionSessionRepository } from './infrastructure/typeorm-cas-id-connection-session.repository';
import { TypeOrmBankConnectionRepository } from './infrastructure/typeorm-bank-connection.repository';
import { TypeOrmConnectionAuditEventRepository } from './infrastructure/typeorm-connection-audit-event.repository';
import { CAS_ID_CONNECTION_SESSION_REPOSITORY } from './application/cas-id-connection-session-repository.port';
import { BANK_CONNECTION_REPOSITORY } from './application/bank-connection-repository.port';
import { CONNECTION_AUDIT_EVENT_REPOSITORY } from './application/connection-audit-event-repository.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CasIdConnectionSessionOrmEntity,
      BankConnectionOrmEntity,
      ConnectionAuditEventOrmEntity,
    ]),
  ],
  providers: [
    { provide: CAS_ID_CONNECTION_SESSION_REPOSITORY, useClass: TypeOrmCasIdConnectionSessionRepository },
    { provide: BANK_CONNECTION_REPOSITORY, useClass: TypeOrmBankConnectionRepository },
    { provide: CONNECTION_AUDIT_EVENT_REPOSITORY, useClass: TypeOrmConnectionAuditEventRepository },
  ],
  exports: [BANK_CONNECTION_REPOSITORY],
})
export class BankConnectionsModule {}
```

- [ ] **Step 5: Register `BankConnectionsModule` in `apps/backend/src/app.module.ts`**

Add to `imports`.

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections apps/backend/src/app.module.ts
git commit -m "feat: add BankConnection infrastructure (ORM entities and repositories)"
```

---

### Task 4: CasIdIntegrationAdapter + MockCasIdAdapter

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`
- Create: `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`
- Test: `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ICasIdIntegrationAdapter` port + `MockCasIdAdapter` implementation, used by Tasks 5-7's use cases

- [ ] **Step 1: Create `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`**

```typescript
import { AccountIdentity } from '../domain/bank-connection';

export interface CasIdTransaction {
  transactionId: string;
  amount: number;
  transactionDateTime: string;
  counterpartyAccountNumber: string;
  counterpartyName: string;
  transferContent: string;
}

export interface ICasIdIntegrationAdapter {
  createGrantToken(scopes: string[], redirectUri: string): Promise<{ grantToken: string; expiresAt: Date }>;
  exchangeToken(publicToken: string): Promise<{ accessToken: string }>;
  invalidateToken(accessToken: string): Promise<void>;
  getAccountIdentity(accessToken: string): Promise<AccountIdentity>;
  getTransactions(accessToken: string): Promise<CasIdTransaction[]>;
}

export const CAS_ID_INTEGRATION_ADAPTER = Symbol('CAS_ID_INTEGRATION_ADAPTER');

export class CasIdUnauthorizedError extends Error {
  constructor() {
    super('Cas ID access token rejected (401/403) — connection requires reauthorization');
  }
}
```

- [ ] **Step 2: Write failing test for `MockCasIdAdapter`**

Create `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.spec.ts`:

```typescript
import { MockCasIdAdapter } from './mock-cas-id.adapter';
import { CasIdUnauthorizedError } from '../application/cas-id-integration-adapter.port';

describe('MockCasIdAdapter', () => {
  it('creates a grant token that expires 30 minutes from now', async () => {
    const adapter = new MockCasIdAdapter();
    const before = Date.now();
    const { grantToken, expiresAt } = await adapter.createGrantToken(['identity', 'transaction'], 'http://localhost/callback');

    expect(grantToken).toBeDefined();
    expect(expiresAt.getTime()).toBeGreaterThan(before + 29 * 60 * 1000);
  });

  it('exchanges a public token for a fake access token deterministically', async () => {
    const adapter = new MockCasIdAdapter();
    const { accessToken } = await adapter.exchangeToken('mock-public-token');
    expect(accessToken).toContain('mock-access-token-');
  });

  it('returns a fake account identity for any valid-looking access token', async () => {
    const adapter = new MockCasIdAdapter();
    const identity = await adapter.getAccountIdentity('mock-access-token-abc');
    expect(identity.accountNumber).toBeDefined();
    expect(identity.bankName).toBeDefined();
  });

  it('throws CasIdUnauthorizedError when the access token is the reserved "revoked" test value', async () => {
    const adapter = new MockCasIdAdapter();
    await expect(adapter.getAccountIdentity('revoked-token')).rejects.toThrow(CasIdUnauthorizedError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test mock-cas-id.adapter.spec.ts`
Expected: FAIL — Cannot find module './mock-cas-id.adapter'

- [ ] **Step 4: Create `apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CasIdTransaction,
  CasIdUnauthorizedError,
  ICasIdIntegrationAdapter,
} from '../application/cas-id-integration-adapter.port';
import { AccountIdentity } from '../domain/bank-connection';

const GRANT_TOKEN_TTL_MS = 30 * 60 * 1000;

// ponytail: simulates the Cas ID quickstart flow deterministically for demo/test purposes.
// Swap for a real CasIdAdapter (calling the actual Cas ID API) once Developer Portal access
// confirms exact endpoint/response schemas (spec mục 0's own caveat).
@Injectable()
export class MockCasIdAdapter implements ICasIdIntegrationAdapter {
  async createGrantToken(
    _scopes: string[],
    _redirectUri: string,
  ): Promise<{ grantToken: string; expiresAt: Date }> {
    return {
      grantToken: `mock-grant-token-${randomUUID()}`,
      expiresAt: new Date(Date.now() + GRANT_TOKEN_TTL_MS),
    };
  }

  async exchangeToken(_publicToken: string): Promise<{ accessToken: string }> {
    return { accessToken: `mock-access-token-${randomUUID()}` };
  }

  async invalidateToken(_accessToken: string): Promise<void> {
    // no-op in the mock — a real adapter calls POST /grant/invalidate
  }

  async getAccountIdentity(accessToken: string): Promise<AccountIdentity> {
    if (accessToken === 'revoked-token') {
      throw new CasIdUnauthorizedError();
    }
    return { accountNumber: '0011002233', bankName: 'Mock Bank' };
  }

  async getTransactions(accessToken: string): Promise<CasIdTransaction[]> {
    if (accessToken === 'revoked-token') {
      throw new CasIdUnauthorizedError();
    }
    return [];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test mock-cas-id.adapter.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 6: Register the adapter in `bank-connections.module.ts`**

Add to `providers`:

```typescript
{ provide: CAS_ID_INTEGRATION_ADAPTER, useClass: MockCasIdAdapter },
```

(with corresponding imports)

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/bank-connections
git commit -m "feat: add CasIdIntegrationAdapter port and MockCasIdAdapter"
```

---

### Task 5: InitiateConnectionUseCase

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICasIdIntegrationAdapter` (Task 4), `ICasIdConnectionSessionRepository`/`IConnectionAuditEventRepository` (Task 3)
- Produces: `InitiateConnectionUseCase.execute({ userId, redirectUri, bankConnectionId? }): { sessionId, grantToken }`, used by Task 8's controller

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.spec.ts`:

```typescript
import { InitiateConnectionUseCase } from './initiate-connection.usecase';

describe('InitiateConnectionUseCase', () => {
  it('creates a first-connection session without a connection audit row', async () => {
    const adapter = {
      createGrantToken: jest.fn().mockResolvedValue({
        grantToken: 'mock-grant-token-1',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
      exchangeToken: jest.fn(),
      invalidateToken: jest.fn(),
      getAccountIdentity: jest.fn(),
      getTransactions: jest.fn(),
    };
    const sessionRepo = { save: jest.fn(), findById: jest.fn() };
    const bankConnectionRepo = { findById: jest.fn() };
    const auditEventRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new InitiateConnectionUseCase(
      adapter as any,
      sessionRepo as any,
      bankConnectionRepo as any,
      auditEventRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ userId: 'user-1', redirectUri: 'http://localhost/callback' });

    expect(result.grantToken).toBe('mock-grant-token-1');
    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING_AUTHORIZATION',
        organizationId: 'org-1',
        bankConnectionId: null,
      }),
    );
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });

  it('binds a reauthorization session to the existing connection and logs SESSION_CREATED', async () => {
    const adapter = { createGrantToken: jest.fn().mockResolvedValue({ grantToken: 'grant-2', expiresAt: new Date(Date.now() + 1_000) }) };
    const sessionRepo = { save: jest.fn(), findById: jest.fn() };
    const bankConnectionRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'conn-1', status: 'REQUIRES_REAUTHORIZATION' }),
    };
    const auditEventRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const useCase = new InitiateConnectionUseCase(
      adapter as any,
      sessionRepo as any,
      bankConnectionRepo as any,
      auditEventRepo as any,
      tenantContext as any,
    );

    await useCase.execute({
      userId: 'user-1',
      redirectUri: 'http://localhost/callback',
      bankConnectionId: 'conn-1',
    });

    expect(sessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ bankConnectionId: 'conn-1' }));
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ bankConnectionId: 'conn-1', eventType: 'SESSION_CREATED' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test initiate-connection.usecase.spec.ts`
Expected: FAIL — Cannot find module './initiate-connection.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ICasIdIntegrationAdapter,
  CAS_ID_INTEGRATION_ADAPTER,
} from './cas-id-integration-adapter.port';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import {
  ICasIdConnectionSessionRepository,
  CAS_ID_CONNECTION_SESSION_REPOSITORY,
} from './cas-id-connection-session-repository.port';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from './bank-connection-repository.port';
import {
  IConnectionAuditEventRepository,
  CONNECTION_AUDIT_EVENT_REPOSITORY,
} from './connection-audit-event-repository.port';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface InitiateConnectionInput {
  userId: string;
  redirectUri: string;
  bankConnectionId?: string;
}

export interface InitiateConnectionResult {
  sessionId: string;
  grantToken: string;
}

const DEFAULT_SCOPES = ['identity', 'transaction'];

@Injectable()
export class InitiateConnectionUseCase {
  constructor(
    @Inject(CAS_ID_INTEGRATION_ADAPTER) private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(CAS_ID_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepo: ICasIdConnectionSessionRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: InitiateConnectionInput): Promise<InitiateConnectionResult> {
    const existingConnection = input.bankConnectionId
      ? await this.bankConnectionRepo.findById(input.bankConnectionId)
      : null;
    if (input.bankConnectionId && (!existingConnection || existingConnection.status !== 'REQUIRES_REAUTHORIZATION')) {
      throw new Error('Bank connection is not awaiting reauthorization');
    }

    const { grantToken, expiresAt } = await this.adapter.createGrantToken(DEFAULT_SCOPES, input.redirectUri);

    const session = new CasIdConnectionSession({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      initiatedByUserId: input.userId,
      bankConnectionId: existingConnection?.id ?? null,
      grantToken,
      scopes: DEFAULT_SCOPES,
      redirectUri: input.redirectUri,
      status: 'PENDING_AUTHORIZATION',
      expiresAt,
      createdAt: new Date(),
    });

    await this.sessionRepo.save(session);

    if (existingConnection) {
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          bankConnectionId: existingConnection.id,
          eventType: 'SESSION_CREATED',
          metadata: { sessionId: session.id },
          createdAt: new Date(),
        }),
      );
    }

    return { sessionId: session.id, grantToken: session.grantToken };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test initiate-connection.usecase.spec.ts`
Expected: PASS

- [ ] **Step 5: Register `InitiateConnectionUseCase` in `bank-connections.module.ts`**

Add to `providers`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.ts apps/backend/src/modules/bank-connections/application/initiate-connection.usecase.spec.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: add InitiateConnectionUseCase"
```

---

### Task 6: ExchangeTokenUseCase

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICasIdIntegrationAdapter` (Task 4), `encryptToken` (Task 2), `IBankConnectionRepository`/`IConnectionAuditEventRepository` (Task 3)
- Produces: `ExchangeTokenUseCase.execute(sessionId, publicToken)` creating an `ACTIVE` `BankConnection`, used by Task 8's controller

- [ ] **Step 1: Write failing unit test**

Create `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.spec.ts`:

```typescript
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { ExchangeTokenUseCase } from './exchange-token.usecase';

describe('ExchangeTokenUseCase', () => {
  it('exchanges the public token, encrypts the access token, and creates an ACTIVE BankConnection', async () => {
    const session = new CasIdConnectionSession({
      id: 'sess-1',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'mock-grant-token-1',
      scopes: ['identity', 'transaction'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });

    const sessionRepo = { findById: jest.fn().mockResolvedValue(session), save: jest.fn() };
    const adapter = {
      createGrantToken: jest.fn(),
      exchangeToken: jest.fn().mockResolvedValue({ accessToken: 'real-access-token' }),
      invalidateToken: jest.fn(),
      getAccountIdentity: jest.fn().mockResolvedValue({ accountNumber: '0011002233', bankName: 'ABC Bank' }),
      getTransactions: jest.fn(),
    };
    const bankConnectionRepo = { save: jest.fn(), findById: jest.fn(), findByIdUnscoped: jest.fn() };
    const auditEventRepo = { save: jest.fn() };

    process.env.ACCESS_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const useCase = new ExchangeTokenUseCase(
      sessionRepo as any,
      adapter as any,
      bankConnectionRepo as any,
      auditEventRepo as any,
    );

    await useCase.execute({ sessionId: 'sess-1', publicToken: 'public-token-xyz' });

    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', organizationId: 'org-1' }),
    );
    expect(sessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TOKEN_EXCHANGED' }),
    );

    // ensure the raw access token is never stored/logged in plaintext anywhere in the saved connection
    const savedConnection = bankConnectionRepo.save.mock.calls[0][0];
    expect(savedConnection.encryptedAccessToken).not.toBe('real-access-token');
  });

  it('throws when the session is expired', async () => {
    const expiredSession = new CasIdConnectionSession({
      id: 'sess-2',
      organizationId: 'org-1',
      initiatedByUserId: 'user-1',
      bankConnectionId: null,
      grantToken: 'mock-grant-token-2',
      scopes: ['identity'],
      redirectUri: 'http://localhost/callback',
      status: 'PENDING_AUTHORIZATION',
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
    });
    const sessionRepo = { findById: jest.fn().mockResolvedValue(expiredSession), save: jest.fn() };

    const useCase = new ExchangeTokenUseCase(sessionRepo as any, {} as any, {} as any, {} as any);

    await expect(useCase.execute({ sessionId: 'sess-2', publicToken: 'x' })).rejects.toThrow(
      'Connection session expired',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test exchange-token.usecase.spec.ts`
Expected: FAIL — Cannot find module './exchange-token.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ICasIdConnectionSessionRepository,
  CAS_ID_CONNECTION_SESSION_REPOSITORY,
} from './cas-id-connection-session-repository.port';
import {
  ICasIdIntegrationAdapter,
  CAS_ID_INTEGRATION_ADAPTER,
} from './cas-id-integration-adapter.port';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from './bank-connection-repository.port';
import {
  IConnectionAuditEventRepository,
  CONNECTION_AUDIT_EVENT_REPOSITORY,
} from './connection-audit-event-repository.port';
import { BankConnection } from '../domain/bank-connection';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { encryptToken } from './token-encryption';

export interface ExchangeTokenInput {
  sessionId: string;
  publicToken: string;
}

@Injectable()
export class ExchangeTokenUseCase {
  constructor(
    @Inject(CAS_ID_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepo: ICasIdConnectionSessionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER) private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
  ) {}

  async execute(input: ExchangeTokenInput): Promise<BankConnection> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!session) {
      throw new Error('Connection session not found');
    }
    if (session.isExpired(new Date())) {
      throw new Error('Connection session expired');
    }

    const { accessToken } = await this.adapter.exchangeToken(input.publicToken);
    const accountIdentity = await this.adapter.getAccountIdentity(accessToken);

    const encryptedAccessToken = encryptToken(accessToken);
    const existingConnection = session.bankConnectionId
      ? await this.bankConnectionRepo.findById(session.bankConnectionId)
      : null;
    if (session.bankConnectionId && (!existingConnection || existingConnection.status !== 'REQUIRES_REAUTHORIZATION')) {
      throw new Error('Bank connection is not awaiting reauthorization');
    }

    const connection = existingConnection
      ? existingConnection.reactivate({
          casIdConnectionSessionId: session.id,
          encryptedAccessToken,
          accountIdentity,
          scopes: session.scopes,
        })
      : new BankConnection({
          id: randomUUID(),
          organizationId: session.organizationId,
          casIdConnectionSessionId: session.id,
          encryptedAccessToken,
          accountIdentity,
          status: 'ACTIVE',
          scopes: session.scopes,
          connectedAt: new Date(),
          lastSyncAt: null,
          revokedAt: null,
          createdAt: new Date(),
        });

    await this.bankConnectionRepo.save(connection);
    await this.sessionRepo.save(session.markCompleted());
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connection.id,
        eventType: existingConnection ? 'RECONNECTED' : 'TOKEN_EXCHANGED',
        metadata: { accountNumber: accountIdentity.accountNumber },
        createdAt: new Date(),
      }),
    );

    return connection;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test exchange-token.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Register `ExchangeTokenUseCase` in `bank-connections.module.ts`**

Add to `providers`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-connections/application/exchange-token.usecase.ts apps/backend/src/modules/bank-connections/application/exchange-token.usecase.spec.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts
git commit -m "feat: add ExchangeTokenUseCase creating an ACTIVE BankConnection with encrypted token"
```

---

### Task 7: DisconnectConnectionUseCase + MarkRequiresReauthorizationUseCase

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.spec.ts`
- Create: `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`

**Interfaces:**
- Consumes: `IBankConnectionRepository`/`IConnectionAuditEventRepository` (Task 3), `ICasIdIntegrationAdapter` (Task 4)
- Produces: `DisconnectConnectionUseCase.execute(connectionId)`, `MarkRequiresReauthorizationUseCase.execute(connectionId, reason)` — the latter is the lazy-detection entry point called whenever ANY future adapter call throws `CasIdUnauthorizedError` (documented for the future `getTransactions` pull-path and reused by Task 8's webhook pre-check flow)

- [ ] **Step 1: Create `apps/backend/src/modules/bank-connections/application/disconnect-connection.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from './bank-connection-repository.port';
import {
  ICasIdIntegrationAdapter,
  CAS_ID_INTEGRATION_ADAPTER,
} from './cas-id-integration-adapter.port';
import {
  IConnectionAuditEventRepository,
  CONNECTION_AUDIT_EVENT_REPOSITORY,
} from './connection-audit-event-repository.port';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { decryptToken } from './token-encryption';
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';

@Injectable()
export class DisconnectConnectionUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CAS_ID_INTEGRATION_ADAPTER) private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
  ) {}

  async execute(connectionId: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findById(connectionId);
    if (!connection) {
      throw new Error('Bank connection not found');
    }

    try {
      await this.adapter.invalidateToken(decryptToken(connection.encryptedAccessToken));
    } catch (error) {
      if (error instanceof CasIdUnauthorizedError) {
        await this.markRequiresReauthorization.execute(connectionId, '401/403 from invalidateToken');
      }
      throw error;
    }
    await this.bankConnectionRepo.save(connection.disconnect());
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connection.id,
        eventType: 'DISCONNECTED',
        metadata: {},
        createdAt: new Date(),
      }),
    );
  }
}
```

- [ ] **Step 1b: Test disconnect failure marks reauthorization and rethrows**

```typescript
import { BankConnection } from '../domain/bank-connection';

it('marks REQUIRES_REAUTHORIZATION when invalidateToken returns 401/403, then rethrows', async () => {
  const connection = new BankConnection({
    id: 'conn-1', organizationId: 'org-1', casIdConnectionSessionId: 'sess-1',
    encryptedAccessToken: encryptToken('access-token'),
    accountIdentity: { accountNumber: '0011002233', bankName: 'ABC' }, status: 'ACTIVE',
    scopes: ['identity'], connectedAt: new Date(), lastSyncAt: null, revokedAt: null, createdAt: new Date(),
  });
  const markRequiresReauthorization = { execute: jest.fn() };
  const useCase = new DisconnectConnectionUseCase(
    { findById: jest.fn().mockResolvedValue(connection), save: jest.fn() } as any,
    { invalidateToken: jest.fn().mockRejectedValue(new CasIdUnauthorizedError()) } as any,
    { save: jest.fn() } as any,
    markRequiresReauthorization as any,
  );

  await expect(useCase.execute(connection.id)).rejects.toThrow(CasIdUnauthorizedError);
  expect(markRequiresReauthorization.execute).toHaveBeenCalledWith(connection.id, '401/403 from invalidateToken');
});
```

- [ ] **Step 2: Write failing test for `MarkRequiresReauthorizationUseCase`**

Create `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.spec.ts`:

```typescript
import { BankConnection } from '../domain/bank-connection';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';

describe('MarkRequiresReauthorizationUseCase', () => {
  it('marks an ACTIVE connection as REQUIRES_REAUTHORIZATION and logs the event', async () => {
    const connection = new BankConnection({
      id: 'conn-1',
      organizationId: 'org-1',
      casIdConnectionSessionId: 'sess-1',
      encryptedAccessToken: 'encrypted',
      accountIdentity: { accountNumber: '0011002233', bankName: 'ABC' },
      status: 'ACTIVE',
      scopes: ['identity'],
      connectedAt: new Date(),
      lastSyncAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });

    const bankConnectionRepo = { findByIdUnscoped: jest.fn().mockResolvedValue(connection), save: jest.fn(), findById: jest.fn() };
    const auditEventRepo = { save: jest.fn() };

    const useCase = new MarkRequiresReauthorizationUseCase(bankConnectionRepo as any, auditEventRepo as any);
    await useCase.execute('conn-1', '401 from getTransactions');

    expect(bankConnectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REQUIRES_REAUTHORIZATION' }),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MARKED_REQUIRES_REAUTH', metadata: { reason: '401 from getTransactions' } }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test mark-requires-reauthorization.usecase.spec.ts`
Expected: FAIL — Cannot find module './mark-requires-reauthorization.usecase'

- [ ] **Step 4: Create `apps/backend/src/modules/bank-connections/application/mark-requires-reauthorization.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from './bank-connection-repository.port';
import {
  IConnectionAuditEventRepository,
  CONNECTION_AUDIT_EVENT_REPOSITORY,
} from './connection-audit-event-repository.port';
import { ConnectionAuditEvent } from '../domain/connection-audit-event';

@Injectable()
export class MarkRequiresReauthorizationUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
  ) {}

  async execute(connectionId: string, reason: string): Promise<void> {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) {
      return;
    }

    if (connection.status === 'ACTIVE') {
      await this.bankConnectionRepo.save(connection.markRequiresReauthorization());
    }
    await this.auditEventRepo.save(
      new ConnectionAuditEvent({
        id: randomUUID(),
        bankConnectionId: connectionId,
        eventType: connection.status === 'ACTIVE' ? 'MARKED_REQUIRES_REAUTH' : 'API_CALL_FAILED_401',
        metadata: { reason },
        createdAt: new Date(),
      }),
    );
  }
}
```

Uses `findByIdUnscoped` deliberately: this use case is designed to be callable from contexts with no tenant scope yet resolved (e.g., a future scheduled `getTransactions` pull-path running per-connection, not per-request) — the spec's "notification to Owner" (mục 3) is intentionally NOT implemented here; flagged in Self-Review as relying on the Reminder/Notification infrastructure from a different plan.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test mark-requires-reauthorization.usecase.spec.ts`
Expected: PASS

- [ ] **Step 6: Register both use cases in `bank-connections.module.ts`**

Add `DisconnectConnectionUseCase`, `MarkRequiresReauthorizationUseCase` to `providers` and `exports` (the latter needs exporting since the Webhook module, a sibling module, will call it in Task 8).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-connections
git commit -m "feat: add DisconnectConnectionUseCase and MarkRequiresReauthorizationUseCase"
```

---

### Task 7b: Concrete lazy-revocation caller — `SyncTransactionsUseCase`

**Files:**
- Create: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/sync-transactions.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

**Interfaces:**
- Consumes: `ICasIdIntegrationAdapter.getTransactions`, `IBankConnectionRepository.findByIdUnscoped`, `MarkRequiresReauthorizationUseCase`, and `decryptToken`
- Produces: the concrete access-token caller that marks a connection on Cas ID 401/403 and rethrows the original error; it does not create a polling scheduler.

- [ ] **Step 1: Write the caller test**

```typescript
import { CasIdUnauthorizedError } from './cas-id-integration-adapter.port';
import { SyncTransactionsUseCase } from './sync-transactions.usecase';

it('marks the connection on Cas ID 401/403 and rethrows the unauthorized error', async () => {
  const adapter = { getTransactions: jest.fn().mockRejectedValue(new CasIdUnauthorizedError()) };
  const bankConnectionRepo = {
    findByIdUnscoped: jest.fn().mockResolvedValue({
      id: 'conn-1',
      encryptedAccessToken: 'encrypted-token',
      organizationId: 'org-1',
    }),
  };
  const markRequiresReauthorization = { execute: jest.fn().mockResolvedValue(undefined) };
  const useCase = new SyncTransactionsUseCase(
    adapter as any,
    bankConnectionRepo as any,
    markRequiresReauthorization as any,
  );

  await expect(useCase.execute('conn-1')).rejects.toThrow(CasIdUnauthorizedError);
  expect(markRequiresReauthorization.execute).toHaveBeenCalledWith(
    'conn-1',
    '401/403 from getTransactions',
  );
});
```

- [ ] **Step 2: Implement the caller**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  CasIdUnauthorizedError,
  CAS_ID_INTEGRATION_ADAPTER,
  ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import { BANK_CONNECTION_REPOSITORY, IBankConnectionRepository } from './bank-connection-repository.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';

@Injectable()
export class SyncTransactionsUseCase {
  constructor(
    @Inject(CAS_ID_INTEGRATION_ADAPTER) private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
  ) {}

  async execute(connectionId: string) {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) {
      throw new Error('Bank connection not found');
    }

    try {
      return await this.adapter.getTransactions(decryptToken(connection.encryptedAccessToken));
    } catch (error) {
      if (error instanceof CasIdUnauthorizedError) {
        await this.markRequiresReauthorization.execute(connectionId, '401/403 from getTransactions');
      }
      throw error;
    }
  }
}
```

Register the use case in `BankConnectionsModule`. `DisconnectConnectionUseCase` uses the same catch/mark/rethrow contract around `invalidateToken`; `ExchangeTokenUseCase` is not an existing-token caller because it exchanges a one-time public token.

---

### Task 8: Controller endpoints + webhook pre-check integration

**Files:**
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/initiate-connection.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/exchange-token.dto.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `InitiateConnectionUseCase`/`ExchangeTokenUseCase`/`DisconnectConnectionUseCase` (Tasks 5-7)
- Produces: `POST /bank-connections/cas-id/initiate`, `POST /bank-connections/cas-id/sessions/:id/exchange`, `POST /bank-connections/:id/disconnect`; and the Webhook Controller now checks `BankConnection.status` before enqueueing

- [ ] **Step 1: Create DTOs**

`apps/backend/src/modules/bank-connections/presentation/dto/initiate-connection.dto.ts`:

```typescript
import { IsOptional, IsUUID, IsUrl } from 'class-validator';

export class InitiateConnectionDto {
  @IsUrl({ require_tld: false })
  redirectUri: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
```

`apps/backend/src/modules/bank-connections/presentation/dto/exchange-token.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class ExchangeTokenDto {
  @IsString()
  publicToken: string;
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`**

```typescript
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InitiateConnectionUseCase } from '../application/initiate-connection.usecase';
import { ExchangeTokenUseCase } from '../application/exchange-token.usecase';
import { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import { InitiateConnectionDto } from './dto/initiate-connection.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('bank-connections')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly initiateConnectionUseCase: InitiateConnectionUseCase,
    private readonly exchangeTokenUseCase: ExchangeTokenUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
  ) {}

  @Post('cas-id/initiate')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async initiate(@Body() dto: InitiateConnectionDto, @Req() req: Request) {
    const userId = (req.user as { userId: string }).userId;
    return this.initiateConnectionUseCase.execute({
      userId,
      redirectUri: dto.redirectUri,
      bankConnectionId: dto.bankConnectionId,
    });
  }

  @Post('cas-id/sessions/:id/exchange')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async exchange(@Param('id') sessionId: string, @Body() dto: ExchangeTokenDto) {
    const connection = await this.exchangeTokenUseCase.execute({
      sessionId,
      publicToken: dto.publicToken,
    });
    return { connectionId: connection.id, status: connection.status };
  }

  @Post(':id/disconnect')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async disconnect(@Param('id') id: string) {
    await this.disconnectConnectionUseCase.execute(id);
    return { success: true };
  }
}
```

- [ ] **Step 3: Register controller in `bank-connections.module.ts`**

Add `BankConnectionsController` to `controllers`.

- [ ] **Step 4: Modify the Webhook Controller to check connection status before enqueueing**

Modify `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts` — inject `IBankConnectionRepository` and short-circuit before the `queue.add(...)` call:

```typescript
import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { WebhookAuthGuard } from './webhook-auth.guard';
import {
  IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
  DuplicateWebhookError,
} from '../application/webhook-inbox-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WEBHOOK_PROCESSING_QUEUE } from '../infrastructure/webhooks-queue.constants';
import {
  IBankConnectionRepository,
  BANK_CONNECTION_REPOSITORY,
} from '../../bank-connections/application/bank-connection-repository.port';

interface BalanceHookPayload {
  organizationId?: string;
  bankConnectionId: string;
  transactionId: string;
  [key: string]: unknown;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY) private readonly webhookInboxRepo: IWebhookInboxRepository,
    @Inject(BANK_CONNECTION_REPOSITORY) private readonly bankConnectionRepo: IBankConnectionRepository,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('casso-balance-hook')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(200)
  async receiveBalanceHook(@Body() payload: BalanceHookPayload, @Req() req: Request) {
    const connection = await this.bankConnectionRepo.findByIdUnscoped(payload.bankConnectionId);
    if (!connection || !connection.isUsable()) {
      return { received: true, ignored: true, reason: 'bank connection not ACTIVE' };
    }
    if (payload.organizationId && payload.organizationId !== connection.organizationId) {
      throw new BadRequestException('Webhook organization does not match bank connection');
    }

    const inbox = new WebhookInbox({
      id: randomUUID(),
      organizationId: connection.organizationId,
      providerTransactionId: payload.transactionId,
      rawPayload: payload as unknown as Record<string, unknown>,
      receivedAt: new Date(),
      status: 'RECEIVED',
      processedAt: null,
      errorMessage: null,
      retryCount: 0,
    });

    try {
      await this.webhookInboxRepo.insert(inbox);
    } catch (error) {
      if (error instanceof DuplicateWebhookError) {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    await this.queue.add(
      'process-webhook',
      { webhookInboxId: inbox.id, organizationId: inbox.organizationId, bankConnectionId: connection.id },
      { jobId: payload.transactionId, attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { received: true, duplicate: false };
  }
}
```

- [ ] **Step 5: Import `BankConnectionsModule` in `webhooks.module.ts`**

Add `BankConnectionsModule` to `imports` (already exports `BANK_CONNECTION_REPOSITORY` from Task 3 Step 4).

- [ ] **Step 6: Register `BankConnectionsModule` in `apps/backend/src/app.module.ts`** (if not already present from Task 3 Step 5 — confirm it's there)

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/bank-connections apps/backend/src/modules/webhooks apps/backend/src/app.module.ts
git commit -m "feat: add bank connection endpoints, gate webhook ingestion on connection status"
```

---

### Task 9: Integration test — full connection flow + webhook rejection when not ACTIVE

**Files:**
- Create: `apps/backend/test/cas-id-connection-flow.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-8), real Postgres via testcontainers
- Produces: verified proof that (a) initiate → exchange produces an `ACTIVE` `BankConnection` with an encrypted token in the DB, and (b) a webhook for a `DISCONNECTED` connection is ignored without creating a `WebhookInbox` row

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/cas-id-connection-flow.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BankConnectionOrmEntity } from '../src/modules/bank-connections/infrastructure/bank-connection.orm-entity';

describe('Cas ID connection flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-000000000020';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function ownerToken(): string {
    return jwtService.sign({ userId: 'user-1', organizationId, role: 'OWNER' });
  }

  it('initiate -> exchange creates an ACTIVE BankConnection with an encrypted access token', async () => {
    const token = ownerToken();

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/bank-connections/cas-id/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ redirectUri: 'http://localhost:3000/bank-connections/cas-id/callback' })
      .expect(201);

    const { sessionId } = initiateRes.body;
    expect(sessionId).toBeDefined();

    const exchangeRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-connections/cas-id/sessions/${sessionId}/exchange`)
      .set('Authorization', `Bearer ${token}`)
      .send({ publicToken: 'mock-public-token-xyz' })
      .expect(201);

    expect(exchangeRes.body.status).toBe('ACTIVE');

    const row = await dataSource.getRepository(BankConnectionOrmEntity).findOne({
      where: { id: exchangeRes.body.connectionId },
    });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.encryptedAccessToken).not.toContain('mock-access-token-'); // stored value is ciphertext, not the raw mock token
  });

  it('webhook is ignored (not enqueued) when the referenced BankConnection is not ACTIVE', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('x-client-id', process.env.CASSO_WEBHOOK_CLIENT_ID ?? 'dev-client-id')
      .set('x-secret-key', process.env.CASSO_WEBHOOK_SECRET_KEY ?? 'dev-secret-key-change-me')
      .send({
        organizationId,
        bankConnectionId: '00000000-0000-0000-0000-000000000099', // does not exist
        transactionId: 'TX-IGNORED-001',
        amount: 1_000_000,
        transactionDateTime: '2026-08-01T00:00:00.000Z',
        counterpartyAccountNumber: '0000000000',
        counterpartyName: 'X',
        transferContent: 'x',
      })
      .expect(200)
      .expect((res) => {
        if (!res.body.ignored) throw new Error('expected webhook to be ignored');
      });

    const rows = await dataSource.query(
      'SELECT COUNT(*) FROM webhook_inbox WHERE "providerTransactionId" = $1',
      ['TX-IGNORED-001'],
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- cas-id-connection-flow.integration.spec.ts`
Expected: both tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/cas-id-connection-flow.integration.spec.ts
git commit -m "test: add integration test for Cas ID connection flow and webhook connection-status gate"
```

---

## Self-Review Notes

- **Spec coverage:** Adapter interface + Mock implementation (mục 1) → Task 4. Connection flow steps 1-8 (mục 1) → Tasks 5-6, Task 9. 3 entities (mục 2) → Task 1, Task 3. Status transitions + lazy revocation detection (mục 3) → Task 1 (domain methods), Task 7/7b (audit-backed marking and concrete adapter callers), Task 8 (webhook pre-check). Encryption at rest (mục 2) → Task 2.
- **Known gap, intentionally deferred:** Spec mục 3 says "Cảnh báo Organization Owner qua notification khi status đổi khỏi ACTIVE" — not implemented in this plan because no notification infrastructure plan exists yet; `MarkRequiresReauthorizationUseCase` (Task 7) only writes the `ConnectionAuditEvent` and flips status. Whichever plan builds the Email/Notification Service should add a call from this use case once that infrastructure exists.
- **Not covered in this plan (by design):** Real `CasIdAdapter` calling the actual Cas ID API — spec's own mục 4 defers this until Developer Portal access confirms schemas; `getTransactions` is defined on the port but has no caller yet (Balance Hook webhook is the primary transaction source per the Webhook & Matching Engine plan — `getTransactions` exists for a possible future pull-based reconciliation, out of scope here).
- **Type consistency checked:** `AccountIdentity` (Task 1) is the same type returned by `MockCasIdAdapter.getAccountIdentity` (Task 4) and stored on `BankConnection.accountIdentity`. `CasIdConnectionSession.bankConnectionId` is nullable for first connection and required for reauth. `IBankConnectionRepository.findByIdUnscoped` (Task 3) is used consistently by the Webhook Controller (Task 8), `MarkRequiresReauthorizationUseCase` (Task 7), and `SyncTransactionsUseCase` (Task 7b) — all are designed for contexts without a resolved request tenant.
- **Audit and re-auth invariants:** initial connection writes `TOKEN_EXCHANGED`; re-auth writes `SESSION_CREATED` then `RECONNECTED` against the same connection id; lazy 401/403 writes `MARKED_REQUIRES_REAUTH` once and `API_CALL_FAILED_401` on repeated failures; disconnect writes `DISCONNECTED`. The audit repository is insert-only, and all token-related metadata remains redacted/non-secret.


