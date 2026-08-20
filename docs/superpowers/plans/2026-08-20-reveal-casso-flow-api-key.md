# Reveal Casso Flow API Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `OWNER`/`FINANCE_MANAGER` reveal the full plaintext Casso Flow API Key for an authorization, gated by re-entering their own account password, rate-limited, and audit-logged.

**Architecture:** One new use case (`RevealCassoFlowApiKeyUseCase`) decrypts the already-stored `CassoFlowAuthorization.encryptedApiKey` after verifying the requesting user's password via the existing `auth` module's `comparePassword`, then fans out a `ConnectionAuditEvent` (`API_KEY_REVEALED`) per `BankConnection` under that authorization — mirroring the existing `API_KEY_ROTATED` pattern exactly. One new controller endpoint wires it up behind a new `BANK_CONNECTION_REVEAL_KEY` permission, `@Throttle`, and the existing `@Audited`/`IdempotencyService` machinery. Frontend adds a password-gated reveal dialog next to the existing "Đổi API Key" button.

**Tech Stack:** NestJS 11 / TypeORM (backend), React 19 + TanStack Query + shadcn/ui (frontend), Jest (backend tests), Vitest + Testing Library (frontend tests).

**Spec:** `docs/superpowers/specs/2026-08-20-reveal-casso-flow-api-key-design.md`

## Global Constraints

- Money/tenant/transaction rules from `AGENTS.md` apply project-wide but this feature touches none of them directly (no money field, and `findById` on `CassoFlowAuthorization` is already tenant-scoped internally).
- No masked/partial key display anywhere — full plaintext only, per ADR 0023.
- No new `ConnectionAuditEvent` schema field — reveal events fan out per-`BankConnection`, matching `API_KEY_ROTATED`.
- Every reveal re-checks the password; no session-level skip.
- Vietnamese user-facing error messages, matching every other message in this module.
- `import type` for pure types; value imports for anything used in a constructor param/decorator (NestJS DI).

---

### Task 1: `BANK_CONNECTION_REVEAL_KEY` permission

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Modify: `packages/shared-types/src/role-permissions.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts`

**Interfaces:**
- Produces: `Permission.BANK_CONNECTION_REVEAL_KEY`, granted to `Role.OWNER` (already gets every permission) and `Role.FINANCE_MANAGER`.

- [ ] **Step 1: Write the failing test**

Add to `packages/shared-types/src/role-permissions.spec.ts` (inside the existing `describe('ROLE_PERMISSIONS', ...)` block, following the existing assertion style in that file):

```typescript
  it('grants BANK_CONNECTION_REVEAL_KEY to OWNER and FINANCE_MANAGER only', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared-types && npx jest role-permissions.spec.ts`
