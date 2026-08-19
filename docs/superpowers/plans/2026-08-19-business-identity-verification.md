# Business Identity Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a tax-code (MST) cross-check at signup and an operator approval gate before an organization can obtain any session, closing the gap where anyone can register a fake business and reach the app immediately.

**Architecture:** Add `PENDING_REVIEW`/`REJECTED` to the existing `OrganizationStatus` union alongside `ACTIVE`/`LOCKED`. `SignupUseCase` calls a new VietQR lookup adapter (outside the DB transaction, Redis-cached) and decides the initial status before creating the `Organization`. `LoginUseCase` and the existing global `OrganizationLockGuard` both refuse non-`ACTIVE` organizations — the former blocks token issuance outright, the latter is defense-in-depth for already-issued tokens. The existing `admin` module (Operator actor, `AdminAuthGuard`) gains approve/reject endpoints that mirror its existing lock/unlock endpoints exactly. Notification emails reuse the existing `IMemberNotificationSender` channel.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, ioredis (already a dependency via BullMQ), Jest.

**Spec:** [docs/superpowers/specs/2026-08-19-business-identity-verification-design.md](../specs/2026-08-19-business-identity-verification-design.md) — GitHub issue [#245](https://github.com/lengocanh2005it/casso-ledger/issues/245).

## Global Constraints

- `taxCode` is required at signup, validated `^\d{10}(\d{3})?$` (10 or 13 digits, no dashes).
- The VietQR call happens outside the DB transaction, with a bounded timeout; any failure/mismatch defaults to `PENDING_REVIEW` and never blocks or fails signup itself — the lookup adapter never throws, it resolves `null` on any error.
- Name matching is normalized-exact only (strip diacritics, uppercase, strip non-alphanumeric, collapse whitespace) — no fuzzy/similarity matching.
- Lookup results are cached in Redis keyed by `taxCode`, TTL 30 days.
- `REJECTED` is a new terminal status distinct from `LOCKED` — no resubmit flow in this ticket.
- Login issues no tokens at all for `PENDING_REVIEW`/`REJECTED` organizations (stricter than the #244 onboarding gate, which only gates the frontend router).
- `OrganizationLockGuard` is broadened to block every non-`ACTIVE` status, not only `LOCKED`.
- Operator review reuses the existing `Operator`/`AdminAuthGuard` mechanism and the `admin` module — no new role, no idempotency-key requirement (mirrors the existing lock/unlock endpoints).
- Reject requires a `reason`, stored in `OperatorAuditLog`, never included in the user-facing email.
- Auto-approval at signup (exact MST match) sends the same "organization approved" email an operator approval would send.
- Follow RED → GREEN → REFACTOR; run the focused test file after each vertical slice.

---

### Task 1: Organization domain — review states and tax-code fields

**Files:**
- Modify: `apps/backend/src/modules/organizations/domain/organization.ts`
- Modify: `apps/backend/src/modules/organizations/domain/organization.spec.ts`
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/status-by-error-code.ts`

**Interfaces:**
- Produces: `OrganizationStatus = 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED'`; `Organization` gains readonly `taxCode: string` (default `''`), `taxCodeMatched: boolean` (default `false`), `taxCodeLookupName: string | null` (default `null`); new methods `approve(): Organization` and `reject(): Organization`.
- Produces: `ErrorCode.ORGANIZATION_PENDING_REVIEW`, `ErrorCode.ORGANIZATION_REJECTED`, both mapped to HTTP 403.

- [ ] **Step 1: Write the failing domain tests**

```typescript
// apps/backend/src/modules/organizations/domain/organization.spec.ts
// add inside the existing describe('Organization', ...) block, after the lock() tests:

it('taxCode/taxCodeMatched/taxCodeLookupName default to empty/false/null', () => {
  const org = buildOrganization();
  expect(org.taxCode).toBe('');
  expect(org.taxCodeMatched).toBe(false);
  expect(org.taxCodeLookupName).toBeNull();
});

it('approve() moves a PENDING_REVIEW organization to ACTIVE', () => {
  const org = buildOrganization({ status: 'PENDING_REVIEW' });
  expect(org.approve().status).toBe('ACTIVE');
});

it('reject() moves a PENDING_REVIEW organization to REJECTED', () => {
  const org = buildOrganization({ status: 'PENDING_REVIEW' });
  expect(org.reject().status).toBe('REJECTED');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern organizations/domain/organization.spec.ts`
Expected: FAIL — `taxCode`/`taxCodeMatched`/`taxCodeLookupName` are `undefined`, `approve`/`reject` are not functions.

- [ ] **Step 3: Implement the domain changes**

```typescript
// apps/backend/src/modules/organizations/domain/organization.ts
export type OrganizationStatus =
  | 'ACTIVE'
  | 'LOCKED'
  | 'PENDING_REVIEW'
  | 'REJECTED';

export interface OrganizationProps {
  id: string;
  name: string;
  status?: OrganizationStatus;
  taxCode?: string;
  taxCodeMatched?: boolean;
  taxCodeLookupName?: string | null;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly status: OrganizationStatus;
  readonly taxCode: string;
  readonly taxCodeMatched: boolean;
  readonly taxCodeLookupName: string | null;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.status = props.status ?? 'ACTIVE';
    this.taxCode = props.taxCode ?? '';
    this.taxCodeMatched = props.taxCodeMatched ?? false;
    this.taxCodeLookupName = props.taxCodeLookupName ?? null;
    this.createdAt = props.createdAt;
  }

  lock(): Organization {
    return new Organization({ ...this, status: 'LOCKED' });
  }

  unlock(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }

  approve(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }

  reject(): Organization {
    return new Organization({ ...this, status: 'REJECTED' });
  }
}
```

`taxCode` defaults to `''` (not required) so every existing `new Organization({...})` call site in tests keeps compiling unchanged — only `SignupUseCase` (Task 5) ever supplies a real value.

- [ ] **Step 4: Add the two new error codes**

```typescript
// apps/backend/src/common/errors/error-code.ts — inside the enum, after ORGANIZATION_LOCKED/MEMBER_BLOCKED:
  ORGANIZATION_PENDING_REVIEW = 'ORGANIZATION_PENDING_REVIEW',
  ORGANIZATION_REJECTED = 'ORGANIZATION_REJECTED',
```

```typescript
// apps/backend/src/common/errors/status-by-error-code.ts — after the ORGANIZATION_LOCKED/MEMBER_BLOCKED entries:
  [ErrorCode.ORGANIZATION_PENDING_REVIEW]: 403,
  [ErrorCode.ORGANIZATION_REJECTED]: 403,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --testPathPattern organizations/domain/organization.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/organizations/domain/organization.ts apps/backend/src/modules/organizations/domain/organization.spec.ts apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/status-by-error-code.ts
git commit -m "feat: add PENDING_REVIEW/REJECTED organization states and tax-code fields"
```

---

### Task 2: Organization infrastructure — persist the new columns and filter by status

**Files:**
- Create: `apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.ts`
- Create: `apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.spec.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts`
- Modify: `apps/backend/src/modules/organizations/application/organization-repository.port.ts`

**Interfaces:**
- Consumes: `Organization`, `OrganizationStatus` from Task 1.
- Produces: `IOrganizationRepository.findAllPaginated(page, limit, status?)` where `status?: OrganizationStatus`; `OrganizationListItem` gains `taxCode`, `taxCodeMatched`, `taxCodeLookupName`.

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddOrganizationTaxCodeAndReviewStatus20260826000000 } from './20260826000000-add-organization-tax-code-and-review-status';

describe('AddOrganizationTaxCodeAndReviewStatus20260826000000', () => {
  it('adds the taxCode, taxCodeMatched, and taxCodeLookupName columns', async () => {
    const migration = new AddOrganizationTaxCodeAndReviewStatus20260826000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCode" character varying NOT NULL DEFAULT \'\'',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeMatched" boolean NOT NULL DEFAULT false',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeLookupName" character varying',
    );
  });

  it('reverts by dropping the columns', async () => {
    const migration = new AddOrganizationTaxCodeAndReviewStatus20260826000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeLookupName"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeMatched"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCode"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern add-organization-tax-code-and-review-status`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationTaxCodeAndReviewStatus20260826000000
  implements MigrationInterface
{
  name = 'AddOrganizationTaxCodeAndReviewStatus20260826000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCode" character varying NOT NULL DEFAULT \'\'',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeMatched" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeLookupName" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeLookupName"',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeMatched"',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCode"',
    );
  }
}
```

Note: the `status` column is already `character varying` with no `CHECK` constraint (`organization.orm-entity.ts:11`), so `PENDING_REVIEW`/`REJECTED` need no migration — only the type union (Task 1) and the ORM entity's TypeScript type (Step 5 below) change.

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `npx jest --testPathPattern add-organization-tax-code-and-review-status`
Expected: PASS

- [ ] **Step 5: Update the ORM entity, repository mapper, and status filter**

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
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED';

  @Column({ type: 'varchar', default: '' })
  taxCode: string;

  @Column({ type: 'boolean', default: false })
  taxCodeMatched: boolean;

  @Column({ type: 'varchar', nullable: true })
  taxCodeLookupName: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

```typescript
// apps/backend/src/modules/organizations/application/organization-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { Organization, OrganizationStatus } from '../domain/organization';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: OrganizationStatus;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
  createdAt: Date;
}

export interface IOrganizationRepository {
  findById(id: string, manager?: EntityManager): Promise<Organization | null>;
  findAllIds(): Promise<string[]>;
  findAllPaginated(
    page: number,
    limit: number,
    status?: OrganizationStatus,
  ): Promise<{ items: OrganizationListItem[]; total: number }>;
  findByIds(ids: string[]): Promise<Map<string, Organization>>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
```

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
import { Organization, type OrganizationStatus } from '../domain/organization';
import { OrganizationOrmEntity } from './organization.orm-entity';

const SELECT_COLUMNS = {
  id: true,
  name: true,
  status: true,
  taxCode: true,
  taxCodeMatched: true,
  taxCodeLookupName: true,
  createdAt: true,
} as const;

function toDomain(row: OrganizationOrmEntity): Organization {
  return new Organization({
    id: row.id,
    name: row.name,
    status: row.status,
    taxCode: row.taxCode,
    taxCodeMatched: row.taxCodeMatched,
    taxCodeLookupName: row.taxCodeLookupName,
    createdAt: row.createdAt,
  });
}

function toOrm(organization: Organization): OrganizationOrmEntity {
  const row = new OrganizationOrmEntity();
  row.id = organization.id;
  row.name = organization.name;
  row.status = organization.status;
  row.taxCode = organization.taxCode;
  row.taxCodeMatched = organization.taxCodeMatched;
  row.taxCodeLookupName = organization.taxCodeLookupName;
  row.createdAt = organization.createdAt;
  return row;
}

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
    ).findOne({ select: SELECT_COLUMNS, where: { id } });
    return row ? toDomain(row) : null;
  }

  async findAllIds(): Promise<string[]> {
    const rows = await this.repo.find({ select: { id: true } });
    return rows.map((row) => row.id);
  }

  async findAllPaginated(
    page: number,
    limit: number,
    status?: OrganizationStatus,
  ): Promise<{ items: OrganizationListItem[]; total: number }> {
    const [rows, total] = await this.repo.findAndCount({
      select: SELECT_COLUMNS,
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        taxCode: row.taxCode,
        taxCodeMatched: row.taxCodeMatched,
        taxCodeLookupName: row.taxCodeLookupName,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async findByIds(ids: string[]): Promise<Map<string, Organization>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repo.find({
      select: SELECT_COLUMNS,
      where: { id: In(ids) },
    });
    return new Map(rows.map((row) => [row.id, toDomain(row)]));
  }

  async save(
    organization: Organization,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).save(toOrm(organization));
  }
}
```

- [ ] **Step 6: Run the backend type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors from the repository/port signature changes at this point — `findAllPaginated` callers pass no third argument, which remains valid since `status` is optional)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.ts apps/backend/src/database/migrations/20260826000000-add-organization-tax-code-and-review-status.spec.ts apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts apps/backend/src/modules/organizations/infrastructure/typeorm-organization.repository.ts apps/backend/src/modules/organizations/application/organization-repository.port.ts
git commit -m "feat: persist organization tax-code fields and add status filter"
```

---

### Task 3: Company-name normalization and exact-match comparator

**Files:**
- Create: `apps/backend/src/modules/organizations/domain/normalize-company-name.ts`
- Create: `apps/backend/src/modules/organizations/domain/normalize-company-name.spec.ts`

**Interfaces:**
- Produces: `normalizeCompanyName(value: string): string`, `matchesTaxCodeName(entered: string, looked_up: string): boolean`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/organizations/domain/normalize-company-name.spec.ts
import { matchesTaxCodeName, normalizeCompanyName } from './normalize-company-name';

describe('normalizeCompanyName', () => {
  it('strips diacritics, uppercases, drops punctuation, and collapses whitespace', () => {
    expect(normalizeCompanyName('Công Ty TNHH  Casso Việt Nam.')).toBe(
      'CONG TY TNHH CASSO VIET NAM',
    );
  });
});

describe('matchesTaxCodeName', () => {
  it('matches when normalized forms are identical', () => {
    expect(
      matchesTaxCodeName(
        'Công ty TNHH Casso Việt Nam',
        'CÔNG TY TNHH CASSO VIỆT NAM',
      ),
    ).toBe(true);
  });

  it('does not match on any difference after normalization', () => {
    expect(
      matchesTaxCodeName('Công ty TNHH Casso', 'Công ty Cổ phần Casso'),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern normalize-company-name`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/backend/src/modules/organizations/domain/normalize-company-name.ts
export function normalizeCompanyName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesTaxCodeName(entered: string, lookedUp: string): boolean {
  return normalizeCompanyName(entered) === normalizeCompanyName(lookedUp);
}
```

`đ`/`Đ` is handled separately because Vietnamese `đ` does not decompose under NFD (it is not `d` + combining stroke) — an unhandled `Đ` would otherwise survive normalization as a non-`[A-Z]` character and get stripped by the punctuation filter, silently dropping a real letter from company names like "Đông".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern normalize-company-name`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/domain/normalize-company-name.ts apps/backend/src/modules/organizations/domain/normalize-company-name.spec.ts
git commit -m "feat: add normalized exact-match comparator for company names"
```

---

### Task 4: VietQR tax-code lookup adapter with Redis cache

**Files:**
- Create: `apps/backend/src/modules/tax-verification/application/tax-code-lookup.port.ts`
- Create: `apps/backend/src/modules/tax-verification/infrastructure/vietqr-tax-code-lookup.adapter.ts`
- Create: `apps/backend/src/modules/tax-verification/infrastructure/vietqr-tax-code-lookup.adapter.spec.ts`
- Create: `apps/backend/src/modules/tax-verification/tax-verification.module.ts`
- Modify: `apps/backend/.env.example`

**Interfaces:**
- Produces: `ITaxCodeLookupAdapter.lookup(taxCode: string): Promise<{ name: string } | null>` — never throws; resolves `null` on not-found, timeout, network error, or malformed response.
- Produces: `TaxVerificationModule` exporting `TAX_CODE_LOOKUP_ADAPTER`.

- [ ] **Step 1: Write the failing adapter tests**

```typescript
// apps/backend/src/modules/tax-verification/infrastructure/vietqr-tax-code-lookup.adapter.spec.ts
import type { ConfigService } from '@nestjs/config';
import { VietQrTaxCodeLookupAdapter } from './vietqr-tax-code-lookup.adapter';

function buildConfig(): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => fallback),
  } as unknown as ConfigService;
}

