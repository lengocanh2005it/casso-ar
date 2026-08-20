# Reveal Casso Flow API Key — Design

**Issue:** #287 — Reveal full Casso Flow API Key (behind password re-auth)
**ADR:** [0023-reveal-full-casso-flow-api-key-behind-reauth.md](../../adr/0023-reveal-full-casso-flow-api-key-behind-reauth.md)
**Related:** #284 (API Key history/event timeline — separate, unblocked)

## 1. Goal

Let `OWNER`/`FINANCE_MANAGER` see the full plaintext Casso Flow API Key they entered
previously, for reconciliation against Casso Flow's own dashboard. Every reveal requires
re-entering the requesting user's account password and is audit-logged.

## 2. Scope

In scope: one new backend endpoint, one new permission, one new use case, one new audit
event type, one frontend dialog. Out of scope (explicitly, per grilling): masked/partial
key display (rejected — doesn't meet the reconciliation need), API Key history/timeline
(#284, separate issue), any change to how the key is stored (`encryptedApiKey` already
supports decryption; no schema change needed there).

## 3. Architecture

```
BankConnectionsController.revealApiKey()
  → IdempotencyService.execute(...)
    → RevealCassoFlowApiKeyUseCase.execute({ organizationId, cassoFlowAuthorizationId, userId, password })
        1. authorizationRepo.findById(cassoFlowAuthorizationId)   — 404 if missing/wrong org (tenant-scoped)
        2. userRepo.findById(userId)                              — look up requesting user's passwordHash
        3. comparePassword(password, user.passwordHash)           — 401 if wrong
        4. decryptToken(authorization.encryptedApiKey, key)       — existing token-encryption.ts
        5. for each BankConnection under this authorization:
             auditEventRepo.save(new ConnectionAuditEvent({ eventType: 'API_KEY_REVEALED', ... }))
        6. return { apiKey: plaintext }
```

No new domain entity, no state transition — this is a read with a side-effecting audit
trail, not a `CassoFlowAuthorization`/`BankConnection` state change.

## 4. Backend changes

### 4.1 `packages/shared-types/src/permission.ts`

Add `BANK_CONNECTION_REVEAL_KEY = 'BANK_CONNECTION_REVEAL_KEY'` to the `Permission` enum.

### 4.2 `packages/shared-types/src/role-permissions.ts`

Add `Permission.BANK_CONNECTION_REVEAL_KEY` to `ROLE_PERMISSIONS[Role.FINANCE_MANAGER]`.
`OWNER` already gets every permission via `Object.values(Permission)` — no change needed
there.

### 4.3 `apps/backend/src/modules/bank-connections/domain/connection-audit-event.ts`

Add `'API_KEY_REVEALED'` to the `ConnectionAuditEventType` union. No other change to this
file — `ConnectionAuditEventProps`/`ConnectionAuditEvent` shape is unchanged, matching how
`'API_KEY_ROTATED'` was added.

### 4.4 `apps/backend/src/common/audit/audit.enums.ts`

Add `BANK_CONNECTION_API_KEY_REVEAL = 'BANK_CONNECTION_API_KEY_REVEAL'` to
`AuditActionType`, next to `BANK_CONNECTION_API_KEY_ROTATE`. Reuse the existing
`AuditEntityType.CASSO_FLOW_AUTHORIZATION` — no new entity type needed. This is the
separate, generic `@Audited` decorator mechanism (writes to the shared `audit_logs`
table via an interceptor) that the `rotate` endpoint already uses alongside its own
`ConnectionAuditEvent` writes — both audit mechanisms fire for this endpoint too, for
consistency with `rotate`.

### 4.5 `apps/backend/src/modules/bank-connections/application/reveal-casso-flow-api-key.usecase.ts` (new)

```typescript
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
import { randomUUID } from 'node:crypto';

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

    const apiKey = decryptToken(authorization.encryptedApiKey, this.encryptionKey);

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

Notes:
- `authorizationRepo.findById` is already tenant-scoped internally (reads
  `TenantContextService` inside the TypeORM implementation) — passing
  `organizationId` explicitly isn't needed for that call, matching the existing
  `PreviewCassoFlowAuthorizationRotationUseCase` pattern.
- `comparePassword`/`password-hasher.ts` is a stateless function (like `bcryptjs`
  itself), imported directly across the module boundary — this mirrors the existing
  precedent of `admin/application/*.usecase.ts` importing plain functions from
  `auth/application/` and `organizations/application/`.
- No transaction wrapper: nothing here mutates a persisted rollup or a state machine:
  the audit rows are independent inserts, not a multi-row invariant that needs
  atomicity. If one insert fails mid-loop, the reveal itself already succeeded (the
  key was returned to a use case caller only after all inserts resolve — see error
  handling in §6) — but the user already authenticated correctly, so a partial audit
  trail on an infra failure is an acceptable, logged edge case, not a correctness bug
  (nothing counts or reconciles against these rows the way `paidAmount` does).

### 4.6 `apps/backend/src/modules/bank-connections/presentation/dto/reveal-casso-flow-api-key.dto.ts` (new)

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

### 4.7 `apps/backend/src/modules/bank-connections/presentation/bank-connections.controller.ts`

Add one endpoint, following the exact shape of `rotate` (§ line 160-192 of the current
file) including `IdempotencyService.execute` (this is a POST with a side effect — the
audit rows — so the repo's hard rule in `.claude/rules/api.md` applies) and `@Audited`:

```typescript
import { type AuthRequest } from '../../../common/auth/assert-org-matches';
// ...
import { RevealCassoFlowApiKeyUseCase } from '../application/reveal-casso-flow-api-key.usecase';
import {
  RevealCassoFlowApiKeyDto,
  RevealCassoFlowApiKeyResponseDto,
} from './dto/reveal-casso-flow-api-key.dto';

// constructor: add `private readonly revealCassoFlowApiKeyUseCase: RevealCassoFlowApiKeyUseCase,`

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

`AuthRequest`/`request.user.userId` follows the existing precedent in
`organizations.controller.ts`.

### 4.8 `apps/backend/src/modules/bank-connections/bank-connections.module.ts`

- Add `UsersModule` to `imports` (module-wiring.md: import the whole module, not
  individual providers).
- Add `RevealCassoFlowApiKeyUseCase` to `providers`.
- Wire it into `BankConnectionsController`'s constructor (already covered by Nest's
  automatic DI once the provider and controller param are declared).

### 4.9 `apps/backend/src/common/errors/status-by-error-code.ts`

No change — `UNAUTHORIZED` already maps to 401.

## 5. Frontend changes

### 5.1 `apps/frontend/src/features/bank-connections/components/connection-table.tsx`

Add a "Hiện API Key" button next to the existing "Đổi API Key" button in each
authorization group's header row, gated by
`hasPermission(user?.role ?? null, Permission.BANK_CONNECTION_REVEAL_KEY)` (hide, not
disable — matches the repo-wide RBAC UI convention already used for every other button
in this file).

### 5.2 `apps/frontend/src/features/bank-connections/components/reveal-api-key-dialog.tsx` (new)

A `Dialog` with a password `Input` (type="password", no show/hide toggle needed here —
this is the user's own login password, not the Casso Flow key) and a submit button.
On success, render the revealed key in a read-only field with a "Copy" button
(`navigator.clipboard.writeText`). Clear the revealed value from component state when
the dialog closes (`onOpenChange={(open) => { if (!open) setRevealedKey(null); }}`) —
never persist it beyond the dialog's lifetime.

### 5.3 `apps/frontend/src/features/bank-connections/api/use-bank-connections.ts`

Add `useRevealCassoFlowApiKey()`, a `useMutation` calling
`POST /bank-connections/authorizations/:id/reveal-key`, following the existing
`useRotateCassoFlowAuthorization` shape. On `UNAUTHORIZED` error, show
`toast.error('Mật khẩu không đúng.')` (matching the FE convention of switching on
`errorCode`, never parsing `message`).

### 5.4 `apps/frontend/src/features/bank-connections/api/bank-connections-api.ts`

Add `revealCassoFlowApiKey(authorizationId: string, body: { password: string })
=> Promise<{ apiKey: string }>`.

### 5.5 `apps/frontend/src/features/bank-connections/types.ts`

Add the request/response shape used by the API function above.

## 6. Error handling

| Case | ErrorCode | HTTP |
|---|---|---|
| Authorization not found / wrong org | `NOT_FOUND` | 404 |
| Wrong password | `UNAUTHORIZED` | 401 |
| Missing/empty password in body | `VALIDATION_ERROR` (class-validator) | 400 |
| >5 reveal attempts/min | `429` via `@Throttle`, standard NestJS throttler response | 429 |
| Duplicate `Idempotency-Key` | `IDEMPOTENCY_KEY_REUSED` | 409 |

## 7. Testing

- Unit: `reveal-casso-flow-api-key.usecase.spec.ts` — covers: authorization not found;
  wrong password (mocked `comparePassword` false); correct password → returns
  decrypted key + writes one `ConnectionAuditEvent` per connection under the
  authorization; zero connections under the authorization → returns the key with zero
  audit writes (no error — an authorization with no active connections can still have
  its key revealed).
- Controller: extend `bank-connections.controller` test coverage (or e2e) for the new
  route — permission-gated (403 without `BANK_CONNECTION_REVEAL_KEY`), idempotency-key
  reuse returns cached response.
- Frontend: `reveal-api-key-dialog.spec.tsx` — renders password field, calls mutation
  on submit, shows revealed key + copy button on success, shows Vietnamese error toast
  on `UNAUTHORIZED`, clears revealed value on close.
- RBAC: extend `role-permissions.spec.ts` to assert `FINANCE_MANAGER` has
  `BANK_CONNECTION_REVEAL_KEY` and `ACCOUNTANT`/`SALES_REP`/`VIEWER` do not.

## 8. Non-goals (explicit)

- No masked/partial key display anywhere (ADR 0023).
- No change to `CassoFlowAuthorization`/`BankConnection` domain state.
- No new `ConnectionAuditEvent` schema field (`cassoFlowAuthorizationId`) — reveal
  events fan out per-connection, matching `API_KEY_ROTATED`'s existing precedent.
- No session-level "already revealed recently, skip re-auth" — every reveal re-checks
  the password.
