# Casso Admin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-organization admin surface (`Operator`) covering organization lock/unlock and aggregate cross-org AI usage monitoring, per issue #98.

**Architecture:** A second, fully separate authorization plane alongside the existing per-org RBAC. `AdminAuthGuard` verifies JWTs and the `isOperator` claim directly (no `JwtStrategy`/`Membership` lookup); `/admin/*` routes are `@Public()` (skip the global customer guard chain) and self-protect with `AdminAuthGuard`. A new `OrganizationLockGuard` is added to the global customer guard chain to hard-block requests against a `LOCKED` organization. Neither guard touches `TenantContextService`, `PermissionGuard`, or `AuditLog` (ADR-0017).

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, `@nestjs/jwt`, React 19, recharts (already a dependency), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-14-casso-admin-platform-design.md`

## Global Constraints

- Money/amounts: not applicable to this feature (no money fields).
- Every business query is normally scoped by `organizationId` (ADR-0001) — this feature is a deliberate, documented exception (ADR-0017): admin reads/writes are cross-org by design and never call `TenantContextService.getOrganizationId()`.
- `domain/` files must not import NestJS/TypeORM.
- `application/` use cases throw `AppError`, never `HttpException`/Nest exception classes; guards (presentation-adjacent) may throw Nest exceptions directly, matching `PermissionGuard`/`JwtStrategy` convention.
- Every controller needs `@ApiTags(...)`.
- Response DTOs are `class`, not `interface`, and end in `.dto.ts`.
- Biome: single quotes, semicolons, 2-space indent, no trailing commas.
- Test commands: `npx jest --testPathPattern <name>`, `npx tsc --noEmit`, `pnpm --filter @casso-ledger/backend test:e2e`.
- Admin write endpoints (`lock`/`unlock`) deliberately do **not** use `IdempotencyService`/`Idempotency-Key`: that service calls `TenantContextService.getOrganizationId()` internally, which is meaningless for an Operator request (no org context). State-level idempotency (locking an already-`LOCKED` org is a no-op) covers the retry-safety concern instead.

---

## Task 1: Data model — `users.isOperator`, `organizations.status`, `operator_audit_logs`

**Files:**
- Create: `apps/backend/src/database/migrations/20260822000000-add-users-is-operator.ts`
- Create: `apps/backend/src/database/migrations/20260822010000-add-organizations-status.ts`
- Create: `apps/backend/src/database/migrations/20260822020000-add-operator-audit-logs-table.ts`
- Modify: `apps/backend/src/modules/users/domain/user.ts`
- Modify: `apps/backend/src/modules/users/infrastructure/user.orm-entity.ts`
- Modify: `apps/backend/src/modules/organizations/domain/organization.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts`
- Create: `apps/backend/src/modules/organizations/domain/organization.spec.ts`
- Create: `apps/backend/src/modules/admin/domain/operator-audit-log.ts`

**Interfaces:**
- Produces: `Organization.status: 'ACTIVE' | 'LOCKED'`, `Organization.lock(): Organization`, `Organization.unlock(): Organization`
- Produces: `User.isOperator: boolean`
- Produces: `OperatorAuditLog` class with `id`, `operatorId`, `organizationId`, `actionType: 'ORGANIZATION_LOCKED' | 'ORGANIZATION_UNLOCKED'`, `createdAt`

- [ ] **Step 1: Write the failing domain test for `Organization.lock()`/`unlock()`**

```typescript
// apps/backend/src/modules/organizations/domain/organization.spec.ts
import { Organization } from './organization';

