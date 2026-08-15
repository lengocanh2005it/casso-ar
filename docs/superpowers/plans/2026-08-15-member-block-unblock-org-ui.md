# Member block/unblock — org-facing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org `OWNER` block/unblock a subordinate member's access from the existing member-management UI (`UsersTab`), and gracefully sign out a member whose own session gets blocked mid-use.

**Architecture:** Backend endpoints (`POST .../members/:userId/block|unblock`) already exist and are fully implemented — this plan is frontend-only, plus one small backend DTO field addition. Reuses existing patterns end-to-end: `postWithIdempotency()` for the write calls, the `AlertDialog` confirm pattern already used for "Xoá {name}", and the `window.dispatchEvent`/`window.addEventListener('casso:...')` cross-cutting-error pattern already used for HTTP 402.

**Tech Stack:** NestJS 11 (backend DTO), React 19 + Vite + TanStack Query + React Router (frontend), Vitest + Testing Library (frontend tests), Jest (backend tests).

**Spec:** `docs/superpowers/specs/2026-08-15-member-block-unblock-org-ui-design.md` (this ticket's design/decisions) and `docs/superpowers/specs/2026-08-15-member-block-unblock-design.md` (backend design, already shipped).

## Global Constraints

- Money/domain rules (integers, transactions, tenant isolation) are N/A — no domain/application/backend-business-logic changes in this plan, only a presentation-layer DTO field addition.
- RBAC: hide the button when permission is missing, never disable (`AGENTS.md`).
- `errorCode` is a stable string the FE switches on; never parse `message` for logic.
- TDD: RED → GREEN → REFACTOR for every task below; run the stated test command and observe the failure before writing production code.
- File naming: kebab-case files, PascalCase classes/components, camelCase functions/variables (`AGENTS.md`).
- No `any`, no `as unknown as` in production code (tests may use `any`-adjacent patterns already established in this repo, but none are needed here).

---

### Task 1: Backend — expose `status`/`blockedAt` on the member list DTO

**Files:**
- Modify: `apps/backend/src/modules/organizations/presentation/dto/member-response.dto.ts`
- Test: `apps/backend/src/modules/organizations/presentation/dto/member-response.dto.spec.ts` (new)

**Interfaces:**
- Consumes: `Membership` domain (`apps/backend/src/modules/organizations/domain/membership.ts`) — already has `status: MembershipStatus` (`'ACTIVE' | 'BLOCKED'`) and `blockedAt: Date | null`, no change needed there.
- Produces: `MemberResponseDto` gains `status: MembershipStatus` and `blockedAt: Date | null`, consumed by `apps/frontend/src/features/settings/types.ts`'s `OrganizationMember` in Task 2.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/organizations/presentation/dto/member-response.dto.spec.ts`:

```typescript
import { Role } from '@casso-ledger/shared-types';
import { Membership } from '../../domain/membership';
import { toMemberResponse } from './member-response.dto';

describe('toMemberResponse', () => {
  it('includes membership status and blockedAt for the frontend member list', () => {
    const membership = new Membership({
      id: 'm1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-02'),
      createdAt: new Date('2026-08-01'),
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });

    const dto = toMemberResponse(membership, {
      email: 'ke-toan@congtyb.vn',
      name: 'Kế toán',
    });

    expect(dto).toEqual({
      id: 'm1',
      userId: 'user-1',
      email: 'ke-toan@congtyb.vn',
      name: 'Kế toán',
      role: Role.ACCOUNTANT,
      joinedAt: new Date('2026-08-02'),
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPattern member-response.dto.spec -v`
Expected: FAIL — `toEqual` mismatch, actual object missing `status`/`blockedAt` keys.

- [ ] **Step 3: Write minimal implementation**

Replace the full content of `apps/backend/src/modules/organizations/presentation/dto/member-response.dto.ts`:

```typescript
import type { Membership, MembershipStatus } from '../../domain/membership';

export class MemberResponseDto {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: Date | null;
  status: MembershipStatus;
  blockedAt: Date | null;
}

export class ListMembersResponseDto {
  items: MemberResponseDto[];
  total: number;
  page: number;
  limit: number;
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
    status: membership.status,
    blockedAt: membership.blockedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPattern member-response.dto.spec -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organizations/presentation/dto/member-response.dto.ts apps/backend/src/modules/organizations/presentation/dto/member-response.dto.spec.ts
git commit -m "feat: expose membership status/blockedAt in the org member list DTO"
```

---

### Task 2: Frontend — types + API client functions for block/unblock

**Files:**
- Modify: `apps/frontend/src/features/settings/types.ts`
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Test: `apps/frontend/src/features/settings/api/settings-api.spec.ts`

**Interfaces:**
- Consumes: Task 1's `status`/`blockedAt` fields (now present on the real backend response, mirrored here as local frontend types since `shared-types` doesn't currently export a membership-status type).
- Produces: `MembershipStatus` type, `OrganizationMember.status`/`.blockedAt` fields, `blockMember(organizationId, userId)` / `unblockMember(organizationId, userId)` functions — consumed by `use-settings.ts` in Task 5.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/features/settings/api/settings-api.spec.ts`, change the mock setup at the top of the file from:

```typescript
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));
```

to:

```typescript
const { apiRequest, postWithIdempotency } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  postWithIdempotency: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));
```

Add `blockMember` and `unblockMember` to the existing import from `./settings-api`, and append these two `describe` blocks at the end of the file:

```typescript
describe('blockMember', () => {
  it('posts to the block endpoint via postWithIdempotency', async () => {
    postWithIdempotency.mockResolvedValueOnce({
      id: 'm1',
      userId: 'u1',
      status: 'BLOCKED',
      blockedAt: '2026-08-15T00:00:00.000Z',
    });

    await blockMember('org-1', 'u1');

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/organizations/org-1/members/u1/block',
    );
  });
});

