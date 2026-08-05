# Application Layer Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `apps/backend/src/modules/*/application/*` from depending on concrete framework/SDK types (`HttpException` and friends, `JwtService`), replace them with `AppError` and an `ITokenSigner` port, and make the boundary self-enforcing (rule docs + CI) so it cannot silently regress the way "Controllers translate domain errors → HTTP response" already did.

**Architecture:** `AppError` is a plain `Error` subclass carrying `errorCode`/`details`; the existing global `HttpExceptionFilter` gains one branch that maps it to the same envelope shape it already produces for `HttpException`, so the client-visible contract does not change. `ITokenSigner` is a new port in `auth/application/` implemented by a thin `infrastructure/` adapter wrapping the existing `JwtService`. Enforcement is a CI-only gate (dependency-cruiser + a small Node script) — no runtime behavior changes.

**Tech Stack:** NestJS 11, TypeORM 1.1, Jest 30, TypeScript 6.0, pnpm workspaces + Turborepo, dependency-cruiser (new devDependency).

**Design doc:** `docs/superpowers/specs/2026-08-05-application-layer-boundaries-design.md`

## Global Constraints

- No change to the error envelope shape (`{ statusCode, errorCode, message, details? }`), HTTP status codes, or JWT contents observed by clients.
- No change to `domain/`, `infrastructure/`, or `presentation/` source code — those layers already comply with the boundary rules; only their `.claude/rules/*.md` docs gain clarifying lines.
- `DataSource`/`EntityManager` usage in use cases and `bcryptjs` in `password-hasher.ts` are explicitly out of scope — not touched.
- Every modified use case's existing unit test suite must still pass; no test's assertion on business behavior (only on exception shape) changes.
- Follow repo conventions: kebab-case files, `Symbol('X')` DI tokens, `*.spec.ts` next to source.

---

### Task 1: `AppError` and filter support

**Files:**
- Create: `apps/backend/src/common/errors/app-error.ts`
- Modify: `apps/backend/src/common/errors/http-exception.filter.ts`
- Test: `apps/backend/src/common/errors/http-exception.filter.spec.ts`

**Interfaces:**
- Produces: `class AppError extends Error { constructor(public readonly errorCode: ErrorCode, message: string, public readonly details?: unknown) }` — used by Tasks 2 and 3 as the replacement for `HttpException`/`NotFoundException`.

- [ ] **Step 1: Add failing tests for `AppError` mapping**

Add to the end of the `describe('HttpExceptionFilter', ...)` block in `apps/backend/src/common/errors/http-exception.filter.spec.ts` (after the existing 4 `it(...)` blocks, before the closing `});`), and add the import at the top:

```ts
import { AppError } from './app-error';
```