describe('VietQrTaxCodeLookupAdapter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the cached name without calling fetch on a cache hit', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ name: 'CACHED CO' })),
      set: jest.fn(),
    };
    global.fetch = jest.fn();
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toEqual({ name: 'CACHED CO' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches, caches, and returns the name on a cache miss', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '0101234567', name: 'ACME CO' }),
    });
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toEqual({ name: 'ACME CO' });
    expect(redis.set).toHaveBeenCalledWith(
      'tax-code-lookup:0101234567',
      JSON.stringify({ name: 'ACME CO' }),
      'EX',
      30 * 24 * 60 * 60,
    );
  });

  it('returns null and does not cache when VietQR responds with a non-OK status', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws (network error/timeout)', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const adapter = new VietQrTaxCodeLookupAdapter(buildConfig(), redis as any);

    const result = await adapter.lookup('0101234567');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern vietqr-tax-code-lookup`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the port**

```typescript
// apps/backend/src/modules/tax-verification/application/tax-code-lookup.port.ts
export interface TaxCodeLookupResult {
  name: string;
}

/**
 * Never throws — resolves `null` for "not found", timeout, network error, or
 * a non-OK/malformed VietQR response. Callers treat `null` the same as a
 * confirmed mismatch: fall back to manual review, never block the caller.
 */
export interface ITaxCodeLookupAdapter {
  lookup(taxCode: string): Promise<TaxCodeLookupResult | null>;
}

export const TAX_CODE_LOOKUP_ADAPTER = Symbol('TAX_CODE_LOOKUP_ADAPTER');
```

- [ ] **Step 4: Write the adapter**

```typescript
// apps/backend/src/modules/tax-verification/infrastructure/vietqr-tax-code-lookup.adapter.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type {
  ITaxCodeLookupAdapter,
  TaxCodeLookupResult,
} from '../application/tax-code-lookup.port';
import { REDIS_CLIENT } from './redis-client.provider';

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOOKUP_TIMEOUT_MS = 5000;