describe('unblockMember', () => {
  it('posts to the unblock endpoint via postWithIdempotency', async () => {
    postWithIdempotency.mockResolvedValueOnce({
      id: 'm1',
      userId: 'u1',
      status: 'ACTIVE',
      blockedAt: null,
    });

    await unblockMember('org-1', 'u1');

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/organizations/org-1/members/u1/unblock',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/settings/api/settings-api.spec.ts`
Expected: FAIL — `blockMember`/`unblockMember` are not exported from `./settings-api`.

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/features/settings/types.ts`, add before `OrganizationMember`:

```typescript
export type MembershipStatus = 'ACTIVE' | 'BLOCKED';
```

and change `OrganizationMember` to:

```typescript
export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: string | null;
  status: MembershipStatus;
  blockedAt: string | null;
}
```

In `apps/frontend/src/features/settings/api/settings-api.ts`, change the type import from `'../types'` from:

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

to:

```typescript
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplatePreview,
  MembershipStatus,
  OrganizationInviteList,
  OrganizationMemberList,
  SmtpConfig,
  SmtpConfigInput,
} from '../types';
```

Then append after `removeMember`:

```typescript
export function blockMember(
  organizationId: string,
  userId: string,
): Promise<{ id: string; userId: string; status: MembershipStatus; blockedAt: string | null }> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/members/${userId}/block`,
  );
}

export function unblockMember(
  organizationId: string,
  userId: string,
): Promise<{ id: string; userId: string; status: MembershipStatus; blockedAt: string | null }> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/members/${userId}/unblock`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/settings/api/settings-api.spec.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — confirms the mock-hoisting change didn't break `changeMemberRole`/`removeMember`/etc. tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/types.ts apps/frontend/src/features/settings/api/settings-api.ts apps/frontend/src/features/settings/api/settings-api.spec.ts
git commit -m "feat: add blockMember/unblockMember API functions and membership status type"
```

---

### Task 3: Frontend — dispatch a `casso:member-blocked` event on `MEMBER_BLOCKED` errors

**Files:**
- Modify: `apps/frontend/src/lib/api-client.ts`
- Test: `apps/frontend/src/lib/api-client.spec.ts`

**Interfaces:**
- Consumes: nothing new — reads `error.response.data.errorCode` off any failed request, same shape `AppError`/`HttpExceptionFilter` already produce (`{ statusCode, errorCode, message, details? }`).
- Produces: a `window` `CustomEvent` named `'casso:member-blocked'`, dispatched on every failed request whose body has `errorCode: 'MEMBER_BLOCKED'` — consumed by `MemberBlockedWatcher` in Task 4.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/lib/api-client.spec.ts`, add this test directly after the existing `'dispatches the plan-limit event for HTTP 402 responses'` test (still inside the `describe('AuthTokenManager', ...)` block, same `it` sibling level):

```typescript
  it('dispatches the member-blocked event for MEMBER_BLOCKED errors', async () => {
    const handler = vi.fn();
    window.addEventListener('casso:member-blocked', handler);
    const error = {
      response: { status: 403, data: { errorCode: 'MEMBER_BLOCKED' } },
    };
    requestMock.mockRejectedValue(error);

    await expect(
      apiRequest({ url: '/api/v1/receivables', method: 'GET' }),
    ).rejects.toBe(error);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('casso:member-blocked', handler);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/api-client.spec.ts`
Expected: FAIL — `handler` is never called (no dispatch exists yet for this error shape).

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/lib/api-client.ts`, add this helper directly above the `async function send<T>` declaration:

```typescript
function getErrorCode(error: unknown): string | undefined {
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { data?: unknown } }).response
      : undefined;
  const data = response?.data;
  return typeof data === 'object' && data !== null && 'errorCode' in data
    ? String((data as { errorCode?: unknown }).errorCode)
    : undefined;
}
```

Then change the `catch` block inside `send<T>` from:

```typescript
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
```

to:

```typescript
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error.response as { status?: unknown }).status
        : undefined;
    if (status === 402) {
      window.dispatchEvent(new CustomEvent('casso:plan-limit'));
    }
    if (getErrorCode(error) === 'MEMBER_BLOCKED') {
      window.dispatchEvent(new CustomEvent('casso:member-blocked'));
    }
    throw error;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/api-client.spec.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/api-client.ts apps/frontend/src/lib/api-client.spec.ts
