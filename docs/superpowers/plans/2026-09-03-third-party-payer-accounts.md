# Third-Party Payer Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one bank account (a "payer") be linked to many customers within an organization, feed that into transaction matching as a signal only, and show payer vs. owning customer as distinct concepts in the Exception Queue — without a silent reassignment path.

**Architecture:** Evolve the existing `customer_bank_accounts` table from one-account-one-customer into an org-scoped many-to-many authorization link (`accountNumber` ↔ `customerId`) with per-link confirmation provenance. The matching engine resolves every customer linked to a transaction's counterparty account and unions their open receivables into the candidate set; an ambiguity guard blocks auto-match when two different customers both clear the threshold. The per-customer bank-account management UI gains an explicit cross-customer confirmation step. The Exception Queue read model gains a `payer` block.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16, Jest 30 (backend); React 19 + Vitest + Testing Library (frontend). Clean Architecture 4 layers per module.

## Global Constraints

- Money is integer VND; never float. (Not touched by this plan, but do not introduce float.)
- Every query/write is scoped by `organizationId` via `TenantContextService` / `BaseRepository` scoped helpers.
- Domain layer imports no NestJS/TypeORM. Application layer throws `AppError` only, never `HttpException`.
- Error shape `{ statusCode, errorCode, message, details? }`. `CONFLICT` → HTTP 409 (already mapped in `src/common/errors/status-by-error-code.ts`).
- File names kebab-case; classes PascalCase; enums/const UPPER_SNAKE_CASE.
- `import type` for pure types; value import for classes used in DI/decorators.
- Biome: single quotes, semicolons, 2-space indent, no trailing commas.
- TDD RED → GREEN → REFACTOR for every code change. Observe the failing test before writing production code.
- Response DTOs never leak `organizationId`, `version` (except the documented Exception Queue round-trip), internal user ids, or `confirmedByUserId`.
- Controllers carry `@ApiTags`; new/changed request fields get `@ApiProperty`; new response DTO classes live in `*.dto.ts` files as `class` (not interface).
- Vietnamese user-facing copy.
- Normalized account numbers everywhere: `normalizeOrThrow` (throws on invalid) in use cases, `normalizeAccountNumber` (pure) in repositories, `maskAccountNumber` for display — all in `apps/backend/src/modules/bank-accounts/application/account-number-normalizer.ts`.
- The existing DB unique index is named `UQ_customer_bank_accounts_org_account_number` (created by migration `20260810030000`).
- Commands: `npx jest <pattern>` (backend unit), `npx tsc --noEmit`, `pnpm --filter @casso-ar/frontend test` (frontend), `pnpm verify` (full gate), `/domain-check` (after backend changes).

---

## File Structure

**Backend — modify:**
- `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts` — add `confirmedByUserId` / `confirmedAt` to props + class.
- `apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts` — drop `(organizationId, accountNumber)` unique index, add partial-unique `(organizationId, accountNumber, customerId) WHERE isActive`, add two nullable columns.
- `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts` — `findByAccountNumber` → `findActiveByAccountNumber` (array), map the two new fields.
- `apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts` — port signature.
- `apps/backend/src/modules/bank-accounts/application/create-customer-bank-account.usecase.ts` — `acknowledgeExistingLinks`, cross-customer detection, set provenance.
- `apps/backend/src/modules/bank-accounts/presentation/customer-bank-account.dto.ts` — `acknowledgeExistingLinks?: boolean` + `@ApiProperty`.
- `apps/backend/src/modules/bank-accounts/presentation/customer-bank-accounts.controller.ts` — pass the flag through.
- `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts` — export `CUSTOMER_BANK_ACCOUNT_REPOSITORY`.
- `apps/backend/src/modules/webhooks/application/matching-engine.service.ts` — fan-out over linked customers.
- `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts` — auto-match ambiguity guard.
- `apps/backend/src/modules/webhooks/application/reprocess-webhook.usecase.ts` — same guard.
- `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts` — `payer` view.
- `apps/backend/src/modules/exception-queue/exception-queue.module.ts` — import `BankAccountsModule`.
- `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.ts` — `PayerResponseDto` + mapping.

**Backend — create:**
- `apps/backend/src/database/migrations/20260909000000-add-payer-link-columns-to-customer-bank-accounts.ts` (+ `.spec.ts`).

**Frontend — modify:**
- `apps/frontend/src/features/customers/types.ts` — `acknowledgeExistingLinks?` on `CreateCustomerBankAccountInput`.
- `apps/frontend/src/features/customers/api/customers-api.ts` — send the flag.
- `apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx` — cross-customer confirm step.
- `apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx` — description wording.
- `apps/frontend/src/features/exceptions/types.ts` — `Payer` + `payer` on `PendingReviewItem`.
- `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx` — payer/linked-customer rendering.
- `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx` — payer block in the processing header (if it renders a counterparty header).

**Frontend — modify tests alongside each component.**

**Docs:**
- `docs/wayfinder/feature-map.md` — Frontier entry.

---

## Task 1: Domain — confirmation provenance on `CustomerBankAccount`

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts`
- Test: `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.spec.ts`

**Interfaces:**
- Produces: `CustomerBankAccountProps` gains `confirmedByUserId: string | null` and `confirmedAt: Date | null`. `CustomerBankAccount` exposes both as `readonly`. Existing methods `deactivate()`, `setActive(isActive)`, `changeAccountNumber(accountNumber)` keep their signatures and now carry the two fields through unchanged.

- [ ] **Step 1: Write the failing test**

Add to `customer-bank-account.spec.ts`:

```typescript
it('carries confirmation provenance and preserves it across transitions', () => {
  const confirmedAt = new Date('2026-09-03T00:00:00.000Z');
  const account = new CustomerBankAccount({
    id: 'a1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    accountNumber: '0123456789',
    isActive: true,
    confirmedByUserId: 'user-1',
    confirmedAt,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  });

  expect(account.confirmedByUserId).toBe('user-1');
  expect(account.confirmedAt).toEqual(confirmedAt);

  const deactivated = account.deactivate();
  expect(deactivated.confirmedByUserId).toBe('user-1');
  expect(deactivated.confirmedAt).toEqual(confirmedAt);
  expect(deactivated.isActive).toBe(false);
});

