# Customer Bank Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-safe backend API for managing `CustomerBankAccount` mappings and make the existing Matching Engine consume only active mappings using the same normalization rule.

> **2026-08-10 rescoping note (pre-implementation review):** this plan was drafted 2026-08-04, the same day as the spec, before several later plans reshaped the codebase it targets. Four real discrepancies found and resolved before implementation:
>
> 1. **Permission/audit file paths are wrong.** `common/rbac/permission.enum.ts`, `common/rbac/role-permissions.map.ts`, and `common/audit/audit-action-type.enum.ts` no longer exist. `Permission` moved to `packages/shared-types/src/permission.ts` during the FE Auth plan (Plan #19) — it's a **real, already-populated enum with ~20 values today** (`RECEIVABLE_IMPORT`, `CUSTOMER_READ`, `ORGANIZATION_READ`, `BANK_CONNECTION_READ`, `SWITCH_ORGANIZATION`, etc.), not the ~15-value list Task 2 Step 3 shows as "the exact set" — that list is a stale snapshot from 2026-08-04 and must not be pasted in literally, or it would delete every permission added since. `ROLE_PERMISSIONS` lives in `packages/shared-types/src/role-permissions.ts`. `AuditActionType`/`AuditEntityType` live in `apps/backend/src/common/audit/audit.enums.ts`, and `@Audited()`'s real signature is `(actionType: AuditActionType, entityType: AuditEntityType)` — both real enum types, not the raw string literal `'CustomerBankAccount'` Task 4 Step 4 passes (confirmed via `audited.decorator.ts`; that line wouldn't type-check as written). Task 2 (and Task 4's `@Audited` calls) are rewritten below against the real files.
> 2. **"No migration file needed, `synchronize: true` covers it" (Task 1 Step 5) is wrong.** `apps/backend/src/database/migrations/` now holds real, hand-written migrations (e.g. `20260808000000-add-invoice-unique-index.ts`) used for production correctness — `synchronize: true` is dev/test-only convenience, not a substitute. Task 1 gets a migration step added.
> 3. **Task 2 Step 4's proposed `AuditContextService.skip()`/`shouldSkip()` mechanism is dropped as unnecessary (YAGNI).** It exists to avoid writing a redundant audit row when `DELETE` no-ops on an already-inactive row — but the spec only requires the *endpoint* to be idempotent (204, no error), never says a no-op deactivate must suppress its audit trail. A redundant "deactivate was called, already inactive" audit row is harmless and arguably useful, not a bug. Building a second cross-cutting mechanism into `AuditContextService`/its interceptor for a case the spec doesn't ask to hide is scope the ticket doesn't need — removed from Task 2 below.
> 4. **Task 6's documentation-sync scope is pruned.** The original Task 6 proposed editing 5 other plans' docs (`docs/overview.md`, `2026-08-03-multi-tenancy-rbac-design.md`/`.md`, `2026-08-03-webhook-matching-engine-design.md`/`.md`, `2026-08-03-spec-plan-reconciliation.md`) — all of which have moved on substantially since 2026-08-04 (confirmed stale in the same way this plan itself was). Matching the established convention from the two most recently shipped tickets (Plan #22, Plan #23), Task 6 is narrowed to: this ticket's own spec/plan docs (already covered by this rescoping) plus `docs/wayfinder/feature-map.md` at the end. No other plan's docs are touched.

**Architecture:** Extend the `BankAccountsModule` created by the Webhook/Matching Engine plan. The module owns the domain entity, repository, four use cases, and nested customer controller; it imports the existing Customers module only to validate a tenant-scoped customer. The Matching Engine keeps using the existing repository token, so there is one persistence and lookup path.

**Tech Stack:** NestJS 10, TypeORM, class-validator, existing JWT/RBAC/audit infrastructure, Jest, Supertest, and the existing Postgres testcontainer setup. No new npm dependency.

## Global Constraints

- All controller paths are module-relative; the existing `main.ts` global prefix makes the public paths `/api/v1/...`.
- `organizationId` is taken from `TenantContextService`; it is never accepted from a DTO, route parameter, or webhook body.
- `CustomerBankAccount` is shared tenant-owned master data. Every repository method is tenant-scoped through `BaseRepository`.
- Normalize account numbers by trim → remove spaces/hyphens → require `^[0-9]{4,34}$` → preserve leading zeroes. The same function is used by writes and Matching Engine lookup.
- The database unique constraint is `(organizationId, accountNumber)` and applies to active and inactive rows.
- Deactivation is soft. There is no hard-delete use case or repository method.
- Matching lookup filters `isActive = true`; inactive mappings never contribute to `customerBankAccountScore`.
- HTTP responses and audit snapshots contain only `accountNumberMasked`; raw account numbers are not returned, logged, or persisted in audit state.
- `RECEIVABLE_READ` gates list access. `CUSTOMER_BANK_ACCOUNT_MANAGE` gates create, update, and deactivate for `OWNER`, `FINANCE_MANAGER`, and `ACCOUNTANT`.
- A customer or mapping outside the current organization is returned as `404`, not as a distinguishable authorization error.
- Domain files do not import NestJS or TypeORM. Money/number values are not parsed into JavaScript numeric types when they are identifiers.
- No FE screen is added and no existing FE route or API call is removed.

---

## File Structure

**(2026-08-10: file list corrected — see rescoping note above for why the permission/audit paths changed, and the repo-wide `*.integration.spec.ts` → `*.e2e-spec.ts` naming convention confirmed during Plan #22's own rescoping.)**

```
apps/backend/src/
  database/migrations/<timestamp>-add-customer-bank-account-status.ts -- NEW
  modules/customers/customers.module.ts                  -- VERIFY: exports CUSTOMER_REPOSITORY
  modules/bank-accounts/
    domain/customer-bank-account.ts                       -- MODIFY: active state + timestamps + domain methods
    application/account-number-normalizer.ts              -- NEW: normalize and mask account numbers
    application/account-number-normalizer.spec.ts         -- NEW: normalization/masking tests
    application/customer-bank-account-repository.port.ts  -- MODIFY: list/find contracts
    application/list-customer-bank-accounts.usecase.ts    -- NEW
    application/create-customer-bank-account.usecase.ts   -- NEW
    application/update-customer-bank-account.usecase.ts   -- NEW
    application/deactivate-customer-bank-account.usecase.ts -- NEW
    application/customer-bank-account.usecase.spec.ts    -- NEW: use-case tests
    infrastructure/customer-bank-account.orm-entity.ts   -- MODIFY: unique index + active/timestamp columns
    infrastructure/typeorm-customer-bank-account.repository.ts -- MODIFY: tenant-scoped list and active lookup
    presentation/customer-bank-account.dto.ts             -- NEW: request DTOs
    presentation/customer-bank-account.mapper.ts          -- NEW: masked response mapper
    presentation/customer-bank-accounts.controller.ts     -- NEW: nested HTTP routes
    bank-accounts.module.ts                                -- MODIFY: imports, providers, controller
  modules/webhooks/application/matching-engine.service.ts -- MODIFY: consume active normalized lookup
  common/audit/audit.enums.ts                              -- MODIFY: 3 new AuditActionType values + 1 AuditEntityType value
  test/customer-bank-account-management.e2e-spec.ts       -- NEW
  test/webhook-matching.e2e-spec.ts                        -- MODIFY: active/inactive mapping cases

packages/shared-types/src/permission.ts                  -- MODIFY: append CUSTOMER_BANK_ACCOUNT_MANAGE (already exists, ~20 values)
packages/shared-types/src/role-permissions.ts             -- MODIFY: grant to FINANCE_MANAGER, ACCOUNTANT

docs/wayfinder/feature-map.md                             -- MODIFY: mark this ticket done
```

The current Webhook plan's `CustomerBankAccount` Task 1 is the persistence foundation. This plan extends that task; it must not create a second entity, repository token, or `BankAccountsModule`.

### Task 1: Normalize and persist active customer mappings

**Files:**
- Modify: `apps/backend/src/modules/bank-accounts/domain/customer-bank-account.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/account-number-normalizer.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/account-number-normalizer.spec.ts`
- Modify: `apps/backend/src/modules/bank-accounts/infrastructure/customer-bank-account.orm-entity.ts`
- Modify: `apps/backend/src/modules/bank-accounts/application/customer-bank-account-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts`
- Test: `apps/backend/src/modules/bank-accounts/application/customer-bank-account.usecase.spec.ts`

**Interfaces:**
- Consumes: `BaseRepository` and `TenantContextService` from the Multi-tenancy plan.
- Produces: `normalizeAccountNumber(value: unknown): string`, `maskAccountNumber(normalized: string): string`, and the extended `ICustomerBankAccountRepository` used by Tasks 2–5 and the Matching Engine.

- [ ] **Step 1: Write failing normalizer tests**

Create `account-number-normalizer.spec.ts`:

```typescript
import { maskAccountNumber, normalizeAccountNumber } from './account-number-normalizer';

describe('account number normalizer', () => {
  it('removes visual separators without losing leading zeroes', () => {
    expect(normalizeAccountNumber(' 0011 0022-33 ')).toBe('0011002233');
  });

  it('rejects non-string, empty, short, long, and non-digit values', () => {
    for (const value of [null, 11002233, '', '123', '1'.repeat(35), '0011ABC233']) {
      expect(() => normalizeAccountNumber(value)).toThrow();
    }
  });

  it('masks all but the last four digits', () => {
    expect(maskAccountNumber('0011002233')).toBe('******2233');
    expect(maskAccountNumber('1234')).toBe('****');
  });
});
```

- [ ] **Step 2: Run the normalizer tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- account-number-normalizer.spec.ts --runInBand`

Expected: FAIL because `account-number-normalizer.ts` does not exist.

- [ ] **Step 3: Implement the pure normalizer**

Create `account-number-normalizer.ts`:

```typescript
const ACCOUNT_NUMBER_PATTERN = /^[0-9]{4,34}$/;

export function normalizeAccountNumber(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Account number must be a string');
  const normalized = value.trim().replace(/[\s-]/g, '');
  if (!ACCOUNT_NUMBER_PATTERN.test(normalized)) {
    throw new Error('Account number must contain 4-34 digits');
  }
  return normalized;
}

export function maskAccountNumber(normalized: string): string {
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}
```

- [ ] **Step 4: Run the normalizer tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Extend the domain entity and ORM schema**

Extend `CustomerBankAccountProps` with `isActive`, `createdAt`, and `updatedAt`. Add domain methods with no framework imports:

```typescript
deactivate(): CustomerBankAccount {
  return new CustomerBankAccount({ ...this, isActive: false, updatedAt: new Date() });
}

setActive(isActive: boolean): CustomerBankAccount {
  return new CustomerBankAccount({ ...this, isActive, updatedAt: new Date() });
}

changeAccountNumber(accountNumber: string): CustomerBankAccount {
  return new CustomerBankAccount({ ...this, accountNumber, updatedAt: new Date() });
}
```

Modify `CustomerBankAccountOrmEntity` to add:

```typescript
@Index(['organizationId', 'accountNumber'], { unique: true })
@Index(['organizationId', 'accountNumber', 'isActive'])
@Column({ default: true })
isActive: boolean;

@CreateDateColumn()
createdAt: Date;

@UpdateDateColumn()
updatedAt: Date;
```

Remove the old non-unique duplicate index rather than keeping two overlapping indexes.

**(2026-08-10 correction: a real migration file is required — see the rescoping note above.)** Add `apps/backend/src/database/migrations/<timestamp>-add-customer-bank-account-status.ts`, mirroring `20260808000000-add-invoice-unique-index.ts`'s style (`MigrationInterface`, raw SQL in `up()`/`down()`):

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerBankAccountStatus<TIMESTAMP>
  implements MigrationInterface
{
  name = 'AddCustomerBankAccountStatus<TIMESTAMP>';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE customer_bank_accounts ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true',
    );
    await queryRunner.query(
      'ALTER TABLE customer_bank_accounts ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_<existing-plain-index-name>"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON customer_bank_accounts ("organizationId", "accountNumber")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE customer_bank_accounts DROP COLUMN IF EXISTS "updatedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE customer_bank_accounts DROP COLUMN IF EXISTS "isActive"',
    );
  }
}
```

Look up the existing plain index's real generated name (TypeORM's default naming for `@Index(['organizationId', 'accountNumber'])` on `customer_bank_accounts`) before writing the `DROP INDEX` line — do not guess it.

- [ ] **Step 6: Extend the repository port and implementation**

The port becomes:

```typescript
export interface ICustomerBankAccountRepository {
  findByAccountNumber(accountNumber: string): Promise<CustomerBankAccount | null>; // active only
  findByCustomerId(customerId: string): Promise<CustomerBankAccount[]>; // active + inactive
  findById(id: string): Promise<CustomerBankAccount | null>; // active + inactive
  save(account: CustomerBankAccount): Promise<void>;
}
```

Implement `findByAccountNumber` with the normalized number and `isActive: true`; implement `findByCustomerId` ordered by `createdAt DESC`. All methods must use `scopedFindOne`, `scopedFind`, and `scopedSave` or the equivalent existing `BaseRepository` helpers. Never add an `organizationId` parameter to the port.

- [ ] **Step 7: Run focused repository/domain tests**

Run: `pnpm --filter @casso-ledger/backend test -- bank-accounts --runInBand`

Expected: PASS for normalizer, domain state transitions, and repository tests. Commit:

```bash
git add apps/backend/src/modules/bank-accounts
git commit -m "feat: add active tenant-scoped customer bank account mappings"
```

### Task 2: Add permission and audit action contracts

**(2026-08-10: rewritten against the real files — `Permission` already lives in `packages/shared-types/src/permission.ts` with ~20 real values today, `ROLE_PERMISSIONS` in `packages/shared-types/src/role-permissions.ts`, `AuditActionType`/`AuditEntityType` in `apps/backend/src/common/audit/audit.enums.ts`. Nothing is created fresh here — only additive edits to existing enums. The audit-skip mechanism from the original draft is dropped; see the rescoping note at the top of this plan.)**

**Files:**
- Modify: `packages/shared-types/src/permission.ts`
- Modify: `packages/shared-types/src/role-permissions.ts`
- Modify: `apps/backend/src/common/audit/audit.enums.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts` (or wherever the existing `ROLE_PERMISSIONS` test lives — check first)

**Interfaces:**
- Consumes: existing `PermissionGuard`, `@RequirePermission`, `ROLE_PERMISSIONS`, `AuditActionType`, `AuditEntityType`, and `@Audited`.
- Produces: `Permission.CUSTOMER_BANK_ACCOUNT_MANAGE` and the three audit action values + one entity type value used by Task 4's controller.

- [ ] **Step 1: Add failing contract assertions**

Extend the existing `ROLE_PERMISSIONS` test with:

```typescript
it('grants bank-account management only to financial write roles', () => {
  expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
});
```

And a similar assertion wherever `audit.enums.ts` already has coverage, asserting `AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE`/`_UPDATE`/`_DEACTIVATE` and `AuditEntityType.CUSTOMER_BANK_ACCOUNT` exist with their expected string values.

- [ ] **Step 2: Run the contract tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- role-permissions --runInBand` (adjust the test filename once located in Step 1)

Expected: FAIL because the new permission/action/entity values are absent.

- [ ] **Step 3: Add the permission**

Append `CUSTOMER_BANK_ACCOUNT_MANAGE = 'CUSTOMER_BANK_ACCOUNT_MANAGE'` to the existing `Permission` enum in `packages/shared-types/src/permission.ts` — do not replace or reorder the existing values. In `packages/shared-types/src/role-permissions.ts`, add it to `FINANCE_MANAGER`'s and `ACCOUNTANT`'s arrays (`OWNER` gets every permission automatically via `Object.values(Permission)`, confirmed in that file's existing pattern); leave `SALES_REP`/`VIEWER` untouched.

- [ ] **Step 4: Add the audit action + entity type values**

In `apps/backend/src/common/audit/audit.enums.ts`, append to `AuditActionType`:

```typescript
CUSTOMER_BANK_ACCOUNT_CREATE = 'CUSTOMER_BANK_ACCOUNT_CREATE',
CUSTOMER_BANK_ACCOUNT_UPDATE = 'CUSTOMER_BANK_ACCOUNT_UPDATE',
CUSTOMER_BANK_ACCOUNT_DEACTIVATE = 'CUSTOMER_BANK_ACCOUNT_DEACTIVATE',
```

and one value to `AuditEntityType`, matching the existing `PascalCase`-string convention (e.g. `BANK_CONNECTION = 'BankConnection'`):

```typescript
CUSTOMER_BANK_ACCOUNT = 'CustomerBankAccount',
```

- [ ] **Step 5: Protect audit state from raw account numbers**

The existing `@Audited` interceptor snapshots whatever `AuditContextService.setBefore()`/`setAfter()` is given — it does not know which fields are sensitive. Each use case (Task 3) calls these with a masked plain object, not the raw domain entity:

```typescript
export function toAuditedBankAccount(account: CustomerBankAccount) {
  return {
    id: account.id,
    customerId: account.customerId,
    accountNumberMasked: maskAccountNumber(account.accountNumber),
    isActive: account.isActive,
  };
}
```

Do not broaden the generic audit sanitizer as a substitute; the owning mapper is what knows which fields are safe. No `AuditContextService`/interceptor changes needed for this — the existing `setBefore`/`setAfter` contract already supports passing any plain object.

- [ ] **Step 6: Run the contract tests and commit**

Run the command from Step 2. Expected: PASS.

```bash
git add packages/shared-types apps/backend/src/common/audit
git commit -m "feat: authorize and audit customer bank account management"
```

### Task 3: Implement tenant-scoped application use cases

**Files:**
- Create: `apps/backend/src/modules/bank-accounts/application/list-customer-bank-accounts.usecase.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/create-customer-bank-account.usecase.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/update-customer-bank-account.usecase.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/deactivate-customer-bank-account.usecase.ts`
- Create: `apps/backend/src/modules/bank-accounts/application/customer-bank-account.usecase.spec.ts`
- Modify: `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts`

**Interfaces:**
- Consumes: `ICustomerRepository.findById`, `ICustomerBankAccountRepository`, `TenantContextService`, `AuditContextService`, `normalizeAccountNumber`, and the existing Nest exception conventions.
- Produces: four injectable use cases with the input/output contracts used by Task 4.

- [ ] **Step 1: Write failing use-case tests**

Cover these exact behaviors in `customer-bank-account.usecase.spec.ts`:

```typescript
it('creates a normalized mapping only for an existing tenant customer', async () => {
  const customerRepo = { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
  const bankAccountRepo = { findById: jest.fn(), findByCustomerId: jest.fn(), findByAccountNumber: jest.fn().mockResolvedValue(null), save: jest.fn() };
  const useCase = buildCreateUseCase(customerRepo, bankAccountRepo);

  const result = await useCase.execute({ customerId: 'cust-1', accountNumber: '0011 0022-33' });

  expect(result.accountNumber).toBe('0011002233');
  expect(bankAccountRepo.save).toHaveBeenCalledWith(expect.objectContaining({
    customerId: 'cust-1', accountNumber: '0011002233', isActive: true,
  }));
});

it('rejects a duplicate normalized account number', async () => {
  const useCase = buildCreateUseCase(
    { findById: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
    { findByAccountNumber: jest.fn().mockResolvedValue({ id: 'existing' }) },
  );

  await expect(useCase.execute({ customerId: 'cust-1', accountNumber: '0011002233' }))
    .rejects.toThrow('already mapped');
});

it('deactivates without deleting the row and remains idempotent', async () => {
  const account = buildAccount({ isActive: true });
  const repo = { findById: jest.fn().mockResolvedValue(account), save: jest.fn() };
  const useCase = buildDeactivateUseCase(repo);

  await useCase.execute({ customerId: account.customerId, id: account.id });

  expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
});
```

Also test missing customer/mapping (`NotFoundException`), cross-tenant access through the scoped repositories, update with neither field (`BadRequestException`), immutable `customerId`, and raw-account masking in audit snapshots.

- [ ] **Step 2: Run the use-case tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- customer-bank-account.usecase.spec.ts --runInBand`

Expected: FAIL because the four use cases are absent.

- [ ] **Step 3: Implement the list use case**

Use the existing customer repository to validate the customer first, then return `findByCustomerId(customerId)`. The use case accepts only `{ customerId: string }`; it does not accept `organizationId`.

Return type:

```typescript
{ items: CustomerBankAccount[]; total: number }
```

- [ ] **Step 4: Implement create with database-backed duplicate protection**

Algorithm:

1. `customerRepo.findById(input.customerId)`; throw `NotFoundException('Customer not found')` when null.
2. Normalize `input.accountNumber`.
3. Call `findByAccountNumber(normalized)` only as a friendly pre-check.
4. Throw `ConflictException('Account number is already mapped')` when a row exists.
5. Create a UUID-backed domain object with `isActive: true` and save it.
6. Set masked audit before/after state using the existing audit context.
7. Translate a database unique-constraint error into the same `ConflictException` so concurrent creates are safe.

- [ ] **Step 5: Implement update and deactivate**

Update algorithm:

1. Find the row by ID and verify `row.customerId === input.customerId`; otherwise throw `NotFoundException`.
2. Reject an empty patch.
3. Normalize a supplied account number and reject a different existing mapping with `ConflictException`.
4. Apply `changeAccountNumber()` and/or `setActive()`.
5. Save once and record masked before/after audit state.

Deactivate algorithm:

1. Find and customer-check the row.
2. If already inactive, return it without changing `updatedAt` or creating a duplicate audit event.
3. Otherwise call `deactivate()`, save, and record the deactivate audit state.

- [ ] **Step 6: Register use cases and import dependencies**

Modify `BankAccountsModule` to import `CustomersModule`, provide the four use cases, and keep exporting `CUSTOMER_BANK_ACCOUNT_REPOSITORY` for `WebhooksModule`. Do not import `BankAccountsModule` from `CustomersModule`; this keeps the dependency one-way.

- [ ] **Step 7: Run use-case tests and commit**

Run the command from Step 2. Expected: PASS.

```bash
git add apps/backend/src/modules/bank-accounts
git commit -m "feat: add customer bank account management use cases"
```

### Task 4: Expose the masked nested API

**Files:**
- Create: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-account.dto.ts`
- Create: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-account.mapper.ts`
- Create: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-accounts.controller.ts`
- Modify: `apps/backend/src/modules/bank-accounts/bank-accounts.module.ts`
- Test: `apps/backend/src/modules/bank-accounts/presentation/customer-bank-accounts.controller.spec.ts`

**Interfaces:**
- Consumes: four use cases from Task 3, `JwtAuthGuard`, `PermissionGuard`, `@RequirePermission`, `@Audited`, and `AuditActionType`.
- Produces: module-relative routes that become the following public contracts under the existing `/api/v1` prefix:
  - `GET /customers/:customerId/bank-accounts`
  - `POST /customers/:customerId/bank-accounts`
  - `PATCH /customers/:customerId/bank-accounts/:id`
  - `DELETE /customers/:customerId/bank-accounts/:id`

- [ ] **Step 1: Write DTO/mapper/controller contract tests**

Verify that the controller delegates rather than implementing domain rules:

```typescript
it('returns only masked account data', async () => {
  const controller = buildController({
    list: { execute: jest.fn().mockResolvedValue({ items: [buildAccount()], total: 1 }) },
  });

  const result = await controller.list('cust-1');

  expect(result).toEqual({
    items: [expect.objectContaining({ accountNumberMasked: '******2233' })],
    total: 1,
  });
  expect(JSON.stringify(result)).not.toContain('0011002233');
});
```

- [ ] **Step 2: Run the controller tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- customer-bank-accounts.controller.spec.ts --runInBand`

Expected: FAIL because the DTO, mapper, and controller are absent.

- [ ] **Step 3: Create request DTOs and response mapper**

Use the existing global `ValidationPipe` conventions:

```typescript
export class CreateCustomerBankAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;
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

The mapper returns `{ id, customerId, accountNumberMasked, isActive, createdAt, updatedAt }` and never spreads the domain object into the response.

- [ ] **Step 4: Create the controller with exact guards and audit decorators**

Use module-relative `@Controller('customers/:customerId/bank-accounts')`. The methods are:

```typescript
@Get()
@RequirePermission(Permission.RECEIVABLE_READ)
list(@Param('customerId') customerId: string) {}

@Post()
@RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE, AuditEntityType.CUSTOMER_BANK_ACCOUNT)
create(@Param('customerId') customerId: string, @Body() dto: CreateCustomerBankAccountDto) {}

@Patch(':id')
@RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_UPDATE, AuditEntityType.CUSTOMER_BANK_ACCOUNT)
update(@Param('customerId') customerId: string, @Param('id') id: string, @Body() dto: UpdateCustomerBankAccountDto) {}

@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_DEACTIVATE, AuditEntityType.CUSTOMER_BANK_ACCOUNT)
deactivate(@Param('customerId') customerId: string, @Param('id') id: string) {}
```

**(2026-08-10: `AuditEntityType.CUSTOMER_BANK_ACCOUNT` — not the raw string `'CustomerBankAccount'` the original draft used — per `@Audited`'s real signature `(actionType: AuditActionType, entityType: AuditEntityType)`; see Task 2 Step 4.)**

Every mutating route also needs `@Headers('idempotency-key') key: string | undefined` and a body wrapped in `IdempotencyService.execute(endpoint, key, dto, async () => {...})`, matching `.claude/rules/api.md`'s "POST/PATCH/DELETE endpoints with side effects MUST wrap the handler with `IdempotencyService.execute`" rule — every other controller in this codebase follows this pattern (e.g. `receivables.controller.ts`), and the original draft's Step 4 sample omits it.

Use the project's existing global JWT/permission guards; do not add a second local authentication implementation. The controller passes only route IDs and validated DTO values to the use cases.

- [ ] **Step 5: Register the controller and run focused tests**

Add the controller and providers to `BankAccountsModule`. Run:

```bash
pnpm --filter @casso-ledger/backend test -- customer-bank-accounts.controller.spec.ts --runInBand
```

Expected: PASS. Commit:

```bash
git add apps/backend/src/modules/bank-accounts
git commit -m "feat: expose masked customer bank account API"
```

### Task 5: Reconcile Matching Engine and verify end-to-end behavior

**Files:**
- Modify: `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`
- Create: `apps/backend/test/customer-bank-account-management.e2e-spec.ts`
- Modify: `apps/backend/src/modules/bank-accounts/infrastructure/typeorm-customer-bank-account.repository.ts`

**Interfaces:**
- Consumes: `findByAccountNumber()` from Task 1 and the existing `MatchingEngineService` scoring path.
- Produces: active-only account matching and HTTP integration coverage for tenant isolation, masking, permissions, soft delete, and duplicate handling.

- [ ] **Step 1: Add failing Matching Engine cases**

Extend the existing webhook integration suite:

```typescript
it('scores an active normalized mapping and ignores an inactive mapping', async () => {
  await seedCustomerBankAccount({ accountNumber: '0011002233', isActive: true });
  expect(await bankAccountRepo.findByAccountNumber('0011 0022-33')).toEqual(
    expect.objectContaining({ customerId: 'cust-1' }),
  );

  await deactivateSeededMapping();
  expect(await bankAccountRepo.findByAccountNumber('0011002233')).toBeNull();
});
```

- [ ] **Step 2: Run the matching integration test and verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-matching.e2e-spec.ts --runInBand`

Expected: FAIL until active filtering and shared normalization are wired into the repository/Matching Engine path.

- [ ] **Step 3: Use the shared normalization path in Matching Engine lookup**

Remove any direct `trim`, numeric coercion, or duplicate account-number normalization from `MatchingEngineService`. It must call the repository method with the provider string and let `findByAccountNumber()` normalize and filter active rows. Keep the existing `customerBankAccountScore = 10` behavior only when the repository returns a row.

- [ ] **Step 4: Add API integration tests**

The new `customer-bank-account-management.e2e-spec.ts` must prove:

```typescript
await request(app.getHttpServer())
  .post('/api/v1/customers/cust-1/bank-accounts')
  .set('Authorization', `Bearer ${financeManagerToken}`)
  .send({ accountNumber: '0011 0022-33' })
  .expect(201)
  .expect(({ body }) => {
    expect(body.accountNumberMasked).toBe('******2233');
    expect(body.accountNumber).toBeUndefined();
  });
```

Cover these cases: list includes inactive rows; update can reactivate; delete returns `204` and is idempotent; Sales Rep/Viewer writes return `403`; another tenant's customer/mapping returns `404`; duplicate normalized values return `409`; the matching lookup sees the created active row and stops seeing it after deactivation.

- [ ] **Step 5: Run the full relevant verification**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- bank-accounts --runInBand
pnpm --filter @casso-ledger/backend test:e2e -- customer-bank-account-management.e2e-spec.ts webhook-matching.e2e-spec.ts --runInBand
pnpm --filter @casso-ledger/backend type-check
```

Expected: all focused unit/integration tests and type-check pass. Commit:

```bash
git add apps/backend/src/modules/webhooks apps/backend/test
git commit -m "test: verify bank account mappings feed active matching only"
```

### Task 6: Update `feature-map.md`

**(2026-08-10: scope pruned — the original draft proposed editing 5 other already-shipped plans' spec/plan docs plus `docs/overview.md`. All of those have moved on substantially since 2026-08-04 in ways this session confirmed are themselves stale — editing them here would repeat the exact mistake this rescoping is fixing. Matching how Plan #22 and Plan #23 closed out, this ticket only updates its own two docs (already covered above) and `feature-map.md`.)**

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

**Interfaces:**
- Consumes: the completed implementation from Tasks 1–5.
- Produces: an accurate `feature-map.md` entry for this ticket (it currently has no dedicated section — check the "ADDITIONAL PLANS" area near `Credit Balance Management`/`Spec-Plan Reconciliation` for the right insertion point and format to match).

- [ ] **Step 1: Add/update this ticket's `feature-map.md` entry**

Mark status `done ✅` with a `Shipped:` date + PR reference, following the same entry shape every other completed ticket uses (Type/Status/Owner/Spec/Blockers/Shipped/Key rules/Creates/Implementation note — see any recently-closed entry, e.g. Plan #22 or Plan #23, for the exact format). Update the "Ticket Index" snapshot count and the "Frontier" section (remove this ticket from "Next available tickets", note anything still open).

- [ ] **Step 2: Commit**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: mark Customer Bank Account Management done"
```

## Execution order and verification gate

Execute Tasks 1–6 in order. Before declaring the feature complete: run the focused unit tests (Tasks 1-3), the migration against a real local Postgres (Task 1), the controller tests (Task 4), both e2e suites standalone against real Postgres+Redis (Task 5 — `customer-bank-account-management.e2e-spec.ts` and `webhook-matching.e2e-spec.ts`, per `test:e2e` staying local-only per Plan #22's CI-contract decision), `pnpm verify` (lint/type-check/test/arch-check), and the `domain-check` skill (AGENTS.md requires this after every backend change).

## Self-review checklist

- Every requirement in `2026-08-04-customer-bank-account-management-design.md` maps to Tasks 1–6.
- No task creates a second `CustomerBankAccount` entity, repository token, or module.
- API paths, DTO fields, permission names, audit action names, and `isActive` lookup behavior are identical across all tasks.
- Raw account numbers appear only in write input and internal domain/repository operations, never in response/audit/log output.
- Cross-tenant access is handled by existing tenant-scoped repository contracts, not caller-supplied organization IDs.
- FE is intentionally not modified; existing FE calls remain untouched.
- Every mutating route uses `IdempotencyService.execute` + `@Audited`, matching `.claude/rules/api.md` and every other controller in this codebase (Task 4).
- A real migration file exists for the new columns/unique index, not just reliance on dev-only `synchronize: true` (Task 1).