```ts
  it('maps AppError to the standard envelope using the error code', () => {
    expect(
      captureResponse(new AppError(ErrorCode.UNAUTHORIZED, 'Incorrect password.')),
    ).toEqual({
      statusCode: 401,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Incorrect password.',
    });
  });

  it('maps AppError with details to the standard envelope', () => {
    expect(
      captureResponse(
        new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, 'Plan limit reached.', {
          planId: 'FREE',
        }),
      ),
    ).toEqual({
      statusCode: 402,
      errorCode: ErrorCode.PLAN_LIMIT_EXCEEDED,
      message: 'Plan limit reached.',
      details: { planId: 'FREE' },
    });
  });

  it('maps AppError with an unmapped error code to 500', () => {
    expect(
      captureResponse(new AppError(ErrorCode.EMAIL_SEND_FAILED, 'Failed to send email.')),
    ).toEqual({
      statusCode: 500,
      errorCode: ErrorCode.EMAIL_SEND_FAILED,
      message: 'Failed to send email.',
    });
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/backend && npx jest --testPathPattern http-exception.filter -v`
Expected: FAIL — either a module-not-found error for `./app-error` (file doesn't exist yet), or once Step 3 creates the class, the 3 new assertions fail because `AppError` isn't `instanceof HttpException` and falls through to the generic 500 branch with the wrong `errorCode`/`message`.

- [ ] **Step 3: Create `AppError`**

```ts
// apps/backend/src/common/errors/app-error.ts
import type { ErrorCode } from './error-code';

export class AppError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 4: Teach the filter to map `AppError`**

In `apps/backend/src/common/errors/http-exception.filter.ts`, add the import:

```ts
import { AppError } from './app-error';
```

Replace:

```ts
  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (!(exception instanceof HttpException)) {
```

with:

```ts
  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppError) {
      return {
        statusCode: this.statusForErrorCode(exception.errorCode),
        errorCode: exception.errorCode,
        message: exception.message,
        ...(exception.details === undefined
          ? {}
          : { details: exception.details }),
      };
    }
    if (!(exception instanceof HttpException)) {
```

Add a new private method, next to `codeForStatus`:

```ts
  private statusForErrorCode(errorCode: ErrorCode): number {
    const statusByErrorCode: Partial<Record<ErrorCode, number>> = {
      [ErrorCode.VALIDATION_ERROR]: 400,
      [ErrorCode.UNAUTHORIZED]: 401,
      [ErrorCode.FORBIDDEN]: 403,
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.RECEIVABLE_NOT_FOUND]: 404,
      [ErrorCode.CONFLICT]: 409,
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
      [ErrorCode.PLAN_LIMIT_EXCEEDED]: 402,
    };
    return statusByErrorCode[errorCode] ?? 500;
  }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd apps/backend && npx jest --testPathPattern http-exception.filter -v`
Expected: PASS, all 7 tests (4 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/errors/app-error.ts apps/backend/src/common/errors/http-exception.filter.ts apps/backend/src/common/errors/http-exception.filter.spec.ts
git commit -m "feat: add AppError for application-layer error throwing"
```

---

### Task 2: Auth module — `ITokenSigner` + `AppError` migration

**Files:**
- Create: `apps/backend/src/modules/auth/application/token-signer.port.ts`
- Create: `apps/backend/src/modules/auth/infrastructure/jwt-token-signer.adapter.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Modify: `apps/backend/src/modules/auth/application/login.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/refresh-access-token.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/switch-organization.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/accept-invite.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/reset-password.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/login.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/accept-invite.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/reset-password.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts`

**Interfaces:**
- Consumes: `AppError` from Task 1 (`apps/backend/src/common/errors/app-error.ts`).
- Produces: `interface ITokenSigner { sign(payload: Record<string, unknown>): string }`, `TOKEN_SIGNER` DI symbol — not consumed by later tasks, self-contained to this module.

- [ ] **Step 1: Create the `ITokenSigner` port**

```ts
// apps/backend/src/modules/auth/application/token-signer.port.ts
export interface ITokenSigner {
  sign(payload: Record<string, unknown>): string;
}

export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');
```

- [ ] **Step 2: Create the `JwtTokenSigner` adapter**

```ts
// apps/backend/src/modules/auth/infrastructure/jwt-token-signer.adapter.ts
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { JwtService } from '@nestjs/jwt';
import type { ITokenSigner } from '../application/token-signer.port';

@Injectable()
export class JwtTokenSigner implements ITokenSigner {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload);
  }
}
```

- [ ] **Step 3: Wire `TOKEN_SIGNER` into `auth.module.ts`**

Add imports:

```ts
import { TOKEN_SIGNER } from './application/token-signer.port';
```

```ts
import { JwtTokenSigner } from './infrastructure/jwt-token-signer.adapter';
```

Add to the `providers` array (alongside the other `{ provide, useClass }` entries):

```ts
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
```

- [ ] **Step 4: Migrate `login.usecase.ts`**

Replace the import block:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-code';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
```

Add import (alphabetically with the other local imports, before `./password-hasher`):

```ts
import { TOKEN_SIGNER, type ITokenSigner } from './token-signer.port';
```

Replace the constructor:

```ts
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly jwtService: JwtService,
  ) {}
```

with:

```ts
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
  ) {}
```

Replace both throw sites — first:

```ts
      throw new HttpException(
        {
          statusCode: 401,
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'Incorrect email or password.',
        },
        401,
      );
```

with:

```ts
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Incorrect email or password.');
```

second:

```ts
      throw new HttpException(
        {
          statusCode: 403,
          errorCode: ErrorCode.FORBIDDEN,
          message: 'The account does not belong to any organization.',
        },
        403,
      );
```

