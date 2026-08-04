# Multi-tenancy & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tenant isolation (`Organization`, `Membership`, shared-schema + `organizationId`) and static-role RBAC enforcement, retrofitted onto the Domain Core modules built in `2026-08-03-project-scaffolding-and-domain-core.md` so every query is automatically scoped and every write endpoint is permission-gated.

**Architecture:** `JwtAuthGuard` verifies the JWT and `JwtStrategy.validate()` re-queries `(userId, organizationId)` through `IMembershipRepository`; only a Membership with `joinedAt != null` is accepted, and the current DB role replaces the JWT role. `TenantContextService` (AsyncLocalStorage) then holds `{ userId, organizationId, role }` for the request. `BaseRepository<T>` reads `organizationId` from the context so callers never pass it manually. `PermissionGuard` + `@RequirePermission()` decorator check `ROLE_PERMISSIONS[role]`.

**Tech Stack:** `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt`, Node `AsyncLocalStorage`, TypeORM (builds on Domain Core plan's entities/repositories).

## Global Constraints

- Shared schema: every business table has `organizationId NOT NULL` with an index (spec section 1).
- `BaseRepository` auto-adds `WHERE organizationId = ctx.organizationId` — service/use-case code never writes this filter by hand (spec section 1, "Enforce isolation at the application layer" step 3).
- 5 static roles, permission list hard-coded in code, no `Role`/`Permission` DB tables (spec section 2).
- `SALES_REP` data-scope restriction (own customers only) is Service-layer logic, not `PermissionGuard` logic (spec section 2, "Special case").
- A Membership is active exactly when `joinedAt != null`; JWT payload `role` is not an authorization source after validation.
- No Postgres Row-Level Security at MVP (spec section 3).
- File/class naming and layer dependency rules from `2026-08-03-project-scaffolding-architecture-design.md` (domain has no framework imports; presentation → application → domain).

---

## File Structure

```
apps/backend/src/
  common/
    tenancy/
      tenant-context.ts                 -- AsyncLocalStorage holder + TenantContextService
      tenant-context.interceptor.ts     -- populates context from request.user after JwtAuthGuard
      base.repository.ts                -- abstract class auto-scoping queries by organizationId
    auth/
      authenticated-user.ts             -- interface { userId, organizationId, role }
      jwt.strategy.ts                   -- passport-jwt strategy, validates signature + shape
      jwt-auth.guard.ts                 -- global AuthGuard('jwt') wrapper with @Public bypass
      public.decorator.ts               -- metadata key isPublic
    rbac/
      permission.enum.ts                -- Permission enum (12 values from spec section 2)
      role-permissions.map.ts           -- ROLE_PERMISSIONS: Record<Role, Permission[]>
      require-permission.decorator.ts   -- @RequirePermission(Permission.X) metadata setter
      permission.guard.ts               -- reads role from TenantContext, checks ROLE_PERMISSIONS
  modules/
    organizations/
      domain/organization.ts
      domain/membership.ts              -- includes Role enum
      infrastructure/organization.orm-entity.ts
      infrastructure/membership.orm-entity.ts
      application/organization-repository.port.ts
      application/membership-repository.port.ts
      infrastructure/typeorm-organization.repository.ts
      infrastructure/typeorm-membership.repository.ts
      organizations.module.ts
    customers/infrastructure/typeorm-customer.repository.ts       -- MODIFY: extend BaseRepository
    invoices/infrastructure/typeorm-invoice.repository.ts         -- MODIFY: extend BaseRepository
    receivables/
      infrastructure/typeorm-receivable.repository.ts             -- MODIFY: extend BaseRepository
      application/write-off-receivable.usecase.ts                 -- NEW
      presentation/receivables.controller.ts                      -- MODIFY: add write-off endpoint + guard
    payments/infrastructure/typeorm-payment.repository.ts         -- MODIFY: extend BaseRepository
  app.module.ts                                                    -- MODIFY: register JwtModule, global guards
test/
  tenant-isolation.integration.spec.ts
```

---

### Task 1: Organization & Membership domain entities

**Files:**
- Create: `apps/backend/src/modules/organizations/domain/organization.ts`
- Create: `apps/backend/src/modules/organizations/domain/membership.ts`
- Test: `apps/backend/src/modules/organizations/domain/membership.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Organization`, `Membership`, `Role` enum — used by every later task in this plan and by the Authentication plan's signup use case

- [ ] **Step 1: Write failing test for Role enum completeness**

Create `apps/backend/src/modules/organizations/domain/membership.spec.ts`:

```typescript
import { Membership, Role } from './membership';

describe('Membership domain entity', () => {
  it('holds the 5 static roles defined by the spec', () => {
    expect(Object.values(Role)).toEqual([
      'OWNER',
      'FINANCE_MANAGER',
      'ACCOUNTANT',
      'SALES_REP',
      'VIEWER',
    ]);
  });

  it('creates a membership with joinedAt set for an active member', () => {
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });

    expect(membership.role).toBe(Role.OWNER);
    expect(membership.joinedAt).not.toBeNull();
    expect(membership.isActive()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test membership.spec.ts`
Expected: FAIL — Cannot find module './membership'

- [ ] **Step 3: Create `apps/backend/src/modules/organizations/domain/organization.ts`**

```typescript
export interface OrganizationProps {
  id: string;
  name: string;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 4: Create `apps/backend/src/modules/organizations/domain/membership.ts`**

```typescript
export enum Role {
  OWNER = 'OWNER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  VIEWER = 'VIEWER',
}

export interface MembershipProps {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  invitedAt: Date;
  joinedAt: Date | null;
  createdAt: Date;
}

export class Membership {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly joinedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: MembershipProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.role = props.role;
    this.invitedAt = props.invitedAt;
    this.joinedAt = props.joinedAt;
    this.createdAt = props.createdAt;
  }

  isActive(): boolean {
    return this.joinedAt !== null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test membership.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/organizations/domain
git commit -m "feat: add Organization and Membership domain entities with Role enum"
```

---

### Task 2: Organization & Membership infrastructure + module

**Files:**
- Create: `apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts`
- Create: `apps/backend/src/modules/organizations/infrastructure/membership.orm-entity.ts`
- Create: `apps/backend/src/modules/organizations/application/organization-repository.port.ts`
- Create: `apps/backend/src/modules/organizations/application/membership-repository.port.ts`
- Create: `apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts`
- Create: `apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts`
- Create: `apps/backend/src/modules/organizations/organizations.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `Organization`, `Membership` domain classes (Task 1)
- Produces: `IMembershipRepository.findByUserAndOrganization(userId, organizationId)`, used by Task 4 (`JwtAuthGuard` — actually validates membership exists — see Task 4 note)

- [ ] **Step 1: Create `apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/organizations/infrastructure/membership.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../domain/membership';

@Entity({ name: 'memberships' })
@Index(['organizationId', 'userId'], { unique: true })
export class MembershipOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column()
  invitedAt: Date;

  @Column({ nullable: true })
  joinedAt: Date | null;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 3: Create repository ports**

`apps/backend/src/modules/organizations/application/organization-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Organization } from '../domain/organization';

export interface IOrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
```

`apps/backend/src/modules/organizations/application/membership-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Membership } from '../domain/membership';