function buildOrganization(overrides: Partial<Organization> = {}): Organization {
  return new Organization({
    id: 'org-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('Organization', () => {
  it('lock() sets status to LOCKED', () => {
    const org = buildOrganization();
    expect(org.lock().status).toBe('LOCKED');
  });

  it('unlock() sets status to ACTIVE', () => {
    const org = buildOrganization({ status: 'LOCKED' });
    expect(org.unlock().status).toBe('ACTIVE');
  });

  it('lock() on an already-LOCKED organization is a no-op (still LOCKED)', () => {
    const org = buildOrganization({ status: 'LOCKED' });
    expect(org.lock().status).toBe('LOCKED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern organizations/domain/organization.spec`
Expected: FAIL — `Organization` constructor does not accept `status`, and `lock`/`unlock` do not exist.

- [ ] **Step 3: Update `Organization` domain entity**

```typescript
// apps/backend/src/modules/organizations/domain/organization.ts
export type OrganizationStatus = 'ACTIVE' | 'LOCKED';

export interface OrganizationProps {
  id: string;
  name: string;
  status: OrganizationStatus;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly status: OrganizationStatus;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.status = props.status;
    this.createdAt = props.createdAt;
  }

  lock(): Organization {
    return new Organization({ ...this, status: 'LOCKED' });
  }

  unlock(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern organizations/domain/organization.spec`
Expected: PASS

- [ ] **Step 5: Add `status` column to `OrganizationOrmEntity`**

```typescript
// apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: 'ACTIVE' | 'LOCKED';

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 6: Add `isOperator` to `User` domain entity and `UserOrmEntity`**

```typescript
// apps/backend/src/modules/users/domain/user.ts
export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  isOperator: boolean;
  createdAt: Date;
}

export class User {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly email: string;
  declare readonly passwordHash: string;
  declare readonly emailVerifiedAt: Date | null;
  declare readonly isOperator: boolean;
  declare readonly createdAt: Date;

  constructor(props: UserProps) {
    Object.assign(this, props);
  }

  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }

  markEmailVerified(): User {
    return new User({ ...this, emailVerifiedAt: new Date() });
  }

  withPasswordHash(passwordHash: string): User {
    return new User({ ...this, passwordHash });
  }
}
```

```typescript
// apps/backend/src/modules/users/infrastructure/user.orm-entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isOperator: boolean;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 7: Create `OperatorAuditLog` domain entity**

```typescript
// apps/backend/src/modules/admin/domain/operator-audit-log.ts
export type OperatorActionType = 'ORGANIZATION_LOCKED' | 'ORGANIZATION_UNLOCKED';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 8: Write migrations**

```typescript
// apps/backend/src/database/migrations/20260822000000-add-users-is-operator.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersIsOperator20260822000000 implements MigrationInterface {
  name = 'AddUsersIsOperator20260822000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isOperator" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "isOperator"',
    );
  }
}
```

```typescript
// apps/backend/src/database/migrations/20260822010000-add-organizations-status.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationsStatus20260822010000
  implements MigrationInterface
{
  name = 'AddOrganizationsStatus20260822010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'ACTIVE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "status"',
    );
  }
}
```

```typescript
// apps/backend/src/database/migrations/20260822020000-add-operator-audit-logs-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogsTable20260822020000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogsTable20260822020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "operator_audit_logs" (
        "id" uuid NOT NULL,
        "operatorId" character varying NOT NULL,
        "organizationId" character varying NOT NULL,
        "actionType" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_operator_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_operator_audit_logs_organization" ON "operator_audit_logs" ("organizationId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_operator_audit_logs_organization"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "operator_audit_logs"');
  }
}
```

- [ ] **Step 9: Run full test suite and type check**

Run: `npx jest --testPathPattern organizations` then `npx tsc --noEmit`
Expected: PASS (existing `Organization`/`User` construction call sites will need `status`/`isOperator` — fix any test fixtures that break; grep `new Organization(` and `new User(` across `.spec.ts` files)

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/database/migrations apps/backend/src/modules/users/domain/user.ts apps/backend/src/modules/users/infrastructure/user.orm-entity.ts apps/backend/src/modules/organizations/domain/organization.ts apps/backend/src/modules/organizations/domain/organization.spec.ts apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts apps/backend/src/modules/admin/domain/operator-audit-log.ts
git commit -m "feat: add Operator/Organization-lock data model"
```

---

## Task 2: `LoginUseCase` — allow an operator-only account (no `Membership`) to log in

**Files:**
- Modify: `apps/backend/src/modules/auth/application/login.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/login.usecase.spec.ts` (create if it does not exist — check first with `Glob apps/backend/src/modules/auth/application/login.usecase.spec.ts`)

**Interfaces:**
- Consumes: `IUserRepository.findByEmail(email)` → `User` (now includes `isOperator`); `IMembershipRepository.findFirstActiveByUserId(userId)` → `Membership | null`
- Produces: `LoginUseCase.execute(input): Promise<{ accessToken: string; refreshToken: string }>` (signature unchanged); signed JWT payload is now `{ userId, organizationId, role, isOperator }` when a membership exists, or `{ userId, isOperator: true }` when the user has no membership but `isOperator === true`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/application/login.usecase.spec.ts
import { User } from '../../users/domain/user';
import { LoginUseCase } from './login.usecase';
import * as passwordHasher from './password-hasher';

function buildUser(overrides: Partial<User> = {}): User {
  return new User({
    id: 'user-1',
    name: 'Operator',
    email: 'operator@casso.vn',
    passwordHash: 'hash',
    emailVerifiedAt: new Date('2026-08-01'),
    isOperator: true,
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildDeps() {
  const userRepo = { findByEmail: jest.fn() };
  const membershipRepo = { findFirstActiveByUserId: jest.fn() };
  const refreshTokenRepo = { save: jest.fn() };
  const tokenSigner = { sign: jest.fn().mockReturnValue('signed-token') };
  return { userRepo, membershipRepo, refreshTokenRepo, tokenSigner };
}

describe('LoginUseCase — operator without a membership', () => {
  it('signs a token with isOperator=true and no organizationId when the user has no active membership', async () => {
    const { userRepo, membershipRepo, refreshTokenRepo, tokenSigner } =
      buildDeps();
    userRepo.findByEmail.mockResolvedValue(buildUser());
    membershipRepo.findFirstActiveByUserId.mockResolvedValue(null);
    jest.spyOn(passwordHasher, 'comparePassword').mockResolvedValue(true);

    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      tokenSigner as any,
    );

    await useCase.execute({ email: 'operator@casso.vn', password: 'pw' });

    expect(tokenSigner.sign).toHaveBeenCalledWith({
      userId: 'user-1',
      isOperator: true,
    });
  });

  it('still throws FORBIDDEN when the user has no membership and is not an operator', async () => {
    const { userRepo, membershipRepo, refreshTokenRepo, tokenSigner } =
      buildDeps();
    userRepo.findByEmail.mockResolvedValue(buildUser({ isOperator: false }));
    membershipRepo.findFirstActiveByUserId.mockResolvedValue(null);
    jest.spyOn(passwordHasher, 'comparePassword').mockResolvedValue(true);

    const useCase = new LoginUseCase(
      userRepo as any,
      membershipRepo as any,
      refreshTokenRepo as any,
      tokenSigner as any,
    );

    await expect(
      useCase.execute({ email: 'operator@casso.vn', password: 'pw' }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern login.usecase`
Expected: FAIL — current `LoginUseCase` throws `FORBIDDEN` whenever there is no membership, regardless of `isOperator`, and never signs `{ userId, isOperator: true }`.

- [ ] **Step 3: Update `LoginUseCase`**

```typescript
// apps/backend/src/modules/auth/application/login.usecase.ts
// (imports unchanged)

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Email hoặc mật khẩu không đúng.',
      );
    }

    const membership = await this.membershipRepo.findFirstActiveByUserId(
      user.id,
    );
    if (!membership && !user.isOperator) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Tài khoản chưa thuộc tổ chức nào.',
      );
    }

    const accessToken = this.tokenSigner.sign(
      membership
        ? {
            userId: user.id,
            organizationId: membership.organizationId,
            role: membership.role,
            isOperator: user.isOperator,
          }
        : { userId: user.id, isOperator: true },
    );
    const { token: refreshToken, hash } = generateToken();

    await this.refreshTokenRepo.save(
      new RefreshToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        createdAt: new Date(),
      }),
    );

    return { accessToken, refreshToken };
  }
```

Note: when `membership` exists, the payload now also carries `isOperator: user.isOperator` — this covers the "dual role" case (an Operator who also has a Membership, e.g. to test the customer app) without adding a branch to `JwtStrategy`; `JwtStrategy.validate()` ignores unknown payload fields, so this is a no-op for the customer flow.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern login.usecase`
Expected: PASS

- [ ] **Step 5: Run full auth test suite**

Run: `npx jest --testPathPattern modules/auth`
Expected: PASS (no regressions to existing membership-based login tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/application/login.usecase.ts apps/backend/src/modules/auth/application/login.usecase.spec.ts
git commit -m "feat: allow operator-only accounts to log in without a membership"
```

---

## Task 3: `AdminAuthGuard`

**Files:**
- Create: `apps/backend/src/common/admin/authenticated-operator.ts`
- Create: `apps/backend/src/common/admin/admin-auth.guard.ts`
- Create: `apps/backend/src/common/admin/admin-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `JwtService.verifyAsync<T>(token)` (from `@nestjs/jwt`); `extractJwtFromRequest(request)` (already exported by `apps/backend/src/common/auth/jwt.strategy.ts`)
- Produces: `AuthenticatedOperator { operatorId: string }`; `AdminAuthGuard implements CanActivate`, sets `request.user = { operatorId }` on success

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/common/admin/admin-auth.guard.spec.ts
import type { ExecutionContext } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard', () => {
  it('allows the request and attaches operatorId when the JWT has isOperator=true', async () => {
    const jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ userId: 'user-1', isOperator: true }),
    };
    const guard = new AdminAuthGuard(jwtService as any);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer valid-token' },
    };

    const result = await guard.canActivate(buildContext(request));

    expect(result).toBe(true);
    expect(request.user).toEqual({ operatorId: 'user-1' });
  });

  it('rejects when the JWT has no isOperator claim', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    };
    const guard = new AdminAuthGuard(jwtService as any);
    const request = { headers: { authorization: 'Bearer valid-token' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow();
  });

  it('rejects when no token is present', async () => {
    const jwtService = { verifyAsync: jest.fn() };
    const guard = new AdminAuthGuard(jwtService as any);
    const request = { headers: {} };

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern admin-auth.guard`
Expected: FAIL — `admin-auth.guard.ts` does not exist yet.

- [ ] **Step 3: Implement `AuthenticatedOperator` and `AdminAuthGuard`**

```typescript
// apps/backend/src/common/admin/authenticated-operator.ts
export interface AuthenticatedOperator {
  operatorId: string;
}
```

```typescript
// apps/backend/src/common/admin/admin-auth.guard.ts
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { extractJwtFromRequest } from '../auth/jwt.strategy';
import { ErrorCode } from '../errors/error-code';
import type { AuthenticatedOperator } from './authenticated-operator';

interface OperatorJwtPayload {
  userId: string;
  isOperator?: boolean;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractJwtFromRequest(request);
    if (!token) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }

    let payload: OperatorJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<OperatorJwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }

    if (!payload.isOperator) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    }

    (request as Request & { user: AuthenticatedOperator }).user = {
      operatorId: payload.userId,
    };
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern admin-auth.guard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/admin
git commit -m "feat: add AdminAuthGuard for cross-org Operator routes"
```

---

## Task 4: `OrganizationLockGuard`

**Files:**
- Create: `apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts`
- Create: `apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts`
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/status-by-error-code.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `IOrganizationRepository.findById(id)` → `Organization | null`; `AuthenticatedUser` (`common/auth/authenticated-user.ts`, unchanged)
- Produces: `OrganizationLockGuard implements CanActivate` — registered as a global `APP_GUARD`

- [ ] **Step 1: Add the new ErrorCode**

```typescript
// apps/backend/src/common/errors/error-code.ts
export enum ErrorCode {
  // ...existing entries unchanged...
  INVALID_PLAN_TRANSITION = 'INVALID_PLAN_TRANSITION',
  ORGANIZATION_LOCKED = 'ORGANIZATION_LOCKED',
}
```

```typescript
// apps/backend/src/common/errors/status-by-error-code.ts
export const STATUS_BY_ERROR_CODE: Readonly<
  Partial<Record<ErrorCode, number>>