with:

```ts
      throw new AppError(ErrorCode.FORBIDDEN, 'The account does not belong to any organization.');
```

Replace the sign call:

```ts
    const accessToken = this.jwtService.sign({
```

with:

```ts
    const accessToken = this.tokenSigner.sign({
```

- [ ] **Step 5: Update `login.usecase.spec.ts`**

Replace:

```ts
    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ errorCode: 'UNAUTHORIZED' }),
    });
```

with:

```ts
    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
```

(The mock object passed as the 4th constructor arg already has only a `.sign()` method, matching `ITokenSigner` — no other change needed in this file.)

- [ ] **Step 6: Run auth login test**

Run: `cd apps/backend && npx jest --testPathPattern login.usecase -v`
Expected: PASS (2 tests)

- [ ] **Step 7: Migrate `refresh-access-token.usecase.ts`**

Replace:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { TOKEN_SIGNER, type ITokenSigner } from './token-signer.port';
```

Replace the constructor:

```ts
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}
```

with:

```ts
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
    private readonly dataSource: DataSource,
  ) {}
```

Replace the three throw sites (all identical in this file, appearing twice with 401 and once with 403):

```ts
      throw new HttpException(
        {
          statusCode: 401,
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'The refresh token is invalid or expired.',
        },
        401,
      );
```

with (both occurrences):

```ts
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'The refresh token is invalid or expired.',
      );
```

and:

```ts
        throw new HttpException(
          {
            statusCode: 403,
            errorCode: ErrorCode.FORBIDDEN,
          message: 'The account does not belong to any organization.',
          },
          403,
        );
```

with:

```ts
        throw new AppError(ErrorCode.FORBIDDEN, 'The account does not belong to any organization.');
```

Replace the sign call:

```ts
      const accessToken = this.jwtService.sign({
```

with:

```ts
      const accessToken = this.tokenSigner.sign({
```

No test change needed — `refresh-access-token.usecase.spec.ts` passes a plain `{ sign: jest.fn()... }` mock as the 3rd constructor arg via `as any`, which satisfies `ITokenSigner` identically to how it satisfied `JwtService` in the test.

- [ ] **Step 8: Run refresh-access-token test**

Run: `cd apps/backend && npx jest --testPathPattern refresh-access-token -v`
Expected: PASS (1 test)

- [ ] **Step 9: Migrate `switch-organization.usecase.ts`**

Replace the whole file:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';

@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
  ): Promise<{ accessToken: string }> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      userId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new HttpException(
        {
          statusCode: 403,
          errorCode: ErrorCode.FORBIDDEN,
          message: 'The user does not belong to this organization.',
        },
        403,
      );
    }
    return {
      accessToken: this.jwtService.sign({
        userId,
        organizationId,
        role: membership.role,
      }),
    };
  }
}
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { TOKEN_SIGNER, type ITokenSigner } from './token-signer.port';

@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
  ): Promise<{ accessToken: string }> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      userId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new AppError(ErrorCode.FORBIDDEN, 'The user does not belong to this organization.');
    }
    return {
      accessToken: this.tokenSigner.sign({
        userId,
        organizationId,
        role: membership.role,
      }),
    };
  }
}
```

No spec file exists for this use case today — none to update.

- [ ] **Step 10: Migrate `accept-invite.usecase.ts`**

Replace the import line:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
```

Add, immediately after the `typeorm` import:

```ts
import { AppError } from '../../../common/errors/app-error';
```

Replace all 4 throw sites:

```ts
      throw new HttpException(
        {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'The invitation has expired or has already been used.',
        },
        400,
      );
```
→
```ts
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'The invitation has expired or has already been used.',
      );
```

```ts
      throw new HttpException(
        {
          statusCode: 401,
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'The current user must be logged in to accept the invitation.',
        },
        401,
      );
```
→
```ts
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'The current user must be logged in to accept the invitation.',
      );
```

```ts
        throw new HttpException(
          {
            statusCode: 400,
            errorCode: ErrorCode.VALIDATION_ERROR,
            message: 'A password is required to create a new account.',
          },
          400,
        );
```
→
```ts
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'A password is required to create a new account.',
        );
```

```ts
      throw new HttpException(
        {
          statusCode: 409,
          errorCode: ErrorCode.CONFLICT,
            message: 'The user is already a member of this organization.',
        },
        409,
      );
```
→
```ts
      throw new AppError(
        ErrorCode.CONFLICT,
        'The user is already a member of this organization.',
      );
```

- [ ] **Step 11: Update `accept-invite.usecase.spec.ts`**

Replace:

```ts
    await expect(
      useCase.execute({ token: rawToken, password: 'x' }),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }),
    });