export interface IMembershipRepository {
  findByUserAndOrganization(userId: string, organizationId: string): Promise<Membership | null>;
  save(membership: Membership, manager?: EntityManager): Promise<void>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
```

- [ ] **Step 4: Create repository implementations**

`apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Organization } from '../domain/organization';
import { IOrganizationRepository } from '../application/organization-repository.port';
import { OrganizationOrmEntity } from './organization.orm-entity';

@Injectable()
export class TypeOrmOrganizationRepository implements IOrganizationRepository {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repo: Repository<OrganizationOrmEntity>,
  ) {}

  async findById(id: string): Promise<Organization | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? new Organization(row) : null;
  }

  async save(organization: Organization, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(OrganizationOrmEntity) : this.repo).save(organization);
  }
}
```

`apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Membership } from '../domain/membership';
import { IMembershipRepository } from '../application/membership-repository.port';
import { MembershipOrmEntity } from './membership.orm-entity';

@Injectable()
export class TypeOrmMembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipOrmEntity)
    private readonly repo: Repository<MembershipOrmEntity>,
  ) {}

  async findByUserAndOrganization(userId: string, organizationId: string): Promise<Membership | null> {
    const row = await this.repo.findOne({ where: { userId, organizationId } });
    return row ? new Membership(row) : null;
  }

  async save(membership: Membership, manager?: EntityManager): Promise<void> {
    await (manager ? manager.getRepository(MembershipOrmEntity) : this.repo).save(membership);
  }
}
```

- [ ] **Step 5: Create `apps/backend/src/modules/organizations/organizations.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationOrmEntity } from './infrastructure/organization.orm-entity';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';
import { ORGANIZATION_REPOSITORY } from './application/organization-repository.port';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationOrmEntity, MembershipOrmEntity])],
  providers: [
    { provide: ORGANIZATION_REPOSITORY, useClass: TypeOrmOrganizationRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
  ],
  exports: [ORGANIZATION_REPOSITORY, MEMBERSHIP_REPOSITORY],
})
export class OrganizationsModule {}
```

- [ ] **Step 6: Register `OrganizationsModule` in `apps/backend/src/app.module.ts`**

Add `OrganizationsModule` to the `imports` array.

- [ ] **Step 7: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/organizations apps/backend/src/app.module.ts
git commit -m "feat: add Organization and Membership repositories"
```

---

### Task 3: TenantContext (AsyncLocalStorage)

**Files:**
- Create: `apps/backend/src/common/auth/authenticated-user.ts`
- Create: `apps/backend/src/common/tenancy/tenant-context.ts`
- Test: `apps/backend/src/common/tenancy/tenant-context.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `TenantContextService.run(user, callback)`, `TenantContextService.getCurrentUser()` — used by Task 4 (interceptor sets it), Task 5 (`BaseRepository` reads it), Task 6 (`PermissionGuard` reads it)

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/common/tenancy/tenant-context.spec.ts`:

```typescript
import { TenantContextService } from './tenant-context';
import { Role } from '../../modules/organizations/domain/membership';

describe('TenantContextService', () => {
  it('returns undefined when called outside of run()', () => {
    const service = new TenantContextService();
    expect(service.getCurrentUser()).toBeUndefined();
  });

  it('returns the user set by run() only within that callback', () => {
    const service = new TenantContextService();
    const user = { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER };

    service.run(user, () => {
      expect(service.getCurrentUser()).toEqual(user);
    });

    expect(service.getCurrentUser()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test tenant-context.spec.ts`
Expected: FAIL — Cannot find module './tenant-context'

- [ ] **Step 3: Create `apps/backend/src/common/auth/authenticated-user.ts`**

