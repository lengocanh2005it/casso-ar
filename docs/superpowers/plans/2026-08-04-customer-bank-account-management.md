# Customer Bank Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-safe backend API for managing `CustomerBankAccount` mappings and make the existing Matching Engine consume only active mappings using the same normalization rule.

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

```
apps/backend/src/
  common/rbac/permission.enum.ts                         -- MODIFY: add CUSTOMER_BANK_ACCOUNT_MANAGE
  common/rbac/role-permissions.map.ts                    -- MODIFY: grant the new permission
  common/audit/audit-action-type.enum.ts                  -- MODIFY: add 3 account actions
  common/audit/audit-context.ts                            -- MODIFY: allow explicit no-op audit skip
  common/audit/audit.interceptor.ts                       -- MODIFY: honor no-op audit skip
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
  test/customer-bank-account-management.integration.spec.ts -- NEW
  test/webhook-matching-routing.integration.spec.ts      -- MODIFY: active/inactive mapping cases

packages/shared-types/src/permission.ts                  -- NEW: shared permission enum used by BE and FE
packages/shared-types/src/index.ts                       -- MODIFY: export permission type

docs/overview.md                                               -- MODIFY: permission/API/module ownership
(implementation order defined in feature-map.md)                  -- MODIFY: dependency row and route ownership
docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md -- MODIFY: permission definition
docs/superpowers/plans/2026-08-03-multi-tenancy-rbac.md   -- MODIFY: permission implementation
docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md -- MODIFY: active mapping contract
docs/superpowers/plans/2026-08-03-webhook-matching-engine.md -- MODIFY: Task 1 ownership/lookup contract
docs/superpowers/plans/2026-08-03-spec-plan-reconciliation.md -- MODIFY: checklist and dependency note
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

Remove the old non-unique duplicate index rather than keeping two overlapping indexes. The project currently uses `synchronize: true`, so no migration file is added in this plan.

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

**Files:**
- Modify: `apps/backend/src/common/rbac/permission.enum.ts`
- Modify: `apps/backend/src/common/rbac/role-permissions.map.ts`
- Modify: `apps/backend/src/common/audit/audit-action-type.enum.ts`
- Modify: `apps/backend/src/common/audit/audit-context.ts`
- Modify: `apps/backend/src/common/audit/audit.interceptor.ts`
- Create: `packages/shared-types/src/permission.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/backend/src/common/rbac/role-permissions.map.spec.ts`
- Test: `apps/backend/src/common/audit/audit-action-type.enum.spec.ts`
- Test: `apps/backend/src/common/audit/audit.interceptor.spec.ts`

**Interfaces:**
- Consumes: existing `PermissionGuard`, `@RequirePermission`, `ROLE_PERMISSIONS`, `AuditActionType`, and `@Audited`.
- Produces: `Permission.CUSTOMER_BANK_ACCOUNT_MANAGE` and the three audit action values used by Task 4's controller.

- [ ] **Step 1: Add failing contract assertions**

Extend the existing RBAC/audit tests with:

```typescript
it('grants bank-account management only to financial write roles', () => {
  expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
  expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE);
});

it('defines all CustomerBankAccount audit actions', () => {
  expect(AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE).toBe('CUSTOMER_BANK_ACCOUNT_CREATE');
  expect(AuditActionType.CUSTOMER_BANK_ACCOUNT_UPDATE).toBe('CUSTOMER_BANK_ACCOUNT_UPDATE');
  expect(AuditActionType.CUSTOMER_BANK_ACCOUNT_DEACTIVATE).toBe('CUSTOMER_BANK_ACCOUNT_DEACTIVATE');
});
```

- [ ] **Step 2: Run the contract tests and verify they fail**

Run: `pnpm --filter @casso-ledger/backend test -- role-permissions.map.spec.ts audit-action-type.enum.spec.ts --runInBand`

Expected: FAIL because the new permission and action values are absent.

- [ ] **Step 3: Add the permission and audit values**

Create `packages/shared-types/src/permission.ts` with the complete existing permission set plus `CUSTOMER_BANK_ACCOUNT_MANAGE`, export it from `packages/shared-types/src/index.ts`, and change `apps/backend/src/common/rbac/permission.enum.ts` to re-export that shared `Permission` enum. This keeps one permission definition for BE and FE. Grant the new value to `OWNER`, `FINANCE_MANAGER`, and `ACCOUNTANT`; keep `SALES_REP` and `VIEWER` out of the write permission.

The shared enum must contain this exact set:

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
  CUSTOMER_BANK_ACCOUNT_MANAGE = 'CUSTOMER_BANK_ACCOUNT_MANAGE',
}
```