it('allows null provenance for legacy rows', () => {
  const account = new CustomerBankAccount({
    id: 'a2',
    organizationId: 'org-1',
    customerId: 'cust-1',
    accountNumber: '0123456789',
    isActive: true,
    confirmedByUserId: null,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  expect(account.confirmedByUserId).toBeNull();
  expect(account.confirmedAt).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest customer-bank-account.spec --testPathPattern domain`
Expected: FAIL — `confirmedByUserId` is not a known property / type error.

- [ ] **Step 3: Write minimal implementation**

Replace the file contents of `customer-bank-account.ts`:

```typescript
export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  isActive: boolean;
  // A row is an authorization LINK between a customer and a third-party payer
  // account, not the customer's own account. The same accountNumber may appear
  // against multiple customerIds within one organization (issue #382).
  confirmedByUserId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerBankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly isActive: boolean;
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CustomerBankAccountProps) {
    Object.assign(this, props);
  }

  deactivate(): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      isActive: false,
      updatedAt: new Date(),
    });
  }

  setActive(isActive: boolean): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      isActive,
      updatedAt: new Date(),
    });
  }

  changeAccountNumber(accountNumber: string): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      accountNumber,
      updatedAt: new Date(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest customer-bank-account.spec --testPathPattern domain`
Expected: PASS. (Other files won't compile yet — that's fine; do not run `tsc` here.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts apps/backend/src/modules/bank-accounts/domain/customer-bank-account.spec.ts
git commit -m "feat: add confirmation provenance to CustomerBankAccount domain (#382)"
```

---

## Task 2: ORM entity — index swap + provenance columns

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts`

**Interfaces:**
- Produces: `CustomerBankAccountOrmEntity` gains `confirmedByUserId: string | null` and `confirmedAt: Date | null` columns. Class-level indexes: **remove** `@Index(['organizationId', 'accountNumber'], { unique: true })`; **keep** `@Index(['organizationId', 'accountNumber', 'isActive'])`; **add** a partial unique index declared via `@Index('UQ_customer_bank_accounts_org_account_customer', ['organizationId', 'accountNumber', 'customerId'], { unique: true, where: '"isActive"' })`.

- [ ] **Step 1: Write the implementation** (no separate unit test — schema shape is covered by the migration spec in Task 3 and the repository spec in Task 4)

Replace the file:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'customer_bank_accounts' })
@Index(['organizationId', 'accountNumber', 'isActive'])
@Index(
  'UQ_customer_bank_accounts_org_account_customer',
  ['organizationId', 'accountNumber', 'customerId'],
  { unique: true, where: '"isActive"' },
)
export class CustomerBankAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) customerId: string;
  @Column({ type: 'varchar' }) accountNumber: string;
  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'varchar', nullable: true })
  confirmedByUserId: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | grep customer-bank-account.orm-entity || echo "orm-entity clean"`
Expected: `orm-entity clean` (other files still red — expected until Task 4).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts
git commit -m "feat: widen customer_bank_accounts ORM entity to a payer link (#382)"
```

---

## Task 3: Migration

**Files:**
- Create: `apps/backend/src/database/migrations/20260909000000-add-payer-link-columns-to-customer-bank-accounts.ts`
- Test: `apps/backend/src/database/migrations/20260909000000-add-payer-link-columns-to-customer-bank-accounts.spec.ts`

**Interfaces:**
- Produces: migration class `AddPayerLinkColumnsToCustomerBankAccounts20260909000000` implementing `MigrationInterface` with `name = 'AddPayerLinkColumnsToCustomerBankAccounts20260909000000'`.

- [ ] **Step 1: Write the failing spec**

```typescript
import type { QueryRunner } from 'typeorm';
import { AddPayerLinkColumnsToCustomerBankAccounts20260909000000 } from './20260909000000-add-payer-link-columns-to-customer-bank-accounts';

describe('AddPayerLinkColumnsToCustomerBankAccounts20260909000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('drops the old org+account unique index, adds provenance columns, backfills, and adds the per-customer partial unique index', async () => {
    const { query, runner } = makeRunner();
    await new AddPayerLinkColumnsToCustomerBankAccounts20260909000000().up(
      runner,
    );

    const sql = query.mock.calls.map((call) => call[0] as string);
    expect(sql).toEqual([
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedByUserId" varchar',
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedAt" timestamptz',
      'UPDATE "customer_bank_accounts" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL',
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_customer" ON "customer_bank_accounts" ("organizationId", "accountNumber", "customerId") WHERE "isActive"',
    ]);
  });

  it('reverts the columns and indexes', async () => {
    const { query, runner } = makeRunner();
    await new AddPayerLinkColumnsToCustomerBankAccounts20260909000000().down(
      runner,
    );

    const sql = query.mock.calls.map((call) => call[0] as string);
    expect(sql).toEqual([
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_customer"',
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedAt"',
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedByUserId"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest 20260909000000-add-payer-link-columns`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayerLinkColumnsToCustomerBankAccounts20260909000000
  implements MigrationInterface
{
  name = 'AddPayerLinkColumnsToCustomerBankAccounts20260909000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // A payer account may now be linked to more than one customer, so the
    // (organizationId, accountNumber) pair is no longer unique.
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedByUserId" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedAt" timestamptz',
    );
    // Existing rows were deliberately created by a user through the management
    // UI, so treat them as confirmed at creation time. The acting user is
    // unknown for legacy rows, so confirmedByUserId stays NULL.
    await queryRunner.query(
      'UPDATE "customer_bank_accounts" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL',
    );
    // A customer still cannot have the same active payer account linked twice.
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_customer" ON "customer_bank_accounts" ("organizationId", "accountNumber", "customerId") WHERE "isActive"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_customer"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedByUserId"',
    );
    // Recreating the old unique index fails if a payer account is already
    // linked to more than one customer. This is a forward-only rollout.
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest 20260909000000-add-payer-link-columns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260909000000-add-payer-link-columns-to-customer-bank-accounts.ts apps/backend/src/database/migrations/20260909000000-add-payer-link-columns-to-customer-bank-accounts.spec.ts
git commit -m "feat: migration for payer-link columns and index swap (#382)"
```

---

## Task 4: Repository — `findActiveByAccountNumber` (array) + provenance mapping

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts`
- Test: `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.spec.ts`

**Interfaces:**
- Consumes: `CustomerBankAccount` with `confirmedByUserId` / `confirmedAt` (Task 1); `CustomerBankAccountOrmEntity` with the new columns (Task 2).
- Produces: `ICustomerBankAccountRepository` — `findByAccountNumber` is **removed**; `findActiveByAccountNumber(accountNumber: string): Promise<CustomerBankAccount[]>` is **added** (active links only, tenant-scoped, ordered `createdAt DESC`). `findByCustomerId`, `findById`, `save(account, manager?)` unchanged in signature.

- [ ] **Step 1: Write the failing test**

The repo spec uses testcontainers Postgres. Add:

```typescript
it('findActiveByAccountNumber returns every active link across customers in the org', async () => {
  // helper `saveRow` inserts a CustomerBankAccount via the repository under test
  await saveRow({ customerId: 'cust-1', accountNumber: '0123456789', isActive: true });
  await saveRow({ customerId: 'cust-2', accountNumber: '0123456789', isActive: true });
  await saveRow({ customerId: 'cust-3', accountNumber: '0123456789', isActive: false });

  const links = await repository.findActiveByAccountNumber('0123456789');

  expect(links.map((l) => l.customerId).sort()).toEqual(['cust-1', 'cust-2']);
  expect(links.every((l) => l.isActive)).toBe(true);
});

it('findActiveByAccountNumber is organization-scoped', async () => {
  await saveRow({ customerId: 'cust-1', accountNumber: '0123456789', isActive: true });
  // switch tenant context to another org, then:
  const links = await repositoryForOtherOrg.findActiveByAccountNumber('0123456789');
  expect(links).toEqual([]);
});

it('save round-trips confirmation provenance', async () => {
  const confirmedAt = new Date('2026-09-03T00:00:00.000Z');
  await saveRow({
    customerId: 'cust-1',
    accountNumber: '0123456789',
    isActive: true,
    confirmedByUserId: 'user-9',
    confirmedAt,
  });
  const [link] = await repository.findActiveByAccountNumber('0123456789');
  expect(link.confirmedByUserId).toBe('user-9');
  expect(link.confirmedAt).toEqual(confirmedAt);
});
```

Match the existing spec's fixture/helper style (look at the current file for how it builds `repository`, tenant context, and inserts rows). If the current spec has no `saveRow` helper, add one that calls `repository.save(new CustomerBankAccount({ ...defaults, ...overrides }))`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest typeorm-customer-bank-account.repository.spec`
Expected: FAIL — `findActiveByAccountNumber` is not a function / provenance undefined.

- [ ] **Step 3: Update the port**

`customer-bank-account-repository.port.ts`:

```typescript
import type { EntityManager } from 'typeorm';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

export interface ICustomerBankAccountRepository {
  findActiveByAccountNumber(
    accountNumber: string,
  ): Promise<CustomerBankAccount[]>;
  findByCustomerId(customerId: string): Promise<CustomerBankAccount[]>;
  findById(id: string): Promise<CustomerBankAccount | null>;
  save(account: CustomerBankAccount, manager?: EntityManager): Promise<void>;
}

export const CUSTOMER_BANK_ACCOUNT_REPOSITORY = Symbol(
  'CUSTOMER_BANK_ACCOUNT_REPOSITORY',
);
```

- [ ] **Step 4: Update the repository**

In `typeorm-customer-bank-account.repository.ts`:

1. Add the two fields to `CUSTOMER_BANK_ACCOUNT_SELECT`:

```typescript
const CUSTOMER_BANK_ACCOUNT_SELECT = {
  id: true,
  organizationId: true,
  customerId: true,
  accountNumber: true,
  isActive: true,
  confirmedByUserId: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies FindOptionsSelect<CustomerBankAccountOrmEntity>;
```

2. `toOrm` / `toDomain` — carry the two fields:

```typescript
function toOrm(account: CustomerBankAccount): CustomerBankAccountOrmEntity {
  return {
    id: account.id,
    organizationId: account.organizationId,
    customerId: account.customerId,
    accountNumber: account.accountNumber,
    isActive: account.isActive,
    confirmedByUserId: account.confirmedByUserId,
    confirmedAt: account.confirmedAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toDomain(row: CustomerBankAccountOrmEntity): CustomerBankAccount {
  return new CustomerBankAccount({
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    accountNumber: row.accountNumber,
    isActive: row.isActive,
    confirmedByUserId: row.confirmedByUserId,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
```

3. Replace `findByAccountNumber` with:

```typescript
async findActiveByAccountNumber(
  accountNumber: string,
): Promise<CustomerBankAccount[]> {
  const rows = await this.scopedFindMany(
    {
      accountNumber: normalizeAccountNumber(accountNumber),
      isActive: true,
    },
    {
      select: CUSTOMER_BANK_ACCOUNT_SELECT,
      order: { createdAt: 'DESC' },
    },
  );
  return rows.map(toDomain);
}
```

Leave `save` (unique-violation → `CONFLICT`), `findByCustomerId`, `findById` as they are.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest typeorm-customer-bank-account.repository.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.spec.ts
git commit -m "feat: findActiveByAccountNumber returns all active payer links (#382)"
```

---

## Task 5: Create use case — cross-customer confirmation

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/application/create-customer-bank-account.usecase.ts`
- Test: `apps/backend/src/modules/bank-accounts/application/customer-bank-account.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICustomerBankAccountRepository.findActiveByAccountNumber` (Task 4); `ICustomerRepository.findByIds` (already used elsewhere — batch name lookup) or `findNameById`. Check the port for the exact method; the existing matching engine uses `customerRepo.findByIds([...ids])` returning a `Map<string, { name }>` and `findNameById`. Use whichever the port exposes.
- Produces: `CreateCustomerBankAccountInput` gains `acknowledgeExistingLinks?: boolean` and `confirmedByUserId: string` (the acting user — the controller already has `req.user`). The use case sets `confirmedByUserId` and `confirmedAt: new Date()` on every created link.

- [ ] **Step 1: Write the failing tests**

Add to `customer-bank-account.usecase.spec.ts` (mock repos with `jest.fn()`):

```typescript
describe('CreateCustomerBankAccountUseCase — cross-customer links', () => {
  it('rejects a link when the account is active on another customer and the caller has not acknowledged', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-other', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({ id: 'cust-1', name: 'Cong ty A' });
    customerRepo.findByIds.mockResolvedValue(
      new Map([['cust-other', { name: 'Cong ty B' }]]),
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0123456789',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
      details: { linkedCustomerNames: ['Cong ty B'] },
    });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('creates the link when acknowledged, stamping confirmation provenance', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-other', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({ id: 'cust-1', name: 'Cong ty A' });

    const created = await useCase.execute({
      customerId: 'cust-1',
      accountNumber: '0123456789',
      acknowledgeExistingLinks: true,
      confirmedByUserId: 'user-1',
    });

    expect(created.customerId).toBe('cust-1');
    expect(created.confirmedByUserId).toBe('user-1');
    expect(created.confirmedAt).toBeInstanceOf(Date);
    expect(bankAccountRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a second active link for the SAME customer regardless of the flag', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
      makeLink({ customerId: 'cust-1', accountNumber: '0123456789' }),
    ]);
    customerRepo.findById.mockResolvedValue({ id: 'cust-1', name: 'Cong ty A' });

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        accountNumber: '0123456789',
        acknowledgeExistingLinks: true,
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(bankAccountRepo.save).not.toHaveBeenCalled();
  });

  it('creates a plain link with provenance when the account is unknown', async () => {
    bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([]);
    customerRepo.findById.mockResolvedValue({ id: 'cust-1', name: 'Cong ty A' });

    const created = await useCase.execute({
      customerId: 'cust-1',
      accountNumber: '0123456789',
      confirmedByUserId: 'user-1',
    });

    expect(created.confirmedByUserId).toBe('user-1');
    expect(bankAccountRepo.save).toHaveBeenCalledTimes(1);
  });
});
```

`makeLink` builds a `CustomerBankAccount` with sensible defaults + overrides. Reuse or add it near the top of the spec.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest customer-bank-account.usecase.spec`
Expected: FAIL — old code calls `findByAccountNumber` and has no acknowledgement / provenance.

- [ ] **Step 3: Rewrite the use case**

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import { CustomerBankAccount } from '../domain/customer-bank-account';
import { normalizeOrThrow } from './account-number-normalizer';
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from './customer-bank-account-repository.port';

export interface CreateCustomerBankAccountInput {
  customerId: string;
  accountNumber: string;
  confirmedByUserId: string;
  acknowledgeExistingLinks?: boolean;
}

@Injectable()
export class CreateCustomerBankAccountUseCase {
  constructor(
    @Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
    private readonly bankAccountRepo: ICustomerBankAccountRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: CreateCustomerBankAccountInput,
  ): Promise<CustomerBankAccount> {
    return this.dataSource.transaction((manager: EntityManager) =>
      this.createWithinTransaction(input, manager),
    );
  }

  private async createWithinTransaction(
    input: CreateCustomerBankAccountInput,
    manager: EntityManager,
  ): Promise<CustomerBankAccount> {
    const customer = await this.customerRepo.findById(input.customerId, manager);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }

    const accountNumber = normalizeOrThrow(input.accountNumber);
    const activeLinks =
      await this.bankAccountRepo.findActiveByAccountNumber(accountNumber);

    if (activeLinks.some((link) => link.customerId === customer.id)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Số tài khoản ngân hàng đã được liên kết.',
      );
    }

    const otherCustomerIds = [
      ...new Set(activeLinks.map((link) => link.customerId)),
    ];
    if (otherCustomerIds.length > 0 && input.acknowledgeExistingLinks !== true) {
      const names = await this.customerRepo.findByIds(otherCustomerIds);
      throw new AppError(
        ErrorCode.CONFLICT,
        'Số tài khoản này đang liên kết với khách hàng khác.',
        {
          linkedCustomerNames: otherCustomerIds
            .map((id) => names.get(id)?.name)
            .filter((name): name is string => Boolean(name)),
        },
      );
    }

    const now = new Date();
    const account = new CustomerBankAccount({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      customerId: customer.id,
      accountNumber,
      isActive: true,
      confirmedByUserId: input.confirmedByUserId,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.bankAccountRepo.save(account, manager);
    return account;
  }
}
```

> If `ICustomerRepository` has no `findByIds` returning a name map, use `findNameById` in a `Promise.all` loop over `otherCustomerIds` instead — check the port before implementing.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest customer-bank-account.usecase.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/application/create-customer-bank-account.usecase.ts apps/backend/src/modules/bank-accounts/application/customer-bank-account.usecase.spec.ts
git commit -m "feat: explicit confirmation for cross-customer payer links (#382)"
```

---

## Task 6: DTO + controller — `acknowledgeExistingLinks`

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-account.dto.ts`
- Modify: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-accounts.controller.ts`
- Test: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-accounts.controller.spec.ts`

**Interfaces:**
- Consumes: `CreateCustomerBankAccountUseCase.execute` now needs `confirmedByUserId` and optional `acknowledgeExistingLinks` (Task 5).
- Produces: `CreateCustomerBankAccountDto` gains `acknowledgeExistingLinks?: boolean`. The controller passes `confirmedByUserId: req.user.id` (or whatever the auth request shape exposes — check a sibling controller for the exact accessor, e.g. `@CurrentUser()` or `req.user.sub`).

- [ ] **Step 1: Write the failing test**

Add to `customer-bank-accounts.controller.spec.ts`:

```typescript
it('forwards acknowledgeExistingLinks and the acting user to the create use case', async () => {
  createUseCase.execute.mockResolvedValue(makeAccount());

  await controller.create(
    'cust-1',
    { accountNumber: '0123456789', acknowledgeExistingLinks: true },
    fakeRequestWithUser('user-7'),
  );

  expect(createUseCase.execute).toHaveBeenCalledWith({
    customerId: 'cust-1',
    accountNumber: '0123456789',
    acknowledgeExistingLinks: true,
    confirmedByUserId: 'user-7',
  });
});
```

Match the spec file's existing controller-construction and request-mock helpers.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest customer-bank-accounts.controller.spec`
Expected: FAIL — controller does not pass the new fields.

- [ ] **Step 3: Update the DTO**

```typescript
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerBankAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Xác nhận vẫn liên kết số tài khoản này dù nó đang thuộc khách hàng khác.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeExistingLinks?: boolean;
}

export class UpdateCustomerBankAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 4: Update the controller**

In the `create` handler, build the use-case input with the new fields. Example shape (adapt to the real handler signature and user accessor):

```typescript
return toCustomerBankAccountResponse(
  await this.createUseCase.execute({
    customerId,
    accountNumber: body.accountNumber,
    acknowledgeExistingLinks: body.acknowledgeExistingLinks,
    confirmedByUserId: user.id,
  }),
);
```

Add `@ApiErrorResponse(ErrorCode.CONFLICT)` to the `create` operation if it is not already listed.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest customer-bank-accounts.controller.spec`
Expected: PASS.

- [ ] **Step 6: Type-check the module**

Run: `npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | grep -E "bank-accounts/" || echo "bank-accounts clean"`
Expected: `bank-accounts clean`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/presentation/
git commit -m "feat: acknowledgeExistingLinks on create bank-account endpoint (#382)"
```

---

## Task 7: Export the repository token from `BankAccountsModule`

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts`

**Interfaces:**
- Produces: `BankAccountsModule` adds `CUSTOMER_BANK_ACCOUNT_REPOSITORY` to its `exports` so `ExceptionQueueModule` can consume it (Task 9). No behavior change.

- [ ] **Step 1: Add the export**

In `bank-accounts.module.ts`, add an `exports` array (or extend the existing one) containing `CUSTOMER_BANK_ACCOUNT_REPOSITORY`.

- [ ] **Step 2: Verify the app module still boots in tests**

Run: `npx jest bank-accounts --testPathPattern "module|controller"`
Expected: PASS (or no matching module test — then just `npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | grep bank-accounts.module || echo clean`).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/bank-accounts/bank-accounts.module.ts
git commit -m "chore: export CUSTOMER_BANK_ACCOUNT_REPOSITORY from BankAccountsModule (#382)"
```

---

## Task 8: Matching engine — fan-out over linked customers

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`
- Test: `apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts`

**Interfaces:**
- Consumes: `ICustomerBankAccountRepository.findActiveByAccountNumber(accountNumber): Promise<CustomerBankAccount[]>` (Task 4).
- Produces: `scoreCandidates(transaction, organizationId)` unchanged signature and `ScoredCandidate[]` return shape. The constructor's `Pick<ICustomerBankAccountRepository, 'findByAccountNumber' | 'save'>` becomes `Pick<…, 'findActiveByAccountNumber' | 'save'>`.

- [ ] **Step 1: Write the failing tests**

Add to `matching-engine.service.spec.ts` (this file already mocks all repos — follow its existing `makeService` / mock style):

```typescript
it('unions open receivables across every customer linked to the payer account', async () => {
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
    link({ customerId: 'cust-1', accountNumber: '999' }),
    link({ customerId: 'cust-2', accountNumber: '999' }),
  ]);
  receivableRepo.findOpenByCustomerId.mockImplementation((id: string) =>
    Promise.resolve(id === 'cust-1' ? [openReceivable('r1', 'cust-1')] : [openReceivable('r2', 'cust-2')]),
  );

  const scored = await service.scoreCandidates(
    txn({ counterpartyAccountNumber: '999' }),
    'org-1',
  );

  expect(scored.map((c) => c.receivableId).sort()).toEqual(['r1', 'r2']);
  expect(scored.every((c) => c.customerBankAccountScore === 10)).toBe(true);
  expect(receivableRepo.findOpenTopNByOrganization).not.toHaveBeenCalled();
});

it('still scopes to the single linked customer when only one link exists', async () => {
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
    link({ customerId: 'cust-1', accountNumber: '999' }),
  ]);
  receivableRepo.findOpenByCustomerId.mockResolvedValue([openReceivable('r1', 'cust-1')]);

  const scored = await service.scoreCandidates(txn({ counterpartyAccountNumber: '999' }), 'org-1');

  expect(scored.map((c) => c.receivableId)).toEqual(['r1']);
  expect(receivableRepo.findOpenByCustomerId).toHaveBeenCalledWith('cust-1');
});

it('scores a third-party payer whose name differs from the linked customer', async () => {
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
    link({ customerId: 'cust-1', accountNumber: '999' }),
  ]);
  receivableRepo.findOpenByCustomerId.mockResolvedValue([openReceivable('r1', 'cust-1')]);
  customerRepo.findNameById.mockResolvedValue('Cong ty A');

  const [candidate] = await service.scoreCandidates(
    txn({ counterpartyAccountNumber: '999', counterpartyName: 'NGUYEN VAN B' }),
    'org-1',
  );

  expect(candidate.customerBankAccountScore).toBe(10); // account signal holds
  expect(candidate.customerId).toBe('cust-1'); // no mismatch rejection here
});

it('falls back to the org-wide scan when the payer account is unknown', async () => {
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([]);
  receivableRepo.findOpenTopNByOrganization.mockResolvedValue([openReceivable('r9', 'cust-9')]);

  const scored = await service.scoreCandidates(txn({ counterpartyAccountNumber: '404' }), 'org-1');

  expect(receivableRepo.findOpenTopNByOrganization).toHaveBeenCalled();
  expect(scored.map((c) => c.receivableId)).toEqual(['r9']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest matching-engine.service.spec`
Expected: FAIL — `findActiveByAccountNumber` not mocked / not called.

- [ ] **Step 3: Implement the fan-out**

In `matching-engine.service.ts`:

1. Constructor type:

```typescript
private readonly bankAccountRepo: Pick<
  ICustomerBankAccountRepository,
  'findActiveByAccountNumber' | 'save'
>,
```

2. In `scoreCandidates`, replace the single lookup block:

```typescript
const links = await this.bankAccountRepo.findActiveByAccountNumber(
  transaction.counterpartyAccountNumber,
);
const linkedCustomerIds = new Set(links.map((link) => link.customerId));
const accountIsKnown = linkedCustomerIds.size > 0;

let receivables: Receivable[];
if (accountIsKnown) {
  const perCustomer = await Promise.all(
    [...linkedCustomerIds].map((id) =>
      this.receivableRepo.findOpenByCustomerId(id),
    ),
  );
  const byId = new Map<string, Receivable>();
  for (const receivable of perCustomer.flat()) {
    byId.set(receivable.id, receivable);
  }
  receivables = [...byId.values()];
} else {
  receivables = await this.receivableRepo.findOpenTopNByOrganization(
    organizationId,
    ORG_WIDE_SCAN_LIMIT,
    transaction.transactionDateTime,
  );
}
```

3. Reference-code fallback resolution (`resolveCustomerByReferenceCode`) still runs only when `!accountIsKnown`. Keep its existing behavior; when it resolves a `customerId`, re-fetch that customer's receivables and add its id to `linkedCustomerIds` so the per-candidate scoring below treats it as known:

```typescript
if (!accountIsKnown) {
  const resolvedId = this.resolveCustomerByReferenceCode(
    transaction.transferContent,
    receivables,
    invoiceByReceivableId,
  );
  if (resolvedId) {
    linkedCustomerIds.add(resolvedId);
    receivables = await this.receivableRepo.findOpenByCustomerId(resolvedId);
    invoiceByReceivableId = await this.findInvoicesByReceivableIds(
      receivables.map((r) => r.id),
    );
  }
}
```

4. Customer-name map: build it for **every** `customerId` present in `receivables` (the current code special-cases a single `customerId`). Use the existing `customerRepo.findByIds([...new Set(receivables.map((r) => r.customerId))])` branch for all cases.

5. Per-candidate scoring — replace the `customerId ? … : 0` gates with membership checks:

```typescript
const inLinkedSet = linkedCustomerIds.has(receivable.customerId);
const accountScore = inLinkedSet
  ? customerBankAccountScore(transaction.counterpartyAccountNumber, [
      transaction.counterpartyAccountNumber,
    ])
  : 0;
const payer = inLinkedSet
  ? payerNameScore(
      transaction.counterpartyName,
      customerNames.get(receivable.customerId) ?? '',
    )
  : 0;
const timing = inLinkedSet
  ? timingScore(transaction.transactionDateTime, receivable.dueDate)
  : 0;
```

6. `referenceCodeScore` and `amountScore` are unchanged. `totalScore`, sort, and `toMatchingCandidateEntities` are unchanged.

Remove the now-unused `knownAccountNumber` / single-`customerId` / single-`customerName` locals.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest matching-engine.service.spec`
Expected: PASS (all existing cases in the file included).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/matching-engine.service.ts apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts
git commit -m "feat: matching engine fans out over linked payer customers (#382)"
```

---

## Task 9: Auto-match ambiguity guard

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/reprocess-webhook.usecase.ts`
- Test: `apps/backend/src/modules/webhooks/application/process-webhook.usecase.spec.ts`
- Test: `apps/backend/src/modules/webhooks/application/reprocess-webhook.usecase.spec.ts`

**Interfaces:**
- Consumes: `MatchingEngineService.scoreCandidates` returning `ScoredCandidate[]` (each with `customerId`, `totalScore`).
- Produces: no signature change. New internal rule: auto-match only when `top.totalScore >= AUTO_MATCH_THRESHOLD` **and** no other candidate with a different `customerId` also has `totalScore >= AUTO_MATCH_THRESHOLD`.

- [ ] **Step 1: Write the failing test** (`process-webhook.usecase.spec.ts`)

```typescript
it('routes to PENDING_REVIEW when two different customers both clear the auto-match threshold', async () => {
  matchingEngine.scoreCandidates.mockResolvedValue([
    scored({ receivableId: 'r1', customerId: 'cust-1', totalScore: 95 }),
    scored({ receivableId: 'r2', customerId: 'cust-2', totalScore: 92 }),
  ]);

  await useCase.execute(job);

  expect(transactionRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'PENDING_REVIEW' }),
    expect.anything(),
  );
  expect(paymentRepo.save).not.toHaveBeenCalled();
});

it('still auto-matches when the second-best candidate is the same customer', async () => {
  matchingEngine.scoreCandidates.mockResolvedValue([
    scored({ receivableId: 'r1', customerId: 'cust-1', totalScore: 95 }),
    scored({ receivableId: 'r2', customerId: 'cust-1', totalScore: 91 }),
  ]);

  await useCase.execute(job);

  expect(paymentRepo.save).toHaveBeenCalledTimes(1);
});
```

Match the file's existing mock/fixture helpers (`scored`, `job`, repo mocks). If the spec has no `scored` helper, add one returning a `ScoredCandidate`-shaped object with all five sub-scores set to 0 except `totalScore`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest process-webhook.usecase.spec`
Expected: FAIL — currently auto-matches on `top.totalScore >= 90` alone.

- [ ] **Step 3: Implement the guard** (both use cases, identical change)

Where `top` is computed (`const top = candidates[0];`), add:

```typescript
const clearedThreshold = candidates.filter(
  (candidate) => candidate.totalScore >= AUTO_MATCH_THRESHOLD,
);
const ambiguousAcrossCustomers =
  !!top &&
  clearedThreshold.some(
    (candidate) => candidate.customerId !== top.customerId,
  );
const canAutoMatch =
  !!top &&
  top.totalScore >= AUTO_MATCH_THRESHOLD &&
  !ambiguousAcrossCustomers;
```

Then change the branch condition from `if (top && top.totalScore >= AUTO_MATCH_THRESHOLD)` to `if (canAutoMatch)`. The `else if (top && top.totalScore >= EXCEPTION_QUEUE_THRESHOLD)` branch already handles the fall-through to `PENDING_REVIEW`; the AI-recommendation eligibility check (`>= EXCEPTION_QUEUE_THRESHOLD && < AUTO_MATCH_THRESHOLD`) is left as-is — an ambiguous double-`>=90` transaction will not get an AI recommendation, which is acceptable (it is an unusual case and a human is reviewing it).

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest "process-webhook.usecase.spec|reprocess-webhook.usecase.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts apps/backend/src/modules/webhooks/application/reprocess-webhook.usecase.ts apps/backend/src/modules/webhooks/application/process-webhook.usecase.spec.ts apps/backend/src/modules/webhooks/application/reprocess-webhook.usecase.spec.ts
git commit -m "feat: block auto-match when linked payer customers are ambiguous (#382)"
```

---

## Task 10: Exception Queue query service — `payer` view

**Files:**
- Modify: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`
- Modify: `apps/backend/src/modules/exception-queue/exception-queue.module.ts`
- Test: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.spec.ts`

**Interfaces:**
- Consumes: `ICustomerBankAccountRepository.findActiveByAccountNumber` (Task 4), exported from `BankAccountsModule` (Task 7); `ICustomerRepository.findByIds` for names.
- Produces: `UnmatchedBankTransactionView` gains `payer: PayerView`. `PayerView = { accountNumberMasked: string; name: string; linkedCustomers: { customerId: string; customerName: string }[] }`. Exported from this service file.

- [ ] **Step 1: Write the failing test**

Add to `unmatched-bank-transactions-query.service.spec.ts` (follow its existing mock wiring; add a `bankAccountRepo` mock with `findActiveByAccountNumber: jest.fn()`):

```typescript
it('attaches a payer view with linked customers for each transaction', async () => {
  bankTransactionRepo.findManyByStatus.mockResolvedValue([
    bankTransaction({ id: 't1', counterpartyAccountNumber: '0123456789', counterpartyName: 'NGUYEN VAN A' }),
  ]);
  bankTransactionRepo.countByStatus.mockResolvedValue(1);
  matchingCandidateRepo.findTopByBankTransactionIds.mockResolvedValue(new Map());
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([
    link({ customerId: 'cust-1', accountNumber: '0123456789' }),
    link({ customerId: 'cust-2', accountNumber: '0123456789' }),
  ]);
  customerRepo.findByIds.mockResolvedValue(
    new Map([
      ['cust-1', { name: 'Cong ty A' }],
      ['cust-2', { name: 'Cong ty B' }],
    ]),
  );

  const page = await service.execute(1, 20);

  expect(page.items[0].payer).toEqual({
    accountNumberMasked: expect.stringContaining('6789'),
    name: 'NGUYEN VAN A',
    linkedCustomers: [
      { customerId: 'cust-1', customerName: 'Cong ty A' },
      { customerId: 'cust-2', customerName: 'Cong ty B' },
    ],
  });
});

it('returns an empty linkedCustomers array for an unknown payer account', async () => {
  bankTransactionRepo.findManyByStatus.mockResolvedValue([
    bankTransaction({ id: 't1', counterpartyAccountNumber: '404', counterpartyName: 'UNKNOWN' }),
  ]);
  bankTransactionRepo.countByStatus.mockResolvedValue(1);
  matchingCandidateRepo.findTopByBankTransactionIds.mockResolvedValue(new Map());
  bankAccountRepo.findActiveByAccountNumber.mockResolvedValue([]);

  const page = await service.execute(1, 20);

  expect(page.items[0].payer.linkedCustomers).toEqual([]);
  expect(page.items[0].payer.name).toBe('UNKNOWN');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest unmatched-bank-transactions-query.service.spec`
Expected: FAIL — no `payer` on the view, `bankAccountRepo` not injected.

- [ ] **Step 3: Wire the module**

`exception-queue.module.ts`: add `BankAccountsModule` to `imports`.

- [ ] **Step 4: Implement the payer view**

In the service:

1. Import the token + type and `maskAccountNumber`:

```typescript
import {
  CUSTOMER_BANK_ACCOUNT_REPOSITORY,
  type ICustomerBankAccountRepository,
} from '../../bank-accounts/application/customer-bank-account-repository.port';
import { maskAccountNumber } from '../../bank-accounts/application/account-number-normalizer';
```

2. Add the constructor dependency:

```typescript
@Inject(CUSTOMER_BANK_ACCOUNT_REPOSITORY)
private readonly bankAccountRepo: Pick<
  ICustomerBankAccountRepository,
  'findActiveByAccountNumber'
>,
```

3. Export the view type and extend `UnmatchedBankTransactionView`:

```typescript
export interface PayerView {
  accountNumberMasked: string;
  name: string;
  linkedCustomers: { customerId: string; customerName: string }[];
}

export interface UnmatchedBankTransactionView {
  transaction: BankTransaction;
  topCandidate: MatchingCandidateView | null;
  aiRecommendation: AiMatchingRecommendationView | null;
  payer: PayerView;
}
```

4. In `execute`, after `pageTransactions` is known, resolve payer links once per page:

```typescript
const linksByAccount = new Map<string, { customerId: string }[]>();
await Promise.all(
  [
    ...new Set(
      pageTransactions
        .map((t) => t.counterpartyAccountNumber)
        .filter((n): n is string => Boolean(n)),
    ),
  ].map(async (accountNumber) => {
    linksByAccount.set(
      accountNumber,
      await this.bankAccountRepo.findActiveByAccountNumber(accountNumber),
    );
  }),
);
const payerCustomerIds = [
  ...new Set(
    [...linksByAccount.values()].flat().map((link) => link.customerId),
  ),
];
const payerCustomerNames =
  payerCustomerIds.length > 0
    ? await this.customerRepo.findByIds(payerCustomerIds)
    : new Map<string, { name: string }>();
```

5. When building each item's view, add:

```typescript
payer: {
  accountNumberMasked: transaction.counterpartyAccountNumber
    ? maskAccountNumber(transaction.counterpartyAccountNumber)
    : '',
  name: transaction.counterpartyName ?? '',
  linkedCustomers: (
    linksByAccount.get(transaction.counterpartyAccountNumber ?? '') ?? []
  ).map((link) => ({
    customerId: link.customerId,
    customerName: payerCustomerNames.get(link.customerId)?.name ?? '',
  })),
},
```

> Confirm the exact `customerRepo.findByIds` return shape from the port (`Map<string, Customer>` vs `Map<string, { name }>`); adapt the `.name` accessor accordingly. The matching engine already uses this method — copy its usage.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest unmatched-bank-transactions-query.service.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.spec.ts apps/backend/src/modules/exception-queue/exception-queue.module.ts
git commit -m "feat: Exception Queue query service exposes a payer view (#382)"
```

---

## Task 11: Exception Queue response DTO — `PayerResponseDto`

**Files:**
- Modify: `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.ts`
- Test: `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.spec.ts`

**Interfaces:**
- Consumes: `UnmatchedBankTransactionView.payer: PayerView` (Task 10).
- Produces: `UnmatchedBankTransactionResponseDto.payer: PayerResponseDto`; new classes `PayerResponseDto { accountNumberMasked: string; name: string; linkedCustomers: PayerLinkedCustomerResponseDto[] }` and `PayerLinkedCustomerResponseDto { customerId: string; customerName: string }`, both `class`, both `@ApiProperty`-documented. `toUnmatchedItemResponse` maps `item.payer` straight through.

- [ ] **Step 1: Write the failing test**

Add to `exception-queue-response.dto.spec.ts`:

```typescript
it('maps the payer view including linked customers', () => {
  const response = toUnmatchedResponse({
    items: [
      {
        transaction: fakeBankTransaction(),
        topCandidate: null,
        aiRecommendation: null,
        payer: {
          accountNumberMasked: '••••6789',
          name: 'NGUYEN VAN A',
          linkedCustomers: [{ customerId: 'c1', customerName: 'Cong ty A' }],
        },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  });

  expect(response.items[0].payer).toEqual({
    accountNumberMasked: '••••6789',
    name: 'NGUYEN VAN A',
    linkedCustomers: [{ customerId: 'c1', customerName: 'Cong ty A' }],
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest exception-queue-response.dto.spec`
Expected: FAIL — `payer` missing from the mapped response / type error.

- [ ] **Step 3: Implement**

Add the classes and extend the response DTO + mapper:

```typescript
export class PayerLinkedCustomerResponseDto {
  @ApiProperty({ type: String })
  customerId: string;
  @ApiProperty({ type: String })
  customerName: string;
}

export class PayerResponseDto {
  @ApiProperty({ type: String })
  accountNumberMasked: string;
  @ApiProperty({ type: String })
  name: string;
  @ApiProperty({ type: [PayerLinkedCustomerResponseDto] })
  linkedCustomers: PayerLinkedCustomerResponseDto[];
}
```

In `UnmatchedBankTransactionResponseDto` add:

```typescript
@ApiProperty({ type: PayerResponseDto })
payer: PayerResponseDto;
```

In `toUnmatchedItemResponse` add `payer: item.payer,` to the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest exception-queue-response.dto.spec`
Expected: PASS.

- [ ] **Step 5: Type-check + arch-check the backend**

Run: `npx tsc --noEmit -p apps/backend/tsconfig.json && node scripts/check-controller-docs.mjs`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/exception-queue/presentation/dto/
git commit -m "feat: PayerResponseDto on the Exception Queue read model (#382)"
```

---

## Task 12: Backend full unit run + `/domain-check`

**Files:** none (verification task).

- [ ] **Step 1: Run the full backend unit suite**

Run: `npx jest --selectProjects 2>/dev/null || npx jest`
Expected: all pass. Fix any fallout in the modules this plan touched.

- [ ] **Step 2: Run domain-check**

Run the `/domain-check` skill (`.claude/skills/domain-check.md`). Fix any tenant-scope / layering violations it reports.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: backend suite + domain-check green for payer accounts (#382)"
```

(Skip the commit if nothing changed.)

---

## Task 13: Frontend — `acknowledgeExistingLinks` plumbing

**Files:**
- Modify: `apps/frontend/src/features/customers/types.ts`
- Modify: `apps/frontend/src/features/customers/api/customers-api.ts`
- Test: `apps/frontend/src/features/customers/api/customers-api.spec.ts`

**Interfaces:**
- Produces: `CreateCustomerBankAccountInput` gains `acknowledgeExistingLinks?: boolean`. `createCustomerBankAccount(customerId, input)` sends it in the POST body when present.

- [ ] **Step 1: Write the failing test**

Add to `customers-api.spec.ts`:

```typescript
it('sends acknowledgeExistingLinks when creating a bank account', async () => {
  postWithIdempotency.mockResolvedValue({ id: 'a1' });

  await createCustomerBankAccount('cust-1', {
    accountNumber: '0123456789',
    acknowledgeExistingLinks: true,
  });

  expect(postWithIdempotency).toHaveBeenCalledWith(
    '/api/v1/customers/cust-1/bank-accounts',
    { accountNumber: '0123456789', acknowledgeExistingLinks: true },
  );
});
```

Match the file's actual mock (`apiRequest` vs `postWithIdempotency`) and URL shape — check `customers-api.ts` first.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @casso-ar/frontend test -- customers-api.spec`
Expected: FAIL — flag not forwarded.

- [ ] **Step 3: Implement**

`types.ts`:

```typescript
export interface CreateCustomerBankAccountInput {
  accountNumber: string;
  acknowledgeExistingLinks?: boolean;
}
```

`customers-api.ts` — in `createCustomerBankAccount`, pass the whole `input` object through as the body (it likely already does; if it hand-picks `accountNumber`, change it to spread `input`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @casso-ar/frontend test -- customers-api.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/types.ts apps/frontend/src/features/customers/api/customers-api.ts apps/frontend/src/features/customers/api/customers-api.spec.ts
git commit -m "feat: forward acknowledgeExistingLinks from the FE API layer (#382)"
```

---

## Task 14: Frontend — cross-customer confirmation step in the dialog

**Files:**
- Modify: `apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx`
- Test: `apps/frontend/src/features/customers/components/customer-bank-account-dialog.spec.tsx`

**Interfaces:**
- Consumes: `useCreateCustomerBankAccount(customerId)` mutation (unchanged); `getApiErrorCode` / `getApiErrorMessage` from `@/lib/api-client`; the error `details.linkedCustomerNames: string[]` carried on a `CONFLICT` response.

- [ ] **Step 1: Write the failing test**

Add to `customer-bank-account-dialog.spec.tsx` (the file already mocks `@/lib/api-client`):

```typescript
it('shows a cross-customer confirmation and resubmits with acknowledgeExistingLinks', async () => {
  const conflict = {
    response: { data: { errorCode: 'CONFLICT', message: 'Số tài khoản này đang liên kết với khách hàng khác.', details: { linkedCustomerNames: ['Công ty B'] } } },
  };
  postWithIdempotency.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ id: 'a1' });

  render(<CustomerBankAccountDialog customerId="cust-1" open onOpenChange={() => {}} />, { wrapper });

  fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), { target: { value: '0123456789' } });
  fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByText(/đang liên kết với/i)).toBeInTheDocument();
  expect(screen.getByText('Công ty B')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /vẫn liên kết/i }));

  await waitFor(() => {
    expect(postWithIdempotency).toHaveBeenLastCalledWith(
      '/api/v1/customers/cust-1/bank-accounts',
      { accountNumber: '0123456789', acknowledgeExistingLinks: true },
    );
  });
});