@Injectable()
export class VietQrTaxCodeLookupAdapter implements ITaxCodeLookupAdapter {
  private readonly logger = new Logger(VietQrTaxCodeLookupAdapter.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.baseUrl = this.config.get<string>(
      'VIETQR_API_BASE_URL',
      'https://api.vietqr.io/v2/business',
    );
  }

  async lookup(taxCode: string): Promise<TaxCodeLookupResult | null> {
    const cacheKey = `tax-code-lookup:${taxCode}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as TaxCodeLookupResult;
    } catch (error) {
      this.logger.warn('Tax code lookup cache read failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        response = await fetch(`${this.baseUrl}/${taxCode}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn('Tax code lookup request failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!response.ok) {
      this.logger.warn('Tax code lookup returned a non-OK status', {
        taxCode,
        status: response.status,
      });
      return null;
    }

    let body: { name?: unknown };
    try {
      body = await response.json();
    } catch {
      return null;
    }
    if (typeof body.name !== 'string' || body.name.trim() === '') return null;

    const result: TaxCodeLookupResult = { name: body.name };
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn('Tax code lookup cache write failed', {
        taxCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return result;
  }
}
```

```typescript
// apps/backend/src/modules/tax-verification/infrastructure/redis-client.provider.ts
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
```

- [ ] **Step 5: Wire the module**

```typescript
// apps/backend/src/modules/tax-verification/tax-verification.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TAX_CODE_LOOKUP_ADAPTER } from './application/tax-code-lookup.port';
import { REDIS_CLIENT } from './infrastructure/redis-client.provider';
import { VietQrTaxCodeLookupAdapter } from './infrastructure/vietqr-tax-code-lookup.adapter';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        }),
    },
    {
      provide: TAX_CODE_LOOKUP_ADAPTER,
      useClass: VietQrTaxCodeLookupAdapter,
    },
  ],
  exports: [TAX_CODE_LOOKUP_ADAPTER],
})
export class TaxVerificationModule {}
```

```bash
# apps/backend/.env.example — append
VIETQR_API_BASE_URL=https://api.vietqr.io/v2/business
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --testPathPattern vietqr-tax-code-lookup`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/tax-verification apps/backend/.env.example
git commit -m "feat: add VietQR tax-code lookup adapter with Redis cache"
```

---

### Task 5: Wire tax-code verification into signup

**Files:**
- Modify: `apps/backend/src/modules/auth/presentation/dto/signup.dto.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `ITaxCodeLookupAdapter` (Task 4), `matchesTaxCodeName` (Task 3), `IMemberNotificationSender` (extended in Task 9 — inject now, method added there).
- Produces: `SignupResult.accessToken?: string`, `SignupResult.refreshToken?: string` (both absent when the organization is `PENDING_REVIEW`); `SignupResult.organization.status` tells the controller what to return.

- [ ] **Step 1: Write the failing use-case tests**

```typescript
// apps/backend/src/modules/auth/application/signup.usecase.spec.ts
//
// Existing tests in this file instantiate SignupUseCase with 9 positional constructor
// arguments: userRepo, organizationRepo, membershipRepo, verificationTokenRepo,
// subscriptionRepo, organizationBootstrap, emailSender, loginUseCase, dataSource.
// Task 5 Step 4 inserts two new constructor parameters (taxCodeLookup,
// memberNotificationSender) right before loginUseCase — update every existing
// `new SignupUseCase(...)` call site in this file to insert two more positional
// arguments in that same spot, e.g.:
//   new SignupUseCase(
//     userRepo as any, organizationRepo as any, membershipRepo as any,
//     verificationTokenRepo as any, subscriptionRepo as any, organizationBootstrap as any,
//     emailSender as any, taxCodeLookup as any, memberNotificationSender as any,
//     loginUseCase as any, dataSource as any,
//   )
// Existing tests that don't care about tax-code behavior can reuse the
// `buildTaxCodeMatchMocks()` helper below for those two new arguments so their
// assertions (organization ACTIVE, tokens issued) keep passing unchanged.
//
// Add this helper once near the top of the file, and the three tests below it:

function buildTaxCodeMatchMocks(matchedName: string | null) {
  return {
    taxCodeLookup: {
      lookup: jest.fn().mockResolvedValue(
        matchedName === null ? null : { name: matchedName },
      ),
    },
    memberNotificationSender: {
      sendOrganizationApprovedEmail: jest.fn(),
      sendOrganizationRejectedEmail: jest.fn(),
    },
  };
}

describe('SignupUseCase tax code verification', () => {
  function buildCommonMocks() {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const organizationRepo = { save: jest.fn() };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const loginUseCase = {
      execute: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const dataSource = { transaction: jest.fn((cb) => cb({})) };
    return {
      userRepo,
      organizationRepo,
      membershipRepo,
      verificationTokenRepo,
      subscriptionRepo,
      organizationBootstrap,
      emailSender,
      loginUseCase,
      dataSource,
    };
  }

  it('creates an ACTIVE organization and logs in immediately when the tax code matches exactly', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } =
      buildTaxCodeMatchMocks('ACME CO');
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.loginUseCase as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('ACTIVE');
    expect(result.organization.taxCodeMatched).toBe(true);
    expect(result.accessToken).toBe('access-token');
    expect(memberNotificationSender.sendOrganizationApprovedEmail).toHaveBeenCalledWith(
      'an@acme.vn',
      'Acme Co',
    );
  });

  it('creates a PENDING_REVIEW organization and issues no tokens when the tax code does not match', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } = buildTaxCodeMatchMocks(
      'A Totally Different Co',
    );
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.loginUseCase as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(result.accessToken).toBeUndefined();
    expect(result.refreshToken).toBeUndefined();
    expect(common.loginUseCase.execute).not.toHaveBeenCalled();
    expect(memberNotificationSender.sendOrganizationApprovedEmail).not.toHaveBeenCalled();
  });

  it('creates a PENDING_REVIEW organization when the lookup fails', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } = buildTaxCodeMatchMocks(null);
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.loginUseCase as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(result.accessToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx jest --testPathPattern auth/application/signup.usecase.spec.ts`
Expected: FAIL — `SignupUseCase` constructor arity mismatch, `taxCode` missing on `SignupInput`.

- [ ] **Step 3: Add `taxCode` to `SignupDto`**

```typescript
// apps/backend/src/modules/auth/presentation/dto/signup.dto.ts
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  organizationName: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Matches(/^\d{10}(\d{3})?$/, {
    message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số.',
  })
  taxCode: string;
}
```

- [ ] **Step 4: Rewrite `SignupUseCase`**

```typescript
// apps/backend/src/modules/auth/application/signup.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
import { matchesTaxCodeName } from '../../organizations/domain/normalize-company-name';
import { Membership, Role } from '../../organizations/domain/membership';
import { Organization } from '../../organizations/domain/organization';
import {
  TAX_CODE_LOOKUP_ADAPTER,
  type ITaxCodeLookupAdapter,
} from '../../tax-verification/application/tax-code-lookup.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { LoginUseCase } from './login.usecase';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from './member-notification.port';
import {
  DEFAULT_ORGANIZATION_BOOTSTRAP,
  type IOrganizationBootstrap,
} from './organization-bootstrap.port';
import { hashPassword } from './password-hasher';
import { generateToken } from './token-hasher';

export interface SignupInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  taxCode: string;
}

export interface SignupResult {
  user: User;
  organization: Organization;
  membership: Membership;
  accessToken?: string;
  refreshToken?: string;
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(DEFAULT_ORGANIZATION_BOOTSTRAP)
    private readonly organizationBootstrap: IOrganizationBootstrap,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
    private readonly loginUseCase: LoginUseCase,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    if (await this.userRepo.findByEmail(email)) {
      throw new AppError(ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }

    const organizationName = input.organizationName.trim();
    const lookupResult = await this.taxCodeLookup.lookup(input.taxCode);
    const taxCodeMatched =
      lookupResult !== null &&
      matchesTaxCodeName(organizationName, lookupResult.name);

    const now = new Date();
    const user = new User({
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: null,
      createdAt: now,
    });
    const organization = new Organization({
      id: randomUUID(),
      name: organizationName,
      status: taxCodeMatched ? 'ACTIVE' : 'PENDING_REVIEW',
      taxCode: input.taxCode,
      taxCodeMatched,
      taxCodeLookupName: lookupResult?.name ?? null,
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

    await this.dataSource.transaction(async (manager) => {
      await this.organizationRepo.save(organization, manager);
      await this.userRepo.save(user, manager);
      await this.membershipRepo.save(membership, manager);
      await this.subscriptionRepo.save(
        Subscription.createFree(randomUUID(), organization.id, now),
        manager,
        organization.id,
      );
      await this.organizationBootstrap.seed(organization.id, manager);
    });

    const { token, hash } = generateToken();
    await this.verificationTokenRepo.save(
      new EmailVerificationToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
        createdAt: now,
      }),
    );
    await this.emailSender.sendVerificationEmail(
      user.email,
      `/verify-email?token=${token}`,
    );

    if (organization.status !== 'ACTIVE') {
      return { user, organization, membership };
    }

    await this.memberNotificationSender.sendOrganizationApprovedEmail(
      user.email,
      organization.name,
    );
    const tokens = await this.loginUseCase.execute({
      email: user.email,
      password: input.password,
    });
    return { user, organization, membership, ...tokens };
  }
}
```

- [ ] **Step 5: Update the signup controller response**

```typescript
// apps/backend/src/modules/auth/presentation/auth.controller.ts — replace the signup handler body
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user and organization' })
  @ApiCreatedResponse({
    description:
      'Account created; if the organization is auto-approved, the refresh token is set as an httpOnly cookie (refreshToken) and accessToken is present. If the organization is pending review, no session is issued.',
    schema: {
      type: 'object',
      required: ['userId', 'organizationId', 'organizationStatus'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        organizationStatus: { type: 'string', enum: ['ACTIVE', 'PENDING_REVIEW'] },
        accessToken: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.CONFLICT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.signupUseCase.execute(dto);
    if (result.refreshToken) {
      response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        this.refreshCookieOptions,
      );
    }
    return {
      userId: result.user.id,
      organizationId: result.organization.id,
      organizationStatus: result.organization.status,
      ...(result.accessToken ? { accessToken: result.accessToken } : {}),
    };
  }
```

- [ ] **Step 6: Wire the new dependencies into `AuthModule`**

```typescript
// apps/backend/src/modules/auth/auth.module.ts
// add to imports: TaxVerificationModule (from '../tax-verification/tax-verification.module')
// SignupUseCase already listed in providers — no entry change needed, Nest resolves the two
// new constructor dependencies (TAX_CODE_LOOKUP_ADAPTER, MEMBER_NOTIFICATION_SENDER) from
// TaxVerificationModule's exports and AuthModule's own MEMBER_NOTIFICATION_SENDER binding.
```

Add `import { TaxVerificationModule } from '../tax-verification/tax-verification.module';` and insert `TaxVerificationModule` into the `imports` array (after `BankConnectionsModule`, following the existing import-order convention).

- [ ] **Step 7: Run the focused tests, then the full auth suite and type-check**

Run: `npx jest --testPathPattern auth/application/signup.usecase.spec.ts`
Expected: PASS

Run: `npx jest --testPathPattern apps/backend/src/modules/auth`
Expected: PASS (update any other spec that constructs `SignupUseCase` or asserts on the old `accessToken`-always-present signup response shape)

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/auth apps/backend/.env.example
git commit -m "feat: verify tax code at signup and gate auto-login on the match"
```

---

### Task 6: Block login for non-ACTIVE organizations

**Files:**
- Modify: `apps/backend/src/modules/auth/application/login.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/login.usecase.spec.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts` (no change needed — `LoginUseCase` already resolves `ORGANIZATION_REPOSITORY` from the already-imported `OrganizationsModule`)

**Interfaces:**
- Consumes: `IOrganizationRepository` (Task 2).
- Produces: `LoginUseCase` throws `AppError(ErrorCode.ORGANIZATION_PENDING_REVIEW, ...)` / `AppError(ErrorCode.ORGANIZATION_REJECTED, ...)` from both `execute` and `executeForUser` before issuing tokens.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/auth/application/login.usecase.spec.ts
// Add near the existing tests. Every existing `new LoginUseCase(userRepo, membershipRepo,
// refreshTokenRepo, jwtService)` call (5 call sites) must append a 5th argument:
// an organizationRepo mock. For tests unrelated to org status, use:
//   const organizationRepo = {
//     findById: jest.fn().mockResolvedValue(
//       new Organization({ id: 'org-1', name: 'Acme', status: 'ACTIVE', createdAt: new Date() }),
//     ),
//   };
// and append `organizationRepo as any` as the last constructor argument at each call site.
// (Add `import { Organization } from '../../organizations/domain/organization';` at the top.)

it('throws ORGANIZATION_PENDING_REVIEW when the caller organization is pending review', async () => {
  const passwordHash = await hashPassword('S3curePass!');
  const user = new User({
    id: 'user-1',
    name: 'An',
    email: 'ap@congtyb.vn',
    passwordHash,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  });
  const membership = new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date(),
    joinedAt: new Date(),
    createdAt: new Date(),
  });
  const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
  const membershipRepo = {
    findFirstActiveByUserId: jest.fn().mockResolvedValue(membership),
  };
  const refreshTokenRepo = { save: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'PENDING_REVIEW',
        createdAt: new Date(),
      }),
    ),
  };
  const useCase = new LoginUseCase(
    userRepo as any,
    membershipRepo as any,
    refreshTokenRepo as any,
    jwtService as any,
    organizationRepo as any,
  );

  await expect(
    useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
  ).rejects.toMatchObject({ errorCode: 'ORGANIZATION_PENDING_REVIEW' });
  expect(refreshTokenRepo.save).not.toHaveBeenCalled();
});