Expected: FAIL — `Permission.BANK_CONNECTION_REVEAL_KEY` is `undefined` (property doesn't exist on the enum).

- [ ] **Step 3: Add the permission and grant it**

In `packages/shared-types/src/permission.ts`, add one line to the enum (after `BANK_CONNECTION_MANAGE`):

```typescript
  BANK_CONNECTION_MANAGE = 'BANK_CONNECTION_MANAGE',
  BANK_CONNECTION_REVEAL_KEY = 'BANK_CONNECTION_REVEAL_KEY',
```

In `packages/shared-types/src/role-permissions.ts`, add one line to `ROLE_PERMISSIONS[Role.FINANCE_MANAGER]` (after `Permission.CUSTOMER_BANK_ACCOUNT_MANAGE`):

```typescript
    Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    Permission.BANK_CONNECTION_REVEAL_KEY,
```

`Role.OWNER` needs no change — it already gets `Object.values(Permission)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared-types && npx jest role-permissions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/permission.ts packages/shared-types/src/role-permissions.ts packages/shared-types/src/role-permissions.spec.ts
git commit -m "feat: add BANK_CONNECTION_REVEAL_KEY permission for OWNER/FINANCE_MANAGER"
```

---

### Task 2: `RevealCassoFlowApiKeyUseCase`

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`
- Create: `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts`
- Test: `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICassoFlowAuthorizationRepository.findById(id): Promise<CassoFlowAuthorization | null>` (`casso-flow-authorization-repository.port.ts`); `IBankConnectionRepository.findByAuthorizationId(cassoFlowAuthorizationId): Promise<BankConnection[]>` (`bank-connection-repository.port.ts`); `IUserRepository.findById(id): Promise<User | null>` (`../../users/application/user-repository.port.ts`); `comparePassword(plainPassword, passwordHash): Promise<boolean>` (`../../auth/application/password-hasher.ts`); `IConnectionAuditEventRepository.save(event): Promise<void>` (`connection-audit-event-repository.port.ts`); `decryptToken(value, encryptionKey): string` (`token-encryption.ts`); `ACCESS_TOKEN_ENCRYPTION_KEY` DI token (`token-encryption-key.ts`).
- Produces: `RevealCassoFlowApiKeyUseCase.execute(input: RevealCassoFlowApiKeyInput): Promise<RevealCassoFlowApiKeyResult>` where `RevealCassoFlowApiKeyInput = { organizationId: string; cassoFlowAuthorizationId: string; userId: string; password: string }` and `RevealCassoFlowApiKeyResult = { apiKey: string }`. Consumed by Task 3's controller.

- [ ] **Step 1: Add `'API_KEY_REVEALED'` to the domain audit event type**

In `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`, extend the union (no other change to the file):

```typescript
export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'API_CALL_FAILED'
  | 'MARKED_REQUIRES_REAUTH'
  | 'MARKED_ERROR'
  | 'RECONNECTED'
  | 'DISCONNECTED'
  | 'API_KEY_ROTATED'
  | 'API_KEY_REVEALED';
```

This is a pure type-level addition (no behavior to unit test in isolation) — its behavior is proven by Step 2's failing test below, which asserts a `ConnectionAuditEvent` gets constructed with this exact `eventType`.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.spec.ts`:

```typescript
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { hashPassword } from '../../auth/application/password-hasher';
import { BankConnection } from '../domain/bank-connection';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { RevealCassoFlowApiKeyUseCase } from './reveal-casso-flow-api-key.usecase';
import { encryptToken } from './token-encryption';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function buildAuthorization(): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: 'biz-1',
    encryptedApiKey: encryptToken('AK_CS.real-key', encryptionKey),
    encryptedSecureToken: encryptToken('secret', encryptionKey),
    createdAt: new Date(),
  });
}

function buildConnection(id: string): BankConnection {
  return new BankConnection({
    id,
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: `acc-${id}`,
    bankName: 'Casso Bank',
    accountHolderName: 'NGUYEN VAN A',
    status: 'ACTIVE',
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

async function buildDeps(
  overrides: {
    authorization?: CassoFlowAuthorization | null;
    connections?: BankConnection[];
    userPassword?: string;
    user?: { passwordHash: string } | null;
  } = {},
) {
  const authorizationRepo = {
    findById: jest.fn().mockResolvedValue(
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
  const userRepo = {
    findById: jest.fn().mockResolvedValue(
      overrides.user === undefined
        ? { passwordHash: await hashPassword(overrides.userPassword ?? 'correct') }
        : overrides.user,
    ),
  };
  const auditEventRepo = { save: jest.fn().mockResolvedValue(undefined) };

  const useCase = new RevealCassoFlowApiKeyUseCase(
    // biome-ignore lint: test doubles satisfy the port shape structurally
    authorizationRepo as never,
    bankConnectionRepo as never,
    userRepo as never,
    auditEventRepo as never,
    encryptionKey,
  );

  return { useCase, authorizationRepo, bankConnectionRepo, userRepo, auditEventRepo };
}

describe('RevealCassoFlowApiKeyUseCase', () => {
  it('throws NOT_FOUND when the authorization does not exist', async () => {
    const { useCase } = await buildDeps({ authorization: null });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        userId: 'user-1',
        password: 'secret',
      }),
    ).rejects.toThrow(AppError);
  });

  it('throws UNAUTHORIZED when the password does not match', async () => {
    const { useCase } = await buildDeps({ userPassword: 'correct' });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        cassoFlowAuthorizationId: 'auth-1',
        userId: 'user-1',
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.UNAUTHORIZED });
  });

  it('returns the decrypted key and writes one audit event per connection on success', async () => {
    const { useCase, auditEventRepo } = await buildDeps({
      connections: [buildConnection('conn-1'), buildConnection('conn-2')],
      userPassword: 'correct',
    });

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      userId: 'user-1',
      password: 'correct',
    });

    expect(result.apiKey).toBe('AK_CS.real-key');
    expect(auditEventRepo.save).toHaveBeenCalledTimes(2);
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_KEY_REVEALED', bankConnectionId: 'conn-1' }),
    );
    expect(auditEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'API_KEY_REVEALED', bankConnectionId: 'conn-2' }),
    );
  });

  it('returns the key with zero audit writes when the authorization has no connections', async () => {
    const { useCase, auditEventRepo } = await buildDeps({
      connections: [],
      userPassword: 'correct',
    });

    const result = await useCase.execute({
      organizationId: 'org-1',
      cassoFlowAuthorizationId: 'auth-1',
      userId: 'user-1',
      password: 'correct',
    });

    expect(result.apiKey).toBe('AK_CS.real-key');
    expect(auditEventRepo.save).not.toHaveBeenCalled();
  });
});
```

Note: `comparePassword` is called directly from `password-hasher.ts` inside the use case (like `decryptToken`/`encryptToken` — a stateless function, not a DI token), so this test exercises the real `bcryptjs` compare against a real hash produced by `hashPassword`, rather than mocking it. This avoids a real DI bug an earlier draft of this plan had: passing `comparePassword` as an injectable constructor parameter with a JS default value does not work under Nest's DI, because Nest resolves every constructor parameter by its `design:paramtypes` metadata (a function-typed parameter erases to the `Function` token at runtime) and throws "cannot resolve dependency" at bootstrap since no provider is registered for that token — the default value is never reached unless the parameter also carries `@Optional()`, which adds complexity this feature doesn't need.

- [ ] **Step 2b: Run test to verify it fails**

Run: `cd apps/backend && npx jest reveal-casso-flow-api-key.usecase.spec.ts`
Expected: FAIL — cannot find module `./reveal-casso-flow-api-key.usecase`.

- [ ] **Step 3: Implement `RevealCassoFlowApiKeyUseCase`**

Create `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { comparePassword } from '../../auth/application/password-hasher';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../users/application/user-repository.port';
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
import { ConnectionAuditEvent } from '../domain/connection-audit-event';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

export interface RevealCassoFlowApiKeyInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  userId: string;
  password: string;
}

export interface RevealCassoFlowApiKeyResult {
  apiKey: string;
}

@Injectable()
export class RevealCassoFlowApiKeyUseCase {
  constructor(
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
  ) {}

  async execute(
    input: RevealCassoFlowApiKeyInput,
  ): Promise<RevealCassoFlowApiKeyResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Mật khẩu không đúng.');
    }

    const apiKey = decryptToken(
      authorization.encryptedApiKey,
      this.encryptionKey,
    );

    const connections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    const now = new Date();
    for (const connection of connections) {
      await this.auditEventRepo.save(
        new ConnectionAuditEvent({
          id: randomUUID(),
          organizationId: input.organizationId,
          bankConnectionId: connection.id,
          eventType: 'API_KEY_REVEALED',
          metadata: { revealedByUserId: input.userId },
          createdAt: now,
        }),
      );
    }

    return { apiKey };
  }
}
```

`comparePassword` is imported directly from `password-hasher.ts` and called as a plain function — the same pattern already used for `decryptToken`/`encryptToken` in this same use case, and matching `AGENTS.md`'s rule that `bcryptjs` (and functions built on it) may be used directly without DI.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest reveal-casso-flow-api-key.usecase.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.spec.ts
git commit -m "feat: add RevealCassoFlowApiKeyUseCase"
```

---

### Task 3: Controller endpoint + module wiring

**Files:**
- Modify: `apps/backend/src/common/audit/audit.enums.ts`
- Create: `apps/backend/src/modules/bank-connections/presentation/dto/reveal-casso-flow-api-key.dto.ts`
- Modify: `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`
- Modify: `apps/backend/src/modules/bank-connections/bank-connections.module.ts`
- Test: `apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts`

**Interfaces:**
- Consumes: `RevealCassoFlowApiKeyUseCase` (Task 2); `AuthRequest` type (`../../../common/auth/assert-org-matches.ts`, `request.user.userId`); `IdempotencyService.execute(key, idempotencyKey, dto, callback)`.
- Produces: `POST /api/v1/bank-connections/authorizations/:id/reveal-key` → `{ apiKey: string }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts`, inside the existing `describe` block, following the file's existing style (after the `rotate` case):

```typescript
  it('audits API key reveal as BANK_CONNECTION_API_KEY_REVEAL', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      BankConnectionsController.prototype.revealApiKey,
    );
    expect(metadata).toEqual({
      actionType: 'BANK_CONNECTION_API_KEY_REVEAL',
      entityType: 'CassoFlowAuthorization',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest audited-metadata.spec.ts`
Expected: FAIL — `BankConnectionsController.prototype.revealApiKey` is `undefined`.

- [ ] **Step 3: Add the audit action type**

In `apps/backend/src/common/audit/audit.enums.ts`, add one line to `AuditActionType` (after `BANK_CONNECTION_API_KEY_ROTATE`):

```typescript
  BANK_CONNECTION_API_KEY_ROTATE = 'BANK_CONNECTION_API_KEY_ROTATE',
  BANK_CONNECTION_API_KEY_REVEAL = 'BANK_CONNECTION_API_KEY_REVEAL',
```

- [ ] **Step 4: Add the DTOs**

Create `apps/backend/src/modules/bank-connections/presentation/dto/reveal-casso-flow-api-key.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RevealCassoFlowApiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;
}

export class RevealCassoFlowApiKeyResponseDto {
  @ApiProperty()
  apiKey: string;
}
```

- [ ] **Step 5: Add the controller endpoint**

In `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`:

Add to the imports:

```typescript
import { Throttle } from '@nestjs/throttler';
import { type AuthRequest } from '../../../common/auth/assert-org-matches';
import { RevealCassoFlowApiKeyUseCase } from '../application/reveal-casso-flow-api-key.usecase';
import {
  RevealCassoFlowApiKeyDto,
  RevealCassoFlowApiKeyResponseDto,
} from './dto/reveal-casso-flow-api-key.dto';
```

Add `Req` to the existing `@nestjs/common` import list.

Add a constructor parameter (after `rotateCassoFlowAuthorizationUseCase`):

```typescript
    private readonly revealCassoFlowApiKeyUseCase: RevealCassoFlowApiKeyUseCase,
```

Add the handler, right after `rotate()` and before `disconnect()`:

```typescript
  @Post('authorizations/:id/reveal-key')
  @ApiOperation({ summary: "Reveal one CassoFlowAuthorization's full API Key" })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: RevealCassoFlowApiKeyResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequirePermission(Permission.BANK_CONNECTION_REVEAL_KEY)
  @Audited(
    AuditActionType.BANK_CONNECTION_API_KEY_REVEAL,
    AuditEntityType.CASSO_FLOW_AUTHORIZATION,
  )
  async revealApiKey(
    @Param('id') authorizationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RevealCassoFlowApiKeyDto,
    @Req() request: AuthRequest,
  ) {
    return this.idempotency.execute(
      `POST /bank-connections/authorizations/${authorizationId}/reveal-key`,
      key,
      dto,
      () =>
        this.revealCassoFlowApiKeyUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          cassoFlowAuthorizationId: authorizationId,
          userId: request.user.userId,
          password: dto.password,
        }),
    );
  }