```typescript
import { Role } from '../../modules/organizations/domain/membership';

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: Role;
}
```

- [ ] **Step 4: Create `apps/backend/src/common/tenancy/tenant-context.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<AuthenticatedUser>();

  run<T>(user: AuthenticatedUser, callback: () => T): T {
    return this.storage.run(user, callback);
  }

  getCurrentUser(): AuthenticatedUser | undefined {
    return this.storage.getStore();
  }

  getOrganizationId(): string {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error('TenantContextService accessed outside of an authenticated request');
    }
    return user.organizationId;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test tenant-context.spec.ts`
Expected: both tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/common/auth apps/backend/src/common/tenancy/tenant-context.ts apps/backend/src/common/tenancy/tenant-context.spec.ts
git commit -m "feat: add TenantContextService using AsyncLocalStorage"
```

---

### Task 4: JWT auth guard

**Files:**
- Create: `apps/backend/src/common/auth/jwt.strategy.ts`
- Create: `apps/backend/src/common/auth/jwt-auth.guard.ts`
- Create: `apps/backend/src/common/tenancy/tenant-context.interceptor.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/jwt-auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `TenantContextService` (Task 3), `IMembershipRepository` (Task 2)
- Produces: every request past this guard has `request.user: AuthenticatedUser` AND `TenantContextService.getCurrentUser()` populated — Authentication plan's login endpoint will sign tokens with the same `JWT_SECRET`/payload shape this strategy expects

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @casso-ledger/backend add @nestjs/jwt @nestjs/passport passport passport-jwt`
Run: `pnpm --filter @casso-ledger/backend add -D @types/passport-jwt`

- [ ] **Step 2: Add `JWT_SECRET` to `apps/backend/.env`**

```
JWT_SECRET=dev-only-change-me
```

- [ ] **Step 3: Create `apps/backend/src/common/auth/jwt.strategy.ts`**

```typescript
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IMembershipRepository, MEMBERSHIP_REPOSITORY } from '../../modules/organizations/application/membership-repository.port';
import { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: IMembershipRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const membership = await this.membershipRepo.findByUserAndOrganization(payload.userId, payload.organizationId);
    if (!membership || !membership.isActive()) {
      throw new UnauthorizedException('Active organization membership required');
    }
    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: membership.role,
    };
  }
}
```

`validate()`'s return value becomes `request.user`. The JWT still carries `role` for transport compatibility, but the strategy re-validates active Membership and uses the current membership role; a signed JWT alone is never treated as proof of organization access.

- [ ] **Step 4: Create `apps/backend/src/common/auth/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()])
      ? true
      : super.canActivate(context);
  }
}
```

`apps/backend/src/common/auth/public.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('isPublic', true);
```

Apply `@Public()` to auth endpoints, health, and the webhook controller. All other controllers are protected by the global guard; local `@UseGuards(JwtAuthGuard)` may remain in plans for readability but is not the security boundary.

- [ ] **Step 5: Create `apps/backend/src/common/tenancy/tenant-context.interceptor.ts`**

```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return next.handle();
    }

    let result$!: Observable<unknown>;
    this.tenantContext.run(user, () => {
      result$ = next.handle();
    });
    return result$;
  }
}
```

Runs AFTER `JwtAuthGuard` (guards execute before interceptors in Nest's request lifecycle), so `request.user` is already set.

- [ ] **Step 6: Wire `JwtModule`, `PassportModule`, `TenantContextService`, global interceptor into `apps/backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { typeOrmConfig } from './config/typeorm.config';
import { CustomersModule } from './modules/customers/customers.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { JwtStrategy } from './common/auth/jwt.strategy';
import { TenantContextService } from './common/tenancy/tenant-context';
import { TenantContextInterceptor } from './common/tenancy/tenant-context.interceptor';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: '15m' },
    }),
    OrganizationsModule,
    CustomersModule,
    InvoicesModule,
    ReceivablesModule,
    PaymentsModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    TenantContextService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [TenantContextService],
})
export class AppModule {}
```

- [ ] **Step 7: Write failing e2e test that a protected route requires a valid JWT**

Create `apps/backend/test/jwt-auth.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';

@Controller('_test-protected')
class TestProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  ping() {
    return { ok: true };
  }
}

describe('JwtAuthGuard (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests with no Authorization header', () => {
    return request(app.getHttpServer()).get('/_test-protected').expect(401);
  });

  it('accepts requests with a valid signed JWT', async () => {
    const token = jwtService.sign({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    });

    return request(app.getHttpServer())
      .get('/_test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { ok: true });
  });
});
```

- [ ] **Step 8: Run test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- jwt-auth.e2e-spec.ts`
Expected: both tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/auth apps/backend/src/common/tenancy/tenant-context.interceptor.ts apps/backend/src/app.module.ts apps/backend/test/jwt-auth.e2e-spec.ts apps/backend/.env apps/backend/package.json
git commit -m "feat: add JWT auth guard and tenant context interceptor"
```

---

### Task 5: BaseRepository — auto-scoped queries

**Files:**
- Create: `apps/backend/src/common/tenancy/base.repository.ts`
- Modify: `apps/backend/src/modules/customers/application/customer-repository.port.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`
- Modify: `apps/backend/src/modules/customers/customers.module.ts`
- Test: `apps/backend/src/common/tenancy/base.repository.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService` (Task 3)
- Produces: `BaseRepository<TOrmEntity>.scopedFindOne(where)` / `.scopedSave(entity)` that inject `organizationId` automatically — every repository in Tasks 6-8 extends this

This task establishes the pattern on `Customer` first (smallest module), then Task 6-8 apply the same migration to Invoice/Receivable/Payment.

- [ ] **Step 1: Write failing test with a fake TypeORM repository**

Create `apps/backend/src/common/tenancy/base.repository.spec.ts`:

```typescript
import { BaseRepository } from './base.repository';
import { TenantContextService } from './tenant-context';
import { Role } from '../../modules/organizations/domain/membership';