git commit -m "feat: dispatch casso:member-blocked event on MEMBER_BLOCKED responses"
```

---

### Task 4: Frontend — `MemberBlockedWatcher` (logout + redirect on member-blocked)

**Files:**
- Create: `apps/frontend/src/contexts/member-blocked-watcher.tsx`
- Test: `apps/frontend/src/contexts/member-blocked-watcher.spec.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `'casso:member-blocked'` window event (Task 3), `useAuth().logout()` (`apps/frontend/src/contexts/auth-context.tsx`, already exists — `async logout(): Promise<void>`), `useNavigate()` from `react-router-dom`.
- Produces: `MemberBlockedWatcher` component (renders `null`), mounted inside `<BrowserRouter>` in `App.tsx` so `useNavigate()` has router context.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/contexts/member-blocked-watcher.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MemberBlockedWatcher } from './member-blocked-watcher';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

function renderWatcher() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<MemberBlockedWatcher />} />
        <Route path="/login" element={<div>Trang đăng nhập</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MemberBlockedWatcher', () => {
  it('logs out and redirects to /login on the member-blocked event', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ logout });
    renderWatcher();

    window.dispatchEvent(new CustomEvent('casso:member-blocked'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Trang đăng nhập')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/contexts/member-blocked-watcher.spec.tsx`
Expected: FAIL — cannot resolve module `./member-blocked-watcher` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/frontend/src/contexts/member-blocked-watcher.tsx`:

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export function MemberBlockedWatcher() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function handleBlocked() {
      void logout().then(() => {
        toast.error('Tài khoản của bạn đã bị chặn khỏi tổ chức này.');
        navigate('/login');
      });
    }
    window.addEventListener('casso:member-blocked', handleBlocked);
    return () =>
      window.removeEventListener('casso:member-blocked', handleBlocked);
  }, [logout, navigate]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/contexts/member-blocked-watcher.spec.tsx`
Expected: PASS

- [ ] **Step 5: Wire into `App.tsx`**

In `apps/frontend/src/App.tsx`, add the import:

```typescript
import { MemberBlockedWatcher } from '@/contexts/member-blocked-watcher';
```

and render it inside `<BrowserRouter>`, alongside `<AppRoutes />`:

```tsx
    <BrowserRouter>
      <Toaster richColors position="top-right" theme={resolvedTheme} />
      <AppRoutes />
      <MemberBlockedWatcher />
      <UpgradeDialog
        open={planLimitDialog.open}
        onOpenChange={planLimitDialog.setOpen}
      />
    </BrowserRouter>
```

No dedicated test for this wiring step — there is no `App.spec.tsx` in this codebase (the pre-existing `UpgradeDialog` wiring in the same file is unit-tested only at the component level, same convention followed here).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/contexts/member-blocked-watcher.tsx apps/frontend/src/contexts/member-blocked-watcher.spec.tsx apps/frontend/src/App.tsx
git commit -m "feat: sign out and redirect when the current session gets blocked"
```

---

### Task 5: Frontend — `UsersTab`: status badge, filter, and block/unblock actions

**Files:**
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts`
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Test: `apps/frontend/src/features/settings/components/users-tab.spec.tsx`

**Interfaces:**
- Consumes: `blockMember`/`unblockMember` (Task 2), `member.status`/`member.blockedAt` (Task 1/2), `Permission.MEMBER_BLOCK` (`@casso-ledger/shared-types`, already exists), `hasPermission` (`@/lib/rbac`, already exists), `Badge` (`@/components/ui/badge`, already exists).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/settings/components/users-tab.spec.tsx`, replace the two member fixtures and add a third, and add three new tests.

Replace:

```typescript
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
```

with:

```typescript
const ownerMember = {
  id: 'm1',
  userId: 'owner-1',
  email: 'owner@congtyb.vn',
  name: 'Chủ sở hữu',
  role: 'OWNER',
  joinedAt: '2026-08-01',
  status: 'ACTIVE',
  blockedAt: null,
};
const accountantMember = {
  id: 'm2',
  userId: 'user-2',
  email: 'ke-toan@congtyb.vn',
  name: 'Kế toán',
  role: 'ACCOUNTANT',
  joinedAt: '2026-08-01',
  status: 'ACTIVE',
  blockedAt: null,
};
const blockedMember = {
  id: 'm3',
  userId: 'user-3',
  email: 'sales@congtyb.vn',
  name: 'Sales bị chặn',
  role: 'SALES_REP',
  joinedAt: '2026-08-01',
  status: 'BLOCKED',
  blockedAt: '2026-08-10T00:00:00.000Z',
};
```

Append these three tests at the end of the `describe('UsersTab', ...)` block:

```typescript
  it('shows a blocked badge and lets an OWNER unblock a blocked member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [ownerMember, blockedMember] });
    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Sales bị chặn')).toBeTruthy(),
    );
    expect(screen.getByText('Đã chặn')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Bỏ chặn Sales bị chặn' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-3/unblock',
          method: 'POST',
        }),
      ),
    );
  });

  it('lets an OWNER block an active member', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi();
    renderTab();

    await waitFor(() => expect(screen.getByText('Kế toán')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Chặn Kế toán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organizations/org-1/members/user-2/block',
          method: 'POST',
        }),
      ),
    );
  });

  it('filters the member list by status', async () => {
    useAuth.mockReturnValue({
      user: { id: 'owner-1', role: 'OWNER', organizationId: 'org-1' },
    });
    mockApi({ members: [ownerMember, accountantMember, blockedMember] });
    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Sales bị chặn')).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'BLOCKED' },
    });

    expect(screen.queryByText('Kế toán')).toBeNull();
    expect(screen.getByText('Sales bị chặn')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/settings/components/users-tab.spec.tsx`
Expected: FAIL — no "Đã chặn" text, no "Chặn"/"Bỏ chặn" buttons, no "Lọc theo trạng thái" filter exist yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/features/settings/api/use-settings.ts`, change the import from `'./settings-api'` from:

```typescript
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

to:

```typescript
import {
  blockMember,
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
  unblockMember,
  updateEmailTemplate,
} from './settings-api';
```

Then append these two hooks after `useRemoveMember`:

```typescript
export function useBlockMember(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => blockMember(organizationId ?? '', userId),
    onSuccess: () => {
      toast.success('Đã chặn quyền truy cập của thành viên.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(error, 'Không thể chặn thành viên này.'),
      ),
  });
}