it('keeps the plain inline hint for a same-customer conflict (no linkedCustomerNames)', async () => {
  postWithIdempotency.mockRejectedValueOnce({
    response: { data: { errorCode: 'CONFLICT', message: 'Số tài khoản ngân hàng đã được liên kết.' } },
  });

  render(<CustomerBankAccountDialog customerId="cust-1" open onOpenChange={() => {}} />, { wrapper });
  fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), { target: { value: '0123456789' } });
  fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('đã được liên kết');
  expect(screen.queryByRole('button', { name: /vẫn liên kết/i })).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @casso-ar/frontend test -- customer-bank-account-dialog.spec`
Expected: FAIL — no confirmation step.

- [ ] **Step 3: Implement**

In `customer-bank-account-dialog.tsx`:

1. Add `getApiErrorDetails` usage or read `error.response.data.details.linkedCustomerNames` via the existing narrowing helper. Add state:

```typescript
const [crossCustomerNames, setCrossCustomerNames] = useState<string[] | null>(null);
```

2. In `handleMutationError`, before the existing `setError`, check:

```typescript
const code = getApiErrorCode(mutationError);
const names =
  code === 'CONFLICT'
    ? (getApiErrorDetails(mutationError)?.linkedCustomerNames as string[] | undefined)
    : undefined;