class FakeRepo extends BaseRepository<{ id: string; organizationId: string; name: string }> {}

describe('BaseRepository', () => {
  it('injects organizationId from TenantContext into findOne where clause', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = { findOne: jest.fn().mockResolvedValue({ id: '1', organizationId: 'org-1', name: 'x' }) };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run({ userId: 'u1', organizationId: 'org-1', role: Role.OWNER }, async () => {
      await repo.scopedFindOne({ id: '1' });
    });

    expect(ormRepo.findOne).toHaveBeenCalledWith({ where: { id: '1', organizationId: 'org-1' } });
  });

  it('injects organizationId on save, overriding any value the caller set', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = { save: jest.fn() };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run({ userId: 'u1', organizationId: 'org-1', role: Role.OWNER }, async () => {
      await repo.scopedSave({ id: '1', organizationId: 'WRONG', name: 'x' });
    });

    expect(ormRepo.save).toHaveBeenCalledWith({ id: '1', organizationId: 'org-1', name: 'x' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test base.repository.spec.ts`
Expected: FAIL — Cannot find module './base.repository'

- [ ] **Step 3: Create `apps/backend/src/common/tenancy/base.repository.ts`**

```typescript
import { FindOptionsWhere, Repository } from 'typeorm';
import { TenantContextService } from './tenant-context';

export abstract class BaseRepository<TEntity extends { organizationId: string }> {
  constructor(
    protected readonly ormRepo: Repository<TEntity>,
    protected readonly tenantContext: TenantContextService,
  ) {}

  protected async scopedFindOne(where: FindOptionsWhere<TEntity>): Promise<TEntity | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.findOne({ where: { ...where, organizationId } as FindOptionsWhere<TEntity> });
  }

  protected async scopedSave(entity: TEntity): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.ormRepo.save({ ...entity, organizationId });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test base.repository.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Migrate `ICustomerRepository` port to drop the `organizationId` parameter**

Modify `apps/backend/src/modules/customers/application/customer-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Customer } from '../domain/customer';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  save(customer: Customer, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
```

- [ ] **Step 6: Migrate `TypeOrmCustomerRepository` to extend `BaseRepository`**

Replace contents of `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from '../domain/customer';
import { ICustomerRepository } from '../application/customer-repository.port';
import { CustomerOrmEntity } from './customer.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCustomerRepository extends BaseRepository<CustomerOrmEntity> implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity) repo: Repository<CustomerOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Customer(row) : null;
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerOrmEntity) : this.ormRepo;
    await repo.save({ ...customer, organizationId: this.tenantContext.getOrganizationId() } as CustomerOrmEntity);
  }
}
```

- [ ] **Step 7: Register `TenantContextService` as an export the `CustomersModule` can inject**

Modify `apps/backend/src/modules/customers/customers.module.ts` — import `TenantContextService` is already provided globally by `AppModule` (Task 4 Step 6 `providers`), so no change needed here as long as `AppModule`'s providers are visible; since `TenantContextService` is only in `AppModule.providers` (not exported as a dedicated shared module), add it to `AppModule.exports` (already done in Task 4 Step 6) and ensure `CustomersModule` does not redeclare it — Nest resolves it via the module graph since `AppModule` imports `CustomersModule` (parent-to-child providers require explicit export/import; if injection fails, add `imports: [forwardRef(() => AppModule)]` is NOT the fix — instead extract `TenantContextService` into a small `TenancyModule` marked `@Global()`).

Create `apps/backend/src/common/tenancy/tenancy.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context';

@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenancyModule {}
```

Modify `apps/backend/src/app.module.ts`: replace the direct `TenantContextService` entry in `providers` with importing `TenancyModule` in `imports`, and remove it from the top-level `providers` array (keep `JwtStrategy` and the `APP_INTERCEPTOR` entry there).

- [ ] **Step 8: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`
Expected: all PASS (existing `Customer` tests and e2e tests still green; `CreateReceivableUseCase`/`AllocatePaymentUseCase` from the Domain Core plan are unaffected since they use `Receivable`/`Payment` repositories, migrated in Tasks 6-7)

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/tenancy apps/backend/src/modules/customers apps/backend/src/app.module.ts
git commit -m "feat: add BaseRepository for automatic tenant scoping, migrate Customer repository"
```

---

### Task 6: Migrate Invoice & Receivable repositories to BaseRepository

**Files:**
- Modify: `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`
- Modify: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Modify: `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/application/allocate-payment.usecase.ts` (via Payments module import, see Task 7)
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/dto/create-receivable.dto.ts`

**Interfaces:**
- Consumes: `BaseRepository` (Task 5)
- Produces: `IReceivableRepository.findByIdForUpdate(id, manager)` (organizationId param removed — pulled from `TenantContextService` inside the repository)

- [ ] **Step 1: Migrate `IInvoiceRepository` and `TypeOrmInvoiceRepository`**

Modify `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Invoice } from '../domain/invoice';

export interface IInvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  save(invoice: Invoice, manager?: EntityManager): Promise<void>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
```

Replace `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Invoice } from '../domain/invoice';
import { IInvoiceRepository } from '../application/invoice-repository.port';
import { InvoiceOrmEntity } from './invoice.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmInvoiceRepository extends BaseRepository<InvoiceOrmEntity> implements IInvoiceRepository {
  constructor(
    @InjectRepository(InvoiceOrmEntity) repo: Repository<InvoiceOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Invoice(row) : null;
  }

  async save(invoice: Invoice, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(InvoiceOrmEntity) : this.ormRepo;
    await repo.save({ ...invoice, organizationId: this.tenantContext.getOrganizationId() } as InvoiceOrmEntity);
  }
}
```

- [ ] **Step 2: Migrate `IReceivableRepository` port**

Modify `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Receivable } from '../domain/receivable';