```

with:

```ts
    await expect(
      useCase.execute({ token: rawToken, password: 'x' }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
```

- [ ] **Step 12: Migrate `reset-password.usecase.ts`**

Replace the import line:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
```

Add, immediately after the `typeorm` import:

```ts
import { AppError } from '../../../common/errors/app-error';
```

Replace both throw sites:

```ts
        throw new HttpException(
          {
            statusCode: 400,
            errorCode: ErrorCode.VALIDATION_ERROR,
            message: 'The password reset token is invalid or expired.',
          },
          400,
        );
```
→
```ts
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'The password reset token is invalid or expired.',
        );
```

```ts
      const user = await this.userRepo.findById(resetToken.userId, manager);
      if (!user)
        throw new HttpException(
          {
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
            message: 'User not found.',
          },
          404,
        );
```
→
```ts
      const user = await this.userRepo.findById(resetToken.userId, manager);
      if (!user) {
        throw new AppError(ErrorCode.NOT_FOUND, 'User not found.');
      }
```

- [ ] **Step 13: Update `reset-password.usecase.spec.ts`**

Replace:

```ts
    await expect(
      useCase.execute({ token: rawToken, newPassword: 'x' }),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }),
    });
```

with:

```ts
    await expect(
      useCase.execute({ token: rawToken, newPassword: 'x' }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
```

- [ ] **Step 14: Migrate `signup.usecase.ts`**

Replace the import line:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
```

Add, immediately after the `typeorm` import:

```ts
import { AppError } from '../../../common/errors/app-error';
```

Replace the throw site:

```ts
      throw new HttpException(
        {
          statusCode: 409,
          errorCode: ErrorCode.CONFLICT,
          message: 'The email is already registered.',
        },
        409,
      );
```

with:

```ts
      throw new AppError(ErrorCode.CONFLICT, 'The email is already registered.');
```

- [ ] **Step 15: Update `signup.usecase.spec.ts`**

Replace:

```ts
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ errorCode: 'CONFLICT' }),
    });
```

with:

```ts
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
    });
```

- [ ] **Step 16: Migrate `verify-email.usecase.ts`**

Replace the import line:

```ts
import { HttpException, Inject, Injectable } from '@nestjs/common';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
```

Add, immediately after the `typeorm` import:

```ts
import { AppError } from '../../../common/errors/app-error';
```

Replace both throw sites:

```ts
      throw new HttpException(
        {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'The email verification token is invalid or expired.',
        },
        400,
      );
```
→
```ts
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'The email verification token is invalid or expired.',
      );
```

```ts
        throw new HttpException(
          {
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
            message: 'User not found.',
          },
          404,
        );
```
→
```ts
        throw new AppError(ErrorCode.NOT_FOUND, 'User not found.');
```

- [ ] **Step 17: Update `verify-email.usecase.spec.ts`**

Replace:

```ts
    await expect(useCase.execute(rawToken)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }),
    });
```

with:

```ts
    await expect(useCase.execute(rawToken)).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
```

- [ ] **Step 18: Run the full auth test suite**

Run: `cd apps/backend && npx jest --testPathPattern modules/auth -v`
Expected: PASS, all auth unit tests green.

- [ ] **Step 19: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 20: Commit**

```bash
git add apps/backend/src/modules/auth
git commit -m "refactor: replace HttpException/JwtService in auth use cases with AppError/ITokenSigner"
```

---

### Task 3: Billing + Receivables `AppError` migration

**Files:**
- Modify: `apps/backend/src/modules/billing/application/plan-limit.service.ts`
- Modify: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Test: `apps/backend/src/modules/billing/application/plan-limit.service.spec.ts`

**Interfaces:**
- Consumes: `AppError` from Task 1.

- [ ] **Step 1: Migrate `plan-limit.service.ts`**

Replace:

```ts
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
```

Replace:

```ts
  private throwPlanLimitExceeded(message: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        errorCode: ErrorCode.PLAN_LIMIT_EXCEEDED,
        message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
```

with:

```ts
  private throwPlanLimitExceeded(message: string): never {
    throw new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, message);
  }
