# Admin Platform member block/unblock UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add an Operator organization detail/member workspace that lists active, blocked, and pending members and lets an Operator block or unblock any membership, including an organization `OWNER`.

**Architecture:** Add two Admin read endpoints behind the existing `AdminAuthGuard`: organization detail and paginated, server-filtered members/invites. Application use cases own the filter contract; repository ports provide organization-scoped PostgreSQL reads. The frontend adds one route/page using the existing Admin layout, React Query, tables, `BreakerSwitch`, and `AlertDialog`; existing block/unblock write endpoints remain unchanged.

**Tech Stack:** NestJS 11, TypeORM/PostgreSQL, Jest/Testcontainers, React 19, React Router, TanStack Query, Vitest, Testing Library, and existing Tailwind tokens.

**Spec:** `docs/superpowers/specs/2026-08-15-admin-member-block-unblock-ui-design.md`

## Global Constraints

- Keep every Admin endpoint behind `AdminAuthGuard`; do not add tenant JWT or `PermissionGuard` to the Operator surface.
- Application/domain code throws `AppError`, never `HttpException`; controllers remain orchestration-only.
- Every HTTP response DTO is a class in a `.dto.ts` file with Swagger decorators.
- Every member/invite read includes the target `organizationId`; invites also require `acceptedAt IS NULL`.
- Use PostgreSQL-side pagination, filtering, and search; do not load an organization into React and filter there.
- Search is trimmed, escaped with the existing `toLikePattern`, case-insensitive, and capped by `MAX_SEARCH_LENGTH`.
- Do not add a package, font, color token, toast system, or separate UI library.
- Follow RED → GREEN → REFACTOR for each behavior slice.

---

### Task 1: Add the Admin organization detail read

**Files:**
- Create: `apps/backend/src/modules/admin/application/get-organization.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/get-organization.usecase.spec.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.spec.ts`
- Modify: `apps/backend/src/modules/admin/admin.module.ts`

**Interfaces:** Consumes `IOrganizationRepository.findById(organizationId)`.
Produces `GetOrganizationUseCase.execute({ organizationId }): Promise<Organization>`
and `GET /api/v1/admin/organizations/:id` returning `AdminOrganizationItemResponseDto`.

- [ ] **Step 1: Write failing tests**

Test that a found organization is returned and a missing organization throws
`AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.')`:

~~~ts
it('returns the requested organization', async () => {
  const organization = buildOrganization({ id: 'org-1', name: 'Acme' });
  const repo = { findById: jest.fn().mockResolvedValue(organization) };
  const useCase = new GetOrganizationUseCase(repo as never);

  await expect(useCase.execute({ organizationId: 'org-1' })).resolves.toBe(
    organization,
  );
  expect(repo.findById).toHaveBeenCalledWith('org-1');
});

it('throws NOT_FOUND when the organization does not exist', async () => {
  const useCase = new GetOrganizationUseCase({
    findById: jest.fn().mockResolvedValue(null),
  } as never);

  await expect(useCase.execute({ organizationId: 'org-1' })).rejects.toMatchObject({
    errorCode: ErrorCode.NOT_FOUND,
  });
});
~~~

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/get-organization.usecase.spec.ts --runInBand
~~~

Expected: FAIL because the use case does not exist.

- [ ] **Step 3: Implement and wire the endpoint**

Create the injectable use case with `ORGANIZATION_REPOSITORY`, throwing the
Vietnamese `NOT_FOUND` `AppError`. Add the controller method with
`ParseUUIDPipe`, `@ApiOperation`, `@ApiOkResponse({ type: AdminOrganizationItemResponseDto })`,
and `@ApiErrorResponse(VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND)`.
Register the provider in `AdminModule` and update the controller fixture.

- [ ] **Step 4: Verify GREEN**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/get-organization.usecase.spec.ts src/modules/admin/presentation/admin.controller.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/backend/src/modules/admin/application/get-organization.usecase.ts apps/backend/src/modules/admin/application/get-organization.usecase.spec.ts apps/backend/src/modules/admin/presentation/admin.controller.ts apps/backend/src/modules/admin/presentation/admin.controller.spec.ts apps/backend/src/modules/admin/admin.module.ts
git commit -m "feat: add admin organization detail endpoint"
~~~

### Task 2: Add organization-scoped repository filters