> = {
  // ...existing entries unchanged...
  [ErrorCode.INVALID_PLAN_TRANSITION]: 400,
  [ErrorCode.ORGANIZATION_LOCKED]: 403,
};
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Organization } from '../domain/organization';
import { OrganizationLockGuard } from './organization-lock.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('OrganizationLockGuard', () => {
  function buildGuard(organization: Organization | null) {
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    return new OrganizationLockGuard(organizationRepo as any, reflector as any);
  }

  it('rejects with ORGANIZATION_LOCKED when the caller organization is LOCKED', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'LOCKED',
        createdAt: new Date(),
      }),
    );
    const request = { user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toMatchObject(
      { response: { errorCode: 'ORGANIZATION_LOCKED' } },
    );
  });

  it('allows the request when the caller organization is ACTIVE', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'ACTIVE',
        createdAt: new Date(),
      }),
    );
    const request = { user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' } };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
  });

  it('allows unauthenticated requests through (JwtAuthGuard rejects those first)', async () => {
    const guard = buildGuard(null);
    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --testPathPattern organization-lock.guard`
Expected: FAIL — `organization-lock.guard.ts` does not exist yet.

- [ ] **Step 4: Implement `OrganizationLockGuard`**

```typescript
// apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../application/organization-repository.port';

@Injectable()
export class OrganizationLockGuard implements CanActivate {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.organizationId) return true;

    const organization = await this.organizationRepo.findById(
      user.organizationId,
    );
    if (organization?.status === 'LOCKED') {
      throw new ForbiddenException({
        errorCode: ErrorCode.ORGANIZATION_LOCKED,
        message: 'Tổ chức của bạn đã bị khóa.',
      });
    }
    return true;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern organization-lock.guard`
Expected: PASS

- [ ] **Step 6: Register the guard globally in `app.module.ts`**

```typescript
// apps/backend/src/app.module.ts
// add import:
import { OrganizationLockGuard } from './modules/organizations/presentation/organization-lock.guard';

// in providers array, after EmailVerifiedGuard:
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: OrganizationLockGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
```

- [ ] **Step 7: Run the full backend test suite and type check**

Run: `npx jest` then `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/status-by-error-code.ts apps/backend/src/app.module.ts
git commit -m "feat: hard-block requests against a LOCKED organization"
```

---

## Task 5: Extend `IOrganizationRepository` — pagination + batch lookup

**Files:**
- Modify: `apps/backend/src/modules/organizations/application/organization-repository.port.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts`

**Interfaces:**
- Produces: `IOrganizationRepository.findAllPaginated(page, limit): Promise<{ items: OrganizationListItem[]; total: number }>`
- Produces: `IOrganizationRepository.findByIds(ids: string[]): Promise<Map<string, Organization>>`
- Produces: `IOrganizationRepository.findById(id, manager?: EntityManager)` — now accepts an optional manager for transactional reads (used by Task 8's lock/unlock use cases)
- Produces: `OrganizationListItem { id, name, status, createdAt }`

No dedicated unit test for this task — this repository has no `.spec.ts` today (verified: only use cases that consume it are unit-tested with mocks). Correctness is covered by Task 11's e2e test.

- [ ] **Step 1: Extend the port**

```typescript
// apps/backend/src/modules/organizations/application/organization-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { Organization, OrganizationStatus } from '../domain/organization';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: OrganizationStatus;
  createdAt: Date;
}

export interface IOrganizationRepository {
  findById(id: string, manager?: EntityManager): Promise<Organization | null>;
  findAllIds(): Promise<string[]>;
  findAllPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: OrganizationListItem[]; total: number }>;
  findByIds(ids: string[]): Promise<Map<string, Organization>>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
```

- [ ] **Step 2: Implement in `TypeOrmOrganizationRepository`**

```typescript
// apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';
import type {
  IOrganizationRepository,
  OrganizationListItem,
} from '../application/organization-repository.port';
import { Organization } from '../domain/organization';
import { OrganizationOrmEntity } from './organization.orm-entity';

@Injectable()
export class TypeOrmOrganizationRepository implements IOrganizationRepository {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repo: Repository<OrganizationOrmEntity>,
  ) {}

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<Organization | null> {
    const row = await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).findOne({ where: { id } });
    return row ? new Organization(row) : null;
  }

  async findAllIds(): Promise<string[]> {
    const rows = await this.repo.find({ select: { id: true } });
    return rows.map((row) => row.id);
  }

  async findAllPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: OrganizationListItem[]; total: number }> {
    const [rows, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async findByIds(ids: string[]): Promise<Map<string, Organization>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repo.find({ where: { id: In(ids) } });
    return new Map(rows.map((row) => [row.id, new Organization(row)]));
  }

  async save(
    organization: Organization,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).save(organization);
  }
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS — check for other implementers/callers of `IOrganizationRepository.findById` that might break on the new optional second parameter (none should, it's optional and additive).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/organizations/application/organization-repository.port.ts apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts
git commit -m "feat: add pagination and batch lookup to IOrganizationRepository"
```

---

## Task 6: Extend `IAIUsageLogRepository` — cross-org aggregates

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts`

**Interfaces:**
- Produces: `AIUsageByOrgAndModel { organizationId, model, requestCount, totalTokens, errorCount }`
- Produces: `AIUsageDailyTrendPoint { date: string /* YYYY-MM-DD */, requestCount, totalTokens }`
- Produces: `IAIUsageLogRepository.aggregateByOrgAndModel(from: Date, to: Date): Promise<AIUsageByOrgAndModel[]>`
- Produces: `IAIUsageLogRepository.aggregateDailyTrend(from: Date, to: Date): Promise<AIUsageDailyTrendPoint[]>`

No dedicated unit test — aggregate SQL correctness is covered by Task 11's e2e test against real Postgres (testcontainers), matching how this repository is already tested (no existing `.spec.ts` for `TypeOrmAIUsageLogRepository`).

- [ ] **Step 1: Extend the port**

```typescript
// apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts
export interface AIUsageLogEntry {
  conversationId: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  toolCallsCount: number;
  isError: boolean;
}

export interface AIUsageByOrgAndModel {
  organizationId: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

export interface AIUsageDailyTrendPoint {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
  aggregateByOrgAndModel(
    from: Date,
    to: Date,
  ): Promise<AIUsageByOrgAndModel[]>;
  aggregateDailyTrend(from: Date, to: Date): Promise<AIUsageDailyTrendPoint[]>;
}

export const AI_USAGE_LOG_REPOSITORY = Symbol('AI_USAGE_LOG_REPOSITORY');
```

- [ ] **Step 2: Implement the two aggregate queries**

```typescript
// apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts
// (keep existing imports, log(), deleteOlderThan() unchanged; add:)

  async aggregateByOrgAndModel(
    from: Date,
    to: Date,
  ): Promise<AIUsageByOrgAndModel[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('log')
      .select('log.organizationId', 'organizationId')
      .addSelect('log.model', 'model')
      .addSelect('COUNT(*)', 'requestCount')
      .addSelect(
        'COALESCE(SUM(log.inputTokens), 0) + COALESCE(SUM(log.outputTokens), 0)',
        'totalTokens',
      )
      .addSelect(
        "SUM(CASE WHEN log.isError THEN 1 ELSE 0 END)",
        'errorCount',
      )
      .where('log.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('log.organizationId')
      .addGroupBy('log.model')
      .getRawMany<{
        organizationId: string;
        model: string;
        requestCount: string;
        totalTokens: string;
        errorCount: string;
      }>();

    return rows.map((row) => ({
      organizationId: row.organizationId,
      model: row.model,
      requestCount: Number(row.requestCount),
      totalTokens: Number(row.totalTokens),
      errorCount: Number(row.errorCount),
    }));
  }

  async aggregateDailyTrend(
    from: Date,
    to: Date,
  ): Promise<AIUsageDailyTrendPoint[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('log')
      .select("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'requestCount')
      .addSelect(
        'COALESCE(SUM(log.inputTokens), 0) + COALESCE(SUM(log.outputTokens), 0)',
        'totalTokens',
      )
      .where('log.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'ASC')
      .getRawMany<{ date: string; requestCount: string; totalTokens: string }>();

    return rows.map((row) => ({
      date: row.date,
      requestCount: Number(row.requestCount),
      totalTokens: Number(row.totalTokens),
    }));
  }
```

Add the corresponding `import type { AIUsageByOrgAndModel, AIUsageDailyTrendPoint, ... }` to the top of the file alongside the existing `AIUsageLogEntry`/`IAIUsageLogRepository` import.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts
git commit -m "feat: add cross-org aggregate queries to IAIUsageLogRepository"
```

---

## Task 7: `OperatorAuditLog` repository

**Files:**
- Create: `apps/backend/src/modules/admin/application/operator-audit-log-repository.port.ts`
- Create: `apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`
- Create: `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts`

**Interfaces:**
- Consumes: `OperatorAuditLog` (Task 1)
- Produces: `IOperatorAuditLogRepository.save(log, manager?)`, DI token `OPERATOR_AUDIT_LOG_REPOSITORY`

No dedicated unit test — this is a thin insert-only repository, same as `AuditLog`'s own repository (untested directly); covered by Task 11's e2e test.

- [ ] **Step 1: Port**

```typescript
// apps/backend/src/modules/admin/application/operator-audit-log-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { OperatorAuditLog } from '../domain/operator-audit-log';

export interface IOperatorAuditLogRepository {
  save(log: OperatorAuditLog, manager?: EntityManager): Promise<void>;
}

export const OPERATOR_AUDIT_LOG_REPOSITORY = Symbol(
  'OPERATOR_AUDIT_LOG_REPOSITORY',
);
```

- [ ] **Step 2: ORM entity**

```typescript
// apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'operator_audit_logs' })
export class OperatorAuditLogOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  operatorId: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  actionType: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 3: Repository implementation**

```typescript
// apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IOperatorAuditLogRepository } from '../application/operator-audit-log-repository.port';
import type { OperatorAuditLog } from '../domain/operator-audit-log';
import { OperatorAuditLogOrmEntity } from './operator-audit-log.orm-entity';

@Injectable()
export class TypeOrmOperatorAuditLogRepository
  implements IOperatorAuditLogRepository
{
  constructor(
    @InjectRepository(OperatorAuditLogOrmEntity)
    private readonly repo: Repository<OperatorAuditLogOrmEntity>,
  ) {}

  async save(
    log: OperatorAuditLog,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OperatorAuditLogOrmEntity)
      : this.repo
    ).save(log);
  }
}
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/admin/application/operator-audit-log-repository.port.ts apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts
git commit -m "feat: add OperatorAuditLog repository"
```

---

## Task 8: Admin use cases — `ListOrganizations`, `LockOrganization`, `UnlockOrganization`

**Files:**
- Create: `apps/backend/src/modules/admin/application/list-organizations.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/list-organizations.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/application/lock-organization.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/lock-organization.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/application/unlock-organization.usecase.ts`

**Interfaces:**
- Consumes: `IOrganizationRepository` (Task 5), `IOperatorAuditLogRepository` (Task 7), `DataSource` (typeorm)
- Produces: `ListOrganizationsUseCase.execute({ page, limit }): Promise<{ items: OrganizationListItem[]; total: number; page: number; limit: number }>`
- Produces: `LockOrganizationUseCase.execute({ organizationId, operatorId }): Promise<void>`
- Produces: `UnlockOrganizationUseCase.execute({ organizationId, operatorId }): Promise<void>`

- [ ] **Step 1: Write the failing test for `ListOrganizationsUseCase`**

```typescript
// apps/backend/src/modules/admin/application/list-organizations.usecase.spec.ts
import { ListOrganizationsUseCase } from './list-organizations.usecase';

describe('ListOrganizationsUseCase', () => {
  it('returns paginated organizations from the repository', async () => {
    const organizationRepo = {
      findAllPaginated: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'org-1',
            name: 'Acme',
            status: 'ACTIVE',
            createdAt: new Date('2026-08-01'),
          },
        ],
        total: 1,
      }),
    };
    const useCase = new ListOrganizationsUseCase(organizationRepo as any);

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(organizationRepo.findAllPaginated).toHaveBeenCalledWith(1, 20);
    expect(result).toEqual({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: new Date('2026-08-01'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern list-organizations.usecase`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement `ListOrganizationsUseCase`**

```typescript
// apps/backend/src/modules/admin/application/list-organizations.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
  type OrganizationListItem,
} from '../../organizations/application/organization-repository.port';

export interface ListOrganizationsInput {
  page: number;
  limit: number;
}

export interface ListOrganizationsResult {
  items: OrganizationListItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(
    input: ListOrganizationsInput,
  ): Promise<ListOrganizationsResult> {
    const { items, total } = await this.organizationRepo.findAllPaginated(
      input.page,
      input.limit,
    );
    return { items, total, page: input.page, limit: input.limit };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern list-organizations.usecase`
Expected: PASS

- [ ] **Step 5: Write the failing test for `LockOrganizationUseCase`**

```typescript
// apps/backend/src/modules/admin/application/lock-organization.usecase.spec.ts
import { Organization } from '../../organizations/domain/organization';
import { LockOrganizationUseCase } from './lock-organization.usecase';

function buildOrganization(overrides: Partial<Organization> = {}): Organization {
  return new Organization({
    id: 'org-1',
    name: 'Acme',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildDeps(organization: Organization | null) {
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue(organization),
    save: jest.fn(),
  };
  const auditRepo = { save: jest.fn() };
  const dataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
  };
  return { organizationRepo, auditRepo, dataSource };
}

describe('LockOrganizationUseCase', () => {
  it('sets status to LOCKED and writes an OperatorAuditLog row', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(
      buildOrganization(),
    );
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'LOCKED' }),
      expect.anything(),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'ORGANIZATION_LOCKED',
      }),
      expect.anything(),
    );
  });

  it('is a no-op (no save, no audit) when the organization is already LOCKED', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(
      buildOrganization({ status: 'LOCKED' }),
    );
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the organization does not exist', async () => {
    const { organizationRepo, auditRepo, dataSource } = buildDeps(null);
    const useCase = new LockOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest --testPathPattern lock-organization.usecase`
Expected: FAIL — file does not exist.

- [ ] **Step 7: Implement `LockOrganizationUseCase` and `UnlockOrganizationUseCase`**

```typescript
// apps/backend/src/modules/admin/application/lock-organization.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface LockOrganizationInput {
  organizationId: string;
  operatorId: string;
}

@Injectable()
export class LockOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
  ) {}

  async execute(input: LockOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status === 'LOCKED') return;

      await this.organizationRepo.save(organization.lock(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_LOCKED',
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
```

```typescript
// apps/backend/src/modules/admin/application/unlock-organization.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface UnlockOrganizationInput {
  organizationId: string;
  operatorId: string;
}

@Injectable()
export class UnlockOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
  ) {}

  async execute(input: UnlockOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status === 'ACTIVE') return;

      await this.organizationRepo.save(organization.unlock(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_UNLOCKED',
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest --testPathPattern "modules/admin/application"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/admin/application
git commit -m "feat: add ListOrganizations/LockOrganization/UnlockOrganization use cases"
```

---

## Task 9: Admin use cases — `GetAiUsageAggregate`, `GetAiUsageTrend`

**Files:**
- Create: `apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/application/get-ai-usage-trend.usecase.ts`

**Interfaces:**
- Consumes: `IAIUsageLogRepository.aggregateByOrgAndModel`/`aggregateDailyTrend` (Task 6), `IOrganizationRepository.findByIds` (Task 5)
- Produces: `GetAiUsageAggregateUseCase.execute({ from, to }): Promise<AiUsageAggregateItem[]>` where `AiUsageAggregateItem = { organizationId, organizationName, model, requestCount, totalTokens, errorCount }`
- Produces: `GetAiUsageTrendUseCase.execute({ from, to }): Promise<AIUsageDailyTrendPoint[]>`

- [ ] **Step 1: Write the failing test for `GetAiUsageAggregateUseCase`**

```typescript
// apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.spec.ts
import { Organization } from '../../organizations/domain/organization';
import { GetAiUsageAggregateUseCase } from './get-ai-usage-aggregate.usecase';

describe('GetAiUsageAggregateUseCase', () => {
  it('joins aggregate rows with organization names', async () => {
    const aiUsageRepo = {
      aggregateByOrgAndModel: jest.fn().mockResolvedValue([
        {
          organizationId: 'org-1',
          model: 'gpt-5.5',
          requestCount: 10,
          totalTokens: 5000,
          errorCount: 1,
        },
      ]),
    };
    const organizationRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'org-1',
            new Organization({
              id: 'org-1',
              name: 'Acme',
              status: 'ACTIVE',
              createdAt: new Date('2026-08-01'),
            }),
          ],
        ]),
      ),
    };
    const useCase = new GetAiUsageAggregateUseCase(
      aiUsageRepo as any,
      organizationRepo as any,
    );

    const result = await useCase.execute({
      from: new Date('2026-08-01'),
      to: new Date('2026-08-07'),
    });

    expect(organizationRepo.findByIds).toHaveBeenCalledWith(['org-1']);
    expect(result).toEqual([
      {
        organizationId: 'org-1',
        organizationName: 'Acme',
        model: 'gpt-5.5',
        requestCount: 10,
        totalTokens: 5000,
        errorCount: 1,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern get-ai-usage-aggregate.usecase`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement both use cases**

```typescript
// apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_USAGE_LOG_REPOSITORY,
  type IAIUsageLogRepository,
} from '../../copilot/application/ai-usage-log-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';

export interface GetAiUsageAggregateInput {
  from: Date;
  to: Date;
}

export interface AiUsageAggregateItem {
  organizationId: string;
  organizationName: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

@Injectable()
export class GetAiUsageAggregateUseCase {
  constructor(
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageRepo: IAIUsageLogRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(
    input: GetAiUsageAggregateInput,
  ): Promise<AiUsageAggregateItem[]> {
    const rows = await this.aiUsageRepo.aggregateByOrgAndModel(
      input.from,
      input.to,
    );
    const organizations = await this.organizationRepo.findByIds([
      ...new Set(rows.map((row) => row.organizationId)),
    ]);

    return rows.map((row) => ({
      organizationId: row.organizationId,
      organizationName:
        organizations.get(row.organizationId)?.name ?? 'Unknown',
      model: row.model,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens,
      errorCount: row.errorCount,
    }));
  }
}
```

```typescript
// apps/backend/src/modules/admin/application/get-ai-usage-trend.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_USAGE_LOG_REPOSITORY,
  type AIUsageDailyTrendPoint,
  type IAIUsageLogRepository,
} from '../../copilot/application/ai-usage-log-repository.port';

export interface GetAiUsageTrendInput {
  from: Date;
  to: Date;
}

@Injectable()
export class GetAiUsageTrendUseCase {
  constructor(
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageRepo: IAIUsageLogRepository,
  ) {}

  async execute(input: GetAiUsageTrendInput): Promise<AIUsageDailyTrendPoint[]> {
    return this.aiUsageRepo.aggregateDailyTrend(input.from, input.to);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern "modules/admin/application"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.ts apps/backend/src/modules/admin/application/get-ai-usage-aggregate.usecase.spec.ts apps/backend/src/modules/admin/application/get-ai-usage-trend.usecase.ts
git commit -m "feat: add GetAiUsageAggregate/GetAiUsageTrend use cases"
```

---

## Task 10: Admin controller, DTOs, `AdminModule` wiring, e2e test

**Files:**
- Create: `apps/backend/src/modules/admin/presentation/dto/get-ai-usage-query.dto.ts`
- Create: `apps/backend/src/modules/admin/presentation/admin.controller.ts`
- Create: `apps/backend/src/modules/admin/admin.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Create: `apps/backend/test/admin.e2e-spec.ts`

**Interfaces:**
- Consumes: all use cases from Tasks 8-9, `AdminAuthGuard` (Task 3), `OperatorAuditLogOrmEntity` (Task 7)
- Produces: `GET/POST /api/v1/admin/organizations(...)`, `GET /api/v1/admin/ai-usage(/trend)` per the spec

- [ ] **Step 1: Query DTO with required date range**

```typescript
// apps/backend/src/modules/admin/presentation/dto/get-ai-usage-query.dto.ts
import {
  IsDateString,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

@ValidatorConstraint({ name: 'adminAiUsageDateRange', async: false })
class AdminAiUsageDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { from, to } = args.object as { from?: string; to?: string };
    if (typeof from !== 'string' || typeof to !== 'string') return true;
    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return true;
    const range = toTime - fromTime;
    return range >= 0 && range <= MAX_RANGE_MS;
  }

  defaultMessage(): string {
    return 'to phải >= from và khoảng cách không vượt quá 90 ngày.';
  }
}