```

- [ ] **Step 6: Wire the module**

In `apps/backend/src/modules/bank-connections/bank-connections.module.ts`:

Add to imports (after the `BillingModule` import line, following module-wiring.md: import the whole module):

```typescript
import { UsersModule } from '../users/users.module';
```

Add `RevealCassoFlowApiKeyUseCase` to imports (alongside the other use case imports):

```typescript
import { RevealCassoFlowApiKeyUseCase } from './application/reveal-casso-flow-api-key.usecase';
```

In `@Module({ imports: [...] })`, add `UsersModule` after `BillingModule`:

```typescript
    TypeOrmModule.forFeature([...]),
    BillingModule,
    UsersModule,
```

In `providers`, add `RevealCassoFlowApiKeyUseCase` alongside the other use cases (after `RotateCassoFlowAuthorizationUseCase`):

```typescript
    RotateCassoFlowAuthorizationUseCase,
    RevealCassoFlowApiKeyUseCase,
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/backend && npx jest audited-metadata.spec.ts`
Expected: PASS

- [ ] **Step 8: Run the full backend suite + type-check + arch-check**

Run: `cd apps/backend && npx jest && npx tsc --noEmit && npm run arch-check`
Expected: all PASS. `arch-check` in particular verifies the new controller carries `@ApiTags` (already on the class) and every new endpoint has `@ApiOperation`/error decorators (already added in Step 5).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/audit/audit.enums.ts apps/backend/src/modules/bank-connections/presentation/dto/reveal-casso-flow-api-key.dto.ts apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts apps/backend/src/modules/bank-connections/bank-connections.module.ts apps/backend/src/modules/bank-connections/presentation/audited-metadata.spec.ts
git commit -m "feat: wire POST /bank-connections/authorizations/:id/reveal-key"
```