**Files:**
- Modify: `apps/backend/src/modules/organizations/application/membership-repository.port.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts`
- Modify: `apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.spec.ts`
- Modify: `apps/backend/src/modules/auth/application/membership-invite-repository.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.spec.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Create: `apps/backend/src/modules/admin/application/admin-member-status-filter.ts`

**Interfaces:**
- Add `AdminMemberStatusFilter = 'ALL' | 'ACTIVE' | 'BLOCKED' | 'PENDING'` in the Admin application layer; repository ports receive only membership filters.
- Add `MembershipListFilters { status?: MembershipStatus; userIds?: string[] }`.
- Extend `findPageByOrganization` and `countByOrganization` with optional filters.
- Add `findUserIdsByOrganizationSearch(organizationId, search): Promise<string[]>`.
- Add optional `search?: string` to pending invite page/count methods.
- Export `MEMBERSHIP_INVITE_REPOSITORY` from `AuthModule`.

- [ ] **Step 1: Write failing repository tests**

Assert membership queries retain `organizationId`, require `joinedAt IS NOT NULL`,
apply status/user IDs, and return no rows for an empty user-ID match. Assert the
search query is organization-scoped and uses escaped `ILIKE`. Assert invite
queries retain `acceptedAt IS NULL`, search email with `ILIKE`, and never select
`tokenHash`.

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/organizations/infrastructure/typeorm-membership.repository.spec.ts src/modules/auth/infrastructure/typeorm-membership-invite.repository.spec.ts --runInBand
~~~

Expected: FAIL because the signatures and predicates do not exist.

- [ ] **Step 3: Implement the filtered reads**

Use TypeORM query builders for membership page/count and join the `users` table
only for `findUserIdsByOrganizationSearch`. Scope every predicate by
organization and joined membership. Use `toLikePattern(search.trim())`; do not
interpolate raw input. Apply `status` and non-empty `userIds` filters. For
pending invites retain the existing projection and `acceptedAt IS NULL`, so
expired-but-unaccepted invites remain visible.

- [ ] **Step 4: Verify GREEN and regression**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/organizations/infrastructure/typeorm-membership.repository.spec.ts src/modules/auth/infrastructure/typeorm-membership-invite.repository.spec.ts src/modules/organizations/application/list-members.usecase.spec.ts --runInBand
~~~

Expected: PASS; existing tenant member list tests remain green.

- [ ] **Step 5: Commit**

~~~bash
git add apps/backend/src/modules/organizations/application/membership-repository.port.ts apps/backend/src/modules/admin/application/admin-member-status-filter.ts apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.ts apps/backend/src/modules/organizations/infrastructure/typeorm-membership.repository.spec.ts apps/backend/src/modules/auth/application/membership-invite-repository.port.ts apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.spec.ts apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat: add organization member search filters"
~~~

### Task 3: Add the Admin members/pending-invites use case and endpoint

**Files:**
- Create: `apps/backend/src/modules/admin/application/list-organization-members.usecase.ts`
- Create: `apps/backend/src/modules/admin/application/list-organization-members.usecase.spec.ts`
- Create: `apps/backend/src/modules/admin/presentation/dto/admin-members-query.dto.ts`
- Modify: `apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.ts`
- Modify: `apps/backend/src/modules/admin/presentation/admin.controller.spec.ts`
- Modify: `apps/backend/src/modules/admin/admin.module.ts`

**Interfaces:**
- Input: `{ organizationId, page, limit, status, search? }`.
- Output: `{ members: { items, total, page, limit }, pendingInvites: { items, total, page, limit } }`.
- Member item: `id, userId, name, email, role, joinedAt, status, blockedAt`.
- Invite item: `id, email, role, invitedAt, expiresAt`.

- [ ] **Step 1: Write failing use-case tests**

Cover: `ALL` reads both collections and batches `findByIds`; `ACTIVE`/`BLOCKED`
reads members only and passes status; `PENDING` reads invites only and returns
an expired invite; search trims and scopes matching user IDs; and an empty
user-ID search skips member page/count queries.

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/list-organization-members.usecase.spec.ts --runInBand
~~~

Expected: FAIL because the use case and DTOs do not exist.

- [ ] **Step 3: Implement use case, DTOs, and controller**

Normalize `input.search` with `trim()`; treat empty search as undefined. Run
member/invite branches in parallel for `ALL` and skip the irrelevant branch for
other filters. Batch user lookup, drop orphaned users from returned items, and
expose no secrets/internal fields.

Create `AdminMembersQueryDto extends PaginationDto` with class-validator:

~~~ts
@ApiProperty({ enum: ['ALL', 'ACTIVE', 'BLOCKED', 'PENDING'], default: 'ALL' })
@IsOptional()
@IsIn(ADMIN_MEMBER_STATUS_FILTERS)
status: AdminMemberStatusFilter = 'ALL';

@ApiProperty({ type: String, required: false })
@IsOptional()
@IsString()
@MaxLength(MAX_SEARCH_LENGTH)
search?: string;
~~~

Add class-based Swagger DTOs and
`GET /admin/organizations/:orgId/members` with `ParseUUIDPipe`,
`@ApiOperation`, `@ApiOkResponse`, and error codes
`VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND`. Register the use case
and inject both repository tokens through module exports.

- [ ] **Step 4: Verify unit, controller, and architecture checks**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/list-organization-members.usecase.spec.ts src/modules/admin/presentation/admin.controller.spec.ts --runInBand
pnpm --filter @casso-ledger/backend arch-check
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/backend/src/modules/admin/application/list-organization-members.usecase.ts apps/backend/src/modules/admin/application/list-organization-members.usecase.spec.ts apps/backend/src/modules/admin/presentation/dto/admin-members-query.dto.ts apps/backend/src/modules/admin/presentation/dto/admin-response.dto.ts apps/backend/src/modules/admin/presentation/admin.controller.ts apps/backend/src/modules/admin/presentation/admin.controller.spec.ts apps/backend/src/modules/admin/admin.module.ts
git commit -m "feat: add admin organization member listing"
~~~

### Task 4: Add backend Admin read integration coverage

**Files:**
- Modify: `apps/backend/test/admin.e2e-spec.ts`
- Use: `apps/backend/src/modules/auth/infrastructure/membership-invite.orm-entity.ts`

- [ ] **Step 1: Write failing e2e assertions**

Seed a second member and one unaccepted invite in Acme. Assert detail returns
the organization, `ALL` returns member/invite collections, `PENDING` includes
an expired invite, `BLOCKED` returns only blocked members after the existing
block call, missing organization returns 404, and missing operator token returns
401.

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json test/admin.e2e-spec.ts --runInBand
~~~

Expected: FAIL at the new GET assertions.

- [ ] **Step 3: Add only required fixtures**

Use `MembershipInviteOrmEntity` with a non-secret token hash, `acceptedAt: null`,
and a past `expiresAt`. Do not add a production fixture helper.

- [ ] **Step 4: Verify GREEN**

Run the same focused e2e command and confirm existing lock/block tests remain
green.

- [ ] **Step 5: Commit**

~~~bash
git add apps/backend/test/admin.e2e-spec.ts
git commit -m "test: cover admin organization member reads"
~~~

### Task 5: Add frontend Admin API, hooks, navigation, and route

**Files:**
- Modify: `apps/frontend/src/features/admin/api/admin-api.ts`
- Modify: `apps/frontend/src/features/admin/api/use-admin.ts`
- Modify: `apps/frontend/src/features/admin/pages/admin-organizations-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx`
- Modify: `apps/frontend/src/routes/index.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-organization-members-page.spec.tsx`

**Interfaces:**
- Add typed `getAdminOrganization`, `listOrganizationMembers`,
  `blockOrganizationMember`, and `unblockOrganizationMember`.
- Add React Query keys with an `admin-organization` prefix and invalidate the
  member-list prefix after mutations.
- Add lazy route `admin/organizations/:organizationId/members`.

- [ ] **Step 1: Write failing frontend tests**

Assert the organizations table exposes a `Thành viên` link to
`/admin/organizations/org-1/members`. In the new page spec, mock the two GET
functions and assert the initial calls:

~~~ts
expect(adminApi.getAdminOrganization).toHaveBeenCalledWith('org-1');
expect(adminApi.listOrganizationMembers).toHaveBeenCalledWith('org-1', {
  page: 1,
  limit: 50,
  status: 'ALL',
  search: '',
});
~~~

Add route coverage through the existing AdminRoute harness.

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/admin/pages/admin-organizations-page.spec.tsx src/features/admin/pages/admin-organization-members-page.spec.tsx
~~~

Expected: FAIL because the APIs, page, link, and route do not exist.

- [ ] **Step 3: Implement API, hooks, link, and lazy route**

Add frontend response interfaces matching backend DTOs. Use
`apiRequest({ params })` instead of hand-built query strings. Add one mutation
hook accepting `{ organizationId, userId, action: 'block' | 'unblock' }`.
Use the existing Button/Link pattern for the organization-row link; do not add
a new AdminLayout navigation item. Lazy-load the new page under the existing
`admin` route.

- [ ] **Step 4: Verify GREEN**

Run the focused Vitest command from Step 2. Expected: PASS for API invocation,
navigation, route loading, and query initialization.

- [ ] **Step 5: Commit**

~~~bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/features/admin/api/use-admin.ts apps/frontend/src/features/admin/pages/admin-organizations-page.tsx apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx apps/frontend/src/routes/index.tsx apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx apps/frontend/src/features/admin/pages/admin-organization-members-page.spec.tsx
git commit -m "feat: add admin organization members route"
~~~

### Task 6: Build the Admin members UI with TDD

**Files:**
- Modify: `apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-organization-members-page.spec.tsx`

- [ ] **Step 1: Write failing behavior tests**

Cover organization header/back link; active/blocked badges; pending invite
table and expired badge; URL-backed status/search/page changes; owner-specific
block warning; correct block/unblock path; per-row pending disable; query
invalidation on success; inline alert on failure; loading, empty, error, and
pagination states. Use row-scoped `within(row)` assertions when status text
also exists in the filter.

- [ ] **Step 2: Verify RED**

~~~bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/admin/pages/admin-organization-members-page.spec.tsx
~~~

Expected: FAIL because the page has no tables, controls, dialogs, or mutation
behavior.

- [ ] **Step 3: Implement the approved visual direction**

Use existing tokens/primitives and this structure:

~~~tsx
<div className="space-y-6">
  <header>back link + ADMIN CONSOLE + organization context</header>
  <div className="flex flex-wrap items-end gap-2">search + status select</div>
  <section>members heading/count + member table</section>
  <section>pending invites heading/count + invite table</section>
  <footer>one shared pager</footer>
</div>
~~~

Read `page`, `status`, and `search` from `useSearchParams`; normalize invalid
values to `1`/`ALL` and reset page to 1 when search/status changes. Use the
existing `vi-VN` medium-date formatter. Use
`checked={member.status === 'BLOCKED'}` and labels such as
`Chặn Nguyễn Văn A`/`Bỏ chặn Nguyễn Văn A`. Keep pending invites read-only.
Compute expiry from `expiresAt` at render time; do not add `isExpired` to the API.

- [ ] **Step 4: Verify GREEN and frontend quality**

~~~bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/admin/pages/admin-organization-members-page.spec.tsx src/features/admin/pages/admin-organizations-page.spec.tsx
pnpm --filter @casso-ledger/frontend type-check
pnpm --filter @casso-ledger/frontend lint
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx apps/frontend/src/features/admin/pages/admin-organization-members-page.spec.tsx
git commit -m "feat: add operator member block UI"
~~~

### Task 7: Full verification and handoff

**Files:** Modify only test fixtures/docs if verification identifies a real
failure; do not broaden scope.

- [ ] **Step 1: Run focused suites**

~~~bash
pnpm --filter @casso-ledger/backend exec jest src/modules/admin --runInBand
pnpm --filter @casso-ledger/frontend exec vitest run src/features/admin
~~~

- [ ] **Step 2: Run integration and repository verification**

~~~bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json test/admin.e2e-spec.ts --runInBand
pnpm verify
~~~

- [ ] **Step 3: Run the required domain-check**

Follow `.claude/skills/domain-check.md` after backend changes. Check changed
files for tenant scoping, clean architecture, unsafe casts, status transaction
issues, and forbidden domain imports; fix every violation before completion.

- [ ] **Step 4: Inspect the final diff**

~~~bash
git diff main...HEAD --stat
git diff main...HEAD --check
git status --short
~~~

Confirm env files remain ignored/untracked, no secrets are staged, and no
unrelated files changed.

- [ ] **Step 5: Report evidence and keep feature-map status correct**

Report worktree, commits, focused tests, e2e, `pnpm verify`, and domain-check
results. Keep #186 `in-progress` until its PR is merged; only then add shipped
date/PR reference and change it to `done`.
