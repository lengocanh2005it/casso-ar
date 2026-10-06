# AGENTS.MD

This file defines coding rules and conventions for ALL agents (Claude Code, GitHub Copilot, Cursor, etc.) working in this repo. Every agent MUST comply.

---

## Architecture

### Clean Architecture (Backend)

Each NestJS module is organized into 4 layers:

```
domain/           Entity, state machine, domain error
                  MUST NOT import NestJS/TypeORM
application/      Use case + port interface (I<Entity>Repository)
                  MUST NOT import concrete SDK/integration libraries
                  (@nestjs/jwt, resend, ...) or throw HttpException —
                  throw AppError, port every external integration.
                  Allowed: @Injectable/@Inject, DataSource/EntityManager
                  for cross-repository transactions, bcryptjs.
infrastructure/   TypeORM repository, adapters (Resend, Cas ID)
presentation/     Controller, DTO, DI wiring
```

Dependency: `presentation → application → domain`, `infrastructure → application`.

### File naming

- Files: kebab-case (`create-receivable.usecase.ts`)
- Classes: PascalCase (`CreateReceivableUseCase`)
- Variables/functions: camelCase (`receivableRepo`)
- Enums: UPPER_SNAKE_CASE (`PARTIALLY_PAID`)
- Constants: UPPER_SNAKE_CASE (`RECEIVABLE_REPOSITORY`)

---

## Business Rules (CRITICAL)

### Money

- **ALWAYS** use integers in VND units
- **NEVER** use float or decimal for money
- TypeORM: `@Column('bigint')` for every money field

```typescript
// ✅ Correct
@Column('bigint')
amount: number;

// ❌ Incorrect
@Column('decimal', { precision: 10, scale: 2 })
amount: number;
```

### Transactions

- Every write that changes an amount/status MUST be inside one DB transaction
- Use `DataSource.transaction()` or `EntityManager` in the use case
- Never update rollup fields outside a transaction

### Persisted Rollup

- `Receivable.paidAmount` and `Payment.allocatedAmount` are persisted rollups
- Update only inside a transaction with a lock (pessimistic_write)
- Do not use `SUM(PaymentAllocation)` at runtime

### Derived Fields

- `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — calculate at query time
- Do NOT store derived fields in the database
- **Exception:** `receivable_balance_history.remainingAmount` is an immutable historical
  snapshot recorded inside the transition transaction — append-only, never updated after
  insert, and never reconstructed with a runtime `SUM(payment_allocations)`. It is not a
  current derived field.
- **Rollout exception:** the one-time `ROLLOUT_BASELINE` maintenance migration may snapshot
  current receivable rollups in its own atomic migration transaction. It is a cutover
  operation, not a runtime transition, and must not be reused for request-time writes.

### Tenant Isolation

- Every query/write MUST be scoped by `organizationId`
- Use `TenantContextService.getOrganizationId()`
- Never hardcode organizationId

**System migration exception:** a database migration or maintenance backfill
that intentionally processes every organization has no request tenant context
and may operate across organizations. It MUST still select and persist the
explicit `organizationId` for every row, remain atomic, and never be reused by
application/request code.

```typescript
// ✅ Correct
const orgId = this.tenantContext.getOrganizationId();
await this.repo.findOne({ where: { id, organizationId: orgId } });

