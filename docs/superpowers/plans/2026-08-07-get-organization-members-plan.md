# GET /organizations/:id/members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add endpoint to list organization members with pagination, user details, and strict tenant isolation.

**Architecture:** Follow existing customers module pattern: controller → usecase → repository port → TypeORM repository. Add ORGANIZATION_READ permission, join membership with users table for email/name.

**Tech Stack:** NestJS, TypeORM, class-validator, class-transformer

## Global Constraints

- Clean Architecture: domain/ MUST NOT import NestJS/TypeORM
- application/ MUST NOT throw HttpException — use AppError
- Every query/write MUST be scoped by organizationId via TenantContextService
- Use integers for money (not applicable here)
- Use `import type` for pure types, value import for classes used in DI
- Files: kebab-case, Classes: PascalCase, Variables: camelCase
- Global prefix: `/api/v1`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `common/rbac/permission.enum.ts` | Modify | Add `ORGANIZATION_READ` |
| `organizations/application/membership-repository.port.ts` | Modify | Add `findPageByOrganization`, `countByOrganization` |
| `organizations/infrastructure/typeorm-membership.repository.ts` | Modify | Implement with LEFT JOIN users |
| `organizations/presentation/dto/member-response.dto.ts` | Create | DTO + `toMemberResponse()` mapper |
| `organizations/presentation/list-members.usecase.ts` | Create | Orchestrate repo calls, tenant validation |
| `organizations/presentation/organizations.controller.ts` | Create | HTTP layer, guards, validation |
| `organizations/organizations.module.ts` | Modify | Wire controller, import UserOrmEntity |

---

### Task 1: Add ORGANIZATION_READ Permission

**Files:**
- Modify: `common/rbac/permission.enum.ts`

**Interfaces:**
- Produces: `Permission.ORGANIZATION_READ` enum value

- [ ] **Step 1: Add permission to enum**

```typescript
// common/rbac/permission.enum.ts
export enum Permission {
  // ... existing permissions
  ORGANIZATION_READ = 'ORGANIZATION_READ',
}
```

- [ ] **Step 2: Commit**

```bash
git add common/rbac/permission.enum.ts
git commit -m "feat: add ORGANIZATION_READ permission"
```

---

### Task 2: Add Repository Port Methods

**Files:**
- Modify: `organizations/application/membership-repository.port.ts`

**Interfaces:**
- Consumes: `Membership` domain type
- Produces: `findPageByOrganization(organizationId, page, limit)`, `countByOrganization(organizationId)`

- [ ] **Step 1: Add method signatures to interface**

```typescript
// organizations/application/membership-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { Membership } from '../domain/membership';

export interface IMembershipRepository {
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null>;
  findFirstActiveByUserId(userId: string): Promise<Membership | null>;
  findOwnerByOrganization(organizationId: string): Promise<Membership | null>;
  save(membership: Membership, manager?: EntityManager): Promise<void>;
  findPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<Membership[]>;
  countByOrganization(organizationId: string): Promise<number>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
```

- [ ] **Step 2: Commit**

```bash
git add organizations/application/membership-repository.port.ts
git commit -m "feat: add findPageByOrganization and countByOrganization to port"
```

---

### Task 3: Implement Repository Methods with User JOIN

**Files:**
- Modify: `organizations/infrastructure/typeorm-membership.repository.ts`

**Interfaces:**
- Consumes: `Membership` domain type, `MembershipOrmEntity`, `UserOrmEntity`
- Produces: `findPageByOrganization()`, `countByOrganization()` implementations

- [ ] **Step 1: Write failing test**

```typescript
// organizations/infrastructure/typeorm-membership.repository.spec.ts
import { TypeOrmMembershipRepository } from './typeorm-membership.repository';
import { MembershipOrmEntity } from './membership.orm-entity';
import { UserOrmEntity } from '../../users/infrastructure/user.orm-entity';

describe('TypeOrmMembershipRepository', () => {
  let repo: TypeOrmMembershipRepository;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      createQueryBuilder: jest.fn(),
    };
    repo = new TypeOrmMembershipRepository(mockRepo);
  });

  describe('findPageByOrganization', () => {
    it('should query memberships with user join', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await repo.findPageByOrganization('org-1', 1, 20);

      expect(mockRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'membership.user',
        'user',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'membership.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
    });
  });

  describe('countByOrganization', () => {
    it('should count memberships by organization', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repo.countByOrganization('org-1');

      expect(result).toBe(5);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'membership.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest typeorm-membership.repository.spec.ts`
Expected: FAIL — methods don't exist yet

- [ ] **Step 3: Implement repository methods**