it('throws ORGANIZATION_REJECTED when the caller organization was rejected', async () => {
  const passwordHash = await hashPassword('S3curePass!');
  const user = new User({
    id: 'user-1',
    name: 'An',
    email: 'ap@congtyb.vn',
    passwordHash,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  });
  const membership = new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date(),
    joinedAt: new Date(),
    createdAt: new Date(),
  });
  const userRepo = { findByEmail: jest.fn().mockResolvedValue(user) };
  const membershipRepo = {
    findFirstActiveByUserId: jest.fn().mockResolvedValue(membership),
  };
  const refreshTokenRepo = { save: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'REJECTED',
        createdAt: new Date(),
      }),
    ),
  };
  const useCase = new LoginUseCase(
    userRepo as any,
    membershipRepo as any,
    refreshTokenRepo as any,
    jwtService as any,
    organizationRepo as any,
  );

  await expect(
    useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
  ).rejects.toMatchObject({ errorCode: 'ORGANIZATION_REJECTED' });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx jest --testPathPattern auth/application/login.usecase.spec.ts`
Expected: FAIL — constructor arity mismatch, `ORGANIZATION_PENDING_REVIEW` never thrown.

- [ ] **Step 3: Implement the check in `issueSession`**

```typescript
// apps/backend/src/modules/auth/application/login.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import type { Membership } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import type { User } from '../../users/domain/user';
import { RefreshToken } from '../domain/refresh-token';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import { comparePassword } from './password-hasher';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { generateToken } from './token-hasher';
import { type ITokenSigner, TOKEN_SIGNER } from './token-signer.port';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

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

    await this.assertOrganizationActive(membership);
    return this.issueSession(user, membership);
  }

  async executeForUser(userId: string): Promise<LoginResult> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
    }
    if (!user.isEmailVerified()) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Email chưa được xác minh.');
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

    await this.assertOrganizationActive(membership);
    return this.issueSession(user, membership);
  }

  private async assertOrganizationActive(
    membership: Membership | null,
  ): Promise<void> {
    if (!membership) return;
    const organization = await this.organizationRepo.findById(
      membership.organizationId,
    );
    if (organization?.status === 'PENDING_REVIEW') {
      throw new AppError(
        ErrorCode.ORGANIZATION_PENDING_REVIEW,
        'Tổ chức của bạn đang chờ được duyệt.',
      );
    }
    if (organization?.status === 'REJECTED') {
      throw new AppError(
        ErrorCode.ORGANIZATION_REJECTED,
        'Đăng ký tổ chức của bạn chưa được chấp thuận.',
      );
    }
  }

  private async issueSession(
    user: User,
    membership: Membership | null,
  ): Promise<LoginResult> {
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
}
```

- [ ] **Step 4: Run the focused tests, then the full auth suite**

Run: `npx jest --testPathPattern auth/application/login.usecase.spec.ts`
Expected: PASS

Run: `npx jest --testPathPattern apps/backend/src/modules/auth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/login.usecase.ts apps/backend/src/modules/auth/application/login.usecase.spec.ts
git commit -m "feat: block login for organizations pending review or rejected"
```

---

### Task 7: Broaden `OrganizationLockGuard` to every non-ACTIVE status

**Files:**
- Modify: `apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts`
- Modify: `apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts`

**Interfaces:**
- Consumes: `Organization.status` (Task 1), `ErrorCode.ORGANIZATION_PENDING_REVIEW`/`ErrorCode.ORGANIZATION_REJECTED` (Task 1).
- Produces: unchanged public shape (`CanActivate`), broadened behavior.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts
// Add to the existing describe block:

it('rejects with ORGANIZATION_PENDING_REVIEW when the caller organization is pending review', async () => {
  const guard = buildGuard(
    new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    }),
  );
  const request = {
    user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
  };

  await expect(guard.canActivate(buildContext(request))).rejects.toMatchObject(
    { response: { errorCode: 'ORGANIZATION_PENDING_REVIEW' } },
  );
});

it('rejects with ORGANIZATION_REJECTED when the caller organization was rejected', async () => {
  const guard = buildGuard(
    new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'REJECTED',
      createdAt: new Date(),
    }),
  );
  const request = {
    user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
  };

  await expect(guard.canActivate(buildContext(request))).rejects.toMatchObject(
    { response: { errorCode: 'ORGANIZATION_REJECTED' } },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern organization-lock.guard.spec.ts`
Expected: FAIL — guard still only checks `status === 'LOCKED'`, so `PENDING_REVIEW`/`REJECTED` requests are allowed through instead of rejected.

- [ ] **Step 3: Broaden the guard**

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
import type { OrganizationStatus } from '../domain/organization';