export class GetAiUsageQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  @Validate(AdminAiUsageDateRangeConstraint)
  to!: string;
}
```

- [ ] **Step 2: Controller**

```typescript
// apps/backend/src/modules/admin/presentation/admin.controller.ts
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import type { AuthenticatedOperator } from '../../../common/admin/authenticated-operator';
import { Public } from '../../../common/auth/public.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { GetAiUsageAggregateUseCase } from '../application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from '../application/get-ai-usage-trend.usecase';
import { ListOrganizationsUseCase } from '../application/list-organizations.usecase';
import { LockOrganizationUseCase } from '../application/lock-organization.usecase';
import { UnlockOrganizationUseCase } from '../application/unlock-organization.usecase';
import { GetAiUsageQueryDto } from './dto/get-ai-usage-query.dto';

interface AdminRequest extends Request {
  user: AuthenticatedOperator;
}

@ApiTags('admin')
@Controller('admin')
@Public()
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly listOrganizationsUseCase: ListOrganizationsUseCase,
    private readonly lockOrganizationUseCase: LockOrganizationUseCase,
    private readonly unlockOrganizationUseCase: UnlockOrganizationUseCase,
    private readonly getAiUsageAggregateUseCase: GetAiUsageAggregateUseCase,
    private readonly getAiUsageTrendUseCase: GetAiUsageTrendUseCase,
  ) {}

  @Get('organizations')
  async listOrganizations(@Query() pagination: PaginationDto) {
    return this.listOrganizationsUseCase.execute({
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Post('organizations/:id/lock')
  async lock(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.lockOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'LOCKED' };
  }

  @Post('organizations/:id/unlock')
  async unlock(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.unlockOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'ACTIVE' };
  }

  @Get('ai-usage')
  async getAiUsage(@Query() query: GetAiUsageQueryDto) {
    const items = await this.getAiUsageAggregateUseCase.execute({
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return { items };
  }

  @Get('ai-usage/trend')
  async getAiUsageTrend(@Query() query: GetAiUsageQueryDto) {
    const items = await this.getAiUsageTrendUseCase.execute({
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return { items };
  }
}
```

`@Public()` at the controller class level skips the global `JwtAuthGuard`/`EmailVerifiedGuard`/`OrganizationLockGuard` (all three already check the `isPublic` reflector metadata); `@UseGuards(AdminAuthGuard)` then self-protects every route on this controller.

- [ ] **Step 3: `AdminModule`**

```typescript
// apps/backend/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getJwtModuleOptions } from '../../config/jwt.config';
import { AdminAuthGuard } from '../../common/admin/admin-auth.guard';
import { CopilotModule } from '../copilot/copilot.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GetAiUsageAggregateUseCase } from './application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from './application/get-ai-usage-trend.usecase';
import { ListOrganizationsUseCase } from './application/list-organizations.usecase';
import { LockOrganizationUseCase } from './application/lock-organization.usecase';
import { OPERATOR_AUDIT_LOG_REPOSITORY } from './application/operator-audit-log-repository.port';
import { UnlockOrganizationUseCase } from './application/unlock-organization.usecase';
import { OperatorAuditLogOrmEntity } from './infrastructure/operator-audit-log.orm-entity';
import { TypeOrmOperatorAuditLogRepository } from './infrastructure/typeorm-operator-audit-log.repository';
import { AdminController } from './presentation/admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperatorAuditLogOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    OrganizationsModule,
    CopilotModule,
  ],
  providers: [
    {
      provide: OPERATOR_AUDIT_LOG_REPOSITORY,
      useClass: TypeOrmOperatorAuditLogRepository,
    },
    ListOrganizationsUseCase,
    LockOrganizationUseCase,
    UnlockOrganizationUseCase,
    GetAiUsageAggregateUseCase,
    GetAiUsageTrendUseCase,
    AdminAuthGuard,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
```

- [ ] **Step 4: Register `AdminModule` in `app.module.ts`**

```typescript
// apps/backend/src/app.module.ts
// add import:
import { AdminModule } from './modules/admin/admin.module';

// add to the imports array (alongside the other feature modules):
    AdminModule,
```

- [ ] **Step 5: Write the failing e2e test**

```typescript
// apps/backend/test/admin.e2e-spec.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { hashPassword } from '../src/modules/auth/application/password-hasher';
// (adjust import path/name for the password hasher to match the actual export)

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get('DataSource');

    const passwordHash = await hashPassword('Password123!');
    await dataSource.getRepository(UserOrmEntity).save({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Operator',
      email: 'operator-e2e@casso.vn',
      passwordHash,
      emailVerifiedAt: new Date(),
      isOperator: true,
      createdAt: new Date(),
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'operator-e2e@casso.vn', password: 'Password123!' });
    operatorToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects /admin/organizations without an operator token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .expect(401);
  });

  it('locks an organization, then a member of that org is blocked with ORGANIZATION_LOCKED', async () => {
    const orgsResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations?page=1&limit=1')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const targetOrgId = orgsResponse.body.items[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${targetOrgId}/lock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    // Repeat lock is a no-op, not an error
    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${targetOrgId}/lock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);
  });

  it('rejects the aggregate ai-usage endpoint when from/to are missing', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/ai-usage')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);
  });
});
```

Adjust the seed/fixture details (test DB setup, `hashPassword` export name) to match this repo's existing e2e conventions — check an existing `test/*.e2e-spec.ts` file (e.g. the auth or organizations one) for the exact `beforeAll`/testcontainers bootstrap pattern used elsewhere and mirror it exactly; do not invent a different bootstrap approach.

- [ ] **Step 6: Run e2e test to verify it fails, then implement until it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- admin.e2e-spec`
Expected: first FAIL (module/route wiring incomplete), then PASS once Steps 1-4 are in place.

- [ ] **Step 7: Run the full test suite, e2e suite, and type check**

Run: `npx jest && npx tsc --noEmit && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 8: Run `domain-check` skill**

Per AGENTS.md, run the `domain-check` skill and fix any violations before considering this task done.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/admin apps/backend/src/app.module.ts apps/backend/test/admin.e2e-spec.ts
git commit -m "feat: add admin controller, module wiring, and e2e coverage"
```

---

## Task 11: Frontend — operator token helper + `/admin` route guard + route tree

**Files:**
- Modify: `apps/frontend/src/lib/api-client.ts`
- Create: `apps/frontend/src/routes/admin-route.tsx`
- Modify: `apps/frontend/src/routes/index.tsx`
- Create: `apps/frontend/src/routes/admin-route.spec.tsx`

**Interfaces:**
- Produces: `isOperatorToken(token: string): boolean` (exported from `lib/api-client.ts`, reusing the existing base64 JWT-decode helper)
- Produces: `AdminRoute` component — renders `children` when `authTokenManager`'s current token has `isOperator: true`, else redirects to `/admin/login`
- Produces: `adminRoutes: RouteObject[]` exported from `routes/index.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/routes/admin-route.spec.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { authTokenManager } from '@/lib/api-client';
import { AdminRoute } from './admin-route';

function buildToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe('AdminRoute', () => {
  it('renders children when the current token has isOperator=true', () => {
    authTokenManager.setAccessToken(buildToken({ isOperator: true, exp: Date.now() / 1000 + 3600 }));

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={<AdminRoute>ok</AdminRoute>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('redirects when there is no operator token', () => {
    authTokenManager.setAccessToken(null);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={<AdminRoute>ok</AdminRoute>}
          />
          <Route path="/admin/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern admin-route` (or the FE test runner configured in `apps/frontend/package.json`, e.g. `pnpm --filter @casso-ledger/frontend test -- admin-route`)
Expected: FAIL — `admin-route.tsx` does not exist.

- [ ] **Step 3: Add `isOperatorToken` to `api-client.ts`**

```typescript
// apps/frontend/src/lib/api-client.ts
// (keep existing JwtPayload/getTokenExpiry as-is; extend and add:)

interface JwtPayload {
  exp?: unknown;
  isOperator?: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;
  try {
    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
    return JSON.parse(atob(paddedPayload)) as JwtPayload;
  } catch {
    return null;
  }
}

function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
}

export function isOperatorToken(token: string): boolean {
  return decodeJwtPayload(token)?.isOperator === true;
}
```

(This replaces the existing `getTokenExpiry` body with a shared `decodeJwtPayload` helper — keep `getTokenExpiry`'s exported behavior identical.)

- [ ] **Step 4: Implement `AdminRoute`**

```typescript
// apps/frontend/src/routes/admin-route.tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authTokenManager, isOperatorToken } from '@/lib/api-client';

export function AdminRoute({ children }: { children: ReactNode }) {
  const token = authTokenManager.getAccessToken();
  if (!token || !isOperatorToken(token)) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run the FE test command again.
Expected: PASS

- [ ] **Step 6: Wire the route tree**

```typescript
// apps/frontend/src/routes/index.tsx
// add lazy imports alongside the existing ones:
const AdminLoginPage = lazy(() =>
  import('@/features/admin/pages/admin-login-page').then((m) => ({
    default: m.AdminLoginPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  import('@/features/admin/pages/admin-dashboard-page').then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const AdminOrganizationsPage = lazy(() =>
  import('@/features/admin/pages/admin-organizations-page').then((m) => ({
    default: m.AdminOrganizationsPage,
  })),
);
const AdminAiUsagePage = lazy(() =>
  import('@/features/admin/pages/admin-ai-usage-page').then((m) => ({
    default: m.AdminAiUsagePage,
  })),
);

// add AdminRoute import:
import { AdminRoute } from './admin-route';

// add a new exported route array:
export const adminRoutes: RouteObject[] = [
  { path: 'admin/login', element: withPageSuspense(<AdminLoginPage />) },
  {
    path: 'admin/dashboard',
    element: (
      <AdminRoute>{withPageSuspense(<AdminDashboardPage />)}</AdminRoute>
    ),
  },
  {
    path: 'admin/organizations',
    element: (
      <AdminRoute>{withPageSuspense(<AdminOrganizationsPage />)}</AdminRoute>
    ),
  },
  {
    path: 'admin/ai-usage',
    element: (
      <AdminRoute>{withPageSuspense(<AdminAiUsagePage />)}</AdminRoute>
    ),
  },
];
```

Check `apps/frontend/src/App.tsx` (or wherever `authRoutes`/`appRoutes` are consumed) and add `...adminRoutes` to the router configuration alongside them, at the same top-level route array — the admin pages are pages this new use case will create in Tasks 12-14, so this step only wires paths; the imports will 404 until those files exist. Confirm the router doesn't wrap `admin/*` paths in the existing `<ProtectedRoute>`/org-scoped layout (it must not — the Operator has no `organizationId`/customer session).

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit` (frontend project)
Expected: FAIL until Tasks 12-14 create the page files — that's expected at this point; re-run after Task 14.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/lib/api-client.ts apps/frontend/src/routes/admin-route.tsx apps/frontend/src/routes/admin-route.spec.tsx apps/frontend/src/routes/index.tsx
git commit -m "feat: add admin route guard and route tree"
```

---

## Task 12: Frontend — `admin-login-page` + `admin-organizations-page`

**Files:**
- Create: `apps/frontend/src/features/admin/api/admin-api.ts`
- Create: `apps/frontend/src/features/admin/pages/admin-login-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-organizations-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx`

**Interfaces:**
- Produces: `adminLogin(email, password): Promise<void>` (calls `/auth/login`, stores the token via `authTokenManager`, does **not** call `/me`)
- Produces: `listOrganizations(page, limit): Promise<{ items, total, page, limit }>`, `lockOrganization(id): Promise<void>`, `unlockOrganization(id): Promise<void>`
- Produces: `AdminLoginPage`, `AdminOrganizationsPage` components

- [ ] **Step 1: `admin-api.ts`**

```typescript
// apps/frontend/src/features/admin/api/admin-api.ts
import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<void> {
  const result = await apiRequest<{ accessToken: string }>({
    url: '/api/v1/auth/login',
    method: 'POST',
    data: { email, password },
  });
  authTokenManager.setAccessToken(result.accessToken);
}

export function listOrganizations(
  page: number,
  limit: number,
): Promise<{
  items: OrganizationListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  return apiRequest({
    url: '/api/v1/admin/organizations',
    method: 'GET',
    params: { page, limit },
  });
}

export function lockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/lock`,
    method: 'POST',
  });
}

export function unlockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/unlock`,
    method: 'POST',
  });
}
```

- [ ] **Step 2: `admin-login-page.tsx`**

```typescript
// apps/frontend/src/features/admin/pages/admin-login-page.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminLogin } from '../api/admin-api';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminLogin(email, password);
      navigate('/admin/dashboard', { replace: true });
    } catch {
      setError('Đăng nhập thất bại.');
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Casso Admin</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">
          Đăng nhập
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing test for `AdminOrganizationsPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationsPage } from './admin-organizations-page';

jest.mock('../api/admin-api');

describe('AdminOrganizationsPage', () => {
  it('lists organizations and locks one on button click', async () => {
    jest.spyOn(adminApi, 'listOrganizations').mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    jest
      .spyOn(adminApi, 'lockOrganization')
      .mockResolvedValue({ status: 'LOCKED' });

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /khóa/i }));

    await waitFor(() =>
      expect(adminApi.lockOrganization).toHaveBeenCalledWith('org-1'),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run the FE test command for this file.
Expected: FAIL — `admin-organizations-page.tsx` does not exist.

- [ ] **Step 5: Implement `AdminOrganizationsPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.tsx
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type OrganizationListItem,
  listOrganizations,
  lockOrganization,
  unlockOrganization,
} from '../api/admin-api';

export function AdminOrganizationsPage() {
  const [items, setItems] = useState<OrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    setIsLoading(true);
    const result = await listOrganizations(1, 100);
    setItems(result.items);
    setIsLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleToggle(org: OrganizationListItem) {
    if (org.status === 'ACTIVE') {
      await lockOrganization(org.id);
    } else {
      await unlockOrganization(org.id);
    }
    await reload();
  }

  if (isLoading) return <p>Đang tải...</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên tổ chức</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Ngày tạo</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((org) => (
          <TableRow key={org.id}>
            <TableCell>{org.name}</TableCell>
            <TableCell>
              <Badge variant={org.status === 'LOCKED' ? 'destructive' : 'default'}>
                {org.status}
              </Badge>
            </TableCell>
            <TableCell>{new Date(org.createdAt).toLocaleDateString('vi-VN')}</TableCell>
            <TableCell>
              <Button variant="outline" onClick={() => handleToggle(org)}>
                {org.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Check `apps/frontend/src/components/ui/badge.tsx` for the exact `variant` prop values it accepts (`default`/`destructive` are assumed here — adjust to match).

- [ ] **Step 6: Run test to verify it passes**

Run the FE test command for this file.
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/features/admin/pages/admin-login-page.tsx apps/frontend/src/features/admin/pages/admin-organizations-page.tsx apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
git commit -m "feat: add admin login and organizations pages"
```

---

## Task 13: Frontend — `admin-ai-usage-page`

**Files:**
- Modify: `apps/frontend/src/features/admin/api/admin-api.ts`
- Create: `apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx`

**Interfaces:**
- Produces: `getAiUsage(from, to): Promise<{ items: AiUsageAggregateItem[] }>`
- Produces: `AdminAiUsagePage` component — required date inputs + breakdown table

- [ ] **Step 1: Extend `admin-api.ts`**

```typescript
// apps/frontend/src/features/admin/api/admin-api.ts
// add:

export interface AiUsageAggregateItem {
  organizationId: string;
  organizationName: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

export function getAiUsage(
  from: string,
  to: string,
): Promise<{ items: AiUsageAggregateItem[] }> {
  return apiRequest({
    url: '/api/v1/admin/ai-usage',
    method: 'GET',
    params: { from, to },
  });
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../api/admin-api';
import { AdminAiUsagePage } from './admin-ai-usage-page';

jest.mock('../api/admin-api');

describe('AdminAiUsagePage', () => {
  it('fetches and displays the breakdown after submitting a date range', async () => {
    jest.spyOn(adminApi, 'getAiUsage').mockResolvedValue({
      items: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme',
          model: 'gpt-5.5',
          requestCount: 42,
          totalTokens: 1000,
          errorCount: 0,
        },
      ],
    });

    render(<AdminAiUsagePage />);

    await userEvent.type(screen.getByLabelText(/từ ngày/i), '2026-08-01');
    await userEvent.type(screen.getByLabelText(/đến ngày/i), '2026-08-07');
    await userEvent.click(screen.getByRole('button', { name: /xem/i }));

    await waitFor(() =>
      expect(adminApi.getAiUsage).toHaveBeenCalledWith(
        '2026-08-01',
        '2026-08-07',
      ),
    );
    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run the FE test command for this file.
Expected: FAIL — `admin-ai-usage-page.tsx` does not exist.

- [ ] **Step 4: Implement `AdminAiUsagePage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type AiUsageAggregateItem, getAiUsage } from '../api/admin-api';

export function AdminAiUsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AiUsageAggregateItem[]>([]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await getAiUsage(from, to);
    setItems(result.items);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="from">Từ ngày</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Đến ngày</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
          />
        </div>
        <Button type="submit">Xem</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tổ chức</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Số request</TableHead>
            <TableHead>Tổng tokens</TableHead>
            <TableHead>Lỗi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.organizationId}-${item.model}`}>
              <TableCell>{item.organizationName}</TableCell>
              <TableCell>{item.model}</TableCell>
              <TableCell>{item.requestCount}</TableCell>
              <TableCell>{item.totalTokens}</TableCell>
              <TableCell>{item.errorCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run the FE test command for this file.
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx
git commit -m "feat: add admin AI usage breakdown page"
```

---

## Task 14: Frontend — `admin-dashboard-page` (cards + 2 recharts charts)

**Files:**
- Modify: `apps/frontend/src/features/admin/api/admin-api.ts`
- Create: `apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx`

**Interfaces:**
- Produces: `getAiUsageTrend(from, to): Promise<{ items: { date: string; requestCount: number; totalTokens: number }[] }>`
- Produces: `AdminDashboardPage` — org count / locked count cards, top-orgs bar chart, daily trend line chart, both for the last 7 days (computed client-side, passed explicitly to the endpoints per the "no BE default" decision)

- [ ] **Step 1: Extend `admin-api.ts`**

```typescript
// apps/frontend/src/features/admin/api/admin-api.ts
// add:

export interface AiUsageTrendPoint {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export function getAiUsageTrend(
  from: string,
  to: string,
): Promise<{ items: AiUsageTrendPoint[] }> {
  return apiRequest({
    url: '/api/v1/admin/ai-usage/trend',
    method: 'GET',
    params: { from, to },
  });
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx
import { render, screen } from '@testing-library/react';
import * as adminApi from '../api/admin-api';
import { AdminDashboardPage } from './admin-dashboard-page';

jest.mock('../api/admin-api');

describe('AdminDashboardPage', () => {
  it('shows org counts computed from the organizations list', async () => {
    jest.spyOn(adminApi, 'listOrganizations').mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'LOCKED',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'org-2',
          name: 'Beta',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
    });
    jest
      .spyOn(adminApi, 'getAiUsage')
      .mockResolvedValue({ items: [] });
    jest
      .spyOn(adminApi, 'getAiUsageTrend')
      .mockResolvedValue({ items: [] });

    render(<AdminDashboardPage />);

    expect(await screen.findByText('2')).toBeInTheDocument(); // total orgs
    expect(await screen.findByText('1')).toBeInTheDocument(); // locked orgs
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run the FE test command for this file.
Expected: FAIL — `admin-dashboard-page.tsx` does not exist.

- [ ] **Step 4: Implement `AdminDashboardPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AiUsageAggregateItem,
  type AiUsageTrendPoint,
  getAiUsage,
  getAiUsageTrend,
  listOrganizations,
} from '../api/admin-api';

function last7DayRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function AdminDashboardPage() {
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [lockedOrgs, setLockedOrgs] = useState(0);
  const [topOrgs, setTopOrgs] = useState<AiUsageAggregateItem[]>([]);
  const [trend, setTrend] = useState<AiUsageTrendPoint[]>([]);

  useEffect(() => {
    const { from, to } = last7DayRange();

    void listOrganizations(1, 100).then((result) => {
      setTotalOrgs(result.total);
      setLockedOrgs(result.items.filter((org) => org.status === 'LOCKED').length);
    });
    void getAiUsage(from, to).then((result) => setTopOrgs(result.items));
    void getAiUsageTrend(from, to).then((result) => setTrend(result.items));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Tổng số tổ chức</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totalOrgs}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Đang bị khóa</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{lockedOrgs}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top organizations theo usage (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOrgs}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="organizationName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="requestCount" fill="var(--chart-1, #6366f1)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Xu hướng usage theo ngày (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="requestCount" stroke="var(--chart-2, #10b981)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

Check `apps/frontend/src/components/ui/card.tsx` for the exact `Card`/`CardHeader`/`CardTitle`/`CardContent` exports and adjust if names differ. Before finalizing chart colors, follow the `dataviz` skill's color guidance instead of the placeholder `--chart-1`/`--chart-2` variables used above if the project already has a defined chart palette (check `apps/frontend/src/index.css`/`tailwind.config` for existing `--chart-*` tokens, e.g. from the existing `aging-chart.tsx`).

- [ ] **Step 5: Run test to verify it passes**

Run the FE test command for this file.
Expected: PASS

- [ ] **Step 6: Run the full frontend test suite and type check**

Run: `pnpm --filter @casso-ledger/frontend test && npx tsc --noEmit` (frontend project)
Expected: PASS — this also confirms Task 11's route-tree wiring now type-checks since all four page files exist.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx
git commit -m "feat: add admin dashboard page with recharts visualizations"
```

---

## Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run backend verification**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run `pnpm verify` (lint + type-check + test, includes `arch-check`/`check-controller-docs.mjs`)**

Run: `pnpm verify`
Expected: PASS — this also confirms `AdminController` carries `@ApiTags('admin')` per the arch-check requirement

- [ ] **Step 3: Run frontend verification**

Run: `pnpm --filter @casso-ledger/frontend test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run `domain-check` skill**

Per AGENTS.md, run `/domain-check` and fix any violations before claiming completion.

- [ ] **Step 5: Update `docs/wayfinder/feature-map.md`**

Mark the Casso Admin Platform ticket (issue #98) status → `done` (or the appropriate in-progress status if this plan is executed incrementally), add `Shipped:` date + PR reference once merged, per AGENTS.md's "Workflow: Starting a new ticket" step 5.