```typescript
// organizations/infrastructure/typeorm-membership.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull, Not } from 'typeorm';
import type { IMembershipRepository } from '../application/membership-repository.port';
import { Membership, Role } from '../domain/membership';
import { MembershipOrmEntity } from './membership.orm-entity';
import { UserOrmEntity } from '../../users/infrastructure/user.orm-entity';

@Injectable()
export class TypeOrmMembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipOrmEntity)
    private readonly repo: Repository<MembershipOrmEntity>,
  ) {}

  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await this.repo.findOne({ where: { userId, organizationId } });
    return row ? new Membership(row) : null;
  }

  async findFirstActiveByUserId(userId: string): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { userId, joinedAt: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
    return row ? new Membership(row) : null;
  }

  async findOwnerByOrganization(
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await this.repo.findOne({
      where: { organizationId, role: Role.OWNER, joinedAt: Not(IsNull()) },
    });
    return row ? new Membership(row) : null;
  }

  async save(membership: Membership, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(MembershipOrmEntity)
      : this.repo
    ).save(membership);
  }

  async findPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<Membership[]> {
    const rows = await this.repo
      .createQueryBuilder('membership')
      .leftJoinAndSelect('membership.user', 'user')
      .where('membership.organizationId = :organizationId', { organizationId })
      .orderBy('membership.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return rows.map((row) => new Membership(row));
  }

  async countByOrganization(organizationId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('membership')
      .where('membership.organizationId = :organizationId', { organizationId })
      .getCount();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest typeorm-membership.repository.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add organizations/infrastructure/typeorm-membership.repository.ts organizations/infrastructure/typeorm-membership.repository.spec.ts
git commit -m "feat: implement findPageByOrganization with user JOIN"
```

---

### Task 4: Create MemberResponseDto

**Files:**
- Create: `organizations/presentation/dto/member-response.dto.ts`

**Interfaces:**
- Consumes: `Membership` domain type, `Role` enum
- Produces: `MemberResponseDto`, `toMemberResponse()` mapper

- [ ] **Step 1: Create DTO file**

```typescript
// organizations/presentation/dto/member-response.dto.ts
import type { Membership } from '../../domain/membership';

export interface MemberResponseDto {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: Date | null;
}

export function toMemberResponse(
  membership: Membership,
  user: { email: string; name: string },
): MemberResponseDto {
  return {
    id: membership.id,
    userId: membership.userId,
    email: user.email,
    name: user.name,
    role: membership.role,
    joinedAt: membership.joinedAt,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add organizations/presentation/dto/member-response.dto.ts
git commit -m "feat: add MemberResponseDto with toMemberResponse mapper"
```

---

### Task 5: Create ListMembersUseCase

**Files:**
- Create: `organizations/presentation/list-members.usecase.ts`

**Interfaces:**
- Consumes: `IMembershipRepository`, `TenantContextService`
- Produces: `ListMembersUseCase.execute(input)`

- [ ] **Step 1: Write failing test**

```typescript
// organizations/presentation/list-members.usecase.spec.ts
import { ListMembersUseCase } from './list-members.usecase';
import { MEMBERSHIP_REPOSITORY } from '../application/membership-repository.port';
import { Role } from '../domain/membership';

describe('ListMembersUseCase', () => {
  let useCase: ListMembersUseCase;
  let mockMembershipRepo: any;
  let mockTenantContext: any;

  beforeEach(() => {
    mockMembershipRepo = {
      findPageByOrganization: jest.fn(),
      countByOrganization: jest.fn(),
    };
    mockTenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    useCase = new ListMembersUseCase(mockMembershipRepo, mockTenantContext);
  });

  it('should return paginated members with user details', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        role: Role.OWNER,
        joinedAt: new Date(),
        organizationId: 'org-1',
      },
    ];
    mockMembershipRepo.findPageByOrganization.mockResolvedValue(mockMembers);
    mockMembershipRepo.countByOrganization.mockResolvedValue(1);

    // Mock user lookup (in real impl, this comes from the JOIN)
    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('should throw FORBIDDEN if organizationId mismatches tenant', async () => {
    await expect(
      useCase.execute({
        organizationId: 'org-2',
        page: 1,
        limit: 20,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest list-members.usecase.spec.ts`
Expected: FAIL — usecase doesn't exist

- [ ] **Step 3: Implement usecase**

```typescript
// organizations/presentation/list-members.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { AppError, ErrorCode } from '../../../common/errors/app-error';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../application/membership-repository.port';
import type { MemberResponseDto } from './dto/member-response.dto';
import { toMemberResponse } from './dto/member-response.dto';

export interface ListMembersInput {
  organizationId: string;
  page: number;
  limit: number;
}

export interface ListMembersOutput {
  items: MemberResponseDto[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListMembersInput): Promise<ListMembersOutput> {
    const currentOrgId = this.tenantContext.getOrganizationId();
    if (input.organizationId !== currentOrgId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Access denied to this organization');
    }

    const { organizationId, page, limit } = input;

    const [memberships, total] = await Promise.all([
      this.membershipRepo.findPageByOrganization(organizationId, page, limit),
      this.membershipRepo.countByOrganization(organizationId),
    ]);

    // Users are already joined in the repository query
    // The membership entity will have user data available
    const items = memberships.map((m) =>
      toMemberResponse(m, {
        email: (m as any).user?.email ?? '',
        name: (m as any).user?.name ?? '',
      }),
    );

    return { items, total, page, limit };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest list-members.usecase.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add organizations/presentation/list-members.usecase.ts organizations/presentation/list-members.usecase.spec.ts
git commit -m "feat: add ListMembersUseCase with tenant validation"
```

