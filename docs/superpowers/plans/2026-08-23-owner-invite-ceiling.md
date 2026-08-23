# OWNER Invite/Change-Role Ceiling — Implementation Plan (PR 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `invite-member` and `change-member-role` from ever assigning `OWNER`, and backfill existing organizations down to exactly one `OWNER`, closing the bug in issue #314.

**Architecture:** Add an `INVITABLE_ROLES` constant (`Role` minus `OWNER`) to `@casso-ledger/shared-types`, re-export it through the backend `organizations/domain/membership.ts` boundary (matching how `Role` is already re-exported there), and swap `@IsEnum(Role)` for `@IsIn(INVITABLE_ROLES)` on the two DTOs that can grant a role. This turns an `OWNER` request into an ordinary `VALIDATION_ERROR` (400) with no new `ErrorCode`. The frontend role selects consume the same constant so `OWNER` is never offered as an option. A one-off data migration demotes every non-earliest `OWNER` membership per organization to `FINANCE_MANAGER`, closing the pre-existing multi-owner data state.

**Tech Stack:** NestJS 11, class-validator, TypeORM 1.1 migrations, React 19 (shadcn/ui `Select`), Jest 30 (backend + shared-types), Vitest (frontend).

**Spec:** This plan implements the PR 1 scope from the issue #314 grilling session, recorded in `CONTEXT.md` Business Rule 15 and `docs/adr/0024-organization-single-owner-invariant.md`. PR 2 (the `OwnershipTransferRequest` feature — password+OTP confirmation, target acceptance, auto-demote on transfer) is out of scope for this plan and will get its own plan once PR 1 ships.

## Global Constraints

- No new `ErrorCode`: rejecting `OWNER` at invite/change-role must surface as the existing `VALIDATION_ERROR` (400), per the Q9 decision in the grilling session and ADR-0024's stated consequence.
- File naming: kebab-case; DI tokens are `Symbol('X')`; imports use `node:` protocol for builtins (not used in this plan).
- `import type` for pure types; value imports for anything used in a constructor param or decorator (`Role` is used as a decorator-adjacent field type here — keep it a value import wherever it already is one).
- Every new/changed test file follows RED → GREEN → REFACTOR: run it, see it fail for the stated reason, then implement.
- Backend unit tests: `npx jest --testPathPattern <path>` from `apps/backend`. Shared-types: `npx jest --testPathPattern <path>` from `packages/shared-types`. Frontend: `npx vitest run <path>` from `apps/frontend`.
- Migrations: no NestJS DI, no email/HTTP calls available inside `up()`/`down()` — see the note after Task 5 for why the "notify demoted owners by email" part of the original ask is deliberately deferred, not dropped.
- `Membership.role` (`memberships.role` column) is a Postgres enum column; assigning a plain string literal to it in `UPDATE ... SET "role" = 'FINANCE_MANAGER'` resolves via Postgres's assignment cast — no need to know the generated enum type name.

---

### Task 1: `INVITABLE_ROLES` — shared-types constant + domain re-export

**Files:**
- Modify: `packages/shared-types/src/role.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/backend/src/modules/organizations/domain/membership.ts:1-2`
- Test: `packages/shared-types/src/role.spec.ts` (create)

**Interfaces:**
- Produces: `INVITABLE_ROLES: Exclude<Role, Role.OWNER>[]` exported from `@casso-ledger/shared-types` and re-exported from `apps/backend/src/modules/organizations/domain/membership.ts`, alongside the existing `Role` re-export.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared-types/src/role.spec.ts
import { INVITABLE_ROLES, Role } from './role';