```

- [ ] **Step 2: Update `plan-limit.service.spec.ts`**

There are two occurrences of the same pattern (lines ~68-72 and ~87-91). Replace each:

```ts
    await expect(service.enforceReceivableLimit(manager)).rejects.toMatchObject(
      {
        status: 402,
      },
    );
```

with:

```ts
    await expect(service.enforceReceivableLimit(manager)).rejects.toMatchObject(
      {
        errorCode: 'PLAN_LIMIT_EXCEEDED',
      },
    );
```

(applies to both the "meets the monthly cap" and "subscription is not ACTIVE" tests)

- [ ] **Step 3: Migrate `write-off-receivable.usecase.ts`**

Replace:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
```

with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
```

Replace:

```ts
      if (!receivable) {
        throw new NotFoundException({
          statusCode: 404,
          errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
          message: 'Receivable not found.',
        });
      }
```

with:

```ts
      if (!receivable) {
        throw new AppError(
          ErrorCode.RECEIVABLE_NOT_FOUND,
          'Receivable not found.',
        );
      }
```

(`write-off-receivable.usecase.spec.ts` asserts only `.rejects.toThrow('Receivable not found.')` — `AppError` preserves `message` via `super(message)`, so no test change is needed.)

- [ ] **Step 4: Run billing and receivables tests**

Run: `cd apps/backend && npx jest --testPathPattern "plan-limit|write-off-receivable" -v`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/billing/application apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts
git commit -m "refactor: replace HttpException/NotFoundException in billing and receivables use cases with AppError"
```

---

### Task 4: Rule docs

**Files:**
- Create: `.claude/rules/application.md`
- Modify: `.claude/rules/domain.md`
- Modify: `.claude/rules/infrastructure.md`
- Modify: `.claude/rules/api.md`
- Modify: `AGENTS.md`

No tests — documentation only.

- [ ] **Step 1: Create `.claude/rules/application.md`**

```markdown
---
paths:
  - "apps/backend/src/**/application/**"
---

# Application Layer Rules

- Use cases depend only on ports (`I<Entity>Repository`, `I<Thing>`) and the domain.
- MUST NOT import specific SDKs/integration libraries (`@nestjs/jwt`, `@nestjs/passport`,
  `resend`, Cas ID client...) — define a dedicated port and implement the adapter in
  `infrastructure/`. See `ITokenSigner` (`modules/auth/application/token-signer.port.ts`)
  as an example.
- MUST NOT throw `HttpException`, `NotFoundException`, `UnauthorizedException`,
  `BadRequestException`, `ConflictException`, `ForbiddenException`, or any
  any exception class from `@nestjs/common` — throw `AppError(errorCode, message, details?)`
  (`common/errors/app-error.ts`). `HttpExceptionFilter` (presentation) is the
  only place that translates errors into HTTP status codes.
- ALLOWED (not violations; do not "fix" these locations):
  - `@Injectable()`/`@Inject()` from `@nestjs/common` — inert DI decorators with no
    business logic.
  - `DataSource`/`EntityManager` from `typeorm` when opening a transaction across
    multiple repositories in one use case (see AGENTS.md).
  - `bcryptjs` — a stateless hashing algorithm that needs no DI/config, like
    `node:crypto`.
- Files: `*.usecase.ts` for use cases, `*-repository.port.ts` / `*-<thing>.port.ts`
  for ports. DI tokens: `Symbol('X_REPOSITORY')` / `Symbol('X')`.
```

- [ ] **Step 2: Edit `.claude/rules/domain.md`**

Add as the last bullet:

```
- MUST NOT import from application/, infrastructure/, or presentation/ — domain is the core and may depend only on itself
```

- [ ] **Step 3: Edit `.claude/rules/infrastructure.md`**

Add as the last two bullets:

```
- MUST NOT import another module's infrastructure/ directly — access another module's data through a port in application/
- Queries by secret token/hash (email-verification, refresh-token, password-reset) do not need organizationId scoping — the token itself is the lookup key before the tenant is known. This is an intentional exception, not a bug.
```

- [ ] **Step 4: Edit `.claude/rules/api.md`**

Replace:

```
- Every endpoint MUST have `@RequirePermission()` decorator
```

with:

```
- Authenticated endpoints (with `JwtAuthGuard`) MUST have `@RequirePermission()`
- Pre-authentication endpoints (login, signup, verify-email, refresh, forgot-password) do not need `@RequirePermission()` — there is no identity to check permissions against yet
- Controllers MUST NOT import infrastructure/ or repository ports directly — they only call use cases
```

- [ ] **Step 5: Edit `AGENTS.md`**

In the "Clean Architecture (Backend)" code block under `## Architecture`, replace:

```
```
domain/           Entity, state machine, domain error
                  MUST NOT import NestJS/TypeORM
application/      Use case + port interface (I<Entity>Repository)
infrastructure/   TypeORM repository, adapters (Resend, Cas ID)
presentation/     Controller, DTO, DI wiring
```
```

with:

```
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
```

In the `## Error Handling` → `### Domain Errors` section, replace:

```ts
// ✅ Correct
if (amount > remaining) {
  throw new Error('Allocation amount exceeds remaining amount');
}

// ❌ Incorrect
return { success: false, error: 'Invalid amount' };
```

with:

```ts
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

Add one sentence directly below that code block:

```
`AppError` (`apps/backend/src/common/errors/app-error.ts`) is the only exception type application/domain code throws; `HttpExceptionFilter` (presentation layer) is the single place that translates it to an HTTP response.
```

- [ ] **Step 6: Commit**

```bash
git add .claude/rules/application.md .claude/rules/domain.md .claude/rules/infrastructure.md .claude/rules/api.md AGENTS.md
git commit -m "docs: add application layer boundary rules, close RequirePermission rule gap"
```

---

### Task 5: Boundary enforcement CI gate

**Files:**
- Create: `apps/backend/.dependency-cruiser.cjs`
- Create: `apps/backend/scripts/check-application-exceptions.mjs`
- Modify: `apps/backend/package.json`
- Modify: `turbo.json`
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `pnpm --filter @casso-ledger/backend arch-check` — exit 0 if `application/` is clean, exit 1 with a file:reason list otherwise. Wired into `pnpm verify` at the root.

- [ ] **Step 1: Add dependency-cruiser as a backend devDependency**

Edit `apps/backend/package.json`, add to `devDependencies` (keep alphabetical order with the existing entries):

```json
    "dependency-cruiser": "18.1.1",
```

Run: `pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 2: Create the dependency-cruiser config**

```js
// apps/backend/.dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'application-no-nestjs-jwt',
      comment:
        'application/ use cases must not depend on a concrete JWT signing library — define a port (see ITokenSigner in modules/auth/application/token-signer.port.ts) and implement the adapter in infrastructure/.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: '^node_modules/@nestjs/jwt' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
```

- [ ] **Step 3: Create the exception-class check script**

```js
// apps/backend/scripts/check-application-exceptions.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'HttpException',
  'NotFoundException',
  'UnauthorizedException',
  'BadRequestException',
  'ConflictException',
  'ForbiddenException',
];

const modulesDir = join(process.cwd(), 'src', 'modules');

function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const moduleName of readdirSync(modulesDir)) {
  const appDir = join(modulesDir, moduleName, 'application');
  let isDir = false;
  try {
    isDir = statSync(appDir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) continue;

  for (const file of collectTsFiles(appDir)) {
    const content = readFileSync(file, 'utf8');
    for (const name of FORBIDDEN) {
      if (new RegExp(`\\b${name}\\b`).test(content)) {
        violations.push(`${file}: uses ${name} — throw AppError instead (see common/errors/app-error.ts)`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Application layer boundary violations found:\n');
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  console.error(
    '\napplication/ must throw AppError, not @nestjs/common exception classes.',
  );
  process.exit(1);
}

console.log('Application layer boundary check passed.');
```

- [ ] **Step 4: Add the `arch-check` script**