Add these exact enum values to `AuditActionType`:

```typescript
CUSTOMER_BANK_ACCOUNT_CREATE = 'CUSTOMER_BANK_ACCOUNT_CREATE',
CUSTOMER_BANK_ACCOUNT_UPDATE = 'CUSTOMER_BANK_ACCOUNT_UPDATE',
CUSTOMER_BANK_ACCOUNT_DEACTIVATE = 'CUSTOMER_BANK_ACCOUNT_DEACTIVATE',
```

Do not create a second role-permission map in `packages/shared-types`; the backend `ROLE_PERMISSIONS` map remains the authorization source of truth.

- [ ] **Step 4: Protect audit state from raw account numbers**

Use the existing audit snapshot path, but map `CustomerBankAccount` to a masked plain object before `AuditContextService.setBefore()`/`setAfter()`:

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

Do not broaden the generic sanitizer as a substitute; the owning mapper knows exactly which fields are safe.

When the existing `DELETE` endpoint is called for an already inactive row, the deactivate use case calls `auditContext.skip()` and the existing interceptor checks `auditContext.shouldSkip()` before inserting. This preserves idempotent HTTP behavior without creating a duplicate no-op audit event. Add the two methods to the existing `AuditContextService` store and cover the branch in `audit.interceptor.spec.ts`; do not create a second interceptor.

The minimal context change is:

```typescript
type AuditStore = { before: unknown; after: unknown; skip: boolean };

skip(): void {
  const store = this.storage.getStore();
  if (store) store.skip = true;
}

shouldSkip(): boolean {
  return this.storage.getStore()?.skip ?? false;
}
```

Initialize `skip: false` in the existing `run()` method and add this guard before `auditLogRepo.create(...)` in the existing interceptor:

```typescript
if (this.auditContext.shouldSkip()) return;
```

- [ ] **Step 5: Run the contract tests and commit**

Run the command from Step 2. Expected: PASS.

```bash
git add apps/backend/src/common/rbac apps/backend/src/common/audit packages/shared-types
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
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE, 'CustomerBankAccount')
create(@Param('customerId') customerId: string, @Body() dto: CreateCustomerBankAccountDto) {}

@Patch(':id')
@RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_UPDATE, 'CustomerBankAccount')
update(@Param('customerId') customerId: string, @Param('id') id: string, @Body() dto: UpdateCustomerBankAccountDto) {}

@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
@Audited(AuditActionType.CUSTOMER_BANK_ACCOUNT_DEACTIVATE, 'CustomerBankAccount')
deactivate(@Param('customerId') customerId: string, @Param('id') id: string) {}
```

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
- Modify: `apps/backend/test/webhook-matching-routing.integration.spec.ts`
- Create: `apps/backend/test/customer-bank-account-management.integration.spec.ts`
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

Run: `pnpm --filter @casso-ledger/backend test:e2e -- webhook-matching-routing.integration.spec.ts --runInBand`

Expected: FAIL until active filtering and shared normalization are wired into the repository/Matching Engine path.

- [ ] **Step 3: Use the shared normalization path in Matching Engine lookup**

Remove any direct `trim`, numeric coercion, or duplicate account-number normalization from `MatchingEngineService`. It must call the repository method with the provider string and let `findByAccountNumber()` normalize and filter active rows. Keep the existing `customerBankAccountScore = 10` behavior only when the repository returns a row.

- [ ] **Step 4: Add API integration tests**