describe('INVITABLE_ROLES', () => {
  it('excludes OWNER', () => {
    expect(INVITABLE_ROLES).not.toContain(Role.OWNER);
  });

  it('includes every other role exactly once', () => {
    expect([...INVITABLE_ROLES].sort()).toEqual(
      [
        Role.FINANCE_MANAGER,
        Role.ACCOUNTANT,
        Role.SALES_REP,
        Role.VIEWER,
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/shared-types`): `npx jest --testPathPattern role.spec.ts`
Expected: FAIL — `INVITABLE_ROLES` is not exported from `./role` (`TypeError: ... is not iterable` or a TS compile error, depending on ts-jest config).

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared-types/src/role.ts
export enum Role {
  OWNER = 'OWNER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  VIEWER = 'VIEWER',
}

export const INVITABLE_ROLES = Object.values(Role).filter(
  (role): role is Exclude<Role, Role.OWNER> => role !== Role.OWNER,
);
```

```typescript
// packages/shared-types/src/index.ts
export { type InvoiceSourceType, InvoiceStatus } from './invoice-status';
export type { MembershipStatus } from './membership-status';
export { PeriodChargeStatus } from './period-charge-status';
export { Permission } from './permission';
export { PlanId } from './plan-id';
export { PlanUpgradeOrderStatus } from './plan-upgrade-order-status';
export { ReceivableStatus } from './receivable-status';
export { INVITABLE_ROLES, Role } from './role';
export { ROLE_PERMISSIONS } from './role-permissions';
export { SubscriptionStatus } from './subscription-status';
```

```typescript
// apps/backend/src/modules/organizations/domain/membership.ts (lines 1-2)
export type { MembershipStatus } from '@casso-ledger/shared-types';
export { INVITABLE_ROLES, Role } from '@casso-ledger/shared-types';
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `packages/shared-types`): `npx jest --testPathPattern role.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/role.ts packages/shared-types/src/role.spec.ts packages/shared-types/src/index.ts apps/backend/src/modules/organizations/domain/membership.ts
git commit -m "feat: add INVITABLE_ROLES excluding OWNER"
```

---

### Task 2: `invite-member.usecase` — reject `OWNER` at the DTO boundary

**Files:**
- Modify: `apps/backend/src/modules/auth/presentation/dto/invite-member.dto.ts`
- Test: `apps/backend/src/modules/auth/presentation/dto/invite-member.dto.spec.ts` (create)

**Interfaces:**
- Consumes: `INVITABLE_ROLES` from Task 1 (`../../../organizations/domain/membership`).
- Produces: no change to `InviteMemberDto`'s shape (`email: string`, `role: Role`) — only its validation narrows.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/auth/presentation/dto/invite-member.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../../organizations/domain/membership';
import { InviteMemberDto } from './invite-member.dto';

describe('InviteMemberDto', () => {
  it('rejects role OWNER', async () => {
    const dto = plainToInstance(InviteMemberDto, {
      email: 'a@b.com',
      role: Role.OWNER,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('accepts a non-OWNER role', async () => {
    const dto = plainToInstance(InviteMemberDto, {
      email: 'a@b.com',
      role: Role.ACCOUNTANT,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPattern invite-member.dto.spec.ts`
Expected: FAIL on `'rejects role OWNER'` — `@IsEnum(Role)` currently accepts `OWNER`, so `errors` is empty and `errors.some(...)` is `false`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/auth/presentation/dto/invite-member.dto.ts
import { IsEmail, IsIn } from 'class-validator';
import { INVITABLE_ROLES, Role } from '../../../organizations/domain/membership';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsIn(INVITABLE_ROLES)
  role: Role;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPattern invite-member.dto.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/dto/invite-member.dto.ts apps/backend/src/modules/auth/presentation/dto/invite-member.dto.spec.ts
git commit -m "fix: reject OWNER role on invite-member DTO"
```

---

### Task 3: `change-member-role.usecase` — reject `OWNER` at the DTO boundary

**Files:**
- Modify: `apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.ts`
- Test: `apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.spec.ts` (create)

**Interfaces:**
- Consumes: `INVITABLE_ROLES` from Task 1 (`../../domain/membership`).
- Produces: no change to `UpdateMemberRoleDto`'s shape (`role: Role`) — only its validation narrows.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../domain/membership';
import { UpdateMemberRoleDto } from './update-member-role.dto';

describe('UpdateMemberRoleDto', () => {
  it('rejects role OWNER', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: Role.OWNER });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('accepts a non-OWNER role', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: Role.VIEWER });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPattern update-member-role.dto.spec.ts`
Expected: FAIL on `'rejects role OWNER'` — same reason as Task 2.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.ts
import { IsIn } from 'class-validator';
import { INVITABLE_ROLES, Role } from '../../domain/membership';

export class UpdateMemberRoleDto {
  @IsIn(INVITABLE_ROLES)
  role: Role;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPattern update-member-role.dto.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.ts apps/backend/src/modules/organizations/presentation/dto/update-member-role.dto.spec.ts
git commit -m "fix: reject OWNER role on change-member-role DTO"
```

---

### Task 4: Frontend — stop offering `OWNER` in the invite/change-role selects

**Files:**
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx:1,50,54-58`
- Test: `apps/frontend/src/features/settings/components/users-tab.spec.tsx` (add a test to the existing file)

**Interfaces:**
- Consumes: `INVITABLE_ROLES` from `@casso-ledger/shared-types` (Task 1).
- No change to `MembersTableProps`, `onRoleChange`, or any exported symbol — this only narrows which `<SelectItem>`s render.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/settings/components/users-tab.spec.tsx` (inside the existing `describe('UsersTab', ...)` block, after the `beforeAll`):

```tsx
it('never offers OWNER as a selectable role', async () => {
  useAuth.mockReturnValue({
    user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
  });
  mockApi();
  renderTab();

  await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());

  fireEvent.click(screen.getByRole('combobox', { name: 'Vai trò' }));
  expect(
    await screen.findByRole('option', { name: 'Kế toán' }),
  ).toBeTruthy();
  expect(screen.queryByRole('option', { name: 'Chủ sở hữu' })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/users-tab.spec.tsx`
Expected: FAIL — `roleSelectItems` currently includes `Role.OWNER` (`Chủ sở hữu`), so `screen.queryByRole('option', { name: 'Chủ sở hữu' })` is not `null`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/features/settings/components/users-tab.tsx
// line 1: add INVITABLE_ROLES to the existing import
import { INVITABLE_ROLES, Permission, Role } from '@casso-ledger/shared-types';
```

```tsx
// lines 50-58: keep `roles` (all 5) for display/lookup, but build the
// dropdown options from INVITABLE_ROLES only
const roles = Object.values(Role);

type StatusFilter = 'ALL' | MembershipStatus;

const roleSelectItems = INVITABLE_ROLES.map((item) => (
  <SelectItem key={item} value={item}>
    {ROLE_LABELS[item]}
  </SelectItem>
));
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/frontend`): `npx vitest run src/features/settings/components/users-tab.spec.tsx`
Expected: PASS (all tests in the file, including the pre-existing ones — `roles.find(...)` still works since every selectable value is now a subset of `roles`).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/users-tab.tsx apps/frontend/src/features/settings/components/users-tab.spec.tsx
git commit -m "fix: remove OWNER from invite/change-role selects"
```

---

### Task 5: Migration — backfill existing organizations down to one `OWNER`

**Files:**
- Create: `apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.ts`
- Test: `apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.spec.ts`

**Interfaces:**
- Produces: no new exported symbols consumed elsewhere — this is a standalone `MigrationInterface`, run by TypeORM's migration runner, not imported by application code.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.spec.ts
import type { QueryRunner } from 'typeorm';
import { BackfillSingleOwnerPerOrganization20260902000000 } from './20260902000000-backfill-single-owner-per-organization';

describe('BackfillSingleOwnerPerOrganization20260902000000', () => {
  it('demotes every OWNER except the earliest-joined one per organization', async () => {
    const migration = new BackfillSingleOwnerPerOrganization20260902000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(true);
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('LOCK TABLE "memberships" IN SHARE ROW EXCLUSIVE MODE');
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY "organizationId"');
    expect(sql).toContain('ORDER BY "createdAt" ASC, "id" ASC');
    expect(sql).toContain('SET "role" = \'FINANCE_MANAGER\'');
    expect(sql).toContain('rank > 1');
  });

  it('is a one-directional data backfill with no down migration', async () => {
    const migration = new BackfillSingleOwnerPerOrganization20260902000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest --testPathPattern backfill-single-owner-per-organization`
Expected: FAIL — `Cannot find module './20260902000000-backfill-single-owner-per-organization'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillSingleOwnerPerOrganization20260902000000
  implements MigrationInterface
{
  name = 'BackfillSingleOwnerPerOrganization20260902000000';
  transaction = true;

  // Issue #314 / ADR-0024: an Organization must have exactly one active
  // OWNER. Organizations that already have more than one (the pre-#314
  // bug this migration closes) keep their earliest-joined OWNER and get
  // the rest demoted to FINANCE_MANAGER.
  async up(queryRunner: QueryRunner): Promise<void> {
    // Blocks concurrent role writes on `memberships` for the duration of
    // the backfill, so an in-flight invite/change-role request can't race
    // the demote and leave the organization with an inconsistent count.
    await queryRunner.query(
      'LOCK TABLE "memberships" IN SHARE ROW EXCLUSIVE MODE',
    );
    await queryRunner.query(`
      WITH ranked_owners AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "organizationId"
            ORDER BY "createdAt" ASC, "id" ASC
          ) AS rank
        FROM "memberships"
        WHERE "role" = 'OWNER' AND "joinedAt" IS NOT NULL
      )
      UPDATE "memberships" m
      SET "role" = 'FINANCE_MANAGER'
      FROM ranked_owners ro
      WHERE m."id" = ro."id" AND ro.rank > 1
    `);
  }

  // Which memberships were demoted is not recoverable from data alone
  // (a demoted row looks identical to one that was always FINANCE_MANAGER)
  // — this backfill is one-directional, like the balance-history rollout
  // baseline (20260822000000-add-receivable-balance-history-rollout-baseline.ts).
  async down(_queryRunner: QueryRunner): Promise<void> {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/backend`): `npx jest --testPathPattern backfill-single-owner-per-organization`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.ts apps/backend/src/database/migrations/20260902000000-backfill-single-owner-per-organization.spec.ts
git commit -m "feat: backfill organizations to a single OWNER"
```

**Scope note — email notification deferred:** the grilling decision (Q3) asked for demoted owners to get an email. A `MigrationInterface.up()` runs against a bare `QueryRunner`, outside NestJS DI — it cannot reach `IAuthEmailSender` or the BullMQ-backed email queue that ADR-0009 requires all email to go through, and a migration is the wrong place to make a network call inside a schema/data transaction anyway. This plan ships the backfill without the notification. After this migration runs, query for affected rows with:

```sql
SELECT "organizationId", "userId" FROM "memberships"
WHERE "role" = 'FINANCE_MANAGER'
  AND EXISTS (
    SELECT 1 FROM "memberships" o
    WHERE o."organizationId" = "memberships"."organizationId" AND o."role" = 'OWNER'
  );
```

and notify those users manually, or — if the affected count turns out to be non-trivial — file a follow-up ticket for a proper application-layer notification step (an admin-triggered use case, not a migration).

---

### Task 6: Full verification

- [ ] **Step 1: Run backend unit tests**

Run (from `apps/backend`): `npx jest`
Expected: all suites pass, including the new specs from Tasks 2, 3, 5.

- [ ] **Step 2: Run shared-types unit tests**

Run (from `packages/shared-types`): `npx jest`
Expected: all suites pass, including the new spec from Task 1.

- [ ] **Step 3: Run frontend unit tests**

Run (from `apps/frontend`): `npx vitest run`
Expected: all suites pass, including the updated `users-tab.spec.tsx` from Task 4.

- [ ] **Step 4: Type-check everything**

Run (from repo root): `npx tsc --noEmit` in each of `apps/backend`, `apps/frontend`, `packages/shared-types` (or `pnpm -r exec tsc --noEmit` if the workspace supports it).
Expected: no errors.

- [ ] **Step 5: Lint and format**

Run (from repo root): `npx biome check --write .`
Expected: no unfixable violations.

- [ ] **Step 6: Domain check**

Run the `domain-check` skill (`/domain-check`) per AGENTS.md's "after any backend code change" rule.
Expected: no violations — this plan does not touch `domain/` business logic beyond a pure re-export (Task 1), and introduces no HttpException/any/cast usage.

- [ ] **Step 7: Full `pnpm verify`**

Run (from repo root): `pnpm verify`
Expected: PASS (lint + type-check + test, per `AGENTS.md`).