---

### Task 4: Frontend API function + hook

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/types.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`
- Modify: `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`
- Test: `apps/frontend/src/features/bank-connections/api/use-bank-connections.spec.tsx`

**Interfaces:**
- Consumes: `postWithIdempotency<T>(url, data): Promise<T>` (`@/lib/api-client`); `getApiErrorCode(error): string | undefined` (`@/lib/api-client`).
- Produces: `useRevealCassoFlowApiKey(): UseMutationResult` with `mutateAsync({ authorizationId: string, password: string }) => Promise<{ apiKey: string }>`. Consumed by Task 5's dialog.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/bank-connections/api/use-bank-connections.spec.tsx`. First, extend the existing mocks at the top of the file — add `revealCassoFlowApiKey` to the `vi.hoisted` block and the `./bank-connections-api` mock:

```typescript
const {
  confirmCassoFlow,
  disconnectConnection,
  revealCassoFlowApiKey,
  getApiErrorCode,
  toastError,
} = vi.hoisted(() => ({
  confirmCassoFlow: vi.fn(),
  disconnectConnection: vi.fn(),
  revealCassoFlowApiKey: vi.fn(),
  getApiErrorCode: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./bank-connections-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bank-connections-api')>()),
  confirmCassoFlow,
  disconnectConnection,
  revealCassoFlowApiKey,
}));
```