export function useUnblockMember(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unblockMember(organizationId ?? '', userId),
    onSuccess: () => {
      toast.success('Đã bỏ chặn thành viên.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(error, 'Không thể bỏ chặn thành viên này.'),
      ),
  });
}
```

Replace the full content of `apps/frontend/src/features/settings/components/users-tab.tsx`:

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
import { Badge } from '@/components/ui/badge';
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
import type { MembershipStatus } from '../types';
import {
  useBlockMember,
  useChangeMemberRole,
  useInviteMember,
  useOrganizationMembers,
  useRemoveMember,
  useUnblockMember,
} from '../api/use-settings';
import { PendingInvitesTable } from './pending-invites-table';

const roles = Object.values(Role);

type StatusFilter = 'ALL' | MembershipStatus;

export function UsersTab() {
  const { user } = useAuth();
  const canView =
    user?.role === Role.OWNER || user?.role === Role.FINANCE_MANAGER;
  const canInvite = hasPermission(user?.role ?? null, Permission.USER_MANAGE);
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.ORGANIZATION_MANAGE,
  );
  const canBlock = hasPermission(user?.role ?? null, Permission.MEMBER_BLOCK);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.ACCOUNTANT);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
  );
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole(user?.organizationId);
  const removeMember = useRemoveMember(user?.organizationId);
  const blockMember = useBlockMember(user?.organizationId);
  const unblockMember = useUnblockMember(user?.organizationId);

  if (!canView) return null;

  function submit() {
    if (!user?.organizationId || !email.trim()) return;
    invite.mutate(
      { organizationId: user.organizationId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  }

  const members = membersQuery.data?.items ?? [];
  const filteredMembers =
    statusFilter === 'ALL'
      ? members
      : members.filter((member) => member.status === statusFilter);

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
              onChange={(event) => {
                const nextRole = roles.find(
                  (item) => item === event.target.value,
                );
                if (nextRole) setRole(nextRole);
              }}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Thành viên</h2>
          <select
            aria-label="Lọc theo trạng thái"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="BLOCKED">Đã chặn</option>
          </select>
        </div>
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
                <TableHead>Trạng thái</TableHead>
                {(canManage || canBlock) && <TableHead>Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => {
                const isSelf = member.userId === user?.id;
                const isBlocked = member.status === 'BLOCKED';
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
                          onChange={(event) => {
                            const nextRole = roles.find(
                              (item) => item === event.target.value,
                            );
                            if (nextRole) {
                              changeRole.mutate({
                                userId: member.userId,
                                role: nextRole,
                              });
                            }
                          }}
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
                    <TableCell>
                      {isBlocked && <Badge variant="destructive">Đã chặn</Badge>}
                    </TableCell>
                    {(canManage || canBlock) && (
                      <TableCell className="space-x-2">
                        {canManage && !isSelf && (
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
                                  Người này sẽ mất quyền truy cập ngay lập tức.
                                  Thao tác này không thể hoàn tác.
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
                        {canBlock && !isSelf && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                {isBlocked ? 'Bỏ chặn' : 'Chặn'} {member.name}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {isBlocked
                                    ? `Bỏ chặn ${member.name}?`
                                    : `Chặn quyền truy cập của ${member.name}?`}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isBlocked
                                    ? 'Người này sẽ được khôi phục quyền truy cập vào tổ chức.'
                                    : 'Người này sẽ mất quyền truy cập ngay lập tức. Bạn có thể bỏ chặn lại bất cứ lúc nào.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    isBlocked
                                      ? unblockMember.mutate(member.userId)
                                      : blockMember.mutate(member.userId)
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
Expected: PASS (all tests in the file, including the four pre-existing tests — confirms nothing regressed)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/api/use-settings.ts apps/frontend/src/features/settings/components/users-tab.tsx apps/frontend/src/features/settings/components/users-tab.spec.tsx
git commit -m "feat: add member status badge, filter, and block/unblock actions to UsersTab"
```

---

## Final Verification

- [ ] Run `pnpm --filter @casso-ledger/backend test` — full backend unit suite green.
- [ ] Run `cd apps/frontend && npx vitest run` — full frontend suite green.
- [ ] Run `npx tsc --noEmit` (both `apps/backend` and `apps/frontend`) — no type errors.
- [ ] Run `npx biome check --write .` — lint + format clean.
- [ ] Run the `domain-check` skill (`AGENTS.md` requirement after any backend change).
- [ ] Manually smoke-test in the browser: log in as an OWNER, block a subordinate member, confirm the badge/filter update, unblock them, and (in a second session logged in as that member) confirm a blocked member's next request signs them out to `/login` with the toast message.
- [ ] Update `docs/wayfinder/feature-map.md`: mark this half of #181 in-progress → done with the PR reference (per `AGENTS.md` workflow — do NOT close #181 itself, only the Admin Platform follow-up PR does).
