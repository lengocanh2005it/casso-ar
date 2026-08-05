# Application Layer Boundaries Design

**Date:** 2026-08-05
**Status:** Proposed
**Scope:** Backend `application/` layer of `auth`, `billing`, `receivables` modules; rule docs across all layers. No business logic changes.

## 1. Goal

The backend's Clean Architecture boundary is enforced for `domain/` (rule exists, code complies) but not for `application/`. In practice this let two concrete framework/SDK dependencies leak into use cases:

- `HttpException` (and 8 other `@nestjs/common` exception classes) thrown directly from 9 use cases, even though a global `HttpExceptionFilter` already exists specifically to translate errors → HTTP and was never used for this.
- `JwtService` from `@nestjs/jwt` injected directly into 3 auth use cases, coupling business logic to a specific signing library.

This design closes that gap: application code depends only on ports and domain, `AppError`/`ITokenSigner` replace the leaked framework/SDK types, and the boundary is enforced automatically (rule docs + CI) so it does not silently rot again the way the existing "Controllers translate domain errors → HTTP response" rule did.

It also strengthens rule docs for `domain/`, `infrastructure/`, and `presentation/` — a deep audit found these layers already compliant, so no code changes there, but two gaps in the *rules themselves* were found that could cause a future agent to break working code (see §5).

## 2. Existing model and boundary

Already in place, kept as-is:

- `HttpExceptionFilter` (`common/errors/http-exception.filter.ts`) — global `@Catch()` filter, already has a fallback branch for non-`HttpException` errors (currently maps them all to generic 500).
- `ErrorCode` enum (`common/errors/error-code.ts`) — stable string contract already used by both `HttpException` bodies and the filter.
- `IAuthEmailSender` port (`modules/auth/application/auth-email-sender.port.ts`) — existing precedent for porting an external integration out of application/.
- `DataSource`/`EntityManager` usage in use cases for multi-repository transactions — already an explicit, documented exception in AGENTS.md ("Use an EntityManager parameter for transactional saves"). Not touched by this design.
- `bcryptjs` in `password-hasher.ts` — a stateless hashing algorithm with no DI/config, same category as `node:crypto`. Not touched by this design; not treated as a leaked "integration".

This design owns:

- `AppError` class and the filter change needed to translate it to the existing envelope shape.
- `ITokenSigner` port + `JwtTokenSigner` adapter.
- Migrating the 9 `HttpException` call sites and 3 `JwtService` call sites.
- `.claude/rules/application.md` (new) and targeted additions to `domain.md`, `infrastructure.md`, `api.md`.
- AGENTS.md updates (Architecture section, Error Handling example).
- CI enforcement: dependency-cruiser (new dependency) for `@nestjs/jwt`, plus a grep-based CI check for the exception classes dependency-cruiser cannot filter by named import.

This design does not own:

- Any change to `domain/`, `infrastructure/`, or `presentation/` code (audited, already compliant).
- Retrofitting `DataSource`/`EntityManager` usage behind a port.
- Porting `bcryptjs`.
- Any business-logic or API-contract change. Error envelope shape returned to clients is unchanged.

## 3. `AppError`

```ts
// common/errors/app-error.ts
export class AppError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
```