Then add a new `describe` block at the end of the file:

```typescript
import { useRevealCassoFlowApiKey } from './use-bank-connections';

describe('useRevealCassoFlowApiKey', () => {
  it('resolves with the revealed API key on success', async () => {
    revealCassoFlowApiKey.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRevealCassoFlowApiKey(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    const response = await result.current.mutateAsync({
      authorizationId: 'auth-1',
      password: 'correct',
    });

    expect(response.apiKey).toBe('AK_CS.real-key');
    expect(revealCassoFlowApiKey).toHaveBeenCalledWith('auth-1', {
      password: 'correct',
    });
  });

  it('shows a Vietnamese wrong-password toast on UNAUTHORIZED', async () => {
    const error = new Error('unauthorized');
    revealCassoFlowApiKey.mockRejectedValueOnce(error);
    getApiErrorCode.mockReturnValue('UNAUTHORIZED');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRevealCassoFlowApiKey(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await expect(
      result.current.mutateAsync({ authorizationId: 'auth-1', password: 'wrong' }),
    ).rejects.toThrow();

    expect(toastError).toHaveBeenCalledWith('Mật khẩu không đúng.');
  });
});
```

(`QueryClient`, `QueryClientProvider`, `renderHook` are already imported at the top of the file for the existing tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run use-bank-connections.spec.tsx`
Expected: FAIL — `useRevealCassoFlowApiKey` is not exported from `./use-bank-connections`.

- [ ] **Step 3: Add the type, API function, and hook**

In `apps/frontend/src/features/bank-connections/types.ts`, add at the end:

```typescript
export interface RevealCassoFlowApiKeyInput {
  password: string;
}

export interface RevealCassoFlowApiKeyResult {
  apiKey: string;
}
```

In `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`, add to the type import list:

```typescript
  RevealCassoFlowApiKeyInput,
  RevealCassoFlowApiKeyResult,
```

and add the function at the end of the file:

```typescript
export function revealCassoFlowApiKey(
  authorizationId: string,
  input: RevealCassoFlowApiKeyInput,
): Promise<RevealCassoFlowApiKeyResult> {
  return postWithIdempotency<RevealCassoFlowApiKeyResult>(
    `/api/v1/bank-connections/authorizations/${authorizationId}/reveal-key`,
    input,
  );
}
```

In `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`, add to the import list from `./bank-connections-api`:

```typescript
  revealCassoFlowApiKey,
```

and add the hook at the end of the file:

```typescript
export function useRevealCassoFlowApiKey() {
  return useMutation({
    mutationFn: ({
      authorizationId,
      password,
    }: {
      authorizationId: string;
      password: string;
    }) => revealCassoFlowApiKey(authorizationId, { password }),
    onError: (error) => {
      if (getApiErrorCode(error) === 'UNAUTHORIZED') {
        toast.error('Mật khẩu không đúng.');
        return;
      }
      toast.error('Không thể hiện API Key.');
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run use-bank-connections.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/bank-connections/types.ts apps/frontend/src/features/bank-connections/api/bank-connections-api.ts apps/frontend/src/features/bank-connections/api/use-bank-connections.ts apps/frontend/src/features/bank-connections/api/use-bank-connections.spec.tsx
git commit -m "feat: add useRevealCassoFlowApiKey hook"
```

---

### Task 5: `RevealApiKeyDialog` component

**Files:**
- Create: `apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.tsx`
- Test: `apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.spec.tsx`

**Interfaces:**
- Consumes: `useRevealCassoFlowApiKey()` (Task 4); shadcn/ui `Dialog`/`Input`/`Button`/`Label` (`@/components/ui/*`, same imports as `connection-table.tsx`/`api-key-input.tsx`).
- Produces: `<RevealApiKeyDialog authorizationId={string} />` — a self-contained trigger + dialog. Consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.spec.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RevealApiKeyDialog } from './reveal-api-key-dialog';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('../api/use-bank-connections', () => ({
  useRevealCassoFlowApiKey: () => ({ mutateAsync, isPending: false }),
}));

describe('RevealApiKeyDialog', () => {
  it('reveals the API key after submitting the password', async () => {
    mutateAsync.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });

    render(<RevealApiKeyDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('AK_CS.real-key')).toBeInTheDocument(),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      authorizationId: 'auth-1',
      password: 'correct-password',
    });
  });

  it('clears the revealed key when the dialog is closed', async () => {
    mutateAsync.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });

    render(<RevealApiKeyDialog authorizationId="auth-1" />);
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));
    await waitFor(() =>
      expect(screen.getByDisplayValue('AK_CS.real-key')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /đóng|close/i }));
    fireEvent.click(screen.getByRole('button', { name: /hiện api key/i }));

    expect(screen.queryByDisplayValue('AK_CS.real-key')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run reveal-api-key-dialog.spec.tsx`
Expected: FAIL — cannot find module `./reveal-api-key-dialog`.

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRevealCassoFlowApiKey } from '../api/use-bank-connections';

export function RevealApiKeyDialog({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const revealMutation = useRevealCassoFlowApiKey();

  const handleSubmit = async () => {
    const result = await revealMutation.mutateAsync({
      authorizationId,
      password,
    });
    setRevealedKey(result.apiKey);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPassword('');
          setRevealedKey(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Hiện API Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hiện API Key Casso Flow</DialogTitle>
          <DialogDescription>
            Nhập lại mật khẩu tài khoản của bạn để xem API Key đã nhập.
          </DialogDescription>
        </DialogHeader>
        {revealedKey ? (
          <div className="space-y-2">
            <Label htmlFor="revealed-api-key">API Key</Label>
            <Input id="revealed-api-key" readOnly value={revealedKey} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(revealedKey)}
            >
              Sao chép
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reveal-password">Mật khẩu</Label>
            <Input
              id="reveal-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Đóng</Button>
          </DialogClose>
          {!revealedKey && (
            <Button
              type="button"
              disabled={revealMutation.isPending || password.length === 0}
              onClick={handleSubmit}
            >
              Xác nhận
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run reveal-api-key-dialog.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.tsx apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.spec.tsx
git commit -m "feat: add RevealApiKeyDialog component"
```

---

### Task 6: Wire the reveal button into `ConnectionTable`

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/components/connection-table.tsx`
- Test: `apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx`

**Interfaces:**
- Consumes: `RevealApiKeyDialog` (Task 5); `hasPermission(role, permission)` (`@/lib/rbac`, already imported in this file); `Permission.BANK_CONNECTION_REVEAL_KEY` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx`, mock the new component (following the existing mock style for `../api/use-bank-connections`) and add two new test cases:

```typescript
vi.mock('./reveal-api-key-dialog', () => ({
  RevealApiKeyDialog: ({ authorizationId }: { authorizationId: string }) => (
    <button type="button">Hiện API Key ({authorizationId})</button>
  ),
}));
```

```typescript
  it('shows the reveal-key action for a role with BANK_CONNECTION_REVEAL_KEY', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<ConnectionTable connections={[connection]} />);

    expect(
      screen.getByRole('button', { name: /hiện api key/i }),
    ).toBeInTheDocument();
  });

  it('hides the reveal-key action for a role without BANK_CONNECTION_REVEAL_KEY', () => {
    useAuth.mockReturnValue({ user: { role: 'ACCOUNTANT' } });

    render(<ConnectionTable connections={[connection]} />);

    expect(
      screen.queryByRole('button', { name: /hiện api key/i }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run connection-table.spec.tsx`
Expected: FAIL — the "Hiện API Key" button doesn't exist yet (first new test fails); the second passes vacuously but is kept for symmetry once Step 3 lands.

- [ ] **Step 3: Add the button**

In `apps/frontend/src/features/bank-connections/components/connection-table.tsx`:

Add the import:

```typescript
import { RevealApiKeyDialog } from './reveal-api-key-dialog';
```

Add a permission check alongside the existing `canManage` (right after it):

```typescript
  const canRevealKey = hasPermission(
    user?.role ?? null,
    Permission.BANK_CONNECTION_REVEAL_KEY,
  );
```

Replace the existing per-group header block (currently gated by `{canManage && (...)}`) with a block gated by `{(canManage || canRevealKey) && (...)}`, adding `RevealApiKeyDialog` inside a flex wrapper next to the unchanged rotate `Dialog`:

```typescript
            {(canManage || canRevealKey) && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="flex justify-end gap-2 text-right"
                >
                  {canRevealKey && (
                    <RevealApiKeyDialog authorizationId={authorizationId} />
                  )}
                  {canManage && (
                    <Dialog
                      open={rotationAuthorizationId === authorizationId}
                      onOpenChange={(open) =>
                        setRotationAuthorizationId(open ? authorizationId : null)
                      }
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Đổi API Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Đổi API Key{' '}
                            <span className="text-primary">Casso Flow</span>
                          </DialogTitle>
                          <DialogDescription>
                            Nhập API Key mới để cập nhật quyền truy cập cho các
                            tài khoản trong nhóm này.
                          </DialogDescription>
                        </DialogHeader>
                        <CassoFlowAccountPicker
                          onPreview={(apiKey) =>
                            previewRotationMutation.mutateAsync({
                              authorizationId,
                              apiKey,
                            })
                          }
                          onConfirm={(apiKey) =>
                            rotateMutation.mutateAsync({
                              authorizationId,
                              apiKey,
                            })
                          }
                          onCompleted={() => setRotationAuthorizationId(null)}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </TableCell>
              </TableRow>
            )}
```

This is a like-for-like replacement of the existing block in the file (same `Dialog`/`DialogTrigger`/`DialogContent`/`CassoFlowAccountPicker` JSX, unchanged) — only the outer gating condition and the new `RevealApiKeyDialog` sibling are new.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run connection-table.spec.tsx`
Expected: PASS — all existing tests plus the 2 new ones.

- [ ] **Step 5: Run the full frontend suite + type-check**

Run: `cd apps/frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/bank-connections/components/connection-table.tsx apps/frontend/src/features/bank-connections/components/connection-table.spec.tsx
git commit -m "feat: show Hiện API Key action in ConnectionTable"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full verification**

Run: `pnpm verify` (lint + type-check + test, repo root)
Expected: exit 0.

- [ ] **Step 2: Run domain-check**

Run the `domain-check` skill per `AGENTS.md` and fix any violation it reports (none expected — no money fields, no unscoped queries beyond the already-justified `CassoFlowAuthorization.findById` tenant-scoping, no transaction-required writes here per §4.5's note in the spec).

- [ ] **Step 3: Run e2e (if Docker is available)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS (no e2e test added by this plan — existing suite should be unaffected).

No commit for this task — it's verification only, per `verification-before-completion`.