Edit `apps/backend/package.json`, add to `scripts`:

```json
    "arch-check": "depcruise --config .dependency-cruiser.cjs src && node scripts/check-application-exceptions.mjs",
```

- [ ] **Step 5: Verify the dependency-cruiser rule actually fails on a violation**

Temporarily add this line to `apps/backend/src/modules/auth/application/login.usecase.ts` (top of file, will be reverted in the next step):

```ts
import { JwtService } from '@nestjs/jwt';
```

Run: `cd apps/backend && npx depcruise --config .dependency-cruiser.cjs src`
Expected: non-zero exit, output mentioning `application-no-nestjs-jwt` and the file path.

- [ ] **Step 6: Revert the temporary violation**

Remove the line added in Step 5. Confirm with `git diff apps/backend/src/modules/auth/application/login.usecase.ts` that the file is back to Task 2's state (no output).

- [ ] **Step 7: Verify the exception-class script actually fails on a violation**

Temporarily add this line to `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts` (will be reverted in the next step):

```ts
throw new NotFoundException();
```

Run: `cd apps/backend && node scripts/check-application-exceptions.mjs`
Expected: exit 1, output listing `write-off-receivable.usecase.ts: uses NotFoundException`.

- [ ] **Step 8: Revert the temporary violation**

Remove the line added in Step 7. Confirm with `git diff apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts` that the file is clean.

- [ ] **Step 9: Confirm the gate passes clean**

Run: `cd apps/backend && pnpm run arch-check`
Expected: exit 0, prints "Application layer boundary check passed."

- [ ] **Step 10: Wire `arch-check` into turbo and the root `verify` script**

Edit `turbo.json`, add to `tasks`:

```json
    "arch-check": {},
```

Edit `package.json` (root), replace:

```json
    "verify": "turbo run lint type-check test",
```

with:

```json
    "verify": "turbo run lint type-check test arch-check",
```

- [ ] **Step 11: Run the full root verify pipeline**

Run: `pnpm verify`
Expected: all tasks (including `arch-check`) pass.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/.dependency-cruiser.cjs apps/backend/scripts/check-application-exceptions.mjs apps/backend/package.json turbo.json package.json pnpm-lock.yaml
git commit -m "chore: enforce application layer boundaries in CI"
```

---

### Task 6: Feature-map ticket entry

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

No tests — documentation only.

- [ ] **Step 1: Add the ticket entry**

In `docs/wayfinder/feature-map.md`, under the `### ADDITIONAL PLANS` heading, add a new entry (after the existing "Spec-Plan Reconciliation" entry, before the closing of that section):

```markdown

---

#### Plan: Application Layer Boundary Enforcement
- **Type**: task
- **Status**: done
- **Owner**: BE
- **Spec**: `specs/2026-08-05-application-layer-boundaries-design.md`
- **Plan**: `plans/2026-08-05-application-layer-boundaries.md`
- **Blockers**: none
- **Key rules**:
  - application/ must not import @nestjs/jwt or throw HttpException — use AppError
  - The ITokenSigner port replaces direct JwtService usage in auth use cases
  - .claude/rules/application.md + AGENTS.md record the corresponding rule; api.md corrects the incorrect @RequirePermission rule
  - dependency-cruiser + Node script enforce the rules automatically through `pnpm verify`
- **Creates**: `AppError`, `ITokenSigner` port + `JwtTokenSigner` adapter, rule docs, `arch-check` CI gate
```

- [ ] **Step 2: Add a "Decisions so far" entry**

Under `## Decisions so far`, add a new bullet at the end (use today's date, 2026-08-05):

```markdown
- **2026-08-05**: Application Layer Boundary Enforcement shipped — `AppError`/`ITokenSigner` replace `HttpException`/`JwtService` leaks in 9 use case files across auth/billing/receivables; `.claude/rules/application.md` added; `api.md`'s unconditional `@RequirePermission()` rule corrected (was wrong for pre-auth endpoints); `arch-check` (dependency-cruiser + Node script) wired into `pnpm verify`. Domain/infrastructure/presentation audited clean, no code changes there.
```

- [ ] **Step 3: Commit**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: record Application Layer Boundary Enforcement ticket as done"
```