No `statusCode` field — that is an HTTP concept and does not belong in application/domain. `HttpExceptionFilter.toEnvelope()` gets a new branch, checked before the generic-500 fallback: if `exception instanceof AppError`, look up the HTTP status from `errorCode` via the existing `codeForStatus` reverse mapping and return the envelope directly (same shape as today). `HttpException` handling in the filter is unchanged — DTO validation errors (`class-validator` → Nest's built-in `BadRequestException`) still flow through Nest's normal `HttpException` path, only application-layer use cases stop using it.

Migration for the 9 call sites is mechanical: `throw new HttpException({ statusCode, errorCode, message }, statusCode)` becomes `throw new AppError(errorCode, message)`. `write-off-receivable.usecase.ts`'s `NotFoundException` becomes `AppError(ErrorCode.RECEIVABLE_NOT_FOUND, ...)`. Response body and status code observed by clients do not change — covered by existing controller-level e2e tests plus new filter unit tests for the `AppError` branch.

## 4. `ITokenSigner`

```ts
// modules/auth/application/token-signer.port.ts
export interface ITokenSigner {
  sign(payload: Record<string, unknown>): string;
}
export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');
```

```ts
// modules/auth/infrastructure/jwt-token-signer.adapter.ts
@Injectable()
export class JwtTokenSigner implements ITokenSigner {
  constructor(private readonly jwtService: JwtService) {}
  sign(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload);
  }
}
```

`login.usecase.ts`, `refresh-access-token.usecase.ts`, `switch-organization.usecase.ts` replace their `private readonly jwtService: JwtService` constructor param with `@Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner`. `auth.module.ts` adds the `TOKEN_SIGNER` provider binding to `JwtTokenSigner`. No change to token contents, TTL, or signing algorithm — this is a pure indirection, verified by existing use case unit tests continuing to pass against a mock `ITokenSigner`.

## 5. Rule docs

**New `.claude/rules/application.md`** (`paths: apps/backend/src/**/application/**`):

- Use case depends only on ports (`I<Entity>Repository`, etc.) and domain.
- MUST NOT import SDK/integration libraries directly (`@nestjs/jwt`, `@nestjs/passport`, future `resend`/Cas ID clients) — define a port, implement the adapter in `infrastructure/`.
- MUST NOT throw `HttpException` or any `@nestjs/common` exception class — throw `AppError(errorCode, message, details?)`.
- Allowed exceptions, stated explicitly so they are not "fixed" by a future agent: `@Injectable()`/`@Inject()` (inert DI metadata), `DataSource`/`EntityManager` from `typeorm` for cross-repository transactions (per AGENTS.md), `bcryptjs` (stateless hashing, no DI/config).
- File naming: `*.usecase.ts`, `*-repository.port.ts` / `*-<thing>.port.ts`. DI token: `Symbol('X_REPOSITORY')`.

**`domain.md`** — add:
```
- MUST NOT import from application/, infrastructure/, or presentation/ — domain is the core and may depend only on itself
```

**`infrastructure.md`** — add:
```
- MUST NOT import another module's infrastructure/ directly — access another module's data through a port in application/
- Queries by secret token/hash (email-verification, refresh-token, password-reset) do not need organizationId scoping — the token itself is the lookup key before the tenant is known. This is an intentional exception, not a bug.
```

**`api.md`** — replace the unconditional `@RequirePermission()` line, which is currently wrong as stated (it would tell a future agent to add permission checks to `login`/`signup`/`verify-email`/`refresh`, breaking pre-auth flows):
```
- Every authenticated endpoint (with JwtAuthGuard) MUST have `@RequirePermission()`.
- Pre-authentication endpoints (login, signup, verify-email, refresh, forgot-password) do not need it — there is no identity to check permissions against yet.
- Controllers MUST NOT import infrastructure/ or repository ports directly — they only call use cases.
```

**AGENTS.md**:
- "Architecture → Clean Architecture (Backend)" gets an `application/` line mirroring the `domain/` line's "MUST NOT" phrasing, listing the same allowed exceptions as the rule file.
- "Error Handling → Domain Errors" example is updated to show `AppError` instead of a bare `throw new Error(...)`, and explicitly states `HttpExceptionFilter` is the only translation point.

All rule-doc changes are additive/corrective text — no code enforces domain/infrastructure/presentation compliance beyond what already exists (they already comply); the point is preventing regression, not fixing anything present today.

## 6. Enforcement

- **dependency-cruiser** (new dependency, justified: purpose-built for module-graph rules, extensible to future boundary rules e.g. domain → application ban): config forbids any `apps/backend/src/**/application/**` module from depending on `@nestjs/jwt`. Run as a `pnpm` script wired into CI.
- **CI grep check**: dependency-cruiser operates on the module graph, not named imports, so it cannot distinguish `Injectable` (allowed) from `HttpException` (forbidden) within the same `@nestjs/common` import. A single grep step in CI fails the build if any of `HttpException|NotFoundException|UnauthorizedException|BadRequestException|ConflictException|ForbiddenException` appears under `apps/backend/src/modules/*/application`.

Both checks are additive CI steps; neither changes runtime behavior.

## 7. Testing

- `http-exception.filter.spec.ts`: new cases for `AppError` → envelope mapping (each `ErrorCode` used by a migrated use case).
- Existing use case unit tests (`login.usecase.spec.ts`, `signup.usecase.spec.ts`, etc.) updated to assert `AppError` is thrown instead of `HttpException`, and to mock `ITokenSigner` instead of `JwtService`.
- Existing e2e tests (`*.e2e-spec.ts`) assert unchanged HTTP status/body for the same failure cases — proves the client-visible contract didn't move.
- New dependency-cruiser rule and CI grep script each get a deliberately-introduced violation reverted before merge, to confirm they actually fail the build (not asserted by an automated test — verified manually once during implementation).

## 8. Out of scope / explicitly not done

- No change to `domain/`, `infrastructure/`, `presentation/` code.
- No port added for `bcryptjs` or `DataSource`/`EntityManager`.
- No change to error envelope shape, HTTP status codes, or JWT contents observed by clients.
- No retrofit of modules without a `presentation/` layer (`billing`, `customers`, `invoices`, `organizations`, `users`) — out of scope, unrelated to this ticket.
