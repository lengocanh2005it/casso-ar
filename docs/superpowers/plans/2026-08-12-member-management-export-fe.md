# Member Management + CSV Export FE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the frontend for member role change/removal, invite revoke/resend, and CSV export buttons — closing the FE half of issues #128 and #130 (backend shipped in PR #148).

**Architecture:** Small backend addition (`GET /organizations/:id/invites`) so the FE can list pending invites, then pure frontend work extending `apps/frontend/src/features/settings/` (`UsersTab` + new `PendingInvitesTable`), `features/receivables/`, and `features/reports/` following each feature's existing `api/` + `components/`/`pages/` structure.

**Tech Stack:** NestJS 11 (backend addition), React 19 + TanStack Query + shadcn/ui (`AlertDialog`, `Table`, `Button`) + Vitest + Testing Library (frontend), Jest (backend).

## Global Constraints

- Money/N-A — this plan touches no money fields.
- Every backend query/write scoped by `organizationId` (`TenantContextService.getOrganizationId()`), tenant-mismatch checked via `assertOrgMatches` in the controller.
- Backend: `domain/` no NestJS/TypeORM imports; `application/` throws `AppError`, never `HttpException`; controllers only call use cases.
- Backend error shape: `{ statusCode, errorCode, message, details? }`.
- Frontend RBAC: `hasPermission(role, permission)` — **hide** the control, never just disable, when permission is missing (business-rule guards like "last OWNER" are different — those stay visible and let the backend 409, see Task 7).
- Frontend: no `any`, types from `@casso-ledger/shared-types`, feature folders own their `api/`/`components/`/`pages/`.
- TDD: RED → GREEN → REFACTOR for every task; write the failing test first, run it, then write the minimal code.
- Backend file naming: kebab-case, `*.usecase.ts`, `*-repository.port.ts`, `*.orm-entity.ts`, `typeorm-*.repository.ts`.
- Backend test commands: `npx jest --testPathPatterns <name>` (unit), `npx jest --config test/jest-e2e.json test/<file>.e2e-spec.ts` (e2e, standalone — do not run multiple e2e files together, see PR #148 commit history on cross-file testcontainer flakiness).
- Frontend test command: `pnpm --filter @casso-ledger/frontend test` (Vitest).
- Frontend type-check: `pnpm --filter @casso-ledger/frontend type-check`. Lint: `pnpm --filter @casso-ledger/frontend lint`.
- All work happens in worktree `D:\casso-ledger\.worktrees\feat\member-management-export-fe` (branch `feat/member-management-export-fe`) — never on `main`.

---

### Task 1: Backend — `findPendingPageByOrganization`/`countPendingByOrganization` + `ListInvitesUseCase`

**Files:**
- Modify: `apps/backend/src/modules/auth/application/membership-invite-repository.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts`
- Create: `apps/backend/src/modules/auth/application/list-invites.usecase.ts`
- Create: `apps/backend/src/modules/auth/application/list-invites.usecase.spec.ts`

**Interfaces:**
- Consumes: `IMembershipInviteRepository` (existing port), `TenantContextService.getOrganizationId(): string` (existing).
- Produces: `ListInvitesUseCase.execute(input: { page: number; limit: number }): Promise<{ items: MembershipInvite[]; total: number; page: number; limit: number }>` — Task 2's controller calls this exact signature.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/auth/application/list-invites.usecase.spec.ts`:

```typescript
import { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import { ListInvitesUseCase } from './list-invites.usecase';

function buildInvite(
  overrides: Partial<ConstructorParameters<typeof MembershipInvite>[0]> = {},
) {
  return new MembershipInvite({
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'moi@congtyb.vn',
    role: Role.VIEWER,
    invitedByUserId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date('2026-08-20'),
    acceptedAt: null,
    createdAt: new Date('2026-08-12'),
    ...overrides,
  });
}

describe('ListInvitesUseCase', () => {
  it('lists pending invites for the caller organization', async () => {
    const invite = buildInvite();
    const inviteRepo = {
      findPendingPageByOrganization: jest.fn().mockResolvedValue([invite]),
      countPendingByOrganization: jest.fn().mockResolvedValue(1),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ListInvitesUseCase(
      inviteRepo as never,
      tenantContext as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
    );
    expect(inviteRepo.countPendingByOrganization).toHaveBeenCalledWith(
      'org-1',
    );
    expect(result).toEqual({ items: [invite], total: 1, page: 1, limit: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns list-invites.usecase -v`
Expected: FAIL — `Cannot find module './list-invites.usecase'`.

- [ ] **Step 3: Add the repository methods (port + implementation)**

In `apps/backend/src/modules/auth/application/membership-invite-repository.port.ts`, add to the interface:

```typescript
export interface IMembershipInviteRepository {
  findByTokenHash(tokenHash: string): Promise<MembershipInvite | null>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<MembershipInvite | null>;
  save(invite: MembershipInvite, manager?: EntityManager): Promise<void>;
  delete(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<void>;
  findPendingPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<MembershipInvite[]>;
  countPendingByOrganization(organizationId: string): Promise<number>;
}
```

In `apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts`, add the `IsNull` import and the two methods:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { IMembershipInviteRepository } from '../application/membership-invite-repository.port';
import { MembershipInvite } from '../domain/membership-invite';
import { MembershipInviteOrmEntity } from './membership-invite.orm-entity';

@Injectable()
export class TypeOrmMembershipInviteRepository
  implements IMembershipInviteRepository
{
  constructor(
    @InjectRepository(MembershipInviteOrmEntity)
    private readonly repo: Repository<MembershipInviteOrmEntity>,
  ) {}

  // ... existing findByTokenHash, findById, save, delete unchanged ...

  async findPendingPageByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<MembershipInvite[]> {
    const rows = await this.repo.find({
      where: { organizationId, acceptedAt: IsNull() },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => new MembershipInvite(row));
  }

  async countPendingByOrganization(organizationId: string): Promise<number> {
    return this.repo.count({ where: { organizationId, acceptedAt: IsNull() } });
  }
}
```

- [ ] **Step 4: Write the minimal `ListInvitesUseCase`**

Create `apps/backend/src/modules/auth/application/list-invites.usecase.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { MembershipInvite } from '../domain/membership-invite';
import {
  type IMembershipInviteRepository,
  MEMBERSHIP_INVITE_REPOSITORY,
} from './membership-invite-repository.port';

export interface ListInvitesInput {
  page: number;
  limit: number;
}

export interface ListInvitesOutput {
  items: MembershipInvite[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListInvitesUseCase {
  constructor(
    @Inject(MEMBERSHIP_INVITE_REPOSITORY)
    private readonly inviteRepo: IMembershipInviteRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListInvitesInput): Promise<ListInvitesOutput> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [items, total] = await Promise.all([
      this.inviteRepo.findPendingPageByOrganization(
        organizationId,
        input.page,
        input.limit,
      ),
      this.inviteRepo.countPendingByOrganization(organizationId),
    ]);
    return { items, total, page: input.page, limit: input.limit };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns list-invites.usecase -v`
Expected: PASS (1 test).

- [ ] **Step 6: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/auth/application/membership-invite-repository.port.ts apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts apps/backend/src/modules/auth/application/list-invites.usecase.ts apps/backend/src/modules/auth/application/list-invites.usecase.spec.ts
git commit -m "feat: list pending invites (ListInvitesUseCase + repository methods)"
```

---

### Task 2: Backend — `GET /organizations/:id/invites` endpoint + module wiring

**Files:**
- Create: `apps/backend/src/modules/auth/presentation/dto/invite-response.dto.ts`
- Modify: `apps/backend/src/modules/auth/presentation/invites.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `ListInvitesUseCase.execute({ page, limit })` (Task 1), `assertOrgMatches(request, organizationId)` (existing, `common/auth/assert-org-matches.ts`), `PaginationDto` (existing, `common/dto/pagination.dto.ts`).
- Produces: `GET /api/v1/organizations/:id/invites?page&limit` → `{ items: InviteResponseDto[], total, page, limit }`. Task 4 (FE `fetchOrganizationInvites`) is the consumer.

- [ ] **Step 1: Create the response DTO**

Create `apps/backend/src/modules/auth/presentation/dto/invite-response.dto.ts`:

```typescript
import type { Role } from '../../../organizations/domain/membership';
import type { MembershipInvite } from '../../domain/membership-invite';

export interface InviteResponseDto {
  id: string;
  email: string;
  role: Role;
  invitedAt: Date;
  expiresAt: Date;
}

export function toInviteResponse(invite: MembershipInvite): InviteResponseDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}
```

No `tokenHash` in the DTO — never leak the invite token.

- [ ] **Step 2: Add the controller handler**

In `apps/backend/src/modules/auth/presentation/invites.controller.ts`, update imports and constructor, then add the handler.

Change the `@nestjs/common` import to add `Get` and `Query`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
```

Add two imports below the existing `assertOrgMatches`/`AuthRequest` import:

```typescript
import { PaginationDto } from '../../../common/dto/pagination.dto';
```

Add near the other use case imports:

```typescript
import { ListInvitesUseCase } from '../application/list-invites.usecase';
```

Add near the other DTO import:

```typescript
import { toInviteResponse } from './dto/invite-response.dto';
```

Add `listInvitesUseCase` to the constructor:

```typescript
  constructor(
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly acceptInviteUseCase: AcceptInviteUseCase,
    private readonly deleteInviteUseCase: DeleteInviteUseCase,
    private readonly resendInviteUseCase: ResendInviteUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    private readonly listInvitesUseCase: ListInvitesUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
```

Add the handler (place it right after `invite()`, before `accept()`):

```typescript
  @Get('organizations/:id/invites')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async listInvites(
    @Param('id') organizationId: string,
    @Query() pagination: PaginationDto,
    @Req() request: AuthRequest,
  ) {
    assertOrgMatches(request, organizationId);
    const result = await this.listInvitesUseCase.execute({
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      items: result.items.map(toInviteResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
```

- [ ] **Step 3: Wire `ListInvitesUseCase` into `AuthModule`**

In `apps/backend/src/modules/auth/auth.module.ts`, add the import next to the other use case imports (alphabetical position, after `InviteMemberUseCase`):

```typescript
import { ListInvitesUseCase } from './application/list-invites.usecase';
```

Add `ListInvitesUseCase` to the `providers` array, next to `InviteMemberUseCase`:

```typescript
    InviteMemberUseCase,
    ListInvitesUseCase,
    DeleteInviteUseCase,
```

- [ ] **Step 4: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full backend unit suite (regression check)**

Run: `cd apps/backend && npx jest`
Expected: all suites pass (no existing test asserts the old `InvitesController` constructor arity, but this confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/dto/invite-response.dto.ts apps/backend/src/modules/auth/presentation/invites.controller.ts apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat: add GET /organizations/:id/invites endpoint"
```

---

### Task 3: Backend — e2e regression case

**Files:**
- Modify: `apps/backend/test/member-management-export.e2e-spec.ts`

**Interfaces:**
- Consumes: `GET /api/v1/organizations/:id/invites` (Task 2).
- Produces: nothing consumed by later tasks — this is a verification-only task.

- [ ] **Step 1: Write the failing e2e test**

In `apps/backend/test/member-management-export.e2e-spec.ts`, add a new `it` block right after the existing `'resends an invite with a fresh token'` test (so it runs after that test has re-created a pending invite for `inviteId`) and before `'exports receivables as an attachment CSV'`:

```typescript
  it('lists pending invites, excluding accepted ones', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgA}/invites`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].email).toBe('invitee@example.com');
    expect(response.body.items[0]).not.toHaveProperty('tokenHash');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --config test/jest-e2e.json test/member-management-export.e2e-spec.ts`
Expected: FAIL on the new test — `Cannot GET /api/v1/organizations/.../invites` would only happen if Task 2 weren't done; since Task 2 is already implemented at this point in the plan, this step should actually PASS. If it fails for a different reason (e.g. `tokenHash` leaking), fix `toInviteResponse` before proceeding — don't skip this check.

- [ ] **Step 3: Run the full file to confirm no regression**

Run: `cd apps/backend && npx jest --config test/jest-e2e.json test/member-management-export.e2e-spec.ts`
Expected: PASS, all 9 tests (8 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/member-management-export.e2e-spec.ts
git commit -m "test: e2e coverage for GET /organizations/:id/invites"
```

---

### Task 4: Frontend — types + `settings-api.ts` functions

**Files:**
- Modify: `apps/frontend/src/features/settings/types.ts`
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Modify: `apps/frontend/src/features/settings/api/settings-api.spec.ts`

**Interfaces:**
- Produces: `Invite`, `OrganizationInviteList` types; `changeMemberRole(organizationId, userId, role): Promise<{ id: string; userId: string; role: string }>`, `removeMember(organizationId, userId): Promise<void>`, `fetchOrganizationInvites(organizationId): Promise<OrganizationInviteList>`, `revokeInvite(organizationId, inviteId): Promise<void>`, `resendInvite(organizationId, inviteId): Promise<{ success: boolean }>`. Task 5 (`use-settings.ts`) is the consumer.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/settings/api/settings-api.spec.ts` (add these imports to the existing `import { fetchSmtpConfig } from './settings-api';` line, turning it into a multi-line import, and add the new `describe` blocks at the end of the file):

```typescript
import {
  changeMemberRole,
  fetchOrganizationInvites,
  fetchSmtpConfig,
  removeMember,
  resendInvite,
  revokeInvite,
} from './settings-api';
```

Add at the end of the file:

```typescript
describe('changeMemberRole', () => {
  it('sends a PATCH with the new role', async () => {
    apiRequest.mockResolvedValueOnce({ id: 'm1', userId: 'u1', role: 'VIEWER' });

    await changeMemberRole('org-1', 'u1', 'VIEWER');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/members/u1',
        method: 'PATCH',
        data: { role: 'VIEWER' },
      }),
    );
  });
});

describe('removeMember', () => {
  it('sends a DELETE for the member', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    await removeMember('org-1', 'u1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/members/u1',
        method: 'DELETE',
      }),
    );
  });
});

describe('fetchOrganizationInvites', () => {
  it('fetches pending invites for the organization', async () => {
    const list = { items: [], total: 0, page: 1, limit: 100 };
    apiRequest.mockResolvedValueOnce(list);

    await expect(fetchOrganizationInvites('org-1')).resolves.toEqual(list);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites?page=1&limit=100',
        method: 'GET',
      }),
    );
  });
});

describe('revokeInvite', () => {
  it('sends a DELETE for the invite', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    await revokeInvite('org-1', 'inv-1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites/inv-1',
        method: 'DELETE',
      }),
    );
  });
});

describe('resendInvite', () => {
  it('sends a POST to resend the invite', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    await resendInvite('org-1', 'inv-1');

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/organizations/org-1/invites/inv-1/resend',
        method: 'POST',
      }),
    );
  });
});
```

Note: `apiRequest` in this file is the module-level `vi.hoisted` mock already declared at the top of `settings-api.spec.ts` — no new mock setup needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/settings/api/settings-api.spec.ts`
Expected: FAIL — `changeMemberRole is not a function` (and similarly for the other four).

- [ ] **Step 3: Add the types**

In `apps/frontend/src/features/settings/types.ts`, add at the end:

```typescript
export interface Invite {
  id: string;
  email: string;
  role: Role;
  invitedAt: string;
  expiresAt: string;
}

export interface OrganizationInviteList {
  items: Invite[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 4: Implement the API functions**

In `apps/frontend/src/features/settings/api/settings-api.ts`, change the type import at the top to include the new type (`OrganizationInviteList` only — `Invite` is consumed later by `use-settings.ts` in Task 5 and `pending-invites-table.tsx` in Task 6, not by this file):

```typescript
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplatePreview,
  OrganizationInviteList,
  OrganizationMemberList,
  SmtpConfig,
  SmtpConfigInput,
} from '../types';
```

Add at the end of the file:

```typescript
export function changeMemberRole(
  organizationId: string,
  userId: string,
  role: string,
): Promise<{ id: string; userId: string; role: string }> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/members/${userId}`,
    method: 'PATCH',
    data: { role },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function removeMember(
  organizationId: string,
  userId: string,
): Promise<void> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/members/${userId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function fetchOrganizationInvites(
  organizationId: string,
): Promise<OrganizationInviteList> {
  return apiRequest<OrganizationInviteList>({
    url: `/api/v1/organizations/${organizationId}/invites?page=1&limit=100`,
    method: 'GET',
  });
}

export function revokeInvite(
  organizationId: string,
  inviteId: string,
): Promise<void> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/invites/${inviteId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function resendInvite(
  organizationId: string,
  inviteId: string,
): Promise<{ success: boolean }> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/invites/${inviteId}/resend`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

`Invite` is exported from `types.ts` for `use-settings.ts` (Task 5) to reference — `settings-api.ts` itself only needs `OrganizationInviteList`, but TypeScript will flag `Invite` as an unused import here; do not import `Invite` in `settings-api.ts`, only `OrganizationInviteList`. (Correcting the Step 3 import block above: `Invite` is not needed in this file's import list — remove it if your editor flags it as unused.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/settings/api/settings-api.spec.ts`
Expected: PASS, all tests (existing SMTP tests + 5 new).

- [ ] **Step 6: Type-check**

Run: `cd apps/frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/settings/types.ts apps/frontend/src/features/settings/api/settings-api.ts apps/frontend/src/features/settings/api/settings-api.spec.ts
git commit -m "feat: settings API functions for member/invite management"
```

---

### Task 5: Frontend — `use-settings.ts` hooks

**Files:**
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts`

**Interfaces:**
- Consumes: the five functions from Task 4, plus existing `getResponseErrorMessage` (already exported from `settings-api.ts`).
- Produces: `useChangeMemberRole(organizationId)`, `useRemoveMember(organizationId)`, `useOrganizationInvites(organizationId)`, `useRevokeInvite(organizationId)`, `useResendInvite(organizationId)` — each returning the standard TanStack Query mutation/query object. Tasks 6 and 7 consume these by name.

No dedicated unit test file for this task — these hooks are thin TanStack Query wrappers with no branching logic of their own (matching this codebase's existing convention: `use-settings.ts` has no `use-settings.spec.ts`). They're exercised end-to-end by the component tests in Tasks 6 and 7.

- [ ] **Step 1: Update the import block**

In `apps/frontend/src/features/settings/api/use-settings.ts`, replace the top import block:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EmailTemplateInput, SmtpConfigInput } from '../types';
import {
  changeMemberRole,
  createEmailTemplate,
  deleteEmailTemplate,
  deleteSmtpConfig,
  fetchEmailTemplates,
  fetchOrganizationInvites,
  fetchOrganizationMembers,
  fetchSmtpConfig,
  getResponseErrorMessage,
  inviteOrganizationMember,
  previewEmailTemplate,
  removeMember,
  resendInvite,
  revokeInvite,
  saveSmtpConfig,
  updateEmailTemplate,
} from './settings-api';
```

- [ ] **Step 2: Add the hooks**

Add at the end of `apps/frontend/src/features/settings/api/use-settings.ts`:

```typescript
export function useChangeMemberRole(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      changeMemberRole(organizationId ?? '', userId, role),
    onSuccess: () => {
      toast.success('Đã đổi vai trò.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'Không thể đổi vai trò.')),
  });
}

export function useRemoveMember(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(organizationId ?? '', userId),
    onSuccess: () => {
      toast.success('Đã xoá thành viên.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(getResponseErrorMessage(error, 'Không thể xoá thành viên.')),
  });
}

export function useOrganizationInvites(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-invites', organizationId],
    queryFn: () => fetchOrganizationInvites(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

export function useRevokeInvite(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(organizationId ?? '', inviteId),
    onSuccess: () => {
      toast.success('Đã thu hồi lời mời.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-invites', organizationId],
      });
    },
    onError: () => toast.error('Không thể thu hồi lời mời.'),
  });
}

export function useResendInvite(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => resendInvite(organizationId ?? '', inviteId),
    onSuccess: () => {
      toast.success('Đã gửi lại lời mời.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-invites', organizationId],
      });
    },
    onError: () => toast.error('Không thể gửi lại lời mời.'),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full frontend test suite (regression check)**

Run: `cd apps/frontend && npx vitest run`
Expected: all existing tests still pass (this task adds no new test file).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/api/use-settings.ts
git commit -m "feat: TanStack Query hooks for member/invite management"
```

---

### Task 6: Frontend — `PendingInvitesTable` component

**Files:**
- Create: `apps/frontend/src/features/settings/components/pending-invites-table.tsx`
- Create: `apps/frontend/src/features/settings/components/pending-invites-table.spec.tsx`

**Interfaces:**
- Consumes: `useOrganizationInvites`, `useResendInvite`, `useRevokeInvite` (Task 5); `Invite` type (Task 4).
- Produces: `PendingInvitesTable({ organizationId: string | undefined })` — a React component. Task 7 (`UsersTab`) renders it.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/settings/components/pending-invites-table.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingInvitesTable } from './pending-invites-table';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const invite = {
  id: 'inv-1',
  email: 'moi@congtyb.vn',
  role: 'VIEWER',
  invitedAt: '2026-08-12T00:00:00.000Z',
  expiresAt: '2026-08-19T00:00:00.000Z',
};

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingInvitesTable organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe('PendingInvitesTable', () => {
  it('shows the empty state when there are no pending invites', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });
    renderTable();

    await waitFor(() =>
      expect(
        screen.getByText('Không có lời mời nào đang chờ.'),
      ).toBeTruthy(),
    );
  });

  it('resends an invite', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({ success: true });
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/invites/inv-1/resend',
          method: 'POST',
        }),
      ),
    );
  });

  it('confirms before revoking an invite', async () => {
    apiRequest
      .mockResolvedValueOnce({
        items: [invite],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce(undefined);
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('moi@congtyb.vn')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/invites/inv-1',
          method: 'DELETE',
        }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/settings/components/pending-invites-table.spec.tsx`
Expected: FAIL — `Cannot find module './pending-invites-table'`.

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/features/settings/components/pending-invites-table.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  useOrganizationInvites,
  useResendInvite,
  useRevokeInvite,
} from '../api/use-settings';

export function PendingInvitesTable({
  organizationId,
}: {
  organizationId: string | undefined;
}) {
  const invitesQuery = useOrganizationInvites(organizationId);
  const resend = useResendInvite(organizationId);
  const revoke = useRevokeInvite(organizationId);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Lời mời đang chờ</h2>
      {invitesQuery.isPending && <p>Đang tải lời mời…</p>}
      {invitesQuery.isError && (
        <p className="text-destructive">Không thể tải lời mời.</p>
      )}
      {invitesQuery.data && invitesQuery.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Không có lời mời nào đang chờ.
        </p>
      )}
      {invitesQuery.data && invitesQuery.data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Mời lúc</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitesQuery.data.items.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>{invite.role}</TableCell>
                <TableCell>
                  {new Date(invite.invitedAt).toLocaleDateString('vi-VN')}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(invite.id)}
                    >
                      Gửi lại
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Thu hồi
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Thu hồi lời mời tới {invite.email}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Lời mời sẽ không còn hiệu lực.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revoke.mutate(invite.id)}
                          >
                            Xác nhận
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/settings/components/pending-invites-table.spec.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/pending-invites-table.tsx apps/frontend/src/features/settings/components/pending-invites-table.spec.tsx
git commit -m "feat: PendingInvitesTable component (resend/revoke)"
```

---

### Task 7: Frontend — `UsersTab` role change, remove member, self-row hiding, wire `PendingInvitesTable`

**Files:**
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Create: `apps/frontend/src/features/settings/components/users-tab.spec.tsx`

**Interfaces:**
- Consumes: `useChangeMemberRole`, `useRemoveMember` (Task 5), `PendingInvitesTable` (Task 6), `OrganizationMember` type (existing).
- Produces: nothing consumed by later tasks — this is the last piece of the Settings/Users surface.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/settings/components/users-tab.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsersTab } from './users-tab';

const apiRequest = vi.fn();
const useAuth = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

const ownerMember = {
  id: 'm1',
  userId: 'owner-1',
  email: 'owner@congtyb.vn',
  name: 'Chủ sở hữu',
  role: 'OWNER',
  joinedAt: '2026-08-01',
};
const accountantMember = {
  id: 'm2',
  userId: 'user-2',
  email: 'ke-toan@congtyb.vn',
  name: 'Kế toán',
  role: 'ACCOUNTANT',
  joinedAt: '2026-08-01',
};

function mockApi({
  members = [ownerMember, accountantMember],
  invites = [],
}: { members?: unknown[]; invites?: unknown[] } = {}) {
  apiRequest.mockImplementation((config: { url: string }) => {
    if (config.url.includes('/invites')) {
      return Promise.resolve({
        items: invites,
        total: invites.length,
        page: 1,
        limit: 100,
      });
    }
    return Promise.resolve({
      items: members,
      total: members.length,
      page: 1,
      limit: 100,
    });
  });
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersTab />
    </QueryClientProvider>,
  );
}

describe('UsersTab', () => {
  it("lets an OWNER change another member's role", async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    const select = screen.getByLabelText('Vai trò của Kế toán');
    fireEvent.change(select, { target: { value: 'VIEWER' } });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2',
          method: 'PATCH',
          data: { role: 'VIEWER' },
        }),
      ),
    );
  });

  it('confirms before removing a member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Kế toán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2',
          method: 'DELETE',
        }),
      ),
    );
  });

  it("hides role select and remove button on the current user's own row", async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Chủ sở hữu')).toBeTruthy(),
    );
    expect(
      screen.queryByLabelText('Vai trò của Chủ sở hữu'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Xoá Chủ sở hữu' }),
    ).toBeNull();
  });

  it('hides management actions for a non-OWNER', async () => {
    useAuth.mockReturnValue({
      user: { id: 'fm-1', role: 'FINANCE_MANAGER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    expect(screen.queryByLabelText('Vai trò của Kế toán')).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/settings/components/users-tab.spec.tsx`
Expected: FAIL — no role `<select>` per row, no "Xoá {name}" button exists yet (current `UsersTab` renders plain text role cells and no actions column).

- [ ] **Step 3: Modify `UsersTab`**

Replace the full contents of `apps/frontend/src/features/settings/components/users-tab.tsx`:

```tsx
import { Permission, Role } from '@casso-ledger/shared-types';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import {
  useChangeMemberRole,
  useInviteMember,
  useOrganizationMembers,
  useRemoveMember,
} from '../api/use-settings';
import { PendingInvitesTable } from './pending-invites-table';

const roles = Object.values(Role);

export function UsersTab() {
  const { user } = useAuth();
  const canView =
    user?.role === Role.OWNER || user?.role === Role.FINANCE_MANAGER;
  const canInvite = hasPermission(user?.role ?? null, Permission.USER_MANAGE);
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.ORGANIZATION_MANAGE,
  );
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.ACCOUNTANT);
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
  );
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole(user?.organizationId);
  const removeMember = useRemoveMember(user?.organizationId);

  if (!canView) return null;

  function submit() {
    if (!user?.organizationId || !email.trim()) return;
    invite.mutate(
      { organizationId: user.organizationId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  }

  return (
    <div className="space-y-6">
      {canInvite && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm" htmlFor="invite-email">
            <span className="block">Email</span>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
            />
          </label>
          <label className="space-y-1 text-sm" htmlFor="invite-role">
            <span className="block">Vai trò</span>
            <select
              id="invite-role"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!email.trim() || invite.isPending} onClick={submit}>
            Mời thành viên
          </Button>
        </div>
      )}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Thành viên</h2>
        {membersQuery.isPending && <p>Đang tải thành viên…</p>}
        {membersQuery.isError && (
          <p className="text-destructive">Không thể tải thành viên.</p>
        )}
        {membersQuery.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                {canManage && <TableHead>Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data.items.map((member) => {
                const isSelf = member.userId === user?.id;
                return (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {canManage && !isSelf ? (
                        <select
                          aria-label={`Vai trò của ${member.name}`}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={member.role}
                          onChange={(event) =>
                            changeRole.mutate({
                              userId: member.userId,
                              role: event.target.value,
                            })
                          }
                        >
                          {roles.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      ) : (
                        member.role
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {!isSelf && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                Xoá {member.name}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Xoá {member.name} khỏi tổ chức?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Người này sẽ mất quyền truy cập ngay lập
                                  tức. Thao tác này không thể hoàn tác.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    removeMember.mutate(member.userId)
                                  }
                                >
                                  Xác nhận
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      {canManage && (
        <PendingInvitesTable organizationId={user?.organizationId} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/settings/components/users-tab.spec.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Run the full frontend test suite (regression check)**

Run: `cd apps/frontend && npx vitest run`
Expected: all tests pass, including the pre-existing `users-tab`-adjacent tests if any exist under `settings-page.spec.tsx` or similar.

- [ ] **Step 6: Type-check and lint**

Run: `cd apps/frontend && npx tsc -b --noEmit && npx biome check .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/settings/components/users-tab.tsx apps/frontend/src/features/settings/components/users-tab.spec.tsx
git commit -m "feat: role change, remove member, and pending invites in UsersTab"
```

---

### Task 8: Frontend — `apiRequestWithHeaders` in `lib/api-client.ts`

**Files:**
- Modify: `apps/frontend/src/lib/api-client.ts`
- Modify: `apps/frontend/src/lib/api-client.spec.ts`

**Interfaces:**
- Consumes: nothing new (refactors existing `apiRequest`).
- Produces: `apiRequestWithHeaders<T>(config: AxiosRequestConfig): Promise<{ data: T; headers: Record<string, string> }>`. Task 10 (`exportReceivablesCsv`) is the consumer. `apiRequest`'s existing signature and behavior are unchanged — this is a pure refactor for every other caller.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/lib/api-client.spec.ts`, change the import line:

```typescript
import { AuthTokenManager, apiRequest, apiRequestWithHeaders } from './api-client';
```

Add a new `describe` block at the end of the file:

```typescript
describe('apiRequestWithHeaders', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('resolves with both the response data and headers', async () => {
    requestMock.mockResolvedValue({
      data: 'csv text',
      headers: { 'x-export-truncated': 'true' },
    });

    await expect(
      apiRequestWithHeaders({
        url: '/api/v1/receivables/export',
        method: 'GET',
      }),
    ).resolves.toEqual({
      data: 'csv text',
      headers: { 'x-export-truncated': 'true' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/api-client.spec.ts`
Expected: FAIL — `apiRequestWithHeaders is not a function`.

- [ ] **Step 3: Refactor `api-client.ts`**

Replace the existing `apiRequest` function in `apps/frontend/src/lib/api-client.ts` with:

```typescript
async function send<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; headers: Record<string, string> }> {
  const token = await authTokenManager.getValidAccessToken();
  try {
    const response = await axiosClient.request<T>({
      ...config,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(config.headers ?? {}),
      },
    });
    return {
      data: response.data,
      headers: response.headers as Record<string, string>,
    };
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error.response as { status?: unknown }).status
        : undefined;
    if (status === 402) {
      window.dispatchEvent(new CustomEvent('casso:plan-limit'));
    }
    throw error;
  }
}

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await send<T>(config);
  return data;
}

export async function apiRequestWithHeaders<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; headers: Record<string, string> }> {
  return send<T>(config);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/api-client.spec.ts`
Expected: PASS, all tests (existing `apiRequest`/`AuthTokenManager` tests + 1 new).

- [ ] **Step 5: Type-check**

Run: `cd apps/frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/api-client.ts apps/frontend/src/lib/api-client.spec.ts
git commit -m "refactor: extract apiRequestWithHeaders from apiRequest"
```

---

### Task 9: Frontend — `lib/download-csv.ts`

**Files:**
- Create: `apps/frontend/src/lib/download-csv.ts`
- Create: `apps/frontend/src/lib/download-csv.spec.ts`

**Interfaces:**
- Consumes: nothing (pure DOM helper).
- Produces: `downloadCsv(csv: string, filename: string): void`. Tasks 10 and 11 are the consumers.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/download-csv.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './download-csv';

describe('downloadCsv', () => {
  const clickMock = vi.fn();

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      clickMock,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clickMock.mockClear();
  });

  it('creates a blob download link and clicks it', () => {
    downloadCsv('a,b\n1,2', 'test.csv');

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/download-csv.spec.ts`
Expected: FAIL — `Cannot find module './download-csv'`.

- [ ] **Step 3: Implement `download-csv.ts`**

Create `apps/frontend/src/lib/download-csv.ts`:

```typescript
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/download-csv.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/download-csv.ts apps/frontend/src/lib/download-csv.spec.ts
git commit -m "feat: downloadCsv blob-download helper"
```

---

### Task 10: Frontend — receivables "Xuất CSV" button

**Files:**
- Modify: `apps/frontend/src/features/receivables/api/receivables-api.ts`
- Create: `apps/frontend/src/features/receivables/api/receivables-api.spec.ts`
- Modify: `apps/frontend/src/features/receivables/pages/receivables-page.tsx`
- Modify: `apps/frontend/src/features/receivables/pages/receivables-page.spec.tsx`

**Interfaces:**
- Consumes: `apiRequestWithHeaders` (Task 8), `downloadCsv` (Task 9).
- Produces: `exportReceivablesCsv(filters: ReceivableFilters): Promise<{ csv: string; truncated: boolean }>`. No later task consumes this — terminal for this vertical slice.

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/features/receivables/api/receivables-api.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

const apiRequestWithHeaders = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  apiRequestWithHeaders: (...args: unknown[]) =>
    apiRequestWithHeaders(...args),
  postWithIdempotency: vi.fn(),
}));

import { exportReceivablesCsv } from './receivables-api';

describe('exportReceivablesCsv', () => {
  it('returns the CSV text and truncated flag from the export header', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'a,b\n1,2',
      headers: { 'x-export-truncated': 'true' },
    });

    const result = await exportReceivablesCsv({ status: 'OPEN' });

    expect(apiRequestWithHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/receivables/export',
        method: 'GET',
        params: { status: 'OPEN' },
        responseType: 'text',
      }),
    );
    expect(result).toEqual({ csv: 'a,b\n1,2', truncated: true });
  });

  it('reports truncated: false when the header is absent', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'a,b\n1,2',
      headers: {},
    });

    const result = await exportReceivablesCsv({});

    expect(result.truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/receivables/api/receivables-api.spec.ts`
Expected: FAIL — `exportReceivablesCsv is not a function`.

- [ ] **Step 3: Implement `exportReceivablesCsv`**

In `apps/frontend/src/features/receivables/api/receivables-api.ts`, change the top import:

```typescript
import { apiRequest, apiRequestWithHeaders, postWithIdempotency } from '@/lib/api-client';
```

Add after `fetchReceivable`:

```typescript
export function exportReceivablesCsv(
  filters: ReceivableFilters,
): Promise<{ csv: string; truncated: boolean }> {
  return apiRequestWithHeaders<string>({
    url: '/api/v1/receivables/export',
    method: 'GET',
    params: filters,
    responseType: 'text',
  }).then(({ data, headers }) => ({
    csv: data,
    truncated: headers['x-export-truncated'] === 'true',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/receivables/api/receivables-api.spec.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Write the failing page test**

In `apps/frontend/src/features/receivables/pages/receivables-page.spec.tsx`, change the top of the file to:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReceivablesPage } from './receivables-page';

const apiRequest = vi.fn();
const apiRequestWithHeaders = vi.fn();
const downloadCsv = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiRequestWithHeaders: (...args: unknown[]) =>
    apiRequestWithHeaders(...args),
}));

vi.mock('@/lib/download-csv', () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));
```

(Keep the existing `describe('ReceivablesPage', ...)` block and its one existing test unchanged — only the mock setup above changes, adding the two new mocks.)

Add a new test inside the existing `describe` block:

```tsx
  it('exports the current filters as CSV', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    apiRequestWithHeaders.mockResolvedValue({
      data: 'a,b\n1,2',
      headers: {},
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Xuất CSV' }));

    await waitFor(() =>
      expect(apiRequestWithHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/export',
          method: 'GET',
        }),
      ),
    );
    expect(downloadCsv).toHaveBeenCalledWith('a,b\n1,2', 'cong-no.csv');
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/receivables/pages/receivables-page.spec.tsx`
Expected: FAIL — no "Xuất CSV" button exists yet.

- [ ] **Step 7: Wire the button into `ReceivablesPage`**

Replace the full contents of `apps/frontend/src/features/receivables/pages/receivables-page.tsx`:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { downloadCsv } from '@/lib/download-csv';
import { hasPermission } from '@/lib/rbac';
import { exportReceivablesCsv } from '../api/receivables-api';
import { useReceivables } from '../api/use-receivables';
import { CreateReceivableDialog } from '../components/create-receivable-dialog';
import { ImportInvoicesDialog } from '../components/import-invoices-dialog';
import { ReceivableFilters } from '../components/receivable-filters';
import { ReceivableTable } from '../components/receivable-table';
import type { ReceivableStatus } from '../types';

export function ReceivablesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const status =
    (searchParams.get('status') as ReceivableStatus | null) ?? undefined;
  const customerId = searchParams.get('customerId') ?? undefined;
  const page = Number(searchParams.get('page') ?? '1');
  const { data, isPending, isError } = useReceivables(
    { status, customerId },
    page,
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const canExport = hasPermission(
    user?.role ?? null,
    Permission.RECEIVABLE_READ,
  );

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  async function exportCsv() {
    setIsExporting(true);
    try {
      const { csv, truncated } = await exportReceivablesCsv({
        status,
        customerId,
      });
      downloadCsv(csv, 'cong-no.csv');
      if (truncated) {
        toast.warning(
          'Chỉ xuất 10.000 dòng đầu, vui lòng lọc bớt để xuất đầy đủ.',
        );
      }
    } catch {
      toast.error('Không thể xuất CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-primary">QUẢN LÝ CÔNG NỢ</p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Công nợ
          </h1>
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <Button
                variant="outline"
                disabled={isExporting}
                onClick={exportCsv}
              >
                {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
              </Button>
            )}
            <ImportInvoicesDialog />
            <CreateReceivableDialog />
          </div>
        </div>
      </div>
      <ReceivableFilters
        status={status}
        onStatusChange={(value) => {
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (value) {
              next.set('status', value);
            } else {
              next.delete('status');
            }
            next.set('page', '1');
            return next;
          });
        }}
      />
      {isPending && <p>Đang tải danh sách công nợ…</p>}
      {isError && (
        <p className="text-destructive">Không thể tải danh sách công nợ.</p>
      )}
      {data && <ReceivableTable receivables={data.items} />}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {data.page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/receivables/pages/receivables-page.spec.tsx`
Expected: PASS, both tests (existing + new export test).

- [ ] **Step 9: Type-check**

Run: `cd apps/frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/receivables/api/receivables-api.ts apps/frontend/src/features/receivables/api/receivables-api.spec.ts apps/frontend/src/features/receivables/pages/receivables-page.tsx apps/frontend/src/features/receivables/pages/receivables-page.spec.tsx
git commit -m "feat: Xuất CSV button on the receivables page"
```

---

### Task 11: Frontend — reports "Xuất CSV" button

**Files:**
- Modify: `apps/frontend/src/features/reports/api/reports-api.ts`
- Create: `apps/frontend/src/features/reports/api/reports-api.spec.ts`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx`
- Modify: `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`

**Interfaces:**
- Consumes: `apiRequest` (existing), `downloadCsv` (Task 9).
- Produces: `exportAgingReportCsv(): Promise<string>`. No later task consumes this — terminal for this vertical slice.

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/features/reports/api/reports-api.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { exportAgingReportCsv } from './reports-api';

describe('exportAgingReportCsv', () => {
  it('fetches the aging report CSV as plain text', async () => {
    apiRequest.mockResolvedValueOnce('bucket,count\nNOT_DUE,3');

    await expect(exportAgingReportCsv()).resolves.toBe(
      'bucket,count\nNOT_DUE,3',
    );
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/reports/aging/export',
        method: 'GET',
        responseType: 'text',
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/reports/api/reports-api.spec.ts`
Expected: FAIL — `exportAgingReportCsv is not a function`.

- [ ] **Step 3: Implement `exportAgingReportCsv`**

Add to `apps/frontend/src/features/reports/api/reports-api.ts`:

```typescript
export function exportAgingReportCsv(): Promise<string> {
  return apiRequest<string>({
    url: '/api/v1/reports/aging/export',
    method: 'GET',
    responseType: 'text',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/reports/api/reports-api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

In `apps/frontend/src/features/reports/pages/reports-page.spec.tsx`, change the mock setup at the top of the file to add a `downloadCsv` mock:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './reports-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const downloadCsv = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/lib/download-csv', () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));
```

(Keep the existing `describe('ReportsPage', ...)` block and its one existing test unchanged.)

Add a new test inside the existing `describe` block:

```tsx
  it('exports the aging report as CSV', async () => {
    apiRequest
      .mockResolvedValueOnce({
        totalOutstanding: 100_000_000,
        totalOverdue: 30_000_000,
        overdueRate: 0.3,
        cashForecast: {
          forecast7d: 10_000_000,
          forecast14d: 20_000_000,
          forecast30d: 30_000_000,
        },
        topOverdueCustomers: [],
        autoMatchRate: 0.8,
        manualHandlingRate: 0.2,
        reminderEffectiveness: 0.5,
      })
      .mockResolvedValueOnce({
        buckets: [
          { bucket: 'NOT_DUE', count: 3, totalRemaining: 70_000_000 },
          { bucket: 'OVERDUE_1_7', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 30_000_000 },
        ],
      })
      .mockResolvedValueOnce('bucket,count\nNOT_DUE,3');

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Xuất CSV' }));

    await waitFor(() =>
      expect(downloadCsv).toHaveBeenCalledWith(
        'bucket,count\nNOT_DUE,3',
        'bao-cao-tuoi-no.csv',
      ),
    );
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/reports/pages/reports-page.spec.tsx`
Expected: FAIL — no "Xuất CSV" button exists yet.

- [ ] **Step 7: Wire the button into `ReportsPage`**

Replace the full contents of `apps/frontend/src/features/reports/pages/reports-page.tsx`:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { downloadCsv } from '@/lib/download-csv';
import { hasPermission } from '@/lib/rbac';
import { exportAgingReportCsv } from '../api/reports-api';
import { useAgingReport, useDashboardSummary } from '../api/use-reports';
import { AgingChart } from '../components/aging-chart';
import { AgingTable } from '../components/aging-table';
import { DashboardSummary } from '../components/dashboard-summary';

export function ReportsPage() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const summaryQuery = useDashboardSummary();
  const agingQuery = useAgingReport();
  const canExport = hasPermission(user?.role ?? null, Permission.REPORT_READ);

  async function exportCsv() {
    setIsExporting(true);
    try {
      const csv = await exportAgingReportCsv();
      downloadCsv(csv, 'bao-cao-tuoi-no.csv');
    } catch {
      toast.error('Không thể xuất CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  if (summaryQuery.isPending || agingQuery.isPending) {
    return <p>Đang tải báo cáo…</p>;
  }

  if (summaryQuery.isError || agingQuery.isError) {
    return <p className="text-destructive">Không thể tải dữ liệu báo cáo.</p>;
  }

  if (!summaryQuery.data || !agingQuery.data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PHÂN TÍCH</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Báo cáo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi công nợ, tuổi nợ và khả năng thu tiền.
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            disabled={isExporting}
            onClick={exportCsv}
          >
            {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </Button>
        )}
      </div>
      <DashboardSummary summary={summaryQuery.data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent>
            <AgingTable
              report={agingQuery.data}
              totalOutstanding={summaryQuery.data.totalOutstanding}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent>
            <AgingChart report={agingQuery.data} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/reports/pages/reports-page.spec.tsx`
Expected: PASS, both tests.

- [ ] **Step 9: Type-check**

Run: `cd apps/frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/reports/api/reports-api.ts apps/frontend/src/features/reports/api/reports-api.spec.ts apps/frontend/src/features/reports/pages/reports-page.tsx apps/frontend/src/features/reports/pages/reports-page.spec.tsx
git commit -m "feat: Xuất CSV button on the reports page"
```

---

### Task 12: Full verification, feature-map update, PR

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

**Interfaces:**
- Consumes: everything from Tasks 1-11.
- Produces: nothing — this is the ship task.

- [ ] **Step 1: Full backend verification**

Run: `cd apps/backend && npx jest && npx tsc --noEmit`
Expected: all unit suites pass, clean type-check.

- [ ] **Step 2: Backend e2e regression (standalone files, per the Global Constraints note on cross-file flakiness)**

Run:
```bash
cd apps/backend
npx jest --config test/jest-e2e.json test/member-management-export.e2e-spec.ts
npx jest --config test/jest-e2e.json test/auth-flow.e2e-spec.ts
```
Expected: both files pass standalone (9/9 and 5/5 respectively).

- [ ] **Step 3: `pnpm verify` (backend lint + type-check + test + arch-check)**

Run: `pnpm verify` (from repo root)
Expected: 8/8 tasks pass.

- [ ] **Step 4: Domain-check**

Run the `domain-check` skill (`/domain-check`) and fix any violation it reports before proceeding.

- [ ] **Step 5: Full frontend verification**

Run:
```bash
cd apps/frontend
npx vitest run
npx tsc -b --noEmit
npx biome check .
```
Expected: all tests pass, clean type-check, clean lint.

- [ ] **Step 6: Update `docs/wayfinder/feature-map.md`**

Add a new bullet to the dated changelog section (find the most recent `- **2026-08-12**: ...` entries and add this one after the last one, following the exact same bullet style):

```markdown
- **2026-08-12**: FE completion for issues #128 and #130 (backend shipped in PR #148, branch `feat/member-management-export-fe`) — Settings → Users tab gained inline role-change/remove-member actions and a pending-invites table (resend/revoke), all gated on `ORGANIZATION_MANAGE` (OWNER-only) and hidden on the current user's own row to prevent accidental self-lockout; "Xuất CSV" buttons added to the receivables list (respects the active status/customer filter, warns on the 10,000-row export cap via the `X-Export-Truncated` header) and the aging report. Small backend addition: `GET /organizations/:id/invites` (paginated, excludes accepted invites) — the FE had no way to list pending invites before this. Closes #128, Closes #130.
```

- [ ] **Step 7: Commit the feature-map update**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: update feature-map for member-management-export FE"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/member-management-export-fe
gh pr create --title "feat: member management + CSV export FE" --body "Closes #128, Closes #130

FE completion for issues #128/#130 (backend shipped in PR #148, backend-only). Also adds one small backend endpoint: GET /organizations/:id/invites (pending invites list, needed by the invite revoke/resend UI — was missing from PR #148).

## Backend
- GET /organizations/:id/invites — paginated, ORGANIZATION_MANAGE, excludes accepted invites

## Frontend
- Settings → Users tab: inline role-change select + remove-member button per row (hidden on the current user's own row and for non-OWNER roles), pending-invites table (resend/revoke)
- Xuất CSV button on the receivables list (respects active filters, warns on the 10k-row export cap) and the aging report

## Verification
- Backend: pnpm verify 8/8, domain-check OK, member-management-export.e2e-spec.ts + auth-flow.e2e-spec.ts standalone
- Frontend: vitest run, tsc -b --noEmit, biome check — all clean"
```

- [ ] **Step 9: Wait for user review before merging** (per `AGENTS.md` workflow — do not merge in this task).