if (names && names.length > 0) {
  setCrossCustomerNames(names);
  return;
}
```

If there is no `getApiErrorDetails` helper, add a tiny local narrower:

```typescript
function readLinkedCustomerNames(error: unknown): string[] | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const data = (error as { response?: { data?: { details?: { linkedCustomerNames?: unknown } } } }).response?.data?.details?.linkedCustomerNames;
  return Array.isArray(data) && data.every((n) => typeof n === 'string') ? (data as string[]) : undefined;
}
```

3. When `crossCustomerNames !== null`, render a confirmation block inside the dialog instead of the form body:

```tsx
{crossCustomerNames ? (
  <div className="space-y-4">
    <p className="text-sm">
      Số tài khoản này đang liên kết với: {crossCustomerNames.join(', ')}. Vẫn
      liên kết với khách hàng này?
    </p>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => setCrossCustomerNames(null)}>
        Hủy
      </Button>
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          createMutation.mutate(
            { accountNumber: accountNumber.trim(), acknowledgeExistingLinks: true },
            {
              onSuccess: () => handleMutationSuccess('Đã thêm tài khoản ngân hàng.'),
              onError: handleMutationError,
            },
          );
        }}
      >
        Vẫn liên kết
      </Button>
    </DialogFooter>
  </div>
) : (
  /* existing <form> ... */
)}
```

4. Reset `crossCustomerNames` to `null` in the existing `useEffect` that clears the form on open and in `handleOpenChange`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @casso-ar/frontend test -- customer-bank-account-dialog.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx apps/frontend/src/features/customers/components/customer-bank-account-dialog.spec.tsx
git commit -m "feat: cross-customer payer link confirmation in the dialog (#382)"
```