export interface IReceivableRepository {
  findById(id: string): Promise<Receivable | null>;
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Receivable | null>;
  save(receivable: Receivable, manager?: EntityManager): Promise<void>;
}

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');
```

- [ ] **Step 3: Migrate `TypeOrmReceivableRepository`**

Replace `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Receivable } from '../domain/receivable';
import { IReceivableRepository } from '../application/receivable-repository.port';
import { ReceivableOrmEntity } from './receivable.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmReceivableRepository
  extends BaseRepository<ReceivableOrmEntity>
  implements IReceivableRepository
{
  constructor(
    @InjectRepository(ReceivableOrmEntity) repo: Repository<ReceivableOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Receivable | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new Receivable(row) : null;
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<Receivable | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(ReceivableOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Receivable(row) : null;
  }

  async save(receivable: Receivable, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager ? manager.getRepository(ReceivableOrmEntity) : this.ormRepo;
    await repo.save({ ...receivable, organizationId } as ReceivableOrmEntity);
  }
}
```

- [ ] **Step 4: Update `CreateReceivableUseCase` — drop explicit `organizationId` input field**

Modify `apps/backend/src/modules/receivables/application/create-receivable.usecase.ts`: remove `organizationId` from `CreateReceivableInput` and read it from `TenantContextService` instead:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateReceivableInput, manager?: EntityManager): Promise<Receivable> {
    const receivable = new Receivable({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      originalAmount: input.originalAmount,
      paidAmount: 0,
      dueDate: input.dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: input.salesRepresentativeId,
      createdAt: new Date(),
      closedAt: null,
    });
    await this.receivableRepo.save(receivable, manager);
    return receivable;
  }
}
```

- [ ] **Step 5: Drop `organizationId` from the DTO and controller**

Modify `apps/backend/src/modules/receivables/presentation/dto/create-receivable.dto.ts` — remove the `organizationId` field entirely.

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` — remove `organizationId: dto.organizationId` from the `execute()` call and add `@UseGuards(JwtAuthGuard)` to the controller class:

```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';

@Controller('receivables')
@UseGuards(JwtAuthGuard)
export class ReceivablesController {
  constructor(private readonly createReceivableUseCase: CreateReceivableUseCase) {}

  @Post()
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId ?? null,
    });
  }
}
```

- [ ] **Step 6: Update the existing unit test for `Receivable` repository signature**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts` (from the Domain Core plan): remove `organizationId: 'org-1'` from every call to `useCase.execute({...})` — the field no longer exists on `AllocatePaymentInput` after Task 7 migrates it.

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: FAIL at this point for `allocate-payment.usecase.spec.ts` — `AllocatePaymentInput` is migrated in Task 7, not yet. This is expected; proceed to Task 7 before running the full suite again.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/invoices apps/backend/src/modules/receivables apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts
git commit -m "refactor: migrate Invoice and Receivable repositories to BaseRepository tenant scoping"
```

---

### Task 7: Migrate Payment repository, AllocatePaymentUseCase, and add write-off endpoint

**Files:**
- Modify: `apps/backend/src/modules/payments/application/payment-repository.port.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`
- Modify: `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`
- Modify: `apps/backend/src/modules/payments/presentation/dto/allocate-payment.dto.ts`
- Modify: `apps/backend/src/modules/payments/presentation/payments.controller.ts`
- Create: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Test: `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`

**Interfaces:**
- Consumes: `BaseRepository` (Task 5), `IReceivableRepository` (Task 6)
- Produces: `POST /receivables/:id/write-off` endpoint gated by `Permission.RECEIVABLE_WRITE_OFF` (consumed by Task 9's integration test)

- [ ] **Step 1: Migrate `IPaymentRepository` port**

Modify `apps/backend/src/modules/payments/application/payment-repository.port.ts`:

```typescript
import { EntityManager } from 'typeorm';
import { Payment } from '../domain/payment';

