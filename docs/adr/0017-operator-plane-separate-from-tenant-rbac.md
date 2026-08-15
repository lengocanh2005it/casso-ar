---
status: proposed
---

# Cross-org Operator identity/authorization is a separate plane, not an extension of tenant RBAC

Casso needs its own staff (`Operator`) to act across every organization (lock/unlock, cross-org `AIUsageLog` monitoring) — a need `TenantContextService`/`PermissionGuard`/`AuditLog` were never designed for, since every one of them assumes exactly one `organizationId` per request (ADR-0001). We decided an `Operator` is a flag on the existing `User` row (not a separate auth system, not a `Membership`/`Role`), authorized through its own `AdminGuard` that never touches `TenantContextService` or `PermissionGuard`, with its own `OperatorAuditLog` table rather than a nullable `AuditLog.organizationId`.

**Rejected alternative:** extending `TenantContextService`/`PermissionGuard`/`AuditLog` to tolerate a null/cross-org case. Rejected because those three are the cross-cutting foundation every business module depends on (see `.claude/rules/common.md`) — adding a null-`organizationId` branch to code with that blast radius, for one narrow admin feature, is a worse trade than a second small, isolated plane.

Full options considered: see issue #98 discussion.