---

## Task 15: Frontend — card description wording

**Files:**
- Modify: `apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx`
- Test: `apps/frontend/src/features/customers/components/customer-bank-accounts-card.spec.tsx`

**Interfaces:** none (copy change).

- [ ] **Step 1: Write the failing test**

Add to `customer-bank-accounts-card.spec.tsx`:

```typescript
it('explains that one account may belong to several customers', async () => {
  useAuth.mockReturnValue({ user: { role: Role.OWNER } });
  apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

  renderCard();

  expect(
    await screen.findByText(/một tài khoản có thể thuộc nhiều khách hàng/i),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @casso-ar/frontend test -- customer-bank-accounts-card.spec`
Expected: FAIL.

- [ ] **Step 3: Implement**

In the `CardDescription` added by #381, append one sentence:

```
… hoặc hệ thống sẽ ghi nhớ sau khi bạn xác nhận một giao dịch khớp. Một tài
khoản có thể thuộc nhiều khách hàng (một bên trả hộ).
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @casso-ar/frontend test -- customer-bank-accounts-card.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx apps/frontend/src/features/customers/components/customer-bank-accounts-card.spec.tsx
git commit -m "feat: note multi-customer payer accounts on the card (#382)"
```

---

## Task 16: Frontend — payer block in the Exception Queue