export interface IPaymentRepository {
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Payment | null>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
```

- [ ] **Step 2: Migrate `TypeOrmPaymentRepository`**

Replace `apps/backend/src/modules/payments/infrastructure/typeorm-payment.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../domain/payment';
import { IPaymentRepository } from '../application/payment-repository.port';
import { PaymentOrmEntity } from './payment.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmPaymentRepository extends BaseRepository<PaymentOrmEntity> implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentOrmEntity) repo: Repository<PaymentOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<Payment | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(PaymentOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Payment(row) : null;
  }

  async save(payment: Payment, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager ? manager.getRepository(PaymentOrmEntity) : this.ormRepo;
    await repo.save({ ...payment, organizationId } as PaymentOrmEntity);
  }
}
```

- [ ] **Step 3: Migrate `AllocatePaymentUseCase` — drop `organizationId` input field**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from './payment-repository.port';
import {
  IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from './payment-allocation-repository.port';
import { PaymentAllocation } from '../domain/payment-allocation';
import { Payment } from '../domain/payment';
import { Receivable } from '../../receivables/domain/receivable';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface AllocatePaymentInput {
  paymentId: string;
  receivableId: string;
  amount: number;
  allocatedByUserId: string | null;
}

@Injectable()
export class AllocatePaymentUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: AllocatePaymentInput): Promise<void> {
    await this.dataSource.transaction((manager) => this.allocateWithinTransaction(manager, input).then(() => undefined));
  }

  async allocateWithinTransaction(
    manager: EntityManager,
    input: AllocatePaymentInput,
  ): Promise<{ payment: Payment; receivable: Receivable }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('Allocation amount must be a positive integer');
    }

    const receivable = await this.receivableRepo.findByIdForUpdate(input.receivableId, manager);
    if (!receivable) {
      throw new Error('Receivable not found');
    }
    const payment = await this.paymentRepo.findByIdForUpdate(input.paymentId, manager);
    if (!payment) {
      throw new Error('Payment not found');
    }
    if (!payment.customerId) {
      throw new Error('Payment customer is unresolved; send to Exception Queue first');
    }
    if (payment.customerId !== receivable.customerId) {
      throw new Error('Payment and receivable belong to different customers');
    }

    const updatedReceivable = receivable.applyPaymentAllocation(input.amount);
    const updatedPayment = payment.withAdditionalAllocation(input.amount);
    const organizationId = this.tenantContext.getOrganizationId();

    await this.receivableRepo.save(updatedReceivable, manager);
    await this.paymentRepo.save(updatedPayment, manager);
    await this.allocationRepo.create(
      new PaymentAllocation({
        id: randomUUID(),
        organizationId,
        paymentId: input.paymentId,
        receivableId: input.receivableId,
        allocatedAmount: input.amount,
        allocatedAt: new Date(),
        allocatedByUserId: input.allocatedByUserId,
        deletedAt: null,
        deletedByUserId: null,
        undoReason: null,
        createdAt: new Date(),
      }),
      manager,
    );

    return { payment: updatedPayment, receivable: updatedReceivable };
  }
}
```

- [ ] **Step 4: Update the existing unit test's mocked repository signatures**

Modify `apps/backend/src/modules/payments/application/allocate-payment.usecase.spec.ts`: `findByIdForUpdate` mocks now take `(id, manager)` — 2 args instead of 3. Update `expect(...).toHaveBeenCalledWith(...)` assertions accordingly, and construct `AllocatePaymentUseCase` with a 5th constructor arg: a fake `TenantContextService`:

```typescript
const tenantContext = { getOrganizationId: () => 'org-1' };
const useCase = new AllocatePaymentUseCase(
  receivableRepo as any,
  paymentRepo as any,
  allocationRepo as any,
  dataSource as any,
  tenantContext as any,
);
```

Remove `organizationId: 'org-1'` from the `useCase.execute({...})` call bodies in both test cases.

- [ ] **Step 5: Drop `organizationId` from `AllocatePaymentDto` and guard the controller**

Modify `apps/backend/src/modules/payments/presentation/dto/allocate-payment.dto.ts` — remove the `organizationId` field.

Modify `apps/backend/src/modules/payments/presentation/payments.controller.ts`:

```typescript
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentsController {
  constructor(private readonly allocatePaymentUseCase: AllocatePaymentUseCase) {}

  @Post(':id/allocate')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async allocate(@Param('id') paymentId: string, @Body() dto: AllocatePaymentDto, @Req() req: Request) {
    await this.allocatePaymentUseCase.execute({
      paymentId,
      receivableId: dto.receivableId,
      amount: dto.amount,
      allocatedByUserId: req.user.userId,
    });
    return { success: true };
  }
}
```

- [ ] **Step 6: Write failing test for `WriteOffReceivableUseCase`**

Create `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../domain/receivable';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';
import { EntityManager } from 'typeorm';

describe('WriteOffReceivableUseCase', () => {
  it('writes off an OPEN receivable and persists it', async () => {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
    });

    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const manager = {} as EntityManager;
    const dataSource = { transaction: jest.fn((callback) => callback(manager)) };

    const useCase = new WriteOffReceivableUseCase(receivableRepo as any, dataSource as any);
    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.WRITTEN_OFF);
    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.WRITTEN_OFF }),
      manager,
    );
  });

  it('throws if receivable not found', async () => {
    const receivableRepo = { findByIdForUpdate: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const dataSource = { transaction: jest.fn((callback) => callback({} as EntityManager)) };
    const useCase = new WriteOffReceivableUseCase(receivableRepo as any, dataSource as any);

    await expect(useCase.execute('missing')).rejects.toThrow('Receivable not found');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test write-off-receivable.usecase.spec.ts`
Expected: FAIL — Cannot find module './write-off-receivable.usecase'

- [ ] **Step 8: Create `apps/backend/src/modules/receivables/application/write-off-receivable.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { IReceivableRepository, RECEIVABLE_REPOSITORY } from './receivable-repository.port';
import { Receivable } from '../domain/receivable';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(receivableId, manager);
      if (!receivable) {
        throw new Error('Receivable not found');
      }
      const updated = receivable.writeOff();
      await this.receivableRepo.save(updated, manager);
      return updated;
    });
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test write-off-receivable.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 10: Register `WriteOffReceivableUseCase` in `receivables.module.ts` and add the controller endpoint**

Modify `apps/backend/src/modules/receivables/receivables.module.ts` — add `WriteOffReceivableUseCase` to `providers`.

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` — add the write-off route (permission guard wiring completes in Task 8):

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';