// ❌ Incorrect
await this.repo.findOne({ where: { id } }); // missing organizationId
```

---

## Code Style

### TypeScript

- Strict mode enabled
- Do not use `any` in production code (allowed in tests)
- Use the `node:` protocol for Node.js builtins (`import { randomUUID } from 'node:crypto'`)
- Interface for data-only types, class for types with behavior
- Imports: `import type` for pure types; **value import** (never `import type`) for classes used in constructor params or decorators — NestJS DI/ValidationPipe resolves them via `emitDecoratorMetadata`, and type-only imports erase to `Function`/`Object` at runtime. `useImportType` lint rule is disabled repo-wide (see `biome.jsonc`)

### NestJS

- Use cases belong in `application/`, NOT in controllers
- Controllers only call use cases; they do not contain business logic
- Use Symbols for DI tokens (`export const X_REPOSITORY = Symbol('X_REPOSITORY')`)
- Global prefix: `/api/v1`

### API Docs (Swagger)

- Every controller MUST carry `@ApiTags('<tag>')` — enforced by `scripts/check-controller-docs.mjs` in `pnpm verify` (arch-check)
- New endpoints MUST add `@ApiOperation(...)` + response decorators (`@ApiOkResponse`/`@ApiCreatedResponse`) and list their error codes via `@ApiErrorResponse(ErrorCode.X)` from `src/common/swagger/api-error-response.decorator.ts`
- HTTP status ↔ ErrorCode mapping lives in ONE place: `src/common/errors/status-by-error-code.ts` (consumed by `HttpExceptionFilter` and the docs decorator) — update it when adding a code
- Response DTOs exposed over HTTP MUST be `class` (not `interface`) so the swagger CLI plugin (see `nest-cli.json`) documents them; files must end in `.dto.ts` (this includes query-param DTOs — a `.query.ts` suffix is invisible to the plugin)
- Query DTO fields using `@Type(() => Number)` render as a broken `$ref: Object` schema — add explicit `@ApiProperty({ type: Number, ... })` alongside it
- Docs UI: `/api/docs` (OpenAPI JSON at `/api/docs-json`) — open in dev/test, HTTP Basic Auth via `SWAGGER_USER`/`SWAGGER_PASSWORD` in production
- File-download endpoints (CSV export) use `@ApiOkResponse({ content: { '<mime>': ... } })` — NOT `@ApiProduces`, which corrupts error-response content types

### TypeORM

- Entity classes are named `XOrmEntity` (infrastructure layer)
- Domain entities MUST NOT import TypeORM decorators
- Use `@VersionColumn()` for optimistic locking
- Use an `EntityManager` parameter for transactional saves
- Domain ↔ ORM translation MUST be an explicit mapper (`toOrm()` in the repository); NEVER cast domain to ORM entity (`as`, `as unknown as`) — a drift between the shapes must fail the compiler, not be cast away

### Validation

- Use class-validator decorators on DTOs
- Response DTOs: do not leak `organizationId`, `version`, or internal fields
- Error shape: `{ statusCode, errorCode, message, details? }`

---

## Testing

### TDD workflow

- For every new feature, bug fix, behavior change, or refactor, follow **RED → GREEN → REFACTOR**:
  1. **RED** — Write one minimal test for the desired behavior.
  2. Run it and verify that it fails for the expected reason.
  3. **GREEN** — Write the smallest production-code change that makes it pass.
  4. Run it again and verify that it passes.
  5. **REFACTOR** — Clean up while keeping all tests green.
- NEVER write production code before observing a relevant failing test.
- Test behavior through public interfaces, not private methods or implementation details.
- Work one vertical slice at a time; do not write all tests before implementation.
- Bug fixes MUST include a regression test that fails before the fix.
- Exceptions: generated code, configuration-only changes, migrations, and throwaway prototypes. State the exception in the final response.

### Unit tests

- File: `*.spec.ts` placed alongside the source
- Mock repositories with `jest.fn()`
- Test pure domain logic without the NestJS container

### Integration tests

- File: `*.e2e-spec.ts` in the `test/` directory
- Use `@nestjs/testing` for module setup
- Use testcontainers for real Postgres

### Viewport tests (frontend)

- File: `*.e2e.ts` in `apps/frontend/e2e/`, run with Playwright against a real browser
- jsdom has no layout engine, so `max-md:` reflow never applies — layout behaviour must be asserted here, not in a `*.spec.tsx`
- Layout invariants are defined in `apps/frontend/e2e/README.md`; reuse them rather than re-measuring
- Not part of `pnpm verify` or CI yet

### Test commands

```bash
npx jest                          # Run all unit tests
npx jest --testPathPattern <name> # Run specific test
npx tsc --noEmit                  # Type check

pnpm turbo run test:viewport                              # Frontend viewport tests
pnpm --filter @casso-ar/frontend test:viewport:install    # Download the browser once
```

### Verification before completion

- Before claiming work is complete, fixed, or passing, use the `verification-before-completion` skill.
- Identify the command that proves each claim, run it freshly, read the exit code and output, then report only what the evidence supports.
- For code changes, run the focused test, the full relevant test suite, and `pnpm verify`; run e2e tests when the change affects integration behavior.
- After any backend code change, run the `domain-check` skill (`/domain-check`; see `.claude/skills/domain-check.md`) and fix violations before claiming completion.
- Do not claim completion from a previous run, a partial check, or an assumption that the change should work.

### Skill routing

- **Bug, failing test, or unexpected behavior:** use `systematic-debugging` before changing production code, then use TDD.
- **Feature spanning multiple files or layers:** use `brainstorming`, then `writing-plans` before implementation.
- **New domain concept, state machine, or business rule:** use `domain-modeling` before implementation.
- **Frontend page, component, or visual behavior:** use `frontend-design` before implementation; use TDD for behavior.
- **External API, library, regulation, or unstable technical detail:** use `research` with primary sources.
- **Reviewing changes:** use `code-review`; before opening a PR, use `requesting-code-review`.
- **Responding to review comments:** use `receiving-code-review` before applying non-trivial feedback.
- **GitHub Actions failure:** use `github:gh-fix-ci`.
- **Any completion claim, commit, or PR:** use `verification-before-completion` first.

---

## Git Conventions

### Commit messages

```
<type>: <description>

