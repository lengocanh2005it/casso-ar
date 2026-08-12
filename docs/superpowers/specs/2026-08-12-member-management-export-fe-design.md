# Member Management + CSV Export — FE Completion

> Child spec of [docs/overview.md](../../../docs/overview.md). Frontend counterpart to PR #148 (backend for issues #128 and #130 — member role change/removal, invite revoke/resend, CSV export — merged, FE deliberately deferred). Extends [2026-08-07-get-organization-members-design.md](2026-08-07-get-organization-members-design.md) (`GET /organizations/:id/members`) and the FE settings tab pattern in `apps/frontend/src/features/settings/` (`users-tab.tsx`, `email-templates-tab.tsx`). Closes the FE half of issues #128 and #130.

## 0. Problem & non-goals

PR #148 shipped the backend for member management (role change, remove member, invite revoke/resend) and CSV export (receivables, aging report) with zero frontend — `UsersTab` only supports inviting and viewing members; `ReceivablesPage`/`ReportsPage` have no export affordance. This spec closes that gap.

While scoping, we found the backend has no endpoint to list pending (not-yet-accepted) invites — required for the invite revoke/resend UI to know what to show. This spec adds that one small backend endpoint alongside the FE work; see §1.

**Out of scope:**
- Any other backend behavior change — role change/remove/export/revoke/resend endpoints are already shipped and unchanged by this spec.
- Real-time member-list updates across sessions — the tab reflects TanStack Query's default refetch-on-focus/refetch-on-mount behavior, no polling.
- Bulk actions (bulk role change, bulk export by selection) — not requested, YAGNI.

## 1. Backend addition: `GET /organizations/:id/invites`

```
GET /api/v1/organizations/:id/invites?page=1&limit=20
```