The new `customer-bank-account-management.integration.spec.ts` must prove:

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
pnpm --filter @casso-ledger/backend test:e2e -- customer-bank-account-management.integration.spec.ts webhook-matching-routing.integration.spec.ts --runInBand
pnpm --filter @casso-ledger/backend type-check
```

Expected: all focused unit/integration tests and type-check pass. Commit:

```bash
git add apps/backend/src/modules/webhooks apps/backend/test
git commit -m "test: verify bank account mappings feed active matching only"
```

### Task 6: Synchronize the spec/plan contracts and implementation order

**Files:**
- Modify: `docs/overview.md`
- Modify: `(implementation order defined in feature-map.md)`
- Modify: `docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-multi-tenancy-rbac.md`
- Modify: `docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-webhook-matching-engine.md`
- Modify: `docs/superpowers/plans/2026-08-03-spec-plan-reconciliation.md`

**Interfaces:**
- Consumes: the accepted design in `docs/superpowers/specs/2026-08-04-customer-bank-account-management-design.md` and all implementation contracts from Tasks 1–5.
- Produces: one canonical documentation path with no remaining statement that bank-account mappings are seed-only or inferred by matching.

- [ ] **Step 1: Update RBAC documentation**

Add `CUSTOMER_BANK_ACCOUNT_MANAGE` to the permission enum/table and role matrix in the Multi-tenancy spec and plan. Record the exact role grants: `OWNER`, `FINANCE_MANAGER`, `ACCOUNTANT` only. Do not add a generic `CUSTOMER_WRITE` permission.

- [ ] **Step 2: Update Webhook/Matching ownership**

Change the Webhook spec/plan language from “management flow or seeded/admin setup creates the row” to: the Customer Bank Account Management plan owns runtime creation/update/deactivation; fixtures may seed rows only for isolated tests. State that lookup uses the shared normalizer and `isActive = true`.

- [ ] **Step 3: Add API ownership and dependency order**

Add the bank-account route contract to `docs/wayfinder/feature-map.md` after Webhook + Exception/Audit dependencies and before FE Core consumes any future bank-account UI. Keep existing FE routes untouched. In `docs/overview.md`, add the module/API ownership and permission row.

- [ ] **Step 4: Mark reconciliation coverage**

Add the new spec/plan pair and its cross-document updates to `2026-08-03-spec-plan-reconciliation.md`. Record that the feature is BE-only and does not require removing any FE API.

- [ ] **Step 5: Run documentation consistency checks and commit**

Run:

```bash
rg -n "CustomerBankAccount|customer-bank-account|CUSTOMER_BANK_ACCOUNT_MANAGE|/customers/:customerId/bank-accounts|isActive" docs/superpowers/specs docs/superpowers/plans docs/overview.md
rg -n "seeded/admin setup|infer.*customer|BankAccountsModule.*read-only" docs/superpowers/specs docs/superpowers/plans docs/overview.md
```

Expected: every occurrence points to the management plan or explicitly describes a test fixture; no current contract says Matching Engine may infer ownership or read inactive mappings. Commit:

```bash
git add docs/overview.md docs/superpowers
git commit -m "docs: reconcile customer bank account management contracts"
```

## Execution order and verification gate

Execute Tasks 1–6 in order. Before declaring the feature complete, run the focused unit tests, the two integration suites, type-check, and the documentation searches from Task 6. In the current workspace only the documentation exists, so those runtime commands will be runnable after the scaffold/backend plans have been implemented; do not claim runtime tests pass in the docs-only workspace.

## Self-review checklist

- Every requirement in `2026-08-04-customer-bank-account-management-design.md` maps to Tasks 1–6.
- No task creates a second `CustomerBankAccount` entity, repository token, or module.
- API paths, DTO fields, permission names, audit action names, and `isActive` lookup behavior are identical across all tasks.
- Raw account numbers appear only in write input and internal domain/repository operations, never in response/audit/log output.
- Cross-tenant access is handled by existing tenant-scoped repository contracts, not caller-supplied organization IDs.
- FE is intentionally not modified; existing FE calls remain untouched.