Types: feat, fix, chore, refactor, test, docs
```

Examples:
- `feat: add Receivable module with state machine`
- `fix: TenantContextService throw on missing org ID`
- `chore: upgrade NestJS to v11`
- `refactor: Customer class → interface`

The `Co-authored-by: Orca <help@stably.ai>` trailer is added automatically by the husky `prepare-commit-msg` hook — do not add it manually.

### Branches

- `main` — production-ready code
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `chore/<name>` — maintenance

### Workflow: Starting a new ticket

**REQUIRED** when starting to implement a ticket from `docs/wayfinder/feature-map.md`:

1. **Create a worktree** in `.worktrees/`:
```bash
git worktree add .worktrees/feat/<ticket-name> -b feat/<ticket-name>
```
(Or an equivalent tool, e.g. `orca worktree create`.)

1b. **Copy gitignored local env files into the new worktree** — `apps/backend/.env` (and any other untracked `.env*` needed to run tests/dev) is never copied by `git worktree add` or Orca's worktree creation, since git never tracked it in the first place:
```bash
cp apps/backend/.env .worktrees/feat/<ticket-name>/apps/backend/.env
```
Skipping this causes confusing, environment-only failures later (e.g. backend e2e tests failing with "JWT_SECRET is required" or similar config errors that have nothing to do with the code change).

1c. **Run `pnpm install` in the new worktree** right after copying the env files — a freshly created worktree has no `node_modules`, and commands like `tsc`/`jest` will fail with unrelated-looking module errors until dependencies are installed:
```bash
cd .worktrees/feat/<ticket-name> && pnpm install
```

2. **Work in that worktree**, NOT on `main`

3. **When complete**:
```bash
cd .worktrees/feat/<ticket-name>
git add -A
git commit -m "feat: <description>"
git push -u origin feat/<ticket-name>
gh pr create --title "feat: <description>" --body "Closes #<issue>"
```

4. **Wait for user review** before merging

5. **Clean up** after merging:
```bash
git worktree remove .worktrees/feat/<ticket-name>
git branch -d feat/<ticket-name>
```

**NOTE:**
- Each ticket = 1 separate worktree
- Never code directly on `main`
- The PR must have passing tests + a passing type check
- **REQUIRED** to update `docs/wayfinder/feature-map.md` when:
  - Starting a ticket: change status → `in-progress`
  - Completing a ticket: change status → `done`, add `Shipped:` date + PR reference
  - A blocker changes: update the `Blockers` field
  - The frontier changes: update the `Frontier` section

---

## Security

### Secrets & Credentials

- **NEVER** commit secrets, API keys, passwords, or tokens
- Use environment variables for all secrets
- `.env` is already in `.gitignore` — do NOT force-add it
- JWT secret: `process.env.JWT_SECRET` (required, no default)
- Cas ID credentials: `process.env.CAS_ID_CLIENT_ID`, `process.env.CAS_ID_CLIENT_SECRET`
- Database: `process.env.DB_PASSWORD` (no default)

### Authentication

- Access token: 15 minutes, httpOnly cookie
- Refresh token: 7 days, httpOnly cookie, secure
- Rate limit: 5 req/minute per (IP, email) for auth endpoints
- Token hash: SHA-256 when stored in the database, not plaintext

### Authorization

- Endpoints requiring authentication (`JwtAuthGuard`) MUST have the `@RequirePermission()` decorator
- Pre-auth endpoints (login, signup, verify-email, refresh, forgot-password) do NOT need `@RequirePermission()` — there is no identity yet to check permissions against
- Check permission BEFORE executing the use case
- Responses must not leak `organizationId`, `version`, or internal fields
- Webhook auth: constant-time comparison (do not use `===`)

---

## Error Handling

### Error Response Shape

All errors return the standard shape:

```typescript
{
  statusCode: number,      // HTTP status code
  errorCode: string,       // UPPER_SNAKE_CASE, stable for FE switching
  message: string,         // Human-readable (Vietnamese)
  details?: unknown        // Optional additional info
}
```

### ErrorCode Constants

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  MEMBER_BLOCKED = 'MEMBER_BLOCKED',
  CONFLICT = 'CONFLICT',
  PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED',
  ALLOCATION_EXCEEDS_REMAINING = 'ALLOCATION_EXCEEDS_REMAINING',
  ALLOCATION_EXCEEDS_UNALLOCATED = 'ALLOCATION_EXCEEDS_UNALLOCATED',
  OPTIMISTIC_LOCK_CONFLICT = 'OPTIMISTIC_LOCK_CONFLICT',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  PAYMENT_CUSTOMER_UNRESOLVED = 'PAYMENT_CUSTOMER_UNRESOLVED',
  CUSTOMER_MISMATCH = 'CUSTOMER_MISMATCH',
  RECEIVABLE_NOT_FOUND = 'RECEIVABLE_NOT_FOUND',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  ALLOCATION_NOT_FOUND = 'ALLOCATION_NOT_FOUND',
  ALLOCATION_ALREADY_UNDONE = 'ALLOCATION_ALREADY_UNDONE',
  DISPUTE_ALREADY_OPEN = 'DISPUTE_ALREADY_OPEN',
  RECEIVABLE_HAS_PAYMENTS = 'RECEIVABLE_HAS_PAYMENTS',
  TEMPLATE_IN_USE = 'TEMPLATE_IN_USE',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
  INVALID_PLAN_TRANSITION = 'INVALID_PLAN_TRANSITION',
}
```

