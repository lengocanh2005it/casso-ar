# Member-level block/unblock (org OWNER + cross-org Operator)

## Summary

Two distinct actors can revoke a single member's access to a single organization, without touching that member's access to any other org they belong to:

1. **Org `OWNER`** — blocks/unblocks any other member of their own org, except an OWNER (never themselves, and never a co-OWNER — an org can have more than one `OWNER` membership since `ChangeMemberRoleUseCase` only blocks demoting/removing the *last* one, so "except self" alone isn't sufficient; blocking any OWNER is Operator-exclusive).
2. **Cross-org `Operator`** (issue #98, ADR-0017) — blocks/unblocks any member of any org, including that org's `OWNER` — the one action no in-org role, not even a co-OWNER, can perform.

Distinct from #98's `Organization.status` (`ACTIVE`/`LOCKED`), which hard-blocks an entire org. This is per-`Membership`, scoped to the one org/user pair.

Terminology: **block / unblock member** (not "suspend" — matches issue #178's own wording).

Block state is scoped to `Membership`, not `User` — see ADR-0019 for why (a `User` belongs to 1+ orgs; blocking must not leak into orgs neither actor was asked to touch).

## Data Model

```typescript
// memberships table — add columns
status: 'ACTIVE' | 'BLOCKED'; // default 'ACTIVE'
blockedAt: Date | null;

// operator_audit_logs table — extend actionType, add membershipId
actionType: 'ORGANIZATION_LOCKED' | 'ORGANIZATION_UNLOCKED' | 'MEMBER_BLOCKED' | 'MEMBER_UNBLOCKED';
membershipId: string | null; // set for MEMBER_BLOCKED/MEMBER_UNBLOCKED, null for org-level actions
```

`Membership` domain gains `block(): Membership` / `unblock(): Membership` — pure, unconditional transitions with no business-rule checks, exactly mirroring `Organization.lock()/unlock()` (which also just flips `status`; the "no-op if already LOCKED" check lives in `LockOrganizationUseCase`, not the domain method) — plus `isBlocked(): boolean`. `isActive()` keeps its current meaning (invite accepted, `joinedAt !== null`) — accept-state and block-state are separate concepts, not merged into one flag.

`User` is untouched — no account-wide block flag (per issue's own framing: a `User` can belong to 1+ orgs, and blocking must not leak across orgs the Operator wasn't asked to touch).

Block applies uniformly regardless of `joinedAt` — a pending-invite `Membership` (`joinedAt: null`) can be blocked the same as a joined one; `status`/`isBlocked()` don't branch on invite-acceptance.

## Authorization

Two independent write paths, one shared read/enforcement path.

### In-org OWNER path

New permission `MEMBER_BLOCK` in `Permission` enum, granted only to `OWNER` in `ROLE_PERMISSIONS` (not riding `USER_MANAGE`, which `FINANCE_MANAGER` also holds — blocking a colleague is OWNER-exclusive; `OWNER`'s permission list is `Object.values(Permission)`, so adding the enum value alone is sufficient — no separate `ROLE_PERMISSIONS[OWNER]` edit needed). `BlockMemberUseCase`/`UnblockMemberUseCase` live in `modules/auth/application/` alongside the existing `RemoveMemberUseCase` (same "member lifecycle action" family, same `MEMBERSHIP_REPOSITORY` from `OrganizationsModule` which `AuthModule` already imports — putting them in `modules/organizations/application/` instead would need `OrganizationsModule` to import `AuthModule` back for the block-alert email sender, a cycle). Controller: `InvitesController` (`modules/auth/presentation/invites.controller.ts`), which already owns `DELETE organizations/:id/members/:userId` (remove) and `PATCH .../members/:userId` (role change, in `OrganizationsController` — role-change doesn't need the email sender so it stays there); `@RequirePermission(Permission.MEMBER_BLOCK)`.

`BlockMemberUseCase` enforces two checks before calling `membership.block()`, both `AppError(ErrorCode.FORBIDDEN, ...)` — same layer and pattern as the existing `assertNotLastOwner` helper (application-layer business rule, not a domain invariant): the target `userId` cannot equal the actor's own `userId` (no self-block), and the target membership's `role` cannot be `OWNER` (blocking any `OWNER` — including a co-`OWNER` — is Operator-exclusive, per the resolved multi-owner question above).

### Cross-org Operator path

Mirrors `LockOrganizationUseCase` exactly:

- `BlockMemberByOperatorUseCase`/`UnblockMemberByOperatorUseCase` in `modules/admin/application/`, guarded by the existing `AdminAuthGuard` (no new guard — ADR-0017).
- Same transaction shape: load membership, no-op if already in the target state (idempotent, like organization lock/unlock), save, write one `OperatorAuditLog` row (`actionType: MEMBER_BLOCKED`/`MEMBER_UNBLOCKED`, `membershipId` set) in the same transaction.
- No role check before calling `membership.block()` — this is the one path allowed to block a membership of any role, including `OWNER`.

### Enforcement (both paths funnel through this)

New `MembershipBlockGuard`, added to the tenant-facing guard chain alongside the existing `OrganizationLockGuard` (after `JwtAuthGuard`, before `PermissionGuard`). Loads the caller's `Membership` by `(userId, organizationId)`, rejects with `errorCode: MEMBER_BLOCKED`, HTTP 403, if `status === 'BLOCKED'`. Same shape and status code as `ORGANIZATION_LOCKED` — a blocked member is authenticated but forbidden, not unauthenticated, so this does not touch `JwtStrategy.validate`'s existing 401 paths (missing/not-yet-accepted membership stays 401; blocked membership is 403).

## Endpoints

```
POST /api/v1/organizations/:id/members/:userId/block
POST /api/v1/organizations/:id/members/:userId/unblock
POST /admin/organizations/:orgId/members/:userId/block
POST /admin/organizations/:orgId/members/:userId/unblock
```

Keyed by `userId`, not a separate `membershipId` path segment — matches the existing `DELETE .../members/:userId` (remove) and `PATCH .../members/:userId` (role change) convention; the membership is resolved server-side via `findByUserAndOrganization(userId, organizationId)`, same as those two use cases already do. The in-org route also runs `assertOrgMatches(request, id)` before calling the use case, same as every other route in `InvitesController`.

All four: idempotent 200 no-op if already in the target state (same convention as `POST /admin/organizations/:id/lock`/`unlock`). No response body beyond the updated membership summary (id, status, blockedAt) — no `organizationId`/`version` leak, consistent with existing DTO rules.

## Notification email

Both actors trigger the same email — the recipient never sees which actor performed the action. Reuses the existing `send-auth-email` BullMQ job (`AuthEmailJob`, already resolves `'__auth__'`/Resend directly in `EmailQueueProcessor.processAuthEmail`, never the tenant's own SMTP config) instead of adding a new job type — `AuthEmailJob.emailType` gains two values, `'MEMBER_BLOCKED' | 'MEMBER_UNBLOCKED'`. No processor change needed; `processAuthEmail` is already generic over `emailType`.

`IAuthEmailSender` (`modules/auth/application/auth-email-sender.port.ts`) gains `sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>` and `sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>`, implemented in `ResendAuthEmailSenderAdapter` the same way `sendInviteEmail` is. Failure is logged, not retried into a fallback path (matches `processAuthEmail`'s existing failure handling — this is a best-effort notice, not a business-critical delivery like a reminder).

## Error handling

New `ErrorCode.MEMBER_BLOCKED`, HTTP 403 (`status-by-error-code.ts`), used by `MembershipBlockGuard`. Existing errors reused: `NOT_FOUND` for a missing membership, `FORBIDDEN` for permission failures on the write endpoints.

## Testing

- Domain: `Membership.block()/unblock()/isBlocked()` — pure transitions, no role checks (those live in `BlockMemberUseCase`, tested there).
- Use cases: OWNER blocking self → `FORBIDDEN`; OWNER blocking another `OWNER`/co-`OWNER` → `FORBIDDEN`; OWNER blocking a subordinate → success, email queued, no email failure blocks the transaction; Operator blocking an `OWNER` → success; idempotent double-block → no-op, single audit row only from the first call.
- `MembershipBlockGuard`: blocked membership → 403 `MEMBER_BLOCKED`; active membership → passes through.
- e2e: full request through a blocked membership rejected at the guard layer, not earlier (i.e. still passes `JwtAuthGuard`).

## Out of scope

- Any in-app/UI banner for a blocked member (email only, per issue's own open question — resolved as email-only for this scope).
- Bulk block/unblock.
- Un-blocking automatically after a time window.
