# Signup Abuse Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `POST /auth/signup` and `GET /tax-verification/lookup` against enumeration/automated abuse (issue #337) without CAPTCHA or a new persisted audit table — independent per-dimension rate limits, an escalating lockout for repeat offenders, mandatory verification-method evidence on organization approval, and structured audit logging for signup/verification events.

**Architecture:** `AuthCompositeRateLimitGuard` (already shared by both routes) gains three independently-tracked `@nestjs/throttler` named throttlers (IP/email/tax-code, each via its own `getTracker`) plus a `canActivate` override that checks a Redis-backed violation counter before delegating to the throttlers, escalating to a hard lockout after repeated violations. `ApproveOrganizationUseCase` gains a required `verificationMethod` evidence field recorded on the existing `OperatorAuditLog`. `SignupUseCase`/`VerifyEmailUseCase`/`ResendVerificationEmailUseCase` gain structured `info` log calls (no new table — see ADR-0027).

**Tech Stack:** NestJS 11, `@nestjs/throttler` 6.5.0, `ioredis`, TypeORM, PostgreSQL (raw-SQL migration), Jest unit + e2e tests.

## Global Constraints

- AC3 (no duplicate orgs via retry) and AC4 (never auto-activate) are **already satisfied** by shipped issue #336 work — do not touch `PendingSignup`'s dedup logic or `ProvisionOrganizationUseCase`'s `status: 'PENDING_REVIEW'` default. No task in this plan modifies those files' behavior.
- No `any`, no `as`/`as unknown as` casts in production code (AGENTS.md, `.claude/rules/typescript.md`).
- Application layer MUST NOT throw anything but `AppError`; this does **not** apply to `AuthCompositeRateLimitGuard` — it lives in `presentation/`, and `ThrottlerException` is the correct exception type for a guard to throw (`.claude/rules/application.md` scopes the `AppError`-only rule to `application/`).
- Every write that changes persisted state runs inside a transaction where one already exists in the touched use case (`transitionPendingOrganization` already does this for approve/reject — extend it, don't bypass it).
- Never log `otp`, `password`, or `passwordHash` — verified absent from every new log call added in this plan.
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas (CLAUDE.local.md).
- RED → GREEN → REFACTOR for every new behavior (AGENTS.md).
- Run `domain-check` after any backend code change and `pnpm verify` before claiming completion (AGENTS.md).

---

## Task 1: Independent per-dimension rate limits (IP / email / tax code)

**Files:**
- Create: `apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.ts`
- Test: `apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.spec.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts`

**Interfaces:**
- Produces: `extractIp`, `extractSignupEmail`, `extractTaxCode` — each `(req: Record<string, unknown>) => string | null` (`extractIp` never returns null). Consumed directly by `app.module.ts`'s `ThrottlerModule.forRoot` config. Task 2 imports nothing from this file (it works at the `canActivate` level, above tracker resolution).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.spec.ts
import {
  extractIp,
  extractSignupEmail,
  extractTaxCode,
} from './auth-rate-limit-trackers';

describe('extractIp', () => {
  it('returns the request ip', () => {
    expect(extractIp({ ip: '203.0.113.5' })).toBe('203.0.113.5');
  });

  it('falls back to "unknown" when ip is missing', () => {
    expect(extractIp({})).toBe('unknown');
  });
});

describe('extractSignupEmail', () => {
  it('returns the lowercased, trimmed body email', () => {
    expect(extractSignupEmail({ body: { email: ' AP@Congty.VN ' } })).toBe(
      'ap@congty.vn',
    );
  });

  it('returns null when the body has no email', () => {
    expect(extractSignupEmail({ body: {} })).toBeNull();
    expect(extractSignupEmail({})).toBeNull();
  });
});

describe('extractTaxCode', () => {
  it('reads taxCode from the request body (signup)', () => {
    expect(extractTaxCode({ body: { taxCode: ' 0101234567 ' } })).toBe(
      '0101234567',
    );
  });

  it('reads taxCode from the query string (lookup) when body has none', () => {
    expect(
      extractTaxCode({ body: {}, query: { taxCode: '0101234567' } }),
    ).toBe('0101234567');
  });

  it('returns null when neither body nor query has a taxCode', () => {
    expect(extractTaxCode({ body: {}, query: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/presentation/auth-rate-limit-trackers.spec.ts`
Expected: FAIL — `Cannot find module './auth-rate-limit-trackers'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.ts
export function extractIp(req: Record<string, unknown>): string {
  return typeof req.ip === 'string' ? req.ip : 'unknown';
}

export function extractSignupEmail(req: Record<string, unknown>): string | null {
  const body = req.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string'
    ? body.email.trim().toLowerCase()
    : null;
}

export function extractTaxCode(req: Record<string, unknown>): string | null {
  const body = req.body as { taxCode?: unknown } | undefined;
  if (typeof body?.taxCode === 'string') return body.taxCode.trim();
  const query = req.query as { taxCode?: unknown } | undefined;
  if (typeof query?.taxCode === 'string') return query.taxCode.trim();
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/presentation/auth-rate-limit-trackers.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire the three named throttlers into `ThrottlerModule.forRoot`**

In `apps/backend/src/app.module.ts`, add the import:

```typescript
import {
  extractIp,
  extractSignupEmail,
  extractTaxCode,
} from './modules/auth/presentation/auth-rate-limit-trackers';
```

Replace:

```typescript
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
```

with:

```typescript
    ThrottlerModule.forRoot([
      {
        name: 'ip',
        ttl: 15 * 60 * 1000,
        limit: 20,
        getTracker: (req: Record<string, unknown>) => extractIp(req),
      },
      {
        name: 'email',
        ttl: 60 * 60 * 1000,
        limit: 5,
        getTracker: (req: Record<string, unknown>) =>
          extractSignupEmail(req) ?? 'no-email',
        skipIf: (context) =>
          extractSignupEmail(context.switchToHttp().getRequest()) === null,
      },
      {
        name: 'taxCode',
        ttl: 60 * 60 * 1000,
        limit: 5,
        getTracker: (req: Record<string, unknown>) =>
          extractTaxCode(req) ?? 'no-tax-code',
        skipIf: (context) =>
          extractTaxCode(context.switchToHttp().getRequest()) === null,
      },
    ]),
```

This makes `POST /auth/signup` (has both email and taxCode in its body) subject to all three dimensions, and `GET /tax-verification/lookup` (no email, taxCode in the query string) subject to `ip` and `taxCode` only — the `email` throttler is genuinely skipped for it via `skipIf`, not silently degraded to an empty-string tracker. `@nestjs/throttler`'s storage key already includes the controller class name and handler name (see `generateKey` in `@nestjs/throttler`'s `ThrottlerGuard`), so `signup` and `lookup` are tracked independently from each other automatically — no per-route config duplication needed.

- [ ] **Step 6: Remove the now-superseded tracker override from the guard**

Per-throttler `getTracker` (set in Step 5) takes priority over the guard class's own `getTracker()` override (confirmed by reading `@nestjs/throttler@6.5.0`'s `throttler.guard.js`: `const getTracker = routeOrClassGetTracker || namedThrottler.getTracker || this.commonOptions.getTracker;` — the class-level override is only ever the last-resort fallback). Replace the entire contents of `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthCompositeRateLimitGuard extends ThrottlerGuard {}
```

(Task 2 adds an escalation override to this class — it stays a real subclass, not a bare re-export, for that reason.)

- [ ] **Step 7: Type-check and run the affected e2e test**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand -t "rate-limit"`
Expected: PASS — the existing `'auth rate limiting returns the standard 429 envelope'` and `'tax-code lookup rate-limits after 5 requests per IP'` tests still pass under the new named-throttler config (both still exceed the `ip` dimension's limit well before 20, since they fire from a single IP repeatedly — but re-read both tests against the new thresholds before trusting this: the auth rate-limit test used the OLD `limit: 5`/`ttl: 60_000` config value implicitly; with the new `ip` throttler now at `limit: 20`, that test needs 20 attempts, not 5, to trip. Update its loop count from 5 to 20 attempts if it currently loops only 5 times — read the test in `apps/backend/test/auth-flow.e2e-spec.ts` first and fix its attempt count to match the new `ip` throttler's `limit: 20` before treating a failure here as a regression).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.ts apps/backend/src/modules/auth/presentation/auth-rate-limit-trackers.spec.ts apps/backend/src/app.module.ts apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts apps/backend/test/auth-flow.e2e-spec.ts
git commit -m "feat: independent IP/email/tax-code rate limits for signup and lookup"
```

(Include the e2e test file only if Step 7 required editing it.)

---

## Task 2: Escalating lockout after repeated violations

**Files:**
- Create: `apps/backend/src/common/rate-limiting/rate-limit-redis-client.provider.ts`
- Create: `apps/backend/src/common/rate-limiting/rate-limiting.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts`
- Test: `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the now-simplified guard class it modifies further.
- Produces: `RATE_LIMIT_REDIS_CLIENT` DI token (a plain `ioredis` `Redis` instance), and `AuthCompositeRateLimitGuard`'s escalation behavior — no other task depends on this.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.spec.ts
import { ThrottlerException } from '@nestjs/throttler';
import { AuthCompositeRateLimitGuard } from './auth-composite-rate-limit.guard';

function buildContext(ip = '203.0.113.5') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ header: jest.fn() }),
    }),
    getClass: () => ({ name: 'TestController' }),
    getHandler: () => ({ name: 'testHandler' }),
  } as unknown as ExecutionContext;
}

function buildGuard(redis: {
  get: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
}) {
  const options = { throttlers: [] };
  const storageService = {} as ThrottlerStorage;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  return new AuthCompositeRateLimitGuard(
    options,
    storageService,
    reflector,
    redis as unknown as Redis,
  );
}

describe('AuthCompositeRateLimitGuard escalation', () => {
  it('allows the request through when there is no escalation record', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('rejects immediately when the IP is already escalated', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue('3'),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('records a violation and keeps the 1-hour counting window when a throttler rejects and the threshold is not yet reached', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new ThrottlerException());

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(redis.incr).toHaveBeenCalledWith('abuse-escalation:203.0.113.5');
    expect(redis.expire).toHaveBeenCalledWith(
      'abuse-escalation:203.0.113.5',
      60 * 60,
    );
  });

  it('switches to the shorter lockout TTL once the violation threshold is reached', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(3),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new ThrottlerException());

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      'abuse-escalation:203.0.113.5',
      15 * 60,
    );
  });

  it('does not touch the escalation counter for non-throttling errors', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const guard = buildGuard(redis);
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new Error('unrelated failure'));

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      'unrelated failure',
    );
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
```

Add these imports at the top of the spec file:

```typescript
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
```

`jest.spyOn(ThrottlerGuard.prototype, 'canActivate')` stubs the base class's real implementation for every test — restore it with `jest.restoreAllMocks()` in an `afterEach` at the top of the `describe` block so one test's spy doesn't leak into the next.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/presentation/auth-composite-rate-limit.guard.spec.ts`
Expected: FAIL — the current guard's constructor doesn't accept a Redis client, and it has no escalation logic (`canActivate` is inherited unchanged from `ThrottlerGuard`, so none of the mocked `redis` calls happen and the "already escalated" test doesn't reject).

- [ ] **Step 3: Create the Redis client provider and module**

```typescript
// apps/backend/src/common/rate-limiting/rate-limit-redis-client.provider.ts
export const RATE_LIMIT_REDIS_CLIENT = Symbol('RATE_LIMIT_REDIS_CLIENT');
```

```typescript
// apps/backend/src/common/rate-limiting/rate-limiting.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RATE_LIMIT_REDIS_CLIENT } from './rate-limit-redis-client.provider';

@Module({
  providers: [
    {
      provide: RATE_LIMIT_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        }),
    },
  ],
  exports: [RATE_LIMIT_REDIS_CLIENT],
})
export class RateLimitingModule {}
```

This mirrors `modules/tax-verification/infrastructure/redis-client.provider.ts` + its module wiring exactly — a dedicated connection, not shared with BullMQ's.

In `apps/backend/src/app.module.ts`, import `RateLimitingModule` alongside the other root-level imports (same list `ThrottlerModule.forRoot(...)` already sits in), and add the import statement:

```typescript
import { RateLimitingModule } from './common/rate-limiting/rate-limiting.module';
```

added to the `imports` array right after `ThrottlerModule.forRoot([...])`. Registering it only at the `AppModule` root (never re-imported inside `AuthModule`/`TaxVerificationModule`) mirrors exactly how `ThrottlerModule.forRoot`'s own options/storage already resolve today for this same guard used across two modules with no explicit per-module import — if this resolution assumption turns out wrong when you run the app (a `ThrottlerGuard`/`AuthCompositeRateLimitGuard` instantiation error at boot or first request), export `RateLimitingModule` from `CommonTokensModule` (already imported everywhere) instead, or add it directly to whichever module fails to resolve it.

- [ ] **Step 4: Add escalation to the guard**

Replace the entire contents of `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts`:

```typescript
import type { ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { RATE_LIMIT_REDIS_CLIENT } from '../../../common/rate-limiting/rate-limit-redis-client.provider';

const VIOLATION_THRESHOLD = 3;
const VIOLATION_WINDOW_SECONDS = 60 * 60;
const LOCKOUT_SECONDS = 15 * 60;

function escalationKeyFor(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<Record<string, unknown>>();
  const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
  return `abuse-escalation:${ip}`;
}

@Injectable()
export class AuthCompositeRateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(RATE_LIMIT_REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = escalationKeyFor(context);
    const violations = Number((await this.redis.get(key)) ?? 0);
    if (violations >= VIOLATION_THRESHOLD) {
      throw new ThrottlerException();
    }

    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        const count = await this.redis.incr(key);
        await this.redis.expire(
          key,
          count >= VIOLATION_THRESHOLD ? LOCKOUT_SECONDS : VIOLATION_WINDOW_SECONDS,
        );
      }
      throw error;
    }
  }
}
```

`InjectThrottlerOptions`/`InjectThrottlerStorage` are the exact parameter decorators `ThrottlerGuard`'s own constructor uses internally (confirmed by reading the installed `@nestjs/throttler@6.5.0`'s `throttler.guard.js`) — repeating them on the subclass constructor and forwarding to `super(...)` is the standard, fully-typed way to extend a Nest-DI-constructed class with one extra constructor parameter, with no unsafe casts.

- [ ] **Step 5: Run test to verify it passes, then verify against the real app**

Run: `npx jest --testPathPatterns modules/auth/presentation/auth-composite-rate-limit.guard.spec.ts`
Expected: PASS (5 tests) — this only proves the escalation logic in isolation with a mocked `super.canActivate`.

Then run the real e2e suite to prove the guard still boots and functions with Nest's actual DI (this is the step that validates or invalidates the `super(...)` placeholder-args concern above):

Run: `pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand -t "rate-limit"`
Expected: PASS. If the app fails to boot or every request 500s instead of enforcing limits, fix the constructor per the fallback described in Step 4 and re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/rate-limiting/rate-limit-redis-client.provider.ts apps/backend/src/common/rate-limiting/rate-limiting.module.ts apps/backend/src/app.module.ts apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.spec.ts
git commit -m "feat: escalating lockout for repeated rate-limit violations"
```

---

## Task 3: `OrganizationVerificationMethod` domain field on `OperatorAuditLog`

**Files:**
- Modify: `apps/backend/src/modules/admin/domain/operator-audit-log.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts`
- Create: `apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.ts`
- Test: `apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.spec.ts`

**Interfaces:**
- Produces: `OrganizationVerificationMethod` type (`'TAX_CODE_NAME_MATCH_ONLY' | 'BUSINESS_REGISTRATION_DOCUMENT' | 'PHONE_CALL' | 'OTHER'`) and `OperatorAuditLog.verificationMethod: OrganizationVerificationMethod | null`. Task 4 (`ApproveOrganizationUseCase`) and its DTO consume this type.

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddOperatorAuditLogVerificationMethod20260906000000 } from './20260906000000-add-operator-audit-log-verification-method';

describe('AddOperatorAuditLogVerificationMethod20260906000000', () => {
  it('adds the nullable verificationMethod column', async () => {
    const migration = new AddOperatorAuditLogVerificationMethod20260906000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "verificationMethod" character varying',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddOperatorAuditLogVerificationMethod20260906000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "verificationMethod"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns database/migrations/20260906000000-add-operator-audit-log-verification-method.spec.ts`
Expected: FAIL — `Cannot find module './20260906000000-add-operator-audit-log-verification-method'`

- [ ] **Step 3: Write the migration and domain/infrastructure changes**

```typescript
// apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogVerificationMethod20260906000000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogVerificationMethod20260906000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "verificationMethod" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "verificationMethod"',
    );
  }
}
```

In `apps/backend/src/modules/admin/domain/operator-audit-log.ts`, add above `OperatorAuditLogProps`:

```typescript
export type OrganizationVerificationMethod =
  | 'TAX_CODE_NAME_MATCH_ONLY'
  | 'BUSINESS_REGISTRATION_DOCUMENT'
  | 'PHONE_CALL'
  | 'OTHER';
```

Add to `OperatorAuditLogProps`: `verificationMethod?: OrganizationVerificationMethod | null;`

Add to the `OperatorAuditLog` class: `readonly verificationMethod: OrganizationVerificationMethod | null;` and in the constructor, alongside the other `?? null` assignments: `this.verificationMethod = props.verificationMethod ?? null;`

In `apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`, add after the `reason` column:

```typescript
  @Column({ type: 'varchar', nullable: true })
  verificationMethod: string | null;
```

In `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts`, in `toOrm()`, add: `row.verificationMethod = log.verificationMethod;`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns "database/migrations/20260906000000|modules/admin"`
Expected: PASS — the new migration spec, plus every existing `admin` module spec still green (constructing `OperatorAuditLog` without `verificationMethod` must still work, since it's optional).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/admin/domain/operator-audit-log.ts apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.ts apps/backend/src/database/migrations/20260906000000-add-operator-audit-log-verification-method.spec.ts
git commit -m "feat: add OrganizationVerificationMethod to OperatorAuditLog"
```

---

## Task 4: Require verification-method evidence on organization approval

**Files:**
- Modify: `apps/backend/src/modules/admin/application/transition-pending-organization.ts`
- Modify: `apps/backend/src/modules/admin/application/approve-organization.usecase.ts`
- Modify: `apps/backend/src/modules/admin/application/approve-organization.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/presentation/dto/approve-organization.dto.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.ts`

**Interfaces:**
- Consumes: `OrganizationVerificationMethod` (Task 3).
- Produces: `ApproveOrganizationInput` gains a required `verificationMethod: OrganizationVerificationMethod` field (and optional `reason?: string`). No other task depends on this.

- [ ] **Step 1: Write the failing test**

Find the existing test file first — if `apps/backend/src/modules/admin/application/approve-organization.usecase.spec.ts` does not exist yet, create it fresh with only the test below; if it exists, add this test to it (read the file first and follow its existing mock-building style for `dataSource`/`organizationRepo`/`auditRepo`/`membershipRepo`/`userRepo`/`memberNotificationSender`).

```typescript
it('records the verification method on the OperatorAuditLog row', async () => {
  const savedAuditLogs: unknown[] = [];
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: object) => Promise<unknown>) =>
      callback({}),
    ),
  };
  const organization = {
    id: 'org-1',
    name: 'Acme Co',
    status: 'PENDING_REVIEW',
    approve: () => ({ id: 'org-1', name: 'Acme Co', status: 'ACTIVE' }),
  };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue(organization),
    save: jest.fn(),
  };
  const auditRepo = {
    save: jest.fn((log: unknown) => {
      savedAuditLogs.push(log);
      return Promise.resolve();
    }),
  };
  const membershipRepo = { findOwnerByOrganization: jest.fn().mockResolvedValue(null) };
  const userRepo = { findById: jest.fn() };
  const memberNotificationSender = { sendOrganizationApprovedEmail: jest.fn() };

  const useCase = new ApproveOrganizationUseCase(
    dataSource as any,
    organizationRepo as any,
    auditRepo as any,
    membershipRepo as any,
    userRepo as any,
    memberNotificationSender as any,
  );

  await useCase.execute({
    organizationId: 'org-1',
    operatorId: 'operator-1',
    verificationMethod: 'BUSINESS_REGISTRATION_DOCUMENT',
  });

  expect(savedAuditLogs).toEqual([
    expect.objectContaining({
      verificationMethod: 'BUSINESS_REGISTRATION_DOCUMENT',
    }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/admin/application/approve-organization.usecase.spec.ts`
Expected: FAIL — `ApproveOrganizationInput` doesn't have `verificationMethod`, so TypeScript would reject this at compile time if run through `tsc`, and at minimum the audit log saved today has no `verificationMethod` field, so the assertion fails.

- [ ] **Step 3: Thread `verificationMethod` through the use case, DTO, and controller**

In `apps/backend/src/modules/admin/application/transition-pending-organization.ts`, add to `TransitionPendingOrganizationInput`:

```typescript
  verificationMethod?: OrganizationVerificationMethod;
```

(add `import type { OrganizationVerificationMethod } from '../domain/operator-audit-log';` — `OperatorAuditLog`/`OperatorActionType` are already imported from that file as a value import; add `OrganizationVerificationMethod` as an additional named type import in the same `import type` grouping if one already exists there, otherwise add it to the existing value-import line's sibling type-only import).

In the same file, in the `OperatorAuditLog` constructor call inside `transitionPendingOrganization`, add: `verificationMethod: input.verificationMethod,` alongside the existing `reason: input.reason,`.

In `apps/backend/src/modules/admin/application/approve-organization.usecase.ts`:

```typescript
export interface ApproveOrganizationInput {
  organizationId: string;
  operatorId: string;
  verificationMethod: OrganizationVerificationMethod;
  reason?: string;
}
```

(add `import type { OrganizationVerificationMethod } from '../domain/operator-audit-log';`)

In `execute()`, pass the new fields through to `transitionPendingOrganization`:

```typescript
    await transitionPendingOrganization({
      dataSource: this.dataSource,
      organizationRepo: this.organizationRepo,
      auditRepo: this.auditRepo,
      membershipRepo: this.membershipRepo,
      userRepo: this.userRepo,
      organizationId: input.organizationId,
      operatorId: input.operatorId,
      actionType: 'ORGANIZATION_APPROVED',
      verificationMethod: input.verificationMethod,
      reason: input.reason,
      transition: (organization) => organization.approve(),
      notify: (email, name) =>
        this.memberNotificationSender.sendOrganizationApprovedEmail(
          email,
          name,
        ),
    });
```

Create `apps/backend/src/modules/admin/presentation/dto/approve-organization.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ORGANIZATION_VERIFICATION_METHODS = [
  'TAX_CODE_NAME_MATCH_ONLY',
  'BUSINESS_REGISTRATION_DOCUMENT',
  'PHONE_CALL',
  'OTHER',
] as const;

export class ApproveOrganizationDto {
  @ApiProperty({ enum: ORGANIZATION_VERIFICATION_METHODS })
  @IsIn(ORGANIZATION_VERIFICATION_METHODS)
  verificationMethod: (typeof ORGANIZATION_VERIFICATION_METHODS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
```

In `apps/backend/src/modules/admin/presentation/admin.controller.ts`, add the import:

```typescript
import { ApproveOrganizationDto } from './dto/approve-organization.dto';
```

Replace the `approve` handler:

```typescript
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveOrganizationDto,
    @Req() request: AdminRequest,
  ) {
    await this.approveOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
      verificationMethod: dto.verificationMethod,
      reason: dto.reason,
    });
    return { status: 'ACTIVE' as const };
  }
```

Add `@ApiBody({ type: ApproveOrganizationDto })` under the existing `@ApiOperation` for this route if the controller's other `@Body()`-taking routes use `@ApiBody` (check `reject`'s decorators — if it relies on Nest Swagger's automatic DTO-from-`@Body()`-type inference instead, do the same for `approve` and skip adding `@ApiBody` explicitly).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns modules/admin`
Expected: PASS — including the new test from Step 1 and every pre-existing admin spec (all callers of `ApproveOrganizationUseCase.execute` elsewhere, e.g. any e2e/integration test, now need `verificationMethod` in their input too — grep for `approveOrganizationUseCase.execute(` and `.approve(` calls across `test/*.e2e-spec.ts` and fix any that break from the new required field).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/admin/application/transition-pending-organization.ts apps/backend/src/modules/admin/application/approve-organization.usecase.ts apps/backend/src/modules/admin/application/approve-organization.usecase.spec.ts apps/backend/src/modules/admin/presentation/dto/approve-organization.dto.ts apps/backend/src/modules/admin/presentation/admin.controller.ts
git commit -m "feat: require verification-method evidence when approving an organization"
```

(Add any e2e test files touched in Step 4 to this commit too.)

---

## Task 5: Structured audit logging for signup, verification, and resend

**Files:**
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts`
- Modify: `apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts`

**Interfaces:**
- No new exported interfaces — purely additive logging inside existing `execute()` methods. No other task depends on this.

- [ ] **Step 1: Write the failing tests**

In `signup.usecase.spec.ts`, add:

```typescript
it('logs a non-secret signup-requested event after the PendingSignup is saved', async () => {
  const common = buildCommonMocks();
  const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
  const useCase = buildUseCase(common, taxCodeLookup);
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  await useCase.execute({
    organizationName: 'Acme Co',
    name: 'An',
    email: 'an@acme.vn',
    password: 'S3curePass!',
    taxCode: '0101234567',
  });

  expect(logSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Signup requested',
      email: 'an@acme.vn',
      taxCode: '0101234567',
    }),
  );
  const loggedPayload = JSON.stringify(logSpy.mock.calls[0][0]);
  expect(loggedPayload).not.toMatch(/S3curePass!/);
  logSpy.mockRestore();
});
```

(add `import { Logger } from '@nestjs/common';` to the top of the spec file if not already imported)

In `verify-email.usecase.spec.ts`, add to the "PendingSignup branch" describe block:

```typescript
it('logs a non-secret pending-signup-verified event after provisioning', async () => {
  const otp = '482913';
  const pendingSignup = buildPendingSignup();
  const provisionedUser = new User({
    id: 'user-1',
    name: 'An',
    email: 'a@b.vn',
    passwordHash: 'hashed',
    emailVerifiedAt: null,
    createdAt: new Date(),
  });
  const pendingSignupRepo = {
    findByEmail: jest.fn().mockResolvedValue(pendingSignup),
    delete: jest.fn(),
  };
  const provisionOrganizationUseCase = {
    execute: jest.fn().mockResolvedValue({
      user: provisionedUser,
      organization: { id: 'org-1' },
      membership: { id: 'membership-1' },
    }),
  };
  const userRepo = { findByEmail: jest.fn().mockResolvedValue(null), save: jest.fn() };
  const loginUseCase = {
    executeForUser: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: object) => Promise<unknown>) => callback({}),
    ),
  };
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  const useCase = new VerifyEmailUseCase(
    { findByUserIdAndTokenHash: jest.fn() } as any,
    userRepo as any,
    pendingSignupRepo as any,
    provisionOrganizationUseCase as any,
    dataSource as any,
    loginUseCase as any,
  );
  await useCase.execute('a@b.vn', otp);

  expect(logSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Pending signup verified',
      email: 'a@b.vn',
      userId: 'user-1',
      organizationId: 'org-1',
    }),
  );
  logSpy.mockRestore();
});
```

(add `import { Logger } from '@nestjs/common';` to the spec file if not already imported)

In `resend-verification-email.usecase.spec.ts`, add:

```typescript
it('logs a non-secret OTP-resent event for a pending signup', async () => {
  const pendingSignup = new PendingSignup({
    id: 'pending-1',
    email: 'new@casso.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'old-hash',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  });
  const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
  const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
  const pendingSignupRepo = {
    findByEmail: jest.fn().mockResolvedValue(pendingSignup),
    save: jest.fn(),
  };
  const emailSender = { sendVerificationEmail: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  const useCase = new ResendVerificationEmailUseCase(
    userRepo as any,
    verificationTokenRepo as any,
    pendingSignupRepo as any,
    emailSender as any,
    dataSource as any,
  );
  await useCase.execute('new@casso.vn');

  expect(logSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Verification OTP resent',
      email: 'new@casso.vn',
    }),
  );
  const loggedPayload = JSON.stringify(logSpy.mock.calls[0][0]);
  expect(loggedPayload).not.toMatch(/old-hash/);
  logSpy.mockRestore();
});
```

(add `import { Logger } from '@nestjs/common';` to the spec file if not already imported)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPatterns "modules/auth/application/(signup|verify-email|resend-verification-email).usecase.spec.ts"`
Expected: FAIL (3 new tests) — `logSpy` is never called because none of the three use cases log anything today.

- [ ] **Step 3: Add the log calls**

In `apps/backend/src/modules/auth/application/signup.usecase.ts`, add `Logger` to the `@nestjs/common` import, add `private readonly logger = new Logger(SignupUseCase.name);` as a class field, and add a log call after the `dataSource.transaction(...)` that saves the `PendingSignup` (before `await this.emailSender.sendVerificationEmail(...)`):

```typescript
    this.logger.log({ message: 'Signup requested', email, taxCode: input.taxCode });
```

In `apps/backend/src/modules/auth/application/verify-email.usecase.ts`, add `Logger` to the `@nestjs/common` import, add `private readonly logger = new Logger(VerifyEmailUseCase.name);`, and inside the `dataSource.transaction` callback for the PendingSignup branch, right after `await this.pendingSignupRepo.delete(pendingSignup.id, manager);` and before `return provisioned.user.id;`:

```typescript
        this.logger.log({
          message: 'Pending signup verified',
          email: pendingSignup.email,
          userId: provisioned.user.id,
          organizationId: provisioned.organization.id,
        });
```

In `apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts`, add `Logger` to the `@nestjs/common` import, add `private readonly logger = new Logger(ResendVerificationEmailUseCase.name);`, and after the `await this.pendingSignupRepo.save(...)` call in the PendingSignup branch, before `await this.emailSender.sendVerificationEmail(...)`:

```typescript
    this.logger.log({ message: 'Verification OTP resent', email: pendingSignup.email });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns "modules/auth/application/(signup|verify-email|resend-verification-email).usecase.spec.ts"`
Expected: PASS — all tests in all three files, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/signup.usecase.ts apps/backend/src/modules/auth/application/signup.usecase.spec.ts apps/backend/src/modules/auth/application/verify-email.usecase.ts apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts
git commit -m "feat: structured audit logging for signup, verification, and resend"
```

---

## Task 6: E2E coverage for rate-limit dimensions, escalation, and approval evidence

**Files:**
- Modify: `apps/backend/test/auth-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: the real HTTP surface wired through Tasks 1–5.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/test/auth-flow.e2e-spec.ts` (inside the existing `describe('Auth flow (integration)', ...)` block):

```typescript
  it('tax-code dimension rate-limits signup independently of the email dimension', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          organizationName: 'Company E',
          name: 'Emi',
          email: `emi${attempt}@congtye.vn`,
          password: 'S3curePass!',
          taxCode: '0777777770',
        })
        .expect((res) => {
          expect([201, 409]).toContain(res.status);
        });
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company E',
        name: 'Emi',
        email: 'emi-final@congtye.vn',
        password: 'S3curePass!',
        taxCode: '0777777770',
      })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('escalates an IP to a lockout after repeated throttled attempts', async () => {
    throttlerStorage.storage.clear();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: `080000000${attempt}` })
        .expect(200);
    }
    for (let violation = 0; violation < 3; violation += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: `081111111${violation}` })
        .expect(429);
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0822222222' })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });
```

Note: these two tests are sequential/order-sensitive with the rest of the file's rate-limit-consuming tests (they share the same `ThrottlerStorage` for the whole `describe` block) — place them immediately after the existing `'tax-code lookup rate-limits after 5 requests per IP'` test, and call `throttlerStorage.storage.clear()` at the start of each new test the same way that existing test already does, to avoid cross-test interference. Adjust the first test's per-request-attempt tax code and email counts if Task 1's final `email`/`taxCode` thresholds differ from 5 by the time this task runs (re-read `app.module.ts`'s throttler config first).

For approval evidence, extend the existing `'invite creates a hashed invite for the authenticated owner'` test's neighborhood — but that test flow doesn't call approve. Add a new e2e test file section if one exists for admin org approval (`grep -rl "organizations/:id/approve\|/admin/organizations" apps/backend/test/`); if no e2e file currently exercises the admin approve route at all, add this test to `auth-flow.e2e-spec.ts` only if an authenticated operator/admin login helper already exists in this file — otherwise, add a unit-level unit test instead (already covered by Task 4 Step 1) and skip the e2e case here, noting the gap in your final report rather than inventing new operator-auth e2e scaffolding out of scope for this plan.

- [ ] **Step 2: Run tests to verify they fail against pre-Task-1-6 behavior**

This step only makes sense once Tasks 1–5 are already applied (they will be, since this is the last application-code task) — confirm the two new tests fail if you temporarily revert the `ip`/`taxCode` throttler limits to something the loop counts don't trip (e.g., comment out the escalation `VIOLATION_THRESHOLD` check in the guard and rerun) to prove the assertions are real, then restore.

Run: `npx jest -c test/jest-e2e.json --testPathPatterns auth-flow.e2e-spec -t "tax-code dimension rate-limits|escalates an IP"`

- [ ] **Step 3: Run the full file**

Run: `pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand`
Expected: PASS (requires Docker for Postgres and a reachable Redis for both `AuthCompositeRateLimitGuard`'s escalation counter and BullMQ's email queue — if Redis is unavailable in this environment, report that limitation exactly, per the same note in the #336 plan's Task 12).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/auth-flow.e2e-spec.ts
git commit -m "test: cover independent rate-limit dimensions and escalation end to end"
```

---

## Task 7: Full verification

**Files:**
- No additional files — verifies the committed backend changes from Tasks 1–6.

- [ ] **Step 1: Run the full backend unit suite**

```bash
pnpm --filter @casso-ledger/backend test
```

Expected: all suites pass, including every spec touched or added in Tasks 1–5.

- [ ] **Step 2: Run the backend domain check**

Run the repository's `/domain-check` skill. Confirm no violations — in particular, that no new log call includes `otp`/`password`/`passwordHash`, and that `AuthCompositeRateLimitGuard` throwing `ThrottlerException` directly (a presentation-layer guard, not an application-layer use case) is recognized as the documented exception to the `AppError`-only rule, not flagged as a violation.

- [ ] **Step 3: Run the repository verification gate**

```bash
pnpm verify
```

Expected: lint, type-check, tests, dependency-cruiser, application-boundary checks, cross-module checks, and controller-doc checks all pass. `AdminController`'s `approve` route gained a `@Body()` DTO — confirm `scripts/check-controller-docs.mjs` has no new complaint about it (it already carries `@ApiOperation`/`@ApiCreatedResponse`/`@ApiErrorResponse`, unchanged by this plan).

- [ ] **Step 4: Run the e2e regression when Docker (and Redis) are available**

```bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand
```

Expected: PASS against real Postgres + Redis. If Redis is unavailable in this environment (observed to be the case during #336's planning), report that exact limitation rather than claiming the e2e suite passed.

- [ ] **Step 5: Inspect the final diff and status**

```bash
git diff main...HEAD --stat
git status --short --branch
```

Confirm only the spec, plan, ADR, `CONTEXT.md`, and the backend files touched by Tasks 1–6 are present.

## Completion Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-signup-abuse-hardening.md`.

Execution choices:

1. **Subagent-driven execution (recommended):** dispatch a fresh subagent per task and review after each task using `superpowers:subagent-driven-development`.
2. **Inline execution:** execute the tasks in this session using `superpowers:executing-plans` with checkpoints.
