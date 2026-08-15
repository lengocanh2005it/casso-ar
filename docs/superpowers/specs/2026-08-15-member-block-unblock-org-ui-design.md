# Member block/unblock — org-facing UI (issue #181, part 1/2)

## Summary

Part 1 of 2 for issue #181. Adds the org-facing (tenant app) surface only: an
`OWNER` can block/unblock a subordinate member from the existing member
management page (`UsersTab`). The Admin Platform (Operator console) surface
is a separate follow-up ticket/PR, not covered here.

Backend endpoints already exist and are fully implemented (issue #178,
ADR-0019, `docs/superpowers/specs/2026-08-15-member-block-unblock-design.md`):

```
POST /api/v1/organizations/:id/members/:userId/block
POST /api/v1/organizations/:id/members/:userId/unblock
```

Both guarded by `@RequirePermission(Permission.MEMBER_BLOCK)` (OWNER-only),
both accept an optional `Idempotency-Key` header, both return
`MemberStatusResponseDto { id, userId, status: 'ACTIVE'|'BLOCKED', blockedAt: Date|null }`.

## Gap found in the existing backend

`GET /api/v1/organizations/:id/members` (`ListMembersResponseDto` /
`MemberResponseDto`, `apps/backend/src/modules/organizations/presentation/dto/member-response.dto.ts`)
does not expose `status`/`blockedAt`, even though `Membership` (domain) already
carries both fields. This is a presentation-layer-only gap (DTO + mapper), no
domain/application change needed — included in this ticket.

## Decisions (resolved via grilling, superseding the open questions in #181)

1. **Scope**: org-facing only in this PR. Admin Platform is a separate
   ticket. This PR does not `Closes #181`.
2. **Status display**: both a badge on the member's row AND a status filter
   dropdown above the table (issue's "badge, filter, both" question →
   both).
3. **Filter**: client-side only, filtering the already-fetched
   `membersQuery.data.items` array (the list endpoint is called with
   `limit=100`, i.e. already fetches the whole org in one page) — no new
   query param, no refetch on filter change.
4. **Confirmation UX**: both block and unblock go through the same
   `AlertDialog` confirm pattern already used for "Xoá {name}" in this file
   — no asymmetry between block and unblock, no stronger friction pattern.
5. **Row action placement**: a new `<Button variant="outline" size="sm">`
   ("Chặn" / "Bỏ chặn") next to the existing "Xoá {name}" button, not a
   kebab/dropdown menu.
6. **Permission gate**: a new `canBlock = hasPermission(user?.role ?? null, Permission.MEMBER_BLOCK)`
   flag, independent of the existing `canManage` (`Permission.ORGANIZATION_MANAGE`)
   flag that gates the role select + remove button — even though both
   currently resolve to OWNER-only, they are logically distinct permissions
   per `AGENTS.md`'s RBAC convention (hide the button when the specific
   permission is missing, don't piggyback on a different one). Same
   `isSelf` exclusion as the existing remove-member action (mirrors the
   backend's own self-block rejection).
7. **Idempotency**: block/unblock calls go through the existing
   `postWithIdempotency()` helper in `lib/api-client.ts` (auto-attaches
   `Idempotency-Key: crypto.randomUUID()`), same as `saveSmtpConfig`/
   `createEmailTemplate`/`inviteOrganizationMember`.
8. **`MEMBER_BLOCKED` (403) handling, app-wide**: reuses the existing
   cross-cutting error pattern in `lib/api-client.ts` (`send()` already
   dispatches `window.dispatchEvent(new CustomEvent('casso:plan-limit'))`
   on HTTP 402). Add: on any response with
   `error.response.data.errorCode === 'MEMBER_BLOCKED'`, dispatch
   `window.dispatchEvent(new CustomEvent('casso:member-blocked'))`. A new
   hook `useMemberBlockedLogout()` (mirroring `usePlanLimitDialog()` in
   `features/settings/components/upgrade-dialog.tsx`) listens for it at the
   `App()` level (already rendered inside `AuthProvider`, per `main.tsx`)
   and calls the existing `useAuth().logout()` + `navigate('/login')` +
   `toast.error('Tài khoản của bạn đã bị chặn khỏi tổ chức này.')`.

## Out of scope (this PR)

- Admin Platform / Operator console block/unblock UI (separate ticket).
- Server-side filtering/pagination changes to the members list endpoint.
- Any change to `Membership` domain, use cases, or guards (backend behavior
  is unchanged — only the list-members response DTO gains two fields).
