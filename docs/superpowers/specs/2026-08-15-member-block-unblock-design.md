# Member-level block/unblock (org OWNER + cross-org Operator)

## Summary

Two distinct actors can revoke a single member's access to a single organization, without touching that member's access to any other org they belong to:

1. **Org `OWNER`** — blocks/unblocks any other member of their own org (never themselves).
2. **Cross-org `Operator`** (issue #98, ADR-0017) — blocks/unblocks any member of any org, including that org's `OWNER`.

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

`Membership` domain gains `block(): Membership` / `unblock(): Membership` (pure transitions, mirroring `Organization.lock()/unlock()`) and `isBlocked(): boolean`. `isActive()` keeps its current meaning (invite accepted, `joinedAt !== null`) — accept-state and block-state are separate concepts, not merged into one flag.

`User` is untouched — no account-wide block flag (per issue's own framing: a `User` can belong to 1+ orgs, and blocking must not leak across orgs the Operator wasn't asked to touch).

Block applies uniformly regardless of `joinedAt` — a pending-invite `Membership` (`joinedAt: null`) can be blocked the same as a joined one; `status`/`isBlocked()` don't branch on invite-acceptance.

## Authorization

Two independent write paths, one shared read/enforcement path.

### In-org OWNER path

New permission `MEMBER_BLOCK` in `Permission` enum, granted only to `OWNER` in `ROLE_PERMISSIONS` (not riding `USER_MANAGE`, which `FINANCE_MANAGER` also holds — blocking a colleague is OWNER-exclusive). Normal tenant flow: `BlockMembershipUseCase`/`UnblockMembershipUseCase` in `modules/organizations/application/`, `@RequirePermission(Permission.MEMBER_BLOCK)` on the controller.

Domain rule enforced in the use case (needs the actor, so not in the pure domain method): an `OWNER` cannot block their own membership. `Membership.block()` itself rejects blocking a membership with `role === OWNER` unless called with `allowBlockingOwner: true` — the in-org use case never passes it; only the Operator use case does.

### Cross-org Operator path

Mirrors `LockOrganizationUseCase` exactly:

- `BlockMemberByOperatorUseCase`/`UnblockMemberByOperatorUseCase` in `modules/admin/application/`, guarded by the existing `AdminAuthGuard` (no new guard — ADR-0017).
- Same transaction shape: load membership, no-op if already in the target state (idempotent, like organization lock/unlock), save, write one `OperatorAuditLog` row (`actionType: MEMBER_BLOCKED`/`MEMBER_UNBLOCKED`, `membershipId` set) in the same transaction.
- Calls `Membership.block({ allowBlockingOwner: true })` — the one path allowed to block an `OWNER`'s membership.

### Enforcement (both paths funnel through this)

New `MembershipBlockGuard`, added to the tenant-facing guard chain alongside the existing `OrganizationLockGuard` (after `JwtAuthGuard`, before `PermissionGuard`). Loads the caller's `Membership` by `(userId, organizationId)`, rejects with `errorCode: MEMBER_BLOCKED`, HTTP 403, if `status === 'BLOCKED'`. Same shape and status code as `ORGANIZATION_LOCKED` — a blocked member is authenticated but forbidden, not unauthenticated, so this does not touch `JwtStrategy.validate`'s existing 401 paths (missing/not-yet-accepted membership stays 401; blocked membership is 403).

## Endpoints

```
POST /api/v1/organizations/members/:membershipId/block
POST /api/v1/organizations/members/:membershipId/unblock
POST /admin/organizations/:orgId/members/:membershipId/block
POST /admin/organizations/:orgId/members/:membershipId/unblock
```

All four: idempotent 200 no-op if already in the target state (same convention as `POST /admin/organizations/:id/lock`/`unlock`). No response body beyond the updated membership summary (id, status, blockedAt) — no `organizationId`/`version` leak, consistent with existing DTO rules.

## Notification email

Both actors trigger the same email job — the recipient never sees which actor performed the action. New BullMQ job `send-member-block-alert`, added to `EmailQueueProcessor` alongside `send-owner-alert`/`send-auth-email`, sent unconditionally via Resend (not the tenant's own SMTP config — this is an account-security notice, must not depend on the org's own email config, same reasoning as `send-owner-alert`).

```typescript
interface MemberBlockAlertEmailJob {
  to: string; // blocked/unblocked member's email
  organizationName: string;
  action: 'BLOCKED' | 'UNBLOCKED';
}
```

New port method on the existing auth email sender interface (or a small new port in `modules/organizations/application/`) — `sendMemberBlockAlert(to, organizationName, action)` — queues the job; `EmailQueueProcessor` gets one new `if (job.name === 'send-member-block-alert')` branch resolving `'__auth__'`/Resend directly, same as `processAuthEmail`. Failure is logged, not retried into a fallback path (matches `processAuthEmail`'s failure handling — this is a best-effort notice, not a business-critical delivery like a reminder).

## Error handling

New `ErrorCode.MEMBER_BLOCKED`, HTTP 403 (`status-by-error-code.ts`), used by `MembershipBlockGuard`. Existing errors reused: `NOT_FOUND` for a missing membership, `FORBIDDEN` for permission failures on the write endpoints.

## Testing

- Domain: `Membership.block()/unblock()/isBlocked()` — including the `allowBlockingOwner` guard rejecting a plain block of an `OWNER` role membership.
- Use cases: OWNER blocking self → domain error; OWNER blocking a subordinate → success + no email failure blocks the transaction; Operator blocking an `OWNER` → success; idempotent double-block → no-op, single audit row only from the first call.
- `MembershipBlockGuard`: blocked membership → 403 `MEMBER_BLOCKED`; active membership → passes through.
- e2e: full request through a blocked membership rejected at the guard layer, not earlier (i.e. still passes `JwtAuthGuard`).

## Out of scope

- Any in-app/UI banner for a blocked member (email only, per issue's own open question — resolved as email-only for this scope).
- Bulk block/unblock.
- Un-blocking automatically after a time window.
