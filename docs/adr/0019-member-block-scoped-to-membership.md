# 19. Member block is scoped to Membership, not User

Date: 2026-08-15

## Status

Accepted (research — issue #178, not yet built)

## Context

Issue #178 asks for two block/unblock actors: an org's own `OWNER` blocking a subordinate member, and a cross-org `Operator` (issue #98, ADR-0017) blocking any member of any org, including that org's `OWNER`. `User` already carries `isOperator: boolean`, a single account-wide flag (ADR-0017) — the obvious-looking shortcut is to add a similar `isBlocked` flag to `User`.

That shortcut is wrong for this feature specifically: `CONTEXT.md` already defines `User` as belonging to 1+ `Organization` via `Membership`. A `User`-level block would deny access to every org that user belongs to, even orgs neither actor was ever asked to touch — an `OWNER` in org A has no business revoking that user's access to unrelated org B, and even the cross-org `Operator`'s action is framed by the issue as "block this member of this org," not "block this user everywhere."

A related question: should the in-org `OWNER` action reuse the existing `USER_MANAGE` permission (already granted to both `OWNER` and `FINANCE_MANAGER`), or get a new OWNER-exclusive permission? Riding `USER_MANAGE` would let a `FINANCE_MANAGER` block a colleague — plausible, but not something the issue or any existing product decision asked for, and revoking it later (once a `FINANCE_MANAGER` has already used it) is a harder conversation than not granting it up front.

## Decision

Block state lives on `Membership` (`status: ACTIVE | BLOCKED`, `blockedAt`), not on `User`. Blocking is scoped to the one `(userId, organizationId)` pair — every other org the user belongs to is unaffected, for both actors.

The in-org `OWNER` action gets its own permission, `MEMBER_BLOCK`, granted only to `OWNER` in `ROLE_PERMISSIONS` — not layered onto `USER_MANAGE`.

- Explicitly rejected: a `User`-level `isBlocked` flag. Simpler schema (one boolean, no `Membership` migration), but wrong blast radius — it cannot express "block this member from this org only," which is the actual requirement, and mixing it into `isOperator`'s pattern would blur two unrelated concepts (Casso staff flag vs. tenant-scoped access revocation).
- Explicitly rejected: gating the `OWNER` action on `USER_MANAGE`. Reuses an existing permission (less RBAC surface), but silently expands who can block a colleague to `FINANCE_MANAGER` — a scope decision the issue left open and did not ask for.

## Consequences

- `Membership` gains a real two-value state machine (`ACTIVE`/`BLOCKED`) instead of staying a flat link row — enforcement (`MembershipBlockGuard`) reads this per-request, mirroring how `OrganizationLockGuard` already reads `Organization.status`.
- A user blocked from org A keeps normal access to org B without any extra logic — falls out of the model for free, rather than needing an explicit exemption.
- `RBAC.md`/`ROLE_PERMISSIONS` gains one more granular permission (`MEMBER_BLOCK`) beyond the existing set — acceptable per-permission cost for keeping the action OWNER-exclusive by default; if a future issue explicitly asks to extend it to `FINANCE_MANAGER`, that's a one-line `ROLE_PERMISSIONS` change, not a schema migration.
- The cross-org `Operator` path still reuses `AdminAuthGuard`/`OperatorAuditLog` unchanged (ADR-0017) — this ADR only decides where the *state* lives and how the *in-org* actor is authorized, not the Operator plane's shape.