- **Guard**: `JwtAuthGuard`, `PermissionGuard`
- **Permission**: `ORGANIZATION_MANAGE` (existing, OWNER-only — matches revoke/resend)
- **Tenant isolation**: `:id` must match `TenantContextService.getOrganizationId()` via `assertOrgMatches` (`common/auth/assert-org-matches.ts`, added in PR #148's review-fix commit)
- Lists invites where `acceptedAt IS NULL` only (accepted invites are members already, not shown here)

### Response

```typescript
{
  items: InviteResponseDto[],
  total: number,
  page: number,
  limit: number,
}
```

```typescript
// InviteResponseDto
{
  id: string;
  email: string;
  role: Role;
  invitedAt: Date;
  expiresAt: Date;
}
```
No `tokenHash` — never leak the invite token itself.

### Data flow

```
InvitesController.listInvites()
  → assertOrgMatches(request, id)
  → ListInvitesUseCase.execute({ organizationId, page, limit })
    → IMembershipInviteRepository.findPendingPageByOrganization() + countPendingByOrganization()
  → toInviteResponse() mapper
  → { items, total, page, limit }
```

### Files

| File | Action |
|------|--------|
| `auth/application/membership-invite-repository.port.ts` | Add `findPendingPageByOrganization`, `countPendingByOrganization` |
| `auth/infrastructure/typeorm-membership-invite.repository.ts` | Implement (`WHERE acceptedAt IS NULL`, paginated) |
| `auth/application/list-invites.usecase.ts` | New use case |
| `auth/application/list-invites.usecase.spec.ts` | New unit test (RED first) |
| `auth/presentation/dto/invite-response.dto.ts` | New DTO + mapper |
| `auth/presentation/invites.controller.ts` | New `GET` handler |
| `apps/backend/test/member-management-export.e2e-spec.ts` | Add a case: list shows the seeded pending invite, excludes accepted ones |

### Edge cases
- `:id` ≠ tenant org → `FORBIDDEN`
- No pending invites → `{ items: [], total: 0, page, limit }`
- Accepted invite → excluded

## 2. FE component structure

```
apps/frontend/src/features/settings/
  types.ts                          -- MODIFY: add Invite, OrganizationInviteList
  api/
    settings-api.ts                 -- MODIFY: add changeMemberRole, removeMember,
                                        fetchOrganizationInvites, revokeInvite, resendInvite
    use-settings.ts                 -- MODIFY: add corresponding hooks
  components/
    users-tab.tsx                   -- MODIFY: role select + remove per member row,
                                        renders <PendingInvitesTable>
    pending-invites-table.tsx       -- NEW: invites list + revoke/resend actions

apps/frontend/src/features/receivables/
  api/receivables-api.ts            -- MODIFY: add exportReceivablesCsv
  pages/receivables-page.tsx        -- MODIFY: "Xuất CSV" button

apps/frontend/src/features/reports/
  api/reports-api.ts                -- MODIFY: add exportAgingReportCsv
  pages/reports-page.tsx            -- MODIFY: "Xuất CSV" button

apps/frontend/src/lib/
  download-csv.ts                   -- NEW: shared blob-download helper (used by both export buttons)
```

`Rule of Two`: `download-csv.ts` goes in `lib/` from the start, not a feature folder, because both `receivables` and `reports` need the identical blob-to-file-download logic — a single small helper, not a hook (no query/mutation state to manage; it's a synchronous side effect after an `apiRequest` resolves).

## 3. Users tab — states & copy

Current `UsersTab` gates all content behind `canView` (`OWNER`/`FINANCE_MANAGER`). The new actions add a second, narrower gate:

```typescript
const canManage = hasPermission(user?.role ?? null, Permission.ORGANIZATION_MANAGE); // OWNER-only
```

**Members table** — new "Thao tác" column, rendered only when `canManage`:

| Condition | Role cell | Action cell |
|---|---|---|
| `member.userId === user.userId` (self) | plain text, no select | *(nothing)* |
| last active OWNER (see below) | `<select>` present but `disabled` | Xoá button `disabled` |
| otherwise | `<select>` bound to `useChangeMemberRole` | `Xoá` → `AlertDialog` confirm → `useRemoveMember` |

"Last active OWNER" is **not** computed client-side (would require re-deriving backend invariants). The select/button stay enabled for every non-self OWNER row; the 409 from the backend's `assertNotLastOwner` guard is caught and shown as a toast (`getResponseErrorMessage(error, 'Không thể xoá/đổi vai trò OWNER cuối cùng.')`), same pattern as `useDeleteSmtpConfig`'s `onError`. This keeps the FE simple and single-sourced on the backend's actual invariant.

**Pending invites table** (new `PendingInvitesTable`, rendered under the members table, same `canManage` gate):

| Column | Content |
|---|---|
| Email | `invite.email` |
| Vai trò | `invite.role` |
| Mời lúc | formatted `invite.invitedAt` |
| Thao tác | `Gửi lại` (`useResendInvite`), `Thu hồi` (`AlertDialog` confirm → `useRevokeInvite`) |

Empty state: `"Không có lời mời nào đang chờ."`

**Row action confirm dialogs** (both use the existing `AlertDialog` primitive, pattern from `email-templates-tab.tsx`):
- Remove member: *"Xoá {member.name} khỏi tổ chức?"* / *"Người này sẽ mất quyền truy cập ngay lập tức. Thao tác này không thể hoàn tác."*
- Revoke invite: *"Thu hồi lời mời tới {invite.email}?"* / *"Lời mời sẽ không còn hiệu lực."*

**Mutations invalidate** `['organization-members', organizationId]` (role change, remove) and a new `['organization-invites', organizationId]` key (revoke, resend) — mirrors the existing `useInviteMember` invalidation pattern.

## 4. CSV export buttons

**`download-csv.ts`**:
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

**`exportReceivablesCsv(filters)`** (`receivables-api.ts`) needs the `X-Export-Truncated` response header (added in PR #148's review-fix commit), but `apiRequest` only returns `response.data` — no caller has needed headers before. Resolution: `lib/api-client.ts` gets a new sibling function, `apiRequestWithHeaders<T>(config)`, which factors the existing token-attach + 402-event logic out of `apiRequest` into a shared private `send()` and returns `{ data, headers }` instead of just `data`; `apiRequest` becomes a thin wrapper (`send(config).then(r => r.data)`) so every existing call site is unaffected. `exportReceivablesCsv` is the only caller of `apiRequestWithHeaders` for now.

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

`responseType: 'text'` (not `'blob'`) keeps the return type a plain `string`; `downloadCsv` wraps it in a `Blob` itself. On `truncated === true` show a toast: *"Chỉ xuất 10.000 dòng đầu, vui lòng lọc bớt để xuất đầy đủ."*

**`ReceivablesPage`**: button "Xuất CSV" next to `ImportInvoicesDialog`/`CreateReceivableDialog`, visible when `hasPermission(role, Permission.RECEIVABLE_READ)`. On click: call `exportReceivablesCsv({ status, customerId })` (current filters from `searchParams`, page/limit omitted — export is unpaginated by design), then `downloadCsv(csv, 'cong-no.csv')`. Loading state: button shows a spinner/disabled while the request is in flight (it can take a moment for large orgs).

**`ReportsPage`**: button "Xuất CSV" next to the page title, visible when the existing reports-read permission gate passes (reuse whatever gate already wraps this page — no new permission). Calls `exportAgingReportCsv()` → `GET /api/v1/reports/aging/export` → `downloadCsv(csv, 'bao-cao-tuoi-no.csv')`.

## 5. Testing

- **Backend**: RED→GREEN for `ListInvitesUseCase` (mocked repo) + controller wiring; e2e case appended to `member-management-export.e2e-spec.ts`.
- **Frontend**: component tests for `UsersTab`'s new role-select/remove/revoke/resend behavior (pattern: `receivable-actions.spec.tsx` — render, fire event, assert mutation called / assert confirm-then-call for destructive actions) and `PendingInvitesTable`. `downloadCsv` gets its own small unit test (mock `URL.createObjectURL`/`revokeObjectURL`, assert `<a>` click), kept separate from the page tests so the DOM-mocking is isolated in one place.
- Follow `pnpm --filter @casso-ledger/frontend test` conventions already in place (check `package.json` for the exact script name before running).

## 6. Edge cases

- Org has zero pending invites → empty state, no error.
- Removing/demoting the last active OWNER → 409 toast (backend-enforced, not pre-validated client-side).
- Self row → both actions hidden regardless of role/owner-count.
- Export on an org with >10,000 matching receivables → CSV still downloads (first 10,000 rows) + truncation toast, not an error.
