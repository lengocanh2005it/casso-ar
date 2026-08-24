# Defer Signup Provisioning Until Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `SignupUseCase` from creating permanent `Organization`/`User`/`Membership`/`Subscription`/bootstrap data before email verification — hold signup input in a new `PendingSignup` row instead, and provision the real records only when the applicant verifies their OTP.

**Architecture:** New `PendingSignup` domain entity + repository (own migration, `pending_signups` table). `SignupUseCase` writes only a `PendingSignup` row and emails the OTP. A new `ProvisionOrganizationUseCase` holds the exact entity-creation transaction `SignupUseCase` used to run, callable either standalone (the seed script) or inside a caller's transaction (via an optional `EntityManager`). `VerifyEmailUseCase` gets a second branch: on a valid `PendingSignup` + OTP match, it calls `ProvisionOrganizationUseCase` inside its own transaction, then deletes the `PendingSignup` row, then logs in — exactly like today's post-verification behavior. The pre-#336 branch (an already-existing, still-unverified `User`) is untouched, so accounts mid-verification when this ships keep working. `ResendVerificationEmailUseCase` gets the same two-branch shape.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL (raw-SQL migration), Jest unit tests, one Postgres-backed e2e test (`test/auth-flow.e2e-spec.ts`, testcontainers).

## Global Constraints

- Money/tenant rules do not apply here (auth is pre-org, pre-tenant) — but every multi-row write (provisioning) MUST still run inside one DB transaction (AGENTS.md).
- No `any`, no `as`/`as unknown as` casts in production code — domain ↔ ORM translation is an explicit `toDomain()`/`toOrm()` pair in the repository (AGENTS.md, `.claude/rules/typescript.md`).
- Application layer MUST NOT throw anything but `AppError`; MUST NOT import infra/SDK code (`.claude/rules/application.md`).
- Queries by secret token/hash/lookup-key (this includes `PendingSignup`, looked up by `email`/`taxCode` before any tenant exists) do not need `organizationId` scoping and do not extend `BaseRepository` — this is the same documented exception `EmailVerificationToken`/`RefreshToken` already use (`.claude/rules/infrastructure.md`).
- Every new behavior, bug fix, and refactor follows RED → GREEN → REFACTOR — write the failing test, watch it fail, then write the minimal implementation (AGENTS.md). Migrations are the one exception (state the exception, no preceding failing test needed for the SQL itself, but the migration still gets a `.spec.ts` asserting the emitted SQL, matching the existing `ownership_transfer_requests` migration's test).
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas (CLAUDE.local.md).
- Run `domain-check` after any backend code change and `pnpm verify` before claiming completion (AGENTS.md).

---

## Task 1: `PendingSignup` domain entity

**Files:**
- Create: `apps/backend/src/modules/auth/domain/pending-signup.ts`
- Test: `apps/backend/src/modules/auth/domain/pending-signup.spec.ts`

**Interfaces:**
- Produces: `PendingSignup` class with props `{ id, email, passwordHash, name, organizationName, taxCode, taxCodeMatched, taxCodeLookupName, otpHash, expiresAt, createdAt }` and `isExpired(now: Date): boolean`. Every later task that touches `PendingSignup` imports this exact shape.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/domain/pending-signup.spec.ts
import { PendingSignup } from './pending-signup';

function buildPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'otp-hash',
    expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    ...overrides,
  });
}