### Domain Errors

- Domain logic throws `Error` with a clear message
- Controllers translate domain errors → HTTP response + ErrorCode
- Do not return `{ success: false }` — always throw an exception

```typescript
// ✅ Correct
if (amount > remaining) {
  throw new AppError(
    ErrorCode.ALLOCATION_EXCEEDS_REMAINING,
    'Allocation amount exceeds remaining amount',
  );
}

// ❌ Incorrect — application layer must not know about HTTP
throw new HttpException({ statusCode: 400, ... }, 400);

// ❌ Incorrect
return { success: false, error: 'Invalid amount' };
```

`AppError` (`apps/backend/src/common/errors/app-error.ts`) is the only exception type application/domain code throws; `HttpExceptionFilter` (presentation layer) is the single place that translates it to an HTTP response.

---

## Logging

### Console Output

- **DO NOT** use `console.log()` in production code
- Use structured logging through the logger service
- The logger MUST include context: `organizationId`, `userId`, `requestId`

```typescript
// ✅ Correct
this.logger.log({
  message: 'Payment allocated',
  paymentId: payment.id,
  receivableId: receivable.id,
  amount,
  organizationId: this.tenantContext.getOrganizationId(),
});

// ❌ Incorrect
console.log('Payment allocated:', payment.id);
```

### Log Levels

- `error`: System errors, exceptions
- `warn`: Business rule violations, degraded state
- `info`: Business events (payment allocated, reminder sent)
- `debug`: Development debugging (use only while debugging, do NOT commit)

---

## Performance

### Database Queries

- **DO NOT** use `SELECT *` — always select specific columns
- **DO NOT** use N+1 queries — use `IN` or `JOIN` instead of a loop
- Add indexes for frequently queried columns:
  ```typescript
  @Index(['organizationId', 'status', 'dueDate'])
  ```
- Use pagination for every list endpoint (`page`, `limit`)
- `limit` maximum 100, default 20

### Caching

- Do not implement a separate cache — let the TypeORM query cache or Redis handle it
- Invalidate the cache on write operations

### Transaction Scope

- Keep transactions as short as possible
- DO NOT call external APIs inside a transaction
- Hold locks only inside transactions, never outside

---

## Dependency Management

### Adding a New Package

Before adding a new dependency:

1. **Check** whether the package is already in the workspace
2. **Check** whether the standard library can do it
3. **Check** whether the package is actively maintained
4. **Check** whether the bundle size is acceptable

```bash
# Check package
npm info <package> --json | jq '.time.modified, .dist-tags'
```

### Package Categories

| Category | Allowed | Notes |
|----------|---------|-------|
| NestJS modules | `@nestjs/*` | Official NestJS packages |
| TypeORM | `typeorm`, `@nestjs/typeorm` | Database ORM |
| Validation | `class-validator`, `class-transformer` | DTO validation |
| Queue | `bullmq`, `@nestjs/bullmq` | Job queue |
| Email | `resend` | Email provider |
| Testing | `jest`, `supertest`, `@testcontainers/*` | Test tools |
| Utilities | `date-fns`, `zod` | Only if justified |

### Do NOT add

- Lodash (use native JS methods)
- Moment.js (use date-fns or Intl)
- Axios (use native fetch)
- uuid (use crypto.randomUUID)