@Controller('receivables')
@UseGuards(JwtAuthGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId ?? null,
    });
  }

  @Post(':id/write-off')
  async writeOff(@Param('id') id: string) {
    return this.writeOffReceivableUseCase.execute(id);
  }
}
```

- [ ] **Step 11: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/modules/payments apps/backend/src/modules/receivables
git commit -m "refactor: migrate Payment repository to BaseRepository, add WriteOffReceivableUseCase"
```

---

### Task 8: Permission enum, ROLE_PERMISSIONS map, PermissionGuard

**Files:**
- Create: `apps/backend/src/common/rbac/permission.enum.ts`
- Create: `apps/backend/src/common/rbac/role-permissions.map.ts`
- Create: `apps/backend/src/common/rbac/require-permission.decorator.ts`
- Create: `apps/backend/src/common/rbac/permission.guard.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Test: `apps/backend/src/common/rbac/permission.guard.spec.ts`

**Interfaces:**
- Consumes: `TenantContextService` (Task 3), `Role` enum (Task 1)
- Produces: `@RequirePermission(Permission.X)` decorator + `PermissionGuard`, used on the write-off endpoint here and by every future write endpoint across other plans

- [ ] **Step 1: Create `apps/backend/src/common/rbac/permission.enum.ts`**

```typescript
export enum Permission {
  RECEIVABLE_READ = 'RECEIVABLE_READ',
  RECEIVABLE_WRITE = 'RECEIVABLE_WRITE',
  RECEIVABLE_WRITE_OFF = 'RECEIVABLE_WRITE_OFF',
  RECEIVABLE_DISPUTE = 'RECEIVABLE_DISPUTE',
  PAYMENT_ALLOCATE = 'PAYMENT_ALLOCATE',
  PAYMENT_ALLOCATE_UNDO = 'PAYMENT_ALLOCATE_UNDO',
  REMINDER_POLICY_WRITE = 'REMINDER_POLICY_WRITE',
  REMINDER_SEND_MANUAL = 'REMINDER_SEND_MANUAL',
  BANK_CONNECTION_MANAGE = 'BANK_CONNECTION_MANAGE',
  SUBSCRIPTION_MANAGE = 'SUBSCRIPTION_MANAGE',
  USER_MANAGE = 'USER_MANAGE',
  INTERNAL_TASK_MANAGE = 'INTERNAL_TASK_MANAGE',
  REPORT_READ = 'REPORT_READ',
  AUDIT_LOG_READ = 'AUDIT_LOG_READ',
}
```

- [ ] **Step 2: Create `apps/backend/src/common/rbac/role-permissions.map.ts`**

```typescript
import { Role } from '../../modules/organizations/domain/membership';
import { Permission } from './permission.enum';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: Object.values(Permission),
  [Role.FINANCE_MANAGER]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_WRITE_OFF,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.PAYMENT_ALLOCATE_UNDO,
    Permission.SUBSCRIPTION_MANAGE,
    Permission.REMINDER_POLICY_WRITE,
    Permission.REMINDER_SEND_MANUAL,
    Permission.USER_MANAGE,
    Permission.INTERNAL_TASK_MANAGE,
    Permission.REPORT_READ,
    Permission.AUDIT_LOG_READ,
  ],
  [Role.ACCOUNTANT]: [
    Permission.RECEIVABLE_READ,
    Permission.RECEIVABLE_WRITE,
    Permission.RECEIVABLE_DISPUTE,
    Permission.PAYMENT_ALLOCATE,
    Permission.REMINDER_SEND_MANUAL,
    Permission.INTERNAL_TASK_MANAGE,
    Permission.REPORT_READ,
  ],
  [Role.SALES_REP]: [Permission.RECEIVABLE_READ, Permission.REPORT_READ],
  [Role.VIEWER]: [Permission.RECEIVABLE_READ, Permission.REPORT_READ, Permission.AUDIT_LOG_READ],
};
```

- [ ] **Step 3: Create `apps/backend/src/common/rbac/require-permission.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission.enum';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
```

- [ ] **Step 4: Write failing test for `PermissionGuard`**

Create `apps/backend/src/common/rbac/permission.guard.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { Permission } from './permission.enum';
import { Role } from '../../modules/organizations/domain/membership';

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => {},
    getClass: () => {},
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  it('allows access when the role has the required permission', () => {
    const reflector = { getAllAndOverride: () => Permission.RECEIVABLE_WRITE_OFF } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({ userId: 'u1', organizationId: 'org-1', role: Role.FINANCE_MANAGER });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the role lacks the required permission', () => {
    const reflector = { getAllAndOverride: () => Permission.RECEIVABLE_WRITE_OFF } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({ userId: 'u1', organizationId: 'org-1', role: Role.ACCOUNTANT });
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('allows access when no @RequirePermission metadata is set', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({ userId: 'u1', organizationId: 'org-1', role: Role.VIEWER });
    expect(guard.canActivate(context)).toBe(true);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test permission.guard.spec.ts`
Expected: FAIL — Cannot find module './permission.guard'

- [ ] **Step 6: Create `apps/backend/src/common/rbac/permission.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator';
import { ROLE_PERMISSIONS } from './role-permissions.map';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user || !ROLE_PERMISSIONS[user.role].includes(requiredPermission)) {
      throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
    }

    return true;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test permission.guard.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 8: Apply `@RequirePermission` to the write-off endpoint**

Modify `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`:

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async create(@Body() dto: CreateReceivableDto) {
    return this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId ?? null,
    });
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async writeOff(@Param('id') id: string) {
    return this.writeOffReceivableUseCase.execute(id);
  }
}
```

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/common/rbac apps/backend/src/modules/receivables/presentation/receivables.controller.ts
git commit -m "feat: add Permission enum, ROLE_PERMISSIONS map, and PermissionGuard"
```