describe('PendingSignup', () => {
  it('is not expired before its expiresAt instant', () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    });
    expect(
      pendingSignup.isExpired(new Date('2026-08-24T00:09:59.000Z')),
    ).toBe(false);
  });

  it('is expired at or after its expiresAt instant', () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    });
    expect(
      pendingSignup.isExpired(new Date('2026-08-24T00:10:00.000Z')),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/domain/pending-signup.spec.ts`
Expected: FAIL — `Cannot find module './pending-signup'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/domain/pending-signup.ts
export interface PendingSignupProps {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  organizationName: string;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
  otpHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class PendingSignup {
  declare readonly id: string;
  declare readonly email: string;
  declare readonly passwordHash: string;
  declare readonly name: string;
  declare readonly organizationName: string;
  declare readonly taxCode: string;
  declare readonly taxCodeMatched: boolean;
  declare readonly taxCodeLookupName: string | null;
  declare readonly otpHash: string;
  declare readonly expiresAt: Date;
  declare readonly createdAt: Date;

  constructor(props: PendingSignupProps) {
    Object.assign(this, props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/domain/pending-signup.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/domain/pending-signup.ts apps/backend/src/modules/auth/domain/pending-signup.spec.ts
git commit -m "feat: add PendingSignup domain entity"
```

---

## Task 2: `PendingSignup` repository port, ORM entity, and TypeORM repository

**Files:**
- Create: `apps/backend/src/modules/auth/application/pending-signup-repository.port.ts`
- Create: `apps/backend/src/modules/auth/infrastructure/pending-signup.orm-entity.ts`
- Create: `apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.spec.ts`

**Interfaces:**
- Consumes: `PendingSignup` from Task 1.
- Produces: `IPendingSignupRepository` (`findByEmail`, `findByTaxCode`, `save`, `delete`, each taking an optional `manager: EntityManager` — passing `manager` locks the row with `pessimistic_write`), `PENDING_SIGNUP_REPOSITORY` DI token, `TypeOrmPendingSignupRepository`. Tasks 5–7 (`SignupUseCase`, `VerifyEmailUseCase`, `ResendVerificationEmailUseCase`) depend on this exact interface.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.spec.ts
import { DataSource } from 'typeorm';
import { PendingSignup } from '../domain/pending-signup';
import { TypeOrmPendingSignupRepository } from './typeorm-pending-signup.repository';

function buildPendingSignup() {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'otp-hash',
    expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
  });
}

describe('TypeOrmPendingSignupRepository', () => {
  it('saves a pending signup via the ORM repository', async () => {
    const save = jest.fn();
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ save }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.save(buildPendingSignup());

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending-1', email: 'an@acme.vn' }),
    );
  });

  it('findByEmail without a manager does a plain lookup', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    const result = await repo.findByEmail('an@acme.vn');

    expect(findOne).toHaveBeenCalledWith({ where: { email: 'an@acme.vn' } });
    expect(result).toBeNull();
  });

  it('findByEmail with a manager locks the row for update', async () => {
    const getOne = jest.fn().mockResolvedValue(null);
    const where = jest.fn().mockReturnValue({ getOne });
    const setLock = jest.fn().mockReturnValue({ where });
    const createQueryBuilder = jest.fn().mockReturnValue({ setLock });
    const manager = {
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder }),
    } as never;
    const dataSource = {} as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.findByEmail('an@acme.vn', manager);

    expect(setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(where).toHaveBeenCalledWith('pendingSignup.email = :email', {
      email: 'an@acme.vn',
    });
  });

  it('delete removes the row by id', async () => {
    const del = jest.fn();
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: del }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.delete('pending-1');

    expect(del).toHaveBeenCalledWith('pending-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/infrastructure/typeorm-pending-signup.repository.spec.ts`
Expected: FAIL — `Cannot find module './typeorm-pending-signup.repository'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/pending-signup-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { PendingSignup } from '../domain/pending-signup';

export interface IPendingSignupRepository {
  findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null>;
  findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null>;
  save(pendingSignup: PendingSignup, manager?: EntityManager): Promise<void>;
  delete(id: string, manager?: EntityManager): Promise<void>;
}

export const PENDING_SIGNUP_REPOSITORY = Symbol('PENDING_SIGNUP_REPOSITORY');
```

```typescript
// apps/backend/src/modules/auth/infrastructure/pending-signup.orm-entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pending_signups' })
export class PendingSignupOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  organizationName: string;

  @Column({ type: 'varchar' })
  taxCode: string;

  @Column({ type: 'boolean' })
  taxCodeMatched: boolean;

  @Column({ type: 'varchar', nullable: true })
  taxCodeLookupName: string | null;

  @Column({ type: 'varchar' })
  otpHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

```typescript
// apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.ts
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import type { IPendingSignupRepository } from '../application/pending-signup-repository.port';
import { PendingSignup } from '../domain/pending-signup';
import { PendingSignupOrmEntity } from './pending-signup.orm-entity';

function toDomain(row: PendingSignupOrmEntity): PendingSignup {
  return new PendingSignup({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    organizationName: row.organizationName,
    taxCode: row.taxCode,
    taxCodeMatched: row.taxCodeMatched,
    taxCodeLookupName: row.taxCodeLookupName,
    otpHash: row.otpHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  });
}

function toOrm(pendingSignup: PendingSignup): PendingSignupOrmEntity {
  const row = new PendingSignupOrmEntity();
  row.id = pendingSignup.id;
  row.email = pendingSignup.email;
  row.passwordHash = pendingSignup.passwordHash;
  row.name = pendingSignup.name;
  row.organizationName = pendingSignup.organizationName;
  row.taxCode = pendingSignup.taxCode;
  row.taxCodeMatched = pendingSignup.taxCodeMatched;
  row.taxCodeLookupName = pendingSignup.taxCodeLookupName;
  row.otpHash = pendingSignup.otpHash;
  row.expiresAt = pendingSignup.expiresAt;
  row.createdAt = pendingSignup.createdAt;
  return row;
}

@Injectable()
export class TypeOrmPendingSignupRepository implements IPendingSignupRepository {
  constructor(private readonly dataSource: DataSource) {}

  async save(
    pendingSignup: PendingSignup,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity)
    ).save(toOrm(pendingSignup));
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null> {
    const repository = manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('pendingSignup')
          .setLock('pessimistic_write')
          .where('pendingSignup.email = :email', { email })
          .getOne()
      : await repository.findOne({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<PendingSignup | null> {
    const repository = manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity);
    const row = manager
      ? await repository
          .createQueryBuilder('pendingSignup')
          .setLock('pessimistic_write')
          .where('pendingSignup.taxCode = :taxCode', { taxCode })
          .getOne()
      : await repository.findOne({ where: { taxCode } });
    return row ? toDomain(row) : null;
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(PendingSignupOrmEntity)
      : this.dataSource.getRepository(PendingSignupOrmEntity)
    ).delete(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/infrastructure/typeorm-pending-signup.repository.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/pending-signup-repository.port.ts apps/backend/src/modules/auth/infrastructure/pending-signup.orm-entity.ts apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.ts apps/backend/src/modules/auth/infrastructure/typeorm-pending-signup.repository.spec.ts
git commit -m "feat: add PendingSignup repository port and TypeORM implementation"
```

---

## Task 3: `pending_signups` table migration

**Files:**
- Create: `apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.ts`
- Test: `apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.spec.ts`

**Interfaces:**
- Produces: the `pending_signups` table with unique indexes on `email` and `taxCode`, matching the `PendingSignupOrmEntity` columns from Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddPendingSignupsTable20260905000000 } from './20260905000000-add-pending-signups-table';

describe('AddPendingSignupsTable20260905000000', () => {
  it('creates the table and the email/tax-code unique indexes', async () => {
    const migration = new AddPendingSignupsTable20260905000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "pending_signups"');
    expect(sql).toContain('"email" character varying NOT NULL');
    expect(sql).toContain('"passwordHash" character varying NOT NULL');
    expect(sql).toContain('"taxCode" character varying NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_email" ON "pending_signups" ("email")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_tax_code" ON "pending_signups" ("taxCode")',
    );
  });

  it('reverts by dropping the indexes and table', async () => {
    const migration = new AddPendingSignupsTable20260905000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_pending_signups_email"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_pending_signups_tax_code"',
    );
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "pending_signups"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns database/migrations/20260905000000-add-pending-signups-table.spec.ts`
Expected: FAIL — `Cannot find module './20260905000000-add-pending-signups-table'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingSignupsTable20260905000000 implements MigrationInterface {
  name = 'AddPendingSignupsTable20260905000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_signups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "name" character varying NOT NULL,
        "organizationName" character varying NOT NULL,
        "taxCode" character varying NOT NULL,
        "taxCodeMatched" boolean NOT NULL,
        "taxCodeLookupName" character varying,
        "otpHash" character varying NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_pending_signups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_email" ON "pending_signups" ("email")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_tax_code" ON "pending_signups" ("taxCode")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_pending_signups_email"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_pending_signups_tax_code"');
    await queryRunner.query('DROP TABLE IF EXISTS "pending_signups"');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns database/migrations/20260905000000-add-pending-signups-table.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.ts apps/backend/src/database/migrations/20260905000000-add-pending-signups-table.spec.ts
git commit -m "feat: add pending_signups table migration"
```

---

## Task 4: Extract `ProvisionOrganizationUseCase`

**Files:**
- Create: `apps/backend/src/modules/auth/application/provision-organization.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/provision-organization.usecase.spec.ts`

**Interfaces:**
- Consumes: `IUserRepository`, `IOrganizationRepository`, `IMembershipRepository`, `ISubscriptionRepository`, `IOrganizationBootstrap` (all pre-existing ports, see `signup.usecase.ts` for the exact tokens/imports).
- Produces: `ProvisionOrganizationUseCase.execute(input: ProvisionOrganizationInput, manager?: EntityManager): Promise<ProvisionOrganizationResult>` where `ProvisionOrganizationInput = { name, email, passwordHash, organizationName, taxCode, taxCodeMatched, taxCodeLookupName }` and `ProvisionOrganizationResult = { user: User, organization: Organization, membership: Membership }`. Runs inside `manager` when supplied, otherwise opens its own `dataSource.transaction`. Task 6 (`VerifyEmailUseCase`) and Task 10 (`seed.ts`) both call this.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/application/provision-organization.usecase.spec.ts
import { ProvisionOrganizationUseCase } from './provision-organization.usecase';

function buildDeps() {
  return {
    userRepo: { save: jest.fn() },
    organizationRepo: { save: jest.fn() },
    membershipRepo: { save: jest.fn() },
    subscriptionRepo: { save: jest.fn() },
    organizationBootstrap: { seed: jest.fn() },
  };
}

describe('ProvisionOrganizationUseCase', () => {
  it('creates the organization, user, membership, subscription, and bootstrap inside its own transaction', async () => {
    const deps = buildDeps();
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new ProvisionOrganizationUseCase(
      deps.userRepo as any,
      deps.organizationRepo as any,
      deps.membershipRepo as any,
      deps.subscriptionRepo as any,
      deps.organizationBootstrap as any,
      dataSource as any,
    );

    const result = await useCase.execute({
      name: 'An',
      email: 'an@acme.vn',
      passwordHash: 'hashed',
      organizationName: 'Acme Co',
      taxCode: '0101234567',
      taxCodeMatched: true,
      taxCodeLookupName: 'Acme Co',
    });

    expect(result.organization.name).toBe('Acme Co');
    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(result.organization.taxCodeMatched).toBe(true);
    expect(result.user.email).toBe('an@acme.vn');
    expect(result.user.passwordHash).toBe('hashed');
    expect(result.membership.role).toBe('OWNER');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(deps.organizationRepo.save).toHaveBeenCalled();
    expect(deps.userRepo.save).toHaveBeenCalled();
    expect(deps.membershipRepo.save).toHaveBeenCalled();
    expect(deps.subscriptionRepo.save).toHaveBeenCalled();
    expect(deps.organizationBootstrap.seed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
    );
  });

  it('runs inside a caller-supplied manager instead of opening its own transaction', async () => {
    const deps = buildDeps();
    const dataSource = { transaction: jest.fn() };
    const useCase = new ProvisionOrganizationUseCase(
      deps.userRepo as any,
      deps.organizationRepo as any,
      deps.membershipRepo as any,
      deps.subscriptionRepo as any,
      deps.organizationBootstrap as any,
      dataSource as any,
    );
    const externalManager = {} as any;

    await useCase.execute(
      {
        name: 'An',
        email: 'an@acme.vn',
        passwordHash: 'hashed',
        organizationName: 'Acme Co',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Acme Co',
      },
      externalManager,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(deps.organizationRepo.save).toHaveBeenCalledWith(
      expect.anything(),
      externalManager,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/application/provision-organization.usecase.spec.ts`
Expected: FAIL — `Cannot find module './provision-organization.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/application/provision-organization.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { User } from '../../users/domain/user';
import {
  DEFAULT_ORGANIZATION_BOOTSTRAP,
  type IOrganizationBootstrap,
} from './organization-bootstrap.port';

export interface ProvisionOrganizationInput {
  name: string;
  email: string;
  passwordHash: string;
  organizationName: string;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
}

export interface ProvisionOrganizationResult {
  user: User;
  organization: Organization;
  membership: Membership;
}

@Injectable()
export class ProvisionOrganizationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(DEFAULT_ORGANIZATION_BOOTSTRAP)
    private readonly organizationBootstrap: IOrganizationBootstrap,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: ProvisionOrganizationInput,
    manager?: EntityManager,
  ): Promise<ProvisionOrganizationResult> {
    const now = new Date();
    const user = new User({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      emailVerifiedAt: null,
      createdAt: now,
    });
    const organization = new Organization({
      id: randomUUID(),
      name: input.organizationName,
      status: 'PENDING_REVIEW',
      taxCode: input.taxCode,
      taxCodeMatched: input.taxCodeMatched,
      taxCodeLookupName: input.taxCodeLookupName,
      createdAt: now,
    });
    const membership = new Membership({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: Role.OWNER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    const run = async (activeManager: EntityManager) => {
      await this.organizationRepo.save(organization, activeManager);
      await this.userRepo.save(user, activeManager);
      await this.membershipRepo.save(membership, activeManager);
      await this.subscriptionRepo.save(
        Subscription.createFree(randomUUID(), organization.id, now),
        activeManager,
        organization.id,
      );
      await this.organizationBootstrap.seed(organization.id, activeManager);
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }

    return { user, organization, membership };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/application/provision-organization.usecase.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/provision-organization.usecase.ts apps/backend/src/modules/auth/application/provision-organization.usecase.spec.ts
git commit -m "feat: extract ProvisionOrganizationUseCase from SignupUseCase"
```

---

## Task 5: Wire the new pieces into `auth.module.ts`

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `PendingSignupOrmEntity` (Task 2), `PENDING_SIGNUP_REPOSITORY`/`TypeOrmPendingSignupRepository` (Task 2), `ProvisionOrganizationUseCase` (Task 4).
- Produces: DI resolution for `PENDING_SIGNUP_REPOSITORY` and `ProvisionOrganizationUseCase`, so Tasks 6–8 can inject them once their constructors change.

This is a configuration-only change (module wiring) — no preceding failing unit test; verified by a type-check + full app boot in Step 2, per the TDD exception for configuration-only changes (AGENTS.md).

- [ ] **Step 1: Add the new entity, DI token, and use case to the module**

In `apps/backend/src/modules/auth/auth.module.ts`:

Add these imports alongside the existing ones (keep alphabetical placement consistent with the surrounding imports):

```typescript
import { PENDING_SIGNUP_REPOSITORY } from './application/pending-signup-repository.port';
import { ProvisionOrganizationUseCase } from './application/provision-organization.usecase';
import { PendingSignupOrmEntity } from './infrastructure/pending-signup.orm-entity';
import { TypeOrmPendingSignupRepository } from './infrastructure/typeorm-pending-signup.repository';
```

In the `TypeOrmModule.forFeature([...])` array, add `PendingSignupOrmEntity`:

```typescript
    TypeOrmModule.forFeature([
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      MembershipInviteOrmEntity,
      RefreshTokenOrmEntity,
      PendingSignupOrmEntity,
    ]),
```

In `providers`, add `ProvisionOrganizationUseCase` next to `SignupUseCase`:

```typescript
    LoginUseCase,
    SignupUseCase,
    ProvisionOrganizationUseCase,
    VerifyEmailUseCase,
```

and add the DI token binding next to the other repository bindings:

```typescript
    {
      provide: PENDING_SIGNUP_REPOSITORY,
      useClass: TypeOrmPendingSignupRepository,
    },
```

- [ ] **Step 2: Verify the module still type-checks and boots**

Run: `npx tsc --noEmit`
Expected: no errors (this catches an import typo or misplaced binding immediately).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/auth/auth.module.ts
git commit -m "chore: wire PendingSignup repository and ProvisionOrganizationUseCase into AuthModule"
```

---

## Task 6: Rewrite `SignupUseCase` to write only a `PendingSignup`

**Files:**
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Modify (full rewrite): `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPendingSignupRepository` (Task 2), `PendingSignup` (Task 1). Drops its dependency on `IMembershipRepository`, `ISubscriptionRepository`, `IOrganizationBootstrap`, `IEmailVerificationTokenRepository` (moved to `ProvisionOrganizationUseCase`/no longer needed).
- Produces: `SignupUseCase.execute(input: SignupInput): Promise<{ email: string }>` (return type changes from `SignupResult` — Task 9 updates the one caller in the controller, Task 10 updates the seed script's caller of the *old* shape since it now calls `ProvisionOrganizationUseCase` directly instead of `SignupUseCase`).

- [ ] **Step 1: Write the failing tests (full rewrite of the spec file)**

```typescript
// apps/backend/src/modules/auth/application/signup.usecase.spec.ts
import { PendingSignup } from '../domain/pending-signup';
import { SignupUseCase } from './signup.usecase';

function buildTaxCodeMatchMocks(matchedName: string | null) {
  return {
    taxCodeLookup: {
      lookup: jest
        .fn()
        .mockResolvedValue(matchedName === null ? null : { name: matchedName }),
    },
  };
}

function buildCommonMocks() {
  return {
    userRepo: { findByEmail: jest.fn().mockResolvedValue(null) },
    organizationRepo: { findByTaxCode: jest.fn().mockResolvedValue(null) },
    pendingSignupRepo: {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByTaxCode: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn(),
    },
    emailSender: { sendVerificationEmail: jest.fn() },
    dataSource: {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    },
  };
}

function buildUseCase(
  common: ReturnType<typeof buildCommonMocks>,
  taxCodeLookup: unknown,
) {
  return new SignupUseCase(
    common.userRepo as any,
    common.organizationRepo as any,
    common.pendingSignupRepo as any,
    common.emailSender as any,
    taxCodeLookup as any,
    common.dataSource as any,
  );
}

function buildExistingPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'h',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('SignupUseCase', () => {
  it('creates a PendingSignup and emails the OTP, without creating a User or Organization', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Company B');
    const useCase = buildUseCase(common, taxCodeLookup);

    const result = await useCase.execute({
      organizationName: 'Company B',
      name: 'An',
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result).toEqual({ email: 'ap@congtyb.vn' });
    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ap@congtyb.vn',
        name: 'An',
        organizationName: 'Company B',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Company B',
      }),
      expect.anything(),
    );
    expect(common.emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('stores taxCodeMatched=false when the name does not match the lookup', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks('A Totally Different Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ taxCodeMatched: false }),
      expect.anything(),
    );
  });

  it('stores taxCodeMatched=false and a null lookup name when the lookup fails', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        taxCodeMatched: false,
        taxCodeLookupName: null,
      }),
      expect.anything(),
    );
  });

  it('throws if the email is already registered', async () => {
    const common = buildCommonMocks();
    common.userRepo.findByEmail.mockResolvedValue({ id: 'existing' });
    const { taxCodeLookup } = buildTaxCodeMatchMocks(null);
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'X',
        name: 'X',
        email: 'dup@x.vn',
        password: 'password',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(common.pendingSignupRepo.save).not.toHaveBeenCalled();
  });

  it('throws if another organization already holds this tax code', async () => {
    const common = buildCommonMocks();
    common.organizationRepo.findByTaxCode.mockResolvedValue({ id: 'other-org' });
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
    });
  });

  it('throws CONFLICT when a non-expired PendingSignup already exists for the email', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByEmail.mockResolvedValue(
      buildExistingPendingSignup(),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(common.pendingSignupRepo.delete).not.toHaveBeenCalled();
    expect(common.pendingSignupRepo.save).not.toHaveBeenCalled();
  });

  it('reclaims (deletes) an expired PendingSignup by email and allows signup to proceed', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByEmail.mockResolvedValue(
      buildExistingPendingSignup({
        id: 'pending-expired',
        expiresAt: new Date(Date.now() - 60_000),
      }),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(common.pendingSignupRepo.delete).toHaveBeenCalledWith(
      'pending-expired',
      expect.anything(),
    );
    expect(common.pendingSignupRepo.save).toHaveBeenCalled();
  });

  it('throws CONFLICT with DUPLICATE_TAX_CODE when a non-expired PendingSignup already exists for the tax code', async () => {
    const common = buildCommonMocks();
    common.pendingSignupRepo.findByTaxCode.mockResolvedValue(
      buildExistingPendingSignup({ id: 'pending-2', email: 'other@acme.vn' }),
    );
    const { taxCodeLookup } = buildTaxCodeMatchMocks('Acme Co');
    const useCase = buildUseCase(common, taxCodeLookup);

    await expect(
      useCase.execute({
        organizationName: 'Acme Co',
        name: 'An',
        email: 'an@acme.vn',
        password: 'S3curePass!',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/application/signup.usecase.spec.ts`
Expected: FAIL — the current implementation's constructor takes different arguments (`membershipRepo`/`verificationTokenRepo`/`subscriptionRepo`/`organizationBootstrap` instead of `pendingSignupRepo`), so mocks return `undefined` where `PendingSignup`-shaped objects are expected, and `pendingSignupRepo.save` is never called.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `apps/backend/src/modules/auth/application/signup.usecase.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  DUPLICATE_TAX_CODE,
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { matchesTaxCodeName } from '../../organizations/domain/normalize-company-name';
import {
  type ITaxCodeLookupAdapter,
  TAX_CODE_LOOKUP_ADAPTER,
} from '../../tax-verification/application/tax-code-lookup.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { PendingSignup } from '../domain/pending-signup';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import { hashPassword } from './password-hasher';
import {
  PENDING_SIGNUP_REPOSITORY,
  type IPendingSignupRepository,
} from './pending-signup-repository.port';
import { generateOtp } from './token-hasher';

export interface SignupInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  taxCode: string;
}

export interface SignupResult {
  email: string;
}

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    const organizationName = input.organizationName.trim();

    if (await this.userRepo.findByEmail(email)) {
      throw new AppError(ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }
    if (await this.organizationRepo.findByTaxCode(input.taxCode)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã số thuế này đã được đăng ký.',
        { rowErrorCode: DUPLICATE_TAX_CODE },
      );
    }

    const lookupResult = await this.taxCodeLookup.lookup(input.taxCode);
    const taxCodeMatched =
      lookupResult !== null &&
      matchesTaxCodeName(organizationName, lookupResult.name);
    const passwordHash = await hashPassword(input.password);
    const { otp, hash: otpHash } = generateOtp();
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const existingByEmail = await this.pendingSignupRepo.findByEmail(
        email,
        manager,
      );
      if (existingByEmail) {
        if (!existingByEmail.isExpired(now)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Email này đang có một yêu cầu đăng ký chờ xác thực.',
          );
        }
        await this.pendingSignupRepo.delete(existingByEmail.id, manager);
      }

      const existingByTaxCode = await this.pendingSignupRepo.findByTaxCode(
        input.taxCode,
        manager,
      );
      if (existingByTaxCode) {
        if (!existingByTaxCode.isExpired(now)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            'Mã số thuế này đang có một yêu cầu đăng ký chờ xác thực.',
            { rowErrorCode: DUPLICATE_TAX_CODE },
          );
        }
        await this.pendingSignupRepo.delete(existingByTaxCode.id, manager);
      }

      await this.pendingSignupRepo.save(
        new PendingSignup({
          id: randomUUID(),
          email,
          passwordHash,
          name: input.name.trim(),
          organizationName,
          taxCode: input.taxCode,
          taxCodeMatched,
          taxCodeLookupName: lookupResult?.name ?? null,
          otpHash,
          expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
          createdAt: now,
        }),
        manager,
      );
    });

    await this.emailSender.sendVerificationEmail(email, otp);

    return { email };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/application/signup.usecase.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/signup.usecase.ts apps/backend/src/modules/auth/application/signup.usecase.spec.ts
git commit -m "feat: SignupUseCase writes only a PendingSignup, defers provisioning to verification"
```

---

## Task 7: Extend `VerifyEmailUseCase` with the `PendingSignup` branch

**Files:**
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.ts`
- Modify (full rewrite): `apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPendingSignupRepository` (Task 2), `ProvisionOrganizationUseCase` (Task 4).
- Produces: `VerifyEmailUseCase.execute(email, otp): Promise<LoginResult>` — same public signature as before; constructor gains two new parameters (`pendingSignupRepo`, `provisionOrganizationUseCase`) inserted between `userRepo` and `dataSource`.

- [ ] **Step 1: Write the failing tests (full rewrite of the spec file)**

```typescript
// apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts
import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { PendingSignup } from '../domain/pending-signup';
import { hashOtp } from './token-hasher';
import { VerifyEmailUseCase } from './verify-email.usecase';

function buildPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'a@b.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: hashOtp('482913'),
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('VerifyEmailUseCase — legacy User branch', () => {
  it('marks the user verified and deletes the token in one transaction', async () => {
    const otp = '482913';
    const token = new EmailVerificationToken({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashOtp(otp),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'a@b.vn',
      passwordHash: 'h',
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    const tokenRepo = {
      findByUserIdAndTokenHash: jest.fn().mockResolvedValue(token),
      deleteById: jest.fn(),
    };
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(user),
      save: jest.fn(),
    };
    const pendingSignupRepo = { findByEmail: jest.fn(), delete: jest.fn() };
    const provisionOrganizationUseCase = { execute: jest.fn() };
    const loginUseCase = {
      executeForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };

    const useCase = new VerifyEmailUseCase(
      tokenRepo as any,
      userRepo as any,
      pendingSignupRepo as any,
      provisionOrganizationUseCase as any,
      dataSource as any,
      loginUseCase as any,
    );
    await expect(useCase.execute('a@b.vn', otp)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(tokenRepo.deleteById).toHaveBeenCalledWith('tok-1', expect.anything());
    expect(loginUseCase.executeForUser).toHaveBeenCalledWith('user-1');
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailUseCase — PendingSignup branch', () => {
  it('provisions the organization from a PendingSignup and deletes it when there is no legacy match', async () => {
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
    const loginUseCase = {
      executeForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      provisionOrganizationUseCase as any,
      dataSource as any,
      loginUseCase as any,
    );

    await expect(useCase.execute('a@b.vn', otp)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(provisionOrganizationUseCase.execute).toHaveBeenCalledWith(
      {
        name: 'An',
        email: 'a@b.vn',
        passwordHash: 'hashed',
        organizationName: 'Acme Co',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Acme Co',
      },
      expect.anything(),
    );
    expect(pendingSignupRepo.delete).toHaveBeenCalledWith(
      'pending-1',
      expect.anything(),
    );
    expect(loginUseCase.executeForUser).toHaveBeenCalledWith('user-1');
  });

  it('throws the generic error for a wrong PendingSignup OTP', async () => {
    const pendingSignup = buildPendingSignup({ otpHash: hashOtp('111111') });
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', '999999')).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
    expect(pendingSignupRepo.delete).not.toHaveBeenCalled();
  });

  it('throws the generic error for an expired PendingSignup', async () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date(Date.now() - 60_000),
    });
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', '482913')).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('throws the generic error when neither a legacy token nor a PendingSignup exists (also covers OTP replay)', async () => {
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(
      useCase.execute('missing@b.vn', '123456'),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/application/verify-email.usecase.spec.ts`
Expected: FAIL — the current constructor only takes 4 arguments, so the 6-argument calls above pass `pendingSignupRepo` and `provisionOrganizationUseCase` into the wrong parameter slots (`dataSource`/`loginUseCase`), and the "PendingSignup branch" tests fail because the class has no such branch yet.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `apps/backend/src/modules/auth/application/verify-email.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { type LoginResult, LoginUseCase } from './login.usecase';
import {
  PENDING_SIGNUP_REPOSITORY,
  type IPendingSignupRepository,
} from './pending-signup-repository.port';
import { ProvisionOrganizationUseCase } from './provision-organization.usecase';
import { hashOtp } from './token-hasher';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenRepo: IEmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    private readonly provisionOrganizationUseCase: ProvisionOrganizationUseCase,
    private readonly dataSource: DataSource,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(email: string, otp: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    const token = user
      ? await this.tokenRepo.findByUserIdAndTokenHash(user.id, hashOtp(otp))
      : null;

    if (user && token && !token.isExpired(new Date())) {
      await this.dataSource.transaction(async (manager) => {
        await this.userRepo.save(user.markEmailVerified(), manager);
        await this.tokenRepo.deleteById(token.id, manager);
      });
      return this.loginUseCase.executeForUser(user.id);
    }

    const otpHash = hashOtp(otp);
    const provisionedUserId = await this.dataSource.transaction(
      async (manager) => {
        const pendingSignup = await this.pendingSignupRepo.findByEmail(
          normalizedEmail,
          manager,
        );
        if (
          !pendingSignup ||
          pendingSignup.otpHash !== otpHash ||
          pendingSignup.isExpired(new Date())
        ) {
          throw new AppError(
            ErrorCode.UNAUTHORIZED,
            'Mã xác thực không hợp lệ hoặc đã hết hạn.',
          );
        }
        const provisioned = await this.provisionOrganizationUseCase.execute(
          {
            name: pendingSignup.name,
            email: pendingSignup.email,
            passwordHash: pendingSignup.passwordHash,
            organizationName: pendingSignup.organizationName,
            taxCode: pendingSignup.taxCode,
            taxCodeMatched: pendingSignup.taxCodeMatched,
            taxCodeLookupName: pendingSignup.taxCodeLookupName,
          },
          manager,
        );
        await this.pendingSignupRepo.delete(pendingSignup.id, manager);
        return provisioned.user.id;
      },
    );

    return this.loginUseCase.executeForUser(provisionedUserId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/application/verify-email.usecase.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/verify-email.usecase.ts apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts
git commit -m "feat: VerifyEmailUseCase provisions the organization from a PendingSignup"
```

---

## Task 8: Extend `ResendVerificationEmailUseCase` with the `PendingSignup` branch

**Files:**
- Modify: `apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts`
- Modify (full rewrite): `apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts`

**Interfaces:**
- Consumes: `IPendingSignupRepository` (Task 2), `PendingSignup` (Task 1).
- Produces: `ResendVerificationEmailUseCase.execute(inputEmail: string): Promise<void>` — same public signature; constructor gains one new parameter (`pendingSignupRepo`) inserted between `verificationTokenRepo` and `emailSender`.

- [ ] **Step 1: Write the failing tests (full rewrite of the spec file)**

```typescript
// apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts
import { PendingSignup } from '../domain/pending-signup';
import { ResendVerificationEmailUseCase } from './resend-verification-email.usecase';

describe('ResendVerificationEmailUseCase', () => {
  it('replaces the pending token and sends a verification email for an existing unverified user', async () => {
    const user = {
      id: 'user-1',
      email: 'person@casso.vn',
      isEmailVerified: () => false,
    };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const verificationTokenRepo = {
      deleteByUserId: jest.fn(),
      save: jest.fn(),
    };
    const pendingSignupRepo = { findByEmail: jest.fn(), save: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback({}),
      ),
    };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute(' PERSON@CASSO.VN ');

    expect(userRepo.findByEmail).toHaveBeenCalledWith('person@casso.vn');
    expect(verificationTokenRepo.deleteByUserId).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
    expect(verificationTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.anything(),
    );
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'person@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('resends a new OTP for a pending signup when there is no user account yet', async () => {
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
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute(' NEW@CASSO.VN ');

    expect(pendingSignupRepo.findByEmail).toHaveBeenCalledWith('new@casso.vn');
    expect(pendingSignupRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending-1', otpHash: expect.any(String) }),
    );
    expect(pendingSignupRepo.save.mock.calls[0][0].otpHash).not.toBe('old-hash');
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'new@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not reveal or email when neither a user nor a pending signup exists', async () => {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await expect(useCase.execute('missing@casso.vn')).resolves.toBeUndefined();

    expect(pendingSignupRepo.save).not.toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not resend for an already-verified user, and does not fall through to the pending-signup branch', async () => {
    const user = { id: 'user-1', email: 'v@casso.vn', isEmailVerified: () => true };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
    const verificationTokenRepo = { deleteByUserId: jest.fn(), save: jest.fn() };
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const useCase = new ResendVerificationEmailUseCase(
      userRepo as any,
      verificationTokenRepo as any,
      pendingSignupRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute('v@casso.vn');

    expect(emailSender.sendVerificationEmail).not.toHaveBeenCalled();
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns modules/auth/application/resend-verification-email.usecase.spec.ts`
Expected: FAIL — the current constructor only takes 4 arguments (no `pendingSignupRepo` slot), so `emailSender`/`dataSource` receive the wrong values and the pending-signup tests fail.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { PendingSignup } from '../domain/pending-signup';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import {
  PENDING_SIGNUP_REPOSITORY,
  type IPendingSignupRepository,
} from './pending-signup-repository.port';
import { generateOtp } from './token-hasher';

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inputEmail: string): Promise<void> {
    const email = inputEmail.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (user && !user.isEmailVerified()) {
      const { otp, hash } = generateOtp();
      await this.dataSource.transaction(async (manager) => {
        await this.verificationTokenRepo.deleteByUserId(user.id, manager);
        await this.verificationTokenRepo.save(
          new EmailVerificationToken({
            id: randomUUID(),
            userId: user.id,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
            createdAt: new Date(),
          }),
          manager,
        );
      });
      await this.emailSender.sendVerificationEmail(user.email, otp);
      return;
    }
    if (user) return;

    const pendingSignup = await this.pendingSignupRepo.findByEmail(email);
    if (!pendingSignup) return;

    const { otp, hash } = generateOtp();
    await this.pendingSignupRepo.save(
      new PendingSignup({
        ...pendingSignup,
        otpHash: hash,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      }),
    );
    await this.emailSender.sendVerificationEmail(pendingSignup.email, otp);
  }
}
```

Note the `if (user) return;` guard right after the unverified-user branch: it preserves the original "do nothing for an already-verified user" behavior while still allowing an unrelated pending signup for the same email to be resent when no `User` exists at all.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns modules/auth/application/resend-verification-email.usecase.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts
git commit -m "feat: ResendVerificationEmailUseCase resends OTPs for pending signups"
```

---

## Task 9: Update the `/auth/signup` controller response

**Files:**
- Modify: `apps/backend/src/modules/auth/presentation/auth.controller.ts`

**Interfaces:**
- Consumes: `SignupUseCase.execute` returning `{ email: string }` (Task 6, not read by the handler — matches `resendVerification`'s discard-and-report-success shape).
- Produces: `POST /api/v1/auth/signup` now returns `{ success: true }` (was `{ userId, organizationId, organizationStatus }`) — confirmed by grep that no frontend code reads those three fields (`apps/frontend/src/features/auth/pages/signup-page.tsx` ignores the response).

- [ ] **Step 1: Update the swagger docs and handler body**

In `apps/backend/src/modules/auth/presentation/auth.controller.ts`, replace:

```typescript
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user and organization' })
  @ApiCreatedResponse({
    description:
      'Account created. Email verification (a 6-digit OTP) is required before login, regardless of organization status.',
    schema: {
      type: 'object',
      required: ['userId', 'organizationId', 'organizationStatus'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        organizationStatus: {
          type: 'string',
          enum: ['ACTIVE', 'PENDING_REVIEW'],
        },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.CONFLICT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async signup(@Body() dto: SignupDto) {
    const result = await this.signupUseCase.execute(dto);
    return {
      userId: result.user.id,
      organizationId: result.organization.id,
      organizationStatus: result.organization.status,
    };
  }
```

with:

```typescript
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user and organization' })
  @ApiCreatedResponse({
    description:
      'Signup accepted. Email verification (a 6-digit OTP) is required before the organization and account are created.',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.CONFLICT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async signup(@Body() dto: SignupDto) {
    await this.signupUseCase.execute(dto);
    return { success: true };
  }
```

(`successResponseSchema` is already imported at the top of this file for the `resendVerification` handler.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/auth.controller.ts
git commit -m "feat: signup endpoint returns a success acknowledgment instead of ids"
```

---

## Task 10: Update the seed script to call `ProvisionOrganizationUseCase` directly

**Files:**
- Modify: `apps/backend/src/database/seed/seed.ts`

**Interfaces:**
- Consumes: `ProvisionOrganizationUseCase` (Task 4), `hashPassword` (`apps/backend/src/modules/auth/application/password-hasher.ts`, unchanged).

This is a script with no existing Jest coverage — exercised manually against a real database, per the AGENTS.md TDD exception for scripts without a test harness. State this exception when reporting completion of this task.

- [ ] **Step 1: Locate and update the signup call site**

In `apps/backend/src/database/seed/seed.ts`, the current code (around the `main` function) is:

```typescript
    const signup = app.get(SignupUseCase);
    const { user, organization } = await signup.execute({
      organizationName: SEED_ORGANIZATION_NAME,
      name: 'Nguyễn Minh Anh',
      email: SEED_OWNER_EMAIL,
      password: SEED_OWNER_PASSWORD,
      taxCode: '0319999800',
    });
    await userRepo.save(user.markEmailVerified());

    // The synthetic tax code is not backed by VietQR, so signup lands the org
    // in PENDING_REVIEW — force-approve it so the demo owner can log in.
    const organizationRepo = app.get<IOrganizationRepository>(
      ORGANIZATION_REPOSITORY,
    );
    await organizationRepo.save(organization.approve());
```

Replace the `const signup = app.get(SignupUseCase);` line and the `signup.execute(...)` call with:

```typescript
    const provisionOrganization = app.get(ProvisionOrganizationUseCase);
    const { user, organization } = await provisionOrganization.execute({
      name: 'Nguyễn Minh Anh',
      email: SEED_OWNER_EMAIL,
      passwordHash: await hashPassword(SEED_OWNER_PASSWORD),
      organizationName: SEED_ORGANIZATION_NAME,
      taxCode: '0319999800',
      taxCodeMatched: false,
      taxCodeLookupName: null,
    });
    await userRepo.save(user.markEmailVerified());

    // The synthetic tax code is not backed by VietQR, so provisioning lands
    // the org in PENDING_REVIEW — force-approve it so the demo owner can log in.
    const organizationRepo = app.get<IOrganizationRepository>(
      ORGANIZATION_REPOSITORY,
    );
    await organizationRepo.save(organization.approve());
```

At the top of the file, replace the `SignupUseCase` import:

```typescript
import { SignupUseCase } from '../../modules/auth/application/signup.usecase';
```

with:

```typescript
import { hashPassword } from '../../modules/auth/application/password-hasher';
import { ProvisionOrganizationUseCase } from '../../modules/auth/application/provision-organization.usecase';
```

(keep both new imports in the same alphabetically-sorted position the old one occupied, alongside the file's other imports).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the seed script against a local database, if one is available**

Run: `pnpm --filter @casso-ledger/backend seed` (runs `ts-node src/database/seed/seed.ts`, per `apps/backend/package.json`'s `seed` script).
Expected: completes without throwing, logs the same "Seeded operator" / owner login lines as before. If no local Postgres is available, state that this step was skipped and why, rather than claiming it was verified.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/seed/seed.ts
git commit -m "chore: seed script provisions the demo organization directly"
```

---

## Task 11: Rewrite the signup/verify e2e coverage

**Files:**
- Modify: `apps/backend/test/auth-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: the real HTTP surface (`/api/v1/auth/signup`, `/api/v1/auth/verify-email`, `/api/v1/auth/login`) wired through Tasks 1–9, plus an overridden `AUTH_EMAIL_SENDER` provider to capture the real OTP the way `TAX_CODE_LOOKUP_ADAPTER` is already overridden in this file.

- [ ] **Step 1: Write the failing test — override the email sender and rewrite the signup/login block**

In `apps/backend/test/auth-flow.e2e-spec.ts`, add an import for the email sender port token near the existing `TAX_CODE_LOOKUP_ADAPTER` import:

```typescript
import { AUTH_EMAIL_SENDER } from '../src/modules/auth/application/auth-email-sender.port';
```

Remove the now-unused import (this test file no longer directly manipulates `UserOrmEntity`):

```typescript
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
```

Add a mock email sender next to the existing `taxCodeLookup` mock (inside the `describe('Auth flow (integration)', ...)` block, before `beforeAll`):

```typescript
  const authEmailSender = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendChangePasswordOtpEmail: jest.fn(),
    sendInviteEmail: jest.fn(),
  };
```

Chain a second `.overrideProvider(...)` onto the existing one in `beforeAll` (right after `.overrideProvider(TAX_CODE_LOOKUP_ADAPTER).useValue(taxCodeLookup)`):

```typescript
      .overrideProvider(TAX_CODE_LOOKUP_ADAPTER)
      .useValue(taxCodeLookup)
      .overrideProvider(AUTH_EMAIL_SENDER)
      .useValue(authEmailSender)
      .compile();
```

Add a reset for the new mock alongside the existing ones — there is no existing `beforeEach` in this file, so this stays scoped to the tests that need it (no new `beforeEach` needed since each `it` below calls the mock a known number of times and reads `mock.calls[0]`).

Replace the two tests `'signup creates the organization, subscription, membership, verification token, and cookie'` and `'verified user can log in and refresh rotates the cookie'` with:

```typescript
  it('signup creates a pending signup, and verifying it provisions the organization and issues a session', async () => {
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company B',
        name: 'An',
        email: 'ap@congtyb.vn',
        password: 'S3curePass!',
        taxCode: '0123456789',
      })
      .expect(201);

    expect(signupResponse.body).toEqual({ success: true });
    expect(await dataSource.query('SELECT id FROM pending_signups')).toHaveLength(1);
    expect(await dataSource.query('SELECT id FROM organizations')).toHaveLength(0);
    expect(await dataSource.query('SELECT id FROM subscriptions')).toHaveLength(0);
    expect(await dataSource.query('SELECT id FROM memberships')).toHaveLength(0);
    expect(authEmailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );

    const otp = authEmailSender.sendVerificationEmail.mock.calls[0][1] as string;

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: 'ap@congtyb.vn', otp })
      .expect(200);

    expect(verifyResponse.body.verified).toBe(true);
    expect(verifyResponse.body.accessToken).toBeDefined();
    expect(verifyResponse.headers['set-cookie'][0]).toContain('refreshToken=');
    expect(await dataSource.query('SELECT id FROM pending_signups')).toHaveLength(0);
    expect(await dataSource.query('SELECT id FROM organizations')).toHaveLength(1);
    expect(await dataSource.query('SELECT id FROM subscriptions')).toHaveLength(1);
    expect(await dataSource.query('SELECT id FROM memberships')).toHaveLength(1);
  });

  it('rejects a second signup for the same email while one is still pending', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company D',
        name: 'Cuong',
        email: 'cuong@congtyd.vn',
        password: 'S3curePass!',
        taxCode: '0999999998',
      })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company D Retry',
        name: 'Cuong',
        email: 'cuong@congtyd.vn',
        password: 'S3curePass!',
        taxCode: '0999999997',
      })
      .expect(409);

    expect(conflict.body.errorCode).toBe('CONFLICT');
  });

  it('verified user can log in and refresh rotates the cookie', async () => {
    const invalidLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ap@congtyb.vn', password: 'wrong-password' })
      .expect(401);
    expect(invalidLogin.body).toMatchObject({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ap@congtyb.vn', password: 'S3curePass!' })
      .expect(201);
    const cookie = loginResponse.headers['set-cookie'][0];

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.headers['set-cookie'][0]).toContain('refreshToken=');
    expect(
      await dataSource.query(
        'SELECT id FROM refresh_tokens WHERE "revokedAt" IS NOT NULL',
      ),
    ).not.toHaveLength(0);
  });
```

Note: `'verified user can log in...'` no longer manually flips `emailVerifiedAt` — it now relies on `'ap@congtyb.vn'` having been genuinely verified through the real OTP flow by the first test above, which runs earlier in file order and shares the same `app`/`dataSource` for the whole `describe` block (this was already true of the original file; only the verification mechanism changes, from a direct DB write to the real endpoint).

- [ ] **Step 2: Run the test to verify it fails against the pre-Task-1-11 code**

This step only makes sense once Tasks 1–9 are already applied (which they will be, since this is the last application-code task in the plan) — so "RED" here means: temporarily confirm the test fails if `AUTH_EMAIL_SENDER` is not overridden (comment out the `.overrideProvider(AUTH_EMAIL_SENDER)...` line and rerun) to prove the assertion on `authEmailSender.sendVerificationEmail` is actually exercised, then restore the override. This substitutes for a true RED phase since e2e tests exercise already-implemented units.

Run: `npx jest -c test/jest-e2e.json --testPathPatterns auth-flow.e2e-spec -t "signup creates a pending signup"`
Expected (with the override commented out): FAIL, because `authEmailSender.sendVerificationEmail` is never called (the real `ResendAuthEmailSenderAdapter` is used instead, and the OTP capture line finds `mock.calls[0]` undefined).

- [ ] **Step 3: Restore the override and run the full file**

Run: `npx jest -c test/jest-e2e.json --testPathPatterns auth-flow.e2e-spec.ts --runInBand`
Expected: PASS, all tests in the file (requires Docker for the Postgres testcontainer, and a reachable Redis — see the Task 12 verification note if Redis is not available in this environment).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/auth-flow.e2e-spec.ts
git commit -m "test: cover the deferred signup-provisioning flow end to end"
```

---

## Task 12: Full verification

**Files:**
- No additional files — verifies the committed backend changes from Tasks 1–11.

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: evidence the feature is complete without domain-layer, API-doc, type, lint, or regression violations.

- [ ] **Step 1: Run the full backend unit suite**

```bash
pnpm --filter @casso-ledger/backend test
```

Expected: all suites pass, including every spec touched or added in Tasks 1, 2, 3, 4, 6, 7, 8.

- [ ] **Step 2: Run the backend domain check**

Run the repository's `/domain-check` skill after the backend change. Confirm there are no violations for domain imports, unsafe production casts, tenant isolation, money handling, transactions, or persisted rollups — in particular, that `PendingSignup`'s email/tax-code lookups are recognized as the documented token/hash-lookup exception to `organizationId` scoping (`.claude/rules/infrastructure.md`), not flagged as a missing-tenant-scope violation.

- [ ] **Step 3: Run the repository verification gate**

```bash
pnpm verify
```

Expected: lint, type-check, tests, dependency-cruiser, application-boundary checks, cross-module checks, and controller-doc checks (`scripts/check-controller-docs.mjs`) all pass — `AuthController` already carries `@ApiTags('auth')`, and the modified `signup` endpoint keeps its `@ApiOperation`/`@ApiCreatedResponse`/`@ApiErrorResponse` decorators (Task 9), so no new controller-doc violation is expected.

- [ ] **Step 4: Run the e2e regression when Docker (and Redis) are available**

```bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand
```

Expected: PASS against real Postgres. This environment was observed during planning to have Docker but no reachable Redis (`ECONNREFUSED 127.0.0.1:6379` from BullMQ inside `SignupUseCase`'s email-send path), which turns every signup request into a 500 — if that is still true when this step runs, report the exact failure and that it is a pre-existing environment limitation, not a regression from this plan, rather than claiming the e2e suite passed.

- [ ] **Step 5: Inspect the final diff and status**

```bash
git diff main...HEAD --stat
git status --short --branch
```

Confirm only the spec, plan, ADR, `CONTEXT.md`, and the backend files touched by Tasks 1–11 are present — no `.env`, generated output, or unrelated changes.

## Completion Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-defer-signup-provisioning.md`.

Execution choices:

1. **Subagent-driven execution (recommended):** dispatch a fresh subagent per task and review after each task using `superpowers:subagent-driven-development`.
2. **Inline execution:** execute the tasks in this session using `superpowers:executing-plans` with checkpoints.