const ERROR_CODE_BY_STATUS: Partial<Record<OrganizationStatus, ErrorCode>> = {
  LOCKED: ErrorCode.ORGANIZATION_LOCKED,
  PENDING_REVIEW: ErrorCode.ORGANIZATION_PENDING_REVIEW,
  REJECTED: ErrorCode.ORGANIZATION_REJECTED,
};

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
    const errorCode = organization && ERROR_CODE_BY_STATUS[organization.status];
    if (errorCode) {
      throw new ForbiddenException({
        errorCode,
        message: 'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
      });
    }
    return true;
  }
}
```

The existing "rejects with ORGANIZATION_LOCKED" test keeps passing unchanged — `LOCKED` still maps to the same error code, only the lookup mechanism changed from an `if` to a table.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPattern organization-lock.guard.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts apps/backend/src/modules/organizations/presentation/organization-lock.guard.spec.ts
git commit -m "feat: block business APIs for pending-review and rejected organizations"
```

---

### Task 8: Operator audit log — reason field and new action types

**Files:**
- Create: `apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.ts`
- Create: `apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.spec.ts`
- Modify: `apps/backend/src/modules/admin/domain/operator-audit-log.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts`
- Modify: `apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts`

**Interfaces:**
- Produces: `OperatorActionType` gains `'ORGANIZATION_APPROVED' | 'ORGANIZATION_REJECTED'`; `OperatorAuditLogProps`/`OperatorAuditLog` gain `reason?: string | null`.

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.spec.ts
import type { QueryRunner } from 'typeorm';
import { AddOperatorAuditLogReason20260826010000 } from './20260826010000-add-operator-audit-log-reason';

describe('AddOperatorAuditLogReason20260826010000', () => {
  it('adds the nullable reason column', async () => {
    const migration = new AddOperatorAuditLogReason20260826010000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "reason" character varying',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddOperatorAuditLogReason20260826010000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "reason"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern add-operator-audit-log-reason`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogReason20260826010000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogReason20260826010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "reason" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "reason"',
    );
  }
}
```

- [ ] **Step 4: Run migration test to verify it passes**

Run: `npx jest --testPathPattern add-operator-audit-log-reason`
Expected: PASS

- [ ] **Step 5: Update the domain, ORM entity, and repository**

```typescript
// apps/backend/src/modules/admin/domain/operator-audit-log.ts
export type OperatorActionType =
  | 'ORGANIZATION_LOCKED'
  | 'ORGANIZATION_UNLOCKED'
  | 'ORGANIZATION_APPROVED'
  | 'ORGANIZATION_REJECTED'
  | 'MEMBER_BLOCKED'
  | 'MEMBER_UNBLOCKED'
  | 'INVITE_RESENT'
  | 'INVITE_REVOKED';

export interface OperatorAuditLogProps {
  id: string;
  operatorId: string;
  organizationId: string;
  actionType: OperatorActionType;
  createdAt: Date;
  membershipId?: string | null;
  inviteId?: string | null;
  reason?: string | null;
}

export class OperatorAuditLog {
  readonly id: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly actionType: OperatorActionType;
  readonly createdAt: Date;
  readonly membershipId: string | null;
  readonly inviteId: string | null;
  readonly reason: string | null;

  constructor(props: OperatorAuditLogProps) {
    this.id = props.id;
    this.operatorId = props.operatorId;
    this.organizationId = props.organizationId;
    this.actionType = props.actionType;
    this.createdAt = props.createdAt;
    this.membershipId = props.membershipId ?? null;
    this.inviteId = props.inviteId ?? null;
    this.reason = props.reason ?? null;
  }
}
```

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

  @Column({ type: 'varchar', nullable: true })
  membershipId: string | null;

  @Column({ type: 'varchar', nullable: true })
  inviteId: string | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

```typescript
// apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IOperatorAuditLogRepository } from '../application/operator-audit-log-repository.port';
import type { OperatorAuditLog } from '../domain/operator-audit-log';
import { OperatorAuditLogOrmEntity } from './operator-audit-log.orm-entity';

function toOrm(log: OperatorAuditLog): OperatorAuditLogOrmEntity {
  const row = new OperatorAuditLogOrmEntity();
  row.id = log.id;
  row.operatorId = log.operatorId;
  row.organizationId = log.organizationId;
  row.actionType = log.actionType;
  row.membershipId = log.membershipId;
  row.inviteId = log.inviteId;
  row.reason = log.reason;
  row.createdAt = log.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOperatorAuditLogRepository
  implements IOperatorAuditLogRepository
{
  constructor(
    @InjectRepository(OperatorAuditLogOrmEntity)
    private readonly repo: Repository<OperatorAuditLogOrmEntity>,
  ) {}

  async save(log: OperatorAuditLog, manager?: EntityManager): Promise<void> {
    await (manager
      ? manager.getRepository(OperatorAuditLogOrmEntity)
      : this.repo
    ).save(toOrm(log));
  }
}
```

- [ ] **Step 6: Run the admin module tests and type-check**

Run: `npx jest --testPathPattern apps/backend/src/modules/admin`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.ts apps/backend/src/database/migrations/20260826010000-add-operator-audit-log-reason.spec.ts apps/backend/src/modules/admin/domain/operator-audit-log.ts apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts
git commit -m "feat: record a reason on operator audit logs and add org review action types"
```

---

### Task 9: Organization approved/rejected notification emails

**Files:**
- Modify: `apps/backend/src/modules/auth/application/member-notification.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts`

**Interfaces:**
- Produces: `IMemberNotificationSender.sendOrganizationApprovedEmail(to, organizationName)`, `.sendOrganizationRejectedEmail(to, organizationName)`.

- [ ] **Step 1: Write the failing adapter tests**

```typescript
// apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts
// Add alongside the existing sendMemberBlockedEmail/sendMemberUnblockedEmail tests, following
// the same pattern (construct the adapter with a mocked emailQueue, assert emailQueue.add args).

it('sendOrganizationApprovedEmail enqueues an approval email', async () => {
  const emailQueue = { add: jest.fn() };
  const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

  await adapter.sendOrganizationApprovedEmail('owner@acme.vn', 'Acme Co');

  expect(emailQueue.add).toHaveBeenCalledWith('send-auth-email', {
    to: 'owner@acme.vn',
    subject: 'Tổ chức Acme Co đã được duyệt',
    html: expect.stringContaining('Acme Co'),
    emailType: 'ORGANIZATION_APPROVED',
  });
});

it('sendOrganizationRejectedEmail enqueues a rejection email without a reason', async () => {
  const emailQueue = { add: jest.fn() };
  const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

  await adapter.sendOrganizationRejectedEmail('owner@acme.vn', 'Acme Co');

  expect(emailQueue.add).toHaveBeenCalledWith('send-auth-email', {
    to: 'owner@acme.vn',
    subject: 'Đăng ký tổ chức Acme Co chưa được chấp thuận',
    html: expect.stringContaining('liên hệ'),
    emailType: 'ORGANIZATION_REJECTED',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPattern resend-auth-email-sender.adapter.spec.ts`
Expected: FAIL — `sendOrganizationApprovedEmail`/`sendOrganizationRejectedEmail` are not functions.

- [ ] **Step 3: Extend the port and its email-type union**

```typescript
// apps/backend/src/modules/auth/application/member-notification.port.ts
export interface IMemberNotificationSender {
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>;
  sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
  sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
}

export const MEMBER_NOTIFICATION_SENDER = Symbol('MEMBER_NOTIFICATION_SENDER');
```

```typescript
// apps/backend/src/modules/notifications/application/email-queue.port.ts — extend AuthEmailJob.emailType:
export interface AuthEmailJob {
  to: string;
  subject: string;
  html: string;
  emailType:
    | 'AUTH_VERIFICATION'
    | 'AUTH_PASSWORD_RESET'
    | 'AUTH_INVITE'
    | 'MEMBER_BLOCKED'
    | 'MEMBER_UNBLOCKED'
    | 'ORGANIZATION_APPROVED'
    | 'ORGANIZATION_REJECTED';
}
```

- [ ] **Step 4: Implement the adapter methods**

```typescript
// apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts
// Add these two methods to the class, following the exact structure of sendMemberBlockedEmail:

  async sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Tổ chức ${organizationName} đã được duyệt`,
        html: `<p>Tổ chức ${organizationName} của bạn trên Casso đã được duyệt. Bạn có thể đăng nhập để sử dụng dịch vụ.</p>`,
        emailType: 'ORGANIZATION_APPROVED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue organization approved email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo duyệt tổ chức.',
      );
    }
  }

  async sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Đăng ký tổ chức ${organizationName} chưa được chấp thuận`,
        html: `<p>Đăng ký tổ chức ${organizationName} trên Casso chưa được chấp thuận. Vui lòng liên hệ đội ngũ hỗ trợ nếu bạn cho rằng đây là nhầm lẫn.</p>`,
        emailType: 'ORGANIZATION_REJECTED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue organization rejected email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo từ chối tổ chức.',
      );
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --testPathPattern resend-auth-email-sender.adapter.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/application/member-notification.port.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts apps/backend/src/modules/notifications/application/email-queue.port.ts
git commit -m "feat: add organization approved/rejected notification emails"
```