---

### Task 6: Create OrganizationsController

**Files:**
- Create: `organizations/presentation/organizations.controller.ts`

**Interfaces:**
- Consumes: `ListMembersUseCase`, `PaginationDto`
- Produces: `GET /:id/members` endpoint

- [ ] **Step 1: Create controller**

```typescript
// organizations/presentation/organizations.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListMembersUseCase } from './list-members.usecase';

@Controller('organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
  constructor(private readonly listMembers: ListMembersUseCase) {}

  @Get(':id/members')
  @RequirePermission(Permission.ORGANIZATION_READ)
  async listMembers(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.listMembers.execute({
      organizationId: id,
      page: pagination.page,
      limit: pagination.limit,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add organizations/presentation/organizations.controller.ts
git commit -m "feat: add OrganizationsController with listMembers endpoint"
```

---

### Task 7: Update OrganizationsModule

**Files:**
- Modify: `organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `OrganizationsController`, `ListMembersUseCase`, `UserOrmEntity`
- Produces: Wired module with controller

- [ ] **Step 1: Update module**

```typescript
// organizations/organizations.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MEMBERSHIP_REPOSITORY } from './application/membership-repository.port';
import { ORGANIZATION_REPOSITORY } from './application/organization-repository.port';
import { MembershipOrmEntity } from './infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from './infrastructure/organization.orm-entity';
import { TypeOrmMembershipRepository } from './infrastructure/typeorm-membership.repository';
import { TypeOrmOrganizationRepository } from './infrastructure/typeorm-organization.repository';
import { OrganizationsController } from './presentation/organizations.controller';
import { ListMembersUseCase } from './presentation/list-members.usecase';
import { UserOrmEntity } from '../users/infrastructure/user.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipOrmEntity,
      OrganizationOrmEntity,
      UserOrmEntity,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [
    { provide: MEMBERSHIP_REPOSITORY, useClass: TypeOrmMembershipRepository },
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: TypeOrmOrganizationRepository,
    },
    ListMembersUseCase,
  ],
  exports: [MEMBERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY],
})
export class OrganizationsModule {}
```

- [ ] **Step 2: Commit**

```bash
git add organizations/organizations.module.ts
git commit -m "feat: wire OrganizationsController and ListMembersUseCase"
```

---

### Task 8: Integration Test

**Files:**
- Create: `organizations/presentation/organizations.controller.e2e-spec.ts`

**Interfaces:**
- Consumes: Full module with testcontainers

- [ ] **Step 1: Write integration test**

```typescript
// organizations/presentation/organizations.controller.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations.module';
import { MembershipOrmEntity } from '../infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../../users/infrastructure/user.orm-entity';

describe('OrganizationsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'casso',
          password: 'casso',
          database: 'casso_ledger_test',
          entities: [MembershipOrmEntity, OrganizationOrmEntity, UserOrmEntity],
          synchronize: true,
        }),
        OrganizationsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/organizations/:id/members (GET)', () => {
    return request(app.getHttpServer())
      .get('/organizations/org-1/members')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page');
        expect(res.body).toHaveProperty('limit');
      });
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx jest organizations.controller.e2e-spec.ts`
Expected: PASS (with testcontainers running)

- [ ] **Step 3: Commit**

```bash
git add organizations/presentation/organizations.controller.e2e-spec.ts
git commit -m "test: add integration test for GET /organizations/:id/members"
```

---

### Task 9: Type Check and Lint

**Files:**
- None (verification only)

- [ ] **Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `npx jest`
Expected: All tests pass

---

### Task 10: Final Commit

- [ ] **Step 1: Stage all changes**

```bash
git add -A
```

- [ ] **Step 2: Commit with descriptive message**

```bash
git commit -m "feat: implement GET /organizations/:id/members endpoint

- Add ORGANIZATION_READ permission
- Add findPageByOrganization and countByOrganization to repository port
- Implement repository with LEFT JOIN users for email/name
- Create MemberResponseDto with toMemberResponse mapper
- Create ListMembersUseCase with tenant isolation validation
- Create OrganizationsController with pagination support
- Wire module with UserOrmEntity import
- Add integration test"
```

---

## Self-Review Checklist

- [x] Spec coverage: All requirements implemented (permission, tenant isolation, pagination, user details)
- [x] Placeholder scan: No TBD/TODO in tasks
- [x] Type consistency: Method signatures match across tasks
- [x] Task granularity: Each task is independently testable
- [x] Code examples: All steps have actual code