---

## Environment Variables

### Required Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=casso
DB_PASSWORD=casso
DB_DATABASE=casso_ar

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=15m
REFRESH_EXPIRATION=7d

# Cas ID
CAS_ID_CLIENT_ID=
CAS_ID_CLIENT_SECRET=
CAS_ID_BASE_URL=https://api.cas.so

# Email (Resend)
RESEND_API_KEY=
AUTH_EMAIL_SENDER=noreply@casso.vn

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Rules

- **DO NOT** commit the `.env` file
- Always have `.env.example` with placeholder values
- Validate required vars at app startup
- Use `process.env.VARIABLE ?? 'default'` for optional vars
- DO NOT use `process.env.VARIABLE!` (non-null assertion)

---

## API Error Codes

### Standard errorCode list

| ErrorCode | HTTP Status | Description |
|-----------|-------------|-------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Missing or invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `MEMBER_BLOCKED` | 403 | Member access is blocked for this organization |
| `CONFLICT` | 409 | Resource conflict (duplicate, etc.) |
| `PLAN_LIMIT_EXCEEDED` | 402 | Billing quota exceeded |
| `ALLOCATION_EXCEEDS_REMAINING` | 400 | Allocation > remaining amount |
| `ALLOCATION_EXCEEDS_UNALLOCATED` | 400 | Allocation > unallocated payment |
| `OPTIMISTIC_LOCK_CONFLICT` | 409 | Version mismatch (retry) |
| `TENANT_MISMATCH` | 403 | Cross-tenant access denied |
| `PAYMENT_CUSTOMER_UNRESOLVED` | 400 | Payment has no customer |
| `CUSTOMER_MISMATCH` | 400 | Payment ≠ Receivable customer |
| `RECEIVABLE_NOT_FOUND` | 404 | Receivable not found |
| `PAYMENT_NOT_FOUND` | 404 | Payment not found |
| `ALLOCATION_NOT_FOUND` | 404 | Allocation not found |
| `ALLOCATION_ALREADY_UNDONE` | 409 | Allocation already undone |
| `DISPUTE_ALREADY_OPEN` | 409 | Duplicate open dispute |
| `RECEIVABLE_HAS_PAYMENTS` | 400 | Cannot cancel paid receivable |
| `TEMPLATE_IN_USE` | 409 | Template referenced by rule |
| `EMAIL_SEND_FAILED` | 500 | Email provider error |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Duplicate idempotency key |
| `INVALID_PLAN_TRANSITION` | 400 | Target plan tier is not strictly higher than the current plan |

### Usage rules

- `errorCode` is a stable string; the FE switches on errorCode
- `message` is text displayed to the user (Vietnamese)
- Do NOT let the FE parse the message to determine logic

---

## Forbidden Patterns

### NEVER

1. Use `float` or `decimal` for money
2. Import NestJS/TypeORM in the `domain/` layer
3. Hardcode `organizationId`
4. Update rollup fields outside a transaction
5. Leak internal fields in response DTOs
6. Ignore tenant isolation
7. Put business logic in controllers
8. Use `any` in production code, or cast with `as any` / `as unknown as` (domain ↔ ORM must use an explicit mapper)

### ALWAYS

1. Scope queries by `organizationId`
2. Use transactions for write operations
3. Validate input with class-validator
4. Use TDD for new behavior and bug fixes
5. Update the module when adding providers/controllers
6. Check `organizationId` when saving

---

## File Structure Reference

```
apps/backend/src/
  common/
    tenancy/         TenantContextService, TenantMiddleware
    audit/           AuditLog, AuditEnums
  modules/
    <module>/
      domain/        Entity interfaces/classes
      application/   Use cases, repository ports
      infrastructure/ TypeORM entities, repository implementations
      presentation/  Controllers, DTOs
      <module>.module.ts
  config/
    typeorm.config.ts
  main.ts
  app.module.ts
```

---

## Quick Reference

| Concept | Location |
|---------|----------|
| Domain entities | `*/domain/*.ts` |
| Use cases | `*/application/*.usecase.ts` |
| Repository ports | `*/application/*-repository.port.ts` |
| TypeORM entities | `*/infrastructure/*.orm-entity.ts` |
| Repository implementations | `*/infrastructure/typeorm-*.repository.ts` |
| Controllers | `*/presentation/*.controller.ts` |
| DTOs | `*/presentation/dto/*.dto.ts` |
| Module wiring | `*/*.module.ts` |
| Tests | `*.spec.ts` (unit), `test/*.e2e-spec.ts` (integration) |