---

### Task 10: Operator approve/reject endpoints

**Files:**
- Create: `apps/backend/src/modules/admin/application/approve-organization.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/approve-organization.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/application/reject-organization.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/reject-organization.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/presentation/dto/reject-organization.dto.ts`
- Create: `apps/backend/src/modules/admin/presentation/dto/admin-organizations-query.dto.ts`
- Create: `apps/backend/src/modules/admin/application/admin-organization-status-filter.ts`
- Modify: `apps/backend/src/modules/admin/application/list-organizations.usecase.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.ts`
- Modify: `apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts`
- Modify: `apps/backend/src/modules/admin/admin.module.ts`

**Interfaces:**
- Consumes: `IOrganizationRepository`, `IOperatorAuditLogRepository`, `IMembershipRepository.findOwnerByOrganization`, `IUserRepository`, `IMemberNotificationSender` (Task 9).
- Produces: `POST /admin/organizations/:id/approve`, `POST /admin/organizations/:id/reject`, `GET /admin/organizations?status=PENDING_REVIEW`.

- [ ] **Step 1: Write the failing use-case tests**

```typescript
// apps/backend/src/modules/admin/application/approve-organization.usecase.spec.ts
import { Organization } from '../../organizations/domain/organization';
import { Membership, Role } from '../../organizations/domain/membership';
import { User } from '../../users/domain/user';
import { ApproveOrganizationUseCase } from './approve-organization.usecase';

describe('ApproveOrganizationUseCase', () => {
  it('moves a PENDING_REVIEW organization to ACTIVE, audits it, and emails the owner', async () => {
    const organization = new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
    const owner = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const ownerUser = new User({
      id: 'user-1',
      name: 'An',
      email: 'an@acme.vn',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const membershipRepo = {
      findOwnerByOrganization: jest.fn().mockResolvedValue(owner),
    };
    const userRepo = { findById: jest.fn().mockResolvedValue(ownerUser) };
    const memberNotificationSender = {
      sendOrganizationApprovedEmail: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb) => cb({})),
    };

    const useCase = new ApproveOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      {},
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        operatorId: 'op-1',
        actionType: 'ORGANIZATION_APPROVED',
      }),
      {},
    );
    expect(memberNotificationSender.sendOrganizationApprovedEmail).toHaveBeenCalledWith(
      'an@acme.vn',
      'Acme',
    );
  });

  it('throws CONFLICT when the organization is not PENDING_REVIEW', async () => {
    const organization = new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const membershipRepo = { findOwnerByOrganization: jest.fn() };
    const userRepo = { findById: jest.fn() };
    const memberNotificationSender = { sendOrganizationApprovedEmail: jest.fn() };
    const dataSource = { transaction: jest.fn((cb) => cb({})) };

    const useCase = new ApproveOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await expect(
      useCase.execute({ organizationId: 'org-1', operatorId: 'op-1' }),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(organizationRepo.save).not.toHaveBeenCalled();
  });
});
```

```typescript
// apps/backend/src/modules/admin/application/reject-organization.usecase.spec.ts
import { Organization } from '../../organizations/domain/organization';
import { Membership, Role } from '../../organizations/domain/membership';
import { User } from '../../users/domain/user';
import { RejectOrganizationUseCase } from './reject-organization.usecase';

describe('RejectOrganizationUseCase', () => {
  it('moves a PENDING_REVIEW organization to REJECTED, audits the reason, and emails the owner without it', async () => {
    const organization = new Organization({
      id: 'org-1',
      name: 'Acme',
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
    const owner = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const ownerUser = new User({
      id: 'user-1',
      name: 'An',
      email: 'an@acme.vn',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
      save: jest.fn(),
    };
    const auditRepo = { save: jest.fn() };
    const membershipRepo = {
      findOwnerByOrganization: jest.fn().mockResolvedValue(owner),
    };
    const userRepo = { findById: jest.fn().mockResolvedValue(ownerUser) };
    const memberNotificationSender = { sendOrganizationRejectedEmail: jest.fn() };
    const dataSource = { transaction: jest.fn((cb) => cb({})) };

    const useCase = new RejectOrganizationUseCase(
      dataSource as any,
      organizationRepo as any,
      auditRepo as any,
      membershipRepo as any,
      userRepo as any,
      memberNotificationSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      operatorId: 'op-1',
      reason: 'Tax code does not match any registered business',
    });

    expect(organizationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED' }),
      {},
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'ORGANIZATION_REJECTED',
        reason: 'Tax code does not match any registered business',
      }),
      {},
    );
    expect(memberNotificationSender.sendOrganizationRejectedEmail).toHaveBeenCalledWith(
      'an@acme.vn',
      'Acme',
    );
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx jest --testPathPattern "approve-organization|reject-organization"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `ApproveOrganizationUseCase`**

```typescript
// apps/backend/src/modules/admin/application/approve-organization.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from '../../auth/application/member-notification.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface ApproveOrganizationInput {
  organizationId: string;
  operatorId: string;
}