**Files:**
- Modify: `apps/frontend/src/features/exceptions/types.ts`
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx` (only if it renders a counterparty header)
- Test: `apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx`

**Interfaces:**
- Consumes: `PendingReviewItem.payer` from the API.
- Produces: `types.ts` — `Payer { accountNumberMasked: string; name: string; linkedCustomers: { customerId: string; customerName: string }[] }` and `payer: Payer` on `PendingReviewItem`.

- [ ] **Step 1: Write the failing test**

Add to `exceptions-page.spec.tsx` (follow its fetch-mock style):

```typescript
it('shows the payer account and its linked customers, separate from the candidate', async () => {
  mockPendingReview({
    items: [
      {
        transaction: fakeTransaction({ counterpartyName: 'NGUYEN VAN A' }),
        topCandidate: fakeCandidate({ customerName: 'Công ty A' }),
        aiRecommendation: null,
        payer: {
          accountNumberMasked: '••••6789',
          name: 'NGUYEN VAN A',
          linkedCustomers: [
            { customerId: 'c1', customerName: 'Công ty A' },
            { customerId: 'c2', customerName: 'Công ty B' },
          ],
        },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  });

  renderPage();

  expect(await screen.findByText('••••6789')).toBeInTheDocument();
  expect(screen.getByText('Công ty B')).toBeInTheDocument(); // linked, not a candidate
  expect(screen.getByText(/người chuyển khoản/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @casso-ar/frontend test -- exceptions-page.spec`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. `types.ts`:

```typescript
export interface Payer {
  accountNumberMasked: string;
  name: string;
  linkedCustomers: { customerId: string; customerName: string }[];
}

export interface PendingReviewItem {
  transaction: BankTransaction;
  topCandidate: MatchingCandidate | null;
  aiRecommendation?: AiRecommendation | null;
  payer: Payer;
}
```

2. `exceptions-page.tsx` — in the counterparty `TableCell` (currently rendering `row.transaction.counterpartyName`), add below the name: the masked account in muted text, and, when `row.payer.linkedCustomers.length > 0`, a wrapped row of small `Badge variant="secondary"` chips, one per `linkedCustomers[].customerName`, preceded by a `sr-only` or visible label `Người chuyển khoản` on the column header if not already present. Keep the existing `InitialsAvatar` + name. Example:

```tsx
<div className="flex flex-col gap-1">
  <div className="flex items-center gap-2">
    <InitialsAvatar name={row.transaction.counterpartyName ?? '—'} size="sm" />
    {row.transaction.counterpartyName ?? '—'}
  </div>
  {row.payer.accountNumberMasked && (
    <span className="text-xs text-muted-foreground tabular-nums">
      {row.payer.accountNumberMasked}
    </span>
  )}
  {row.payer.linkedCustomers.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {row.payer.linkedCustomers.map((c) => (
        <Badge key={c.customerId} variant="secondary" className="text-[10px]">
          {c.customerName}
        </Badge>
      ))}
    </div>
  )}
</div>
```

   Ensure the column header cell reads `Người chuyển khoản` (check the `TableHead` row; rename if it is generic like `Đối tác`).

3. `split-match-dialog.tsx` — if it shows a transaction/counterparty summary header, add the same masked account + linked-customer chips there, labelled `Người chuyển khoản`, above the candidate list. If it does not render such a header, skip this file and note it in the commit body.

4. Any other component consuming `PendingReviewItem` (grep `PendingReviewItem` and `topCandidate` across `features/exceptions`) must be updated so `payer` is populated in its test fixtures — `exceptions-bulk-action-bar.spec.tsx` and `use-exceptions.spec.tsx` may need `payer` added to mock items to satisfy the type.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @casso-ar/frontend test -- exceptions`
Expected: PASS (whole `features/exceptions` folder).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/
git commit -m "feat: show payer account and linked customers in the Exception Queue (#382)"
```

---

## Task 17: Frontend full run + type-check

**Files:** none (verification).

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: clean. Fix any fixture gaps (`payer` missing on mock `PendingReviewItem`s).

- [ ] **Step 2: Full frontend suite**

Run: `pnpm --filter @casso-ar/frontend test`
Expected: all pass.

- [ ] **Step 3: Biome**

Run: `npx biome check --write apps/frontend/src apps/backend/src`
Expected: clean (auto-fixes formatting). Re-stage and amend the last commit if it only reformats, otherwise:

```bash
git add -A
git commit -m "style: biome for payer accounts (#382)"
```

---

## Task 18: E2E coverage

**Files:**
- Modify: `apps/backend/test/customer-bank-account-management.e2e-spec.ts`
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`

**Interfaces:** exercises real HTTP + Postgres (testcontainers).

- [ ] **Step 1: Add the cross-customer link e2e**

In `customer-bank-account-management.e2e-spec.ts`, add a test:

- Create two customers in one org.
- `POST /api/v1/customers/:c1/bank-accounts` `{ accountNumber }` → 201.
- `POST /api/v1/customers/:c2/bank-accounts` `{ accountNumber }` (same number, no flag) → **409** with `errorCode: 'CONFLICT'` and `details.linkedCustomerNames` containing customer 1's name.
- Repeat with `{ accountNumber, acknowledgeExistingLinks: true }` → 201.
- `GET /api/v1/customers/:c2/bank-accounts` → lists the new link; `GET` for `:c1` still lists its own.
- A second `POST` for `:c2` with the same number (flag or not) → 409 (same-customer duplicate).

- [ ] **Step 2: Add the third-party matching e2e**

In `webhook-matching.e2e-spec.ts`, add a test:

- Customer `C1` with an open receivable; link payer account `A` to `C1`.
- Deliver a webhook transaction from account `A` with a `counterpartyName` unlike `C1`'s name and an amount matching the receivable.
- Assert the transaction is scored against `C1`'s receivable (candidate present with `customerBankAccountScore === 10`), and — depending on total score — either auto-matched or in `PENDING_REVIEW`.
- Add a second customer `C2` (also linked to `A`) with a receivable that also scores `>= 90`; deliver a transaction and assert it lands in `PENDING_REVIEW` (ambiguity guard), no `Payment` created.
- Assert an account number linked in another org does not appear in this org's `GET /api/v1/bank-transactions/unmatched` `payer.linkedCustomers`.

- [ ] **Step 3: Run e2e (if a container runtime is available)**

Run: `pnpm --filter @casso-ar/backend test:e2e -- customer-bank-account-management webhook-matching`
Expected: PASS. If no Docker is available in this environment, state that e2e was written but not executed here, and that CI will run it.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/customer-bank-account-management.e2e-spec.ts apps/backend/test/webhook-matching.e2e-spec.ts
git commit -m "test: e2e for cross-customer links and third-party payer matching (#382)"
```

---

## Task 19: Docs + final verification

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

- [ ] **Step 1: Update the feature map**

In the `## Frontier` → `**In progress:**` list, add:

```
- #382 — Third-party payer accounts: `customer_bank_accounts` becomes an org-scoped M:N payer-account↔customer authorization link (partial-unique per customer, `confirmedByUserId`/`confirmedAt` provenance, one migration); matching engine unions open receivables across every linked customer and blocks auto-match when two customers both clear the threshold; create endpoint gains `acknowledgeExistingLinks` with a 409+`linkedCustomerNames` cross-customer guard; Exception Queue read model + UI gain a `payer` block. Remembering a payer from inside the confirmed-match flow stays with #380. Branch `feat/third-party-payer-accounts`.
```

- [ ] **Step 2: Run the full gate**

Run: `pnpm verify`
Expected: lint + type-check + unit all green. Note any pre-existing unrelated flakes (e.g. Turbo-parallel frontend timeouts) and re-run the affected suite in isolation to confirm.

- [ ] **Step 3: Commit**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: track #382 in the feature map"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/third-party-payer-accounts
gh pr create --title "feat: support third-party payer accounts in transaction matching" --body "Closes #382

<summary of the layers: model+migration, matching fan-out + ambiguity guard, cross-customer confirm, Exception Queue payer view>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Then run `/code-review` (two-axis, against `main`) and address findings before requesting merge. Wait for user review before merging.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 domain model + invariants | 1 (domain), 2 (ORM index), 4 (repo) |
| §3 migration | 3 |
| §4.1 repo port | 4 |
| §4.2 fan-out scoring | 8 |
| §4.3 auto-match ambiguity guard | 9 |
| §5.1 create use case + `acknowledgeExistingLinks` | 5 |
| §5.2 DTO + `CONFLICT` details + no provenance leak | 6, 11 |
| §5.3 FE dialog + card wording | 13, 14, 15 |
| §6.1 query service `payer` view | 10 |
| §6.2 `PayerResponseDto` | 11 |
| §6.3 FE exceptions payer block | 16 |
| §7 testing (unit/e2e/FE) | every task's tests + 12, 17, 18 |
| §8 AC mapping | covered transitively by the above |
| Module wiring (`BankAccountsModule` export, `ExceptionQueueModule` import) | 7, 10 |

No gaps.

**2. Placeholder scan** — no "TBD"/"TODO"/"handle edge cases". Two "check the port / check a sibling controller for the exact accessor" notes remain where the exact upstream signature (`ICustomerRepository.findByIds` return shape, the auth request user accessor) must be read from the codebase at implementation time; each names the concrete file to look at and the fallback. These are lookups, not decisions.

**3. Type consistency**
- `findActiveByAccountNumber(accountNumber: string): Promise<CustomerBankAccount[]>` — identical in Tasks 4, 8, 10.
- `CreateCustomerBankAccountInput` — `{ customerId, accountNumber, confirmedByUserId, acknowledgeExistingLinks? }` in Tasks 5 and 6.
- `PayerView` (backend) / `Payer` (frontend) — `{ accountNumberMasked: string; name: string; linkedCustomers: { customerId: string; customerName: string }[] }` — identical in Tasks 10, 11 (as `PayerResponseDto`), 16.
- `confirmedByUserId: string | null`, `confirmedAt: Date | null` — Tasks 1, 2, 4.
- Auto-match guard variable `canAutoMatch` — defined and used within Task 9 only.

No inconsistencies.