---

### Task 9: Integration test — tenant isolation + permission enforcement

**Files:**
- Create: `apps/backend/test/tenant-isolation.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` with `JwtAuthGuard`, `PermissionGuard`, `BaseRepository`-backed repositories (Tasks 1-8)
- Produces: verified end-to-end proof that (a) org A cannot read org B's `Receivable` and (b) `ACCOUNTANT` role is rejected from `RECEIVABLE_WRITE_OFF`

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/tenant-isolation.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { ReceivableStatus } from '@casso-ledger/shared-types';

describe('Tenant isolation and RBAC (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const orgA = '00000000-0000-0000-0000-00000000000a';
  const orgB = '00000000-0000-0000-0000-00000000000b';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: '00000000-0000-0000-0000-0000000000c1',
      organizationId: orgA,
      name: 'Org A Customer',
      taxCode: '111',
      email: 'a@a.vn',
      phone: '0900000001',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });

    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: '00000000-0000-0000-0000-0000000000r1',
      organizationId: orgA,
      customerId: '00000000-0000-0000-0000-0000000000c1',
      invoiceId: null,
      originalAmount: 10_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-09-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: '00000000-0000-0000-0000-0000000000u1',
      createdAt: new Date(),
      closedAt: null,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  function tokenFor(organizationId: string, role: string): string {
    return jwtService.sign({ userId: 'user-1', organizationId, role });
  }

  it('org B cannot write-off a receivable that belongs to org A', async () => {
    const tokenOrgB = tokenFor(orgB, 'OWNER');

    await request(app.getHttpServer())
      .post('/api/v1/receivables/00000000-0000-0000-0000-0000000000r1/write-off')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .expect(500); // Receivable not found — thrown as a plain Error in this plan's use case
  });

  it('ACCOUNTANT role is rejected from RECEIVABLE_WRITE_OFF by PermissionGuard', async () => {
    const tokenAccountant = tokenFor(orgA, 'ACCOUNTANT');

    await request(app.getHttpServer())
      .post('/api/v1/receivables/00000000-0000-0000-0000-0000000000r1/write-off')
      .set('Authorization', `Bearer ${tokenAccountant}`)
      .expect(403);
  });

  it('FINANCE_MANAGER role in the correct org can write off the receivable', async () => {
    const tokenFinanceManager = tokenFor(orgA, 'FINANCE_MANAGER');

    await request(app.getHttpServer())
      .post('/api/v1/receivables/00000000-0000-0000-0000-0000000000r1/write-off')
      .set('Authorization', `Bearer ${tokenFinanceManager}`)
      .expect(201);

    const row = await dataSource.query('SELECT status FROM receivables WHERE id = $1', [
      '00000000-0000-0000-0000-0000000000r1',
    ]);
    expect(row[0].status).toBe('WRITTEN_OFF');
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- tenant-isolation.integration.spec.ts`
Expected: all 3 tests PASS (run in order: org B blocked → ACCOUNTANT blocked → FINANCE_MANAGER succeeds, since the 3rd test depends on the receivable still being OPEN after the first two failed attempts)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/tenant-isolation.integration.spec.ts
git commit -m "test: add integration test for tenant isolation and RBAC enforcement"
```

---

## Self-Review Notes

- **Spec coverage:** Shared-schema tenant isolation (spec section 1) → Task 5-7 (`BaseRepository`). Application-layer enforcement steps 1-3 (spec section 1) → Task 4 (`JwtAuthGuard` = step 1), Task 4 (`TenantContextInterceptor` = step 2), Task 5-7 (`BaseRepository` = step 3). RBAC static role → permission mapping (spec section 2) → Task 8. `SALES_REP` data-scope exception (spec section 2) is explicitly noted as Service-layer logic in Global Constraints — not implemented as a concrete endpoint in this plan since no `SALES_REP`-restricted read endpoint exists yet in Domain Core; the Read APIs Completion plan owns the `GET /receivables` list endpoint follow-up.
- **Not covered in this plan (by design):** JWT *issuance* (`/auth/login`, `/auth/signup`) — belongs to the Authentication & Onboarding plan, which must sign tokens with the same `JWT_SECRET` env var and `{ userId, organizationId, role }` payload shape this plan's `JwtStrategy` (Task 4) expects. Postgres Row-Level Security, custom per-org roles — explicitly out of scope per section 3 of the spec.
- **Type consistency checked:** `AuthenticatedUser` (Task 3) matches the `JwtStrategy.validate()` return type (Task 4) and the `user` shape read by `TenantContextInterceptor` (Task 4) and `PermissionGuard` (Task 8). `IReceivableRepository`/`IPaymentRepository`/`IInvoiceRepository`/`ICustomerRepository` all have `organizationId` removed consistently across port, implementation, and every caller (`CreateReceivableUseCase`, `AllocatePaymentUseCase`, both controllers, both DTOs) in Tasks 6-7.