@Injectable()
export class ApproveOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
  ) {}

  async execute(input: ApproveOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status !== 'PENDING_REVIEW') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Tổ chức không ở trạng thái chờ duyệt.',
        );
      }

      await this.organizationRepo.save(organization.approve(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_APPROVED',
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const owner = await this.membershipRepo.findOwnerByOrganization(
      input.organizationId,
    );
    if (!owner) return;
    const ownerUser = await this.userRepo.findById(owner.userId);
    if (!ownerUser) return;
    const organization = await this.organizationRepo.findById(
      input.organizationId,
    );
    await this.memberNotificationSender.sendOrganizationApprovedEmail(
      ownerUser.email,
      organization?.name ?? '',
    );
  }
}
```

- [ ] **Step 4: Implement `RejectOrganizationUseCase`**

```typescript
// apps/backend/src/modules/admin/application/reject-organization.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  MEMBER_NOTIFICATION_SENDER,
  type IMemberNotificationSender,
} from '../../auth/application/member-notification.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface RejectOrganizationInput {
  organizationId: string;
  operatorId: string;
  reason: string;
}

@Injectable()
export class RejectOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
  ) {}

  async execute(input: RejectOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status !== 'PENDING_REVIEW') {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Tổ chức không ở trạng thái chờ duyệt.',
        );
      }

      await this.organizationRepo.save(organization.reject(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_REJECTED',
          reason: input.reason,
          createdAt: new Date(),
        }),
        manager,
      );
    });

    const owner = await this.membershipRepo.findOwnerByOrganization(
      input.organizationId,
    );
    if (!owner) return;
    const ownerUser = await this.userRepo.findById(owner.userId);
    if (!ownerUser) return;
    const organization = await this.organizationRepo.findById(
      input.organizationId,
    );
    await this.memberNotificationSender.sendOrganizationRejectedEmail(
      ownerUser.email,
      organization?.name ?? '',
    );
  }
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npx jest --testPathPattern "approve-organization|reject-organization"`
Expected: PASS

- [ ] **Step 6: Add the status filter DTO and extend `ListOrganizationsUseCase`**

```typescript
// apps/backend/src/modules/admin/application/admin-organization-status-filter.ts
export const ADMIN_ORGANIZATION_STATUS_FILTERS = [
  'ALL',
  'ACTIVE',
  'LOCKED',
  'PENDING_REVIEW',
  'REJECTED',
] as const;

export type AdminOrganizationStatusFilter =
  (typeof ADMIN_ORGANIZATION_STATUS_FILTERS)[number];
```

```typescript
// apps/backend/src/modules/admin/application/list-organizations.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
  type OrganizationListItem,
} from '../../organizations/application/organization-repository.port';
import type { AdminOrganizationStatusFilter } from './admin-organization-status-filter';

export interface ListOrganizationsInput {
  page: number;
  limit: number;
  status: AdminOrganizationStatusFilter;
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
      input.status === 'ALL' ? undefined : input.status,
    );
    return { items, total, page: input.page, limit: input.limit };
  }
}
```

```typescript
// apps/backend/src/modules/admin/presentation/dto/admin-organizations-query.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  ADMIN_ORGANIZATION_STATUS_FILTERS,
  type AdminOrganizationStatusFilter,
} from '../../application/admin-organization-status-filter';

export class AdminOrganizationsQueryDto extends PaginationDto {
  @ApiProperty({
    enum: ADMIN_ORGANIZATION_STATUS_FILTERS,
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(ADMIN_ORGANIZATION_STATUS_FILTERS)
  status: AdminOrganizationStatusFilter = 'ALL';
}
```

- [ ] **Step 7: Add the reject DTO and extend the response DTOs**

```typescript
// apps/backend/src/modules/admin/presentation/dto/reject-organization.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  reason: string;
}
```

```typescript
// apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts — replace the two organization DTOs:
export class AdminOrganizationItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['ACTIVE', 'LOCKED', 'PENDING_REVIEW', 'REJECTED'] })
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED';

  @ApiProperty()
  taxCode: string;

  @ApiProperty()
  taxCodeMatched: boolean;

  @ApiProperty({ type: String, nullable: true })
  taxCodeLookupName: string | null;

  @ApiProperty()
  createdAt: Date;
}

export function toAdminOrganizationItemResponse(
  organization: Organization,
): AdminOrganizationItemResponseDto {
  return {
    id: organization.id,
    name: organization.name,
    status: organization.status,
    taxCode: organization.taxCode,
    taxCodeMatched: organization.taxCodeMatched,
    taxCodeLookupName: organization.taxCodeLookupName,
    createdAt: organization.createdAt,
  };
}

export class AdminOrganizationsResponseDto {
  @ApiProperty({ type: [AdminOrganizationItemResponseDto] })
  items: AdminOrganizationItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class AdminOrganizationStatusResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED', 'PENDING_REVIEW', 'REJECTED'] })
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED';
}
```

(Keep every other DTO in the file — `AdminAiUsageItemResponseDto` through `AdminPendingInvitesPageResponseDto` — unchanged.)

- [ ] **Step 8: Add the controller endpoints**

```typescript
// apps/backend/src/modules/admin/presentation/admin.controller.ts
// 1. Update the listOrganizations handler's @Query type and pass status through:
  @Get('organizations')
  @ApiOperation({ summary: 'List organizations for Operators' })
  @ApiOkResponse({ type: AdminOrganizationsResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async listOrganizations(@Query() query: AdminOrganizationsQueryDto) {
    return this.listOrganizationsUseCase.execute({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

// 2. Add two new endpoints, placed after `unlock`:
  @Post('organizations/:id/approve')
  @ApiOperation({ summary: 'Approve an organization pending review' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ) {
    await this.approveOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'ACTIVE' as const };
  }

  @Post('organizations/:id/reject')
  @ApiOperation({ summary: 'Reject an organization pending review' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOrganizationDto,
    @Req() request: AdminRequest,
  ) {
    await this.rejectOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
      reason: dto.reason,
    });
    return { status: 'REJECTED' as const };
  }
```

Add the matching imports (`AdminOrganizationsQueryDto`, `RejectOrganizationDto`, `ApproveOrganizationUseCase`, `RejectOrganizationUseCase`) and constructor-inject `approveOrganizationUseCase`/`rejectOrganizationUseCase` next to `lockOrganizationUseCase`/`unlockOrganizationUseCase`.

- [ ] **Step 9: Wire the new use cases into `AdminModule`**

```typescript
// apps/backend/src/modules/admin/admin.module.ts — add to providers:
    ApproveOrganizationUseCase,
    RejectOrganizationUseCase,
```

with the matching imports. `MEMBER_NOTIFICATION_SENDER` is already exported by `AuthModule`, already imported into `AdminModule` — no new import needed there.

- [ ] **Step 10: Run the full admin suite and type-check**

Run: `npx jest --testPathPattern apps/backend/src/modules/admin`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/admin
git commit -m "feat: add operator endpoints to approve or reject pending organizations"
```

---

### Task 11: Verify, review, and finalize

- [ ] Run the full backend unit suite: `pnpm --filter @casso-ledger/backend test`
- [ ] Run the backend e2e suite (requires Docker): `pnpm --filter @casso-ledger/backend test:e2e`
- [ ] Run the type check: `npx tsc --noEmit`
- [ ] Run lint/format: `npx biome check --write .`
- [ ] Run `pnpm verify`
- [ ] Run the repository `domain-check` procedure and resolve any violations
- [ ] Run `/code-review` against `main`; fix any actionable Standards or Spec findings
- [ ] Inspect `git diff`/`git status`, then commit any leftover formatting fixes
- [ ] Update `docs/wayfinder/feature-map.md`: mark issue #245's entry `in-progress` → `done` once the PR is up, with the `Shipped:` date and PR reference (per `AGENTS.md`'s worktree workflow)
