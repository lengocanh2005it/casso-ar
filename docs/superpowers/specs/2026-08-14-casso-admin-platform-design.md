# Casso Admin Platform (cross-org Operator)

## Summary

A cross-organization admin surface for Casso's own staff (`Operator`) — not an org-scoped feature. MVP covers both use cases from issue #98: locking/unlocking organizations, and cross-org `AIUsageLog` monitoring (aggregate-only). Runs as a second, fully separate authorization plane alongside the existing per-org RBAC — see ADR-0017 (PR #177) for why it does not extend `TenantContextService`/`PermissionGuard`/`AuditLog`.

Member-level block/unblock (an org OWNER blocking a subordinate; an Operator blocking any member including an OWNER) is a related but distinct capability, tracked separately in issue #178 — out of scope here.

## Data Model

```typescript
// users table — add column
isOperator: boolean; // default false, set by manual DB seed only (no admin-management API in MVP)

// organizations table — add column
status: 'ACTIVE' | 'LOCKED'; // default 'ACTIVE'

// new table: operator_audit_logs
{
  id: string;
  operatorId: string;       // User.id
  organizationId: string;   // org the action targeted
  actionType: 'ORGANIZATION_LOCKED' | 'ORGANIZATION_UNLOCKED';
  createdAt: Date;
}
```

`OperatorAuditLog` only records write actions (lock/unlock). Read actions (viewing aggregate AI usage) are not audited — see ADR-0017 discussion in issue #98.

No new table for AI usage aggregation; both usage endpoints query the existing `ai_usage_logs` table directly.

## Authorization

Two guards, both new, neither touches `TenantContextService`/`PermissionGuard`:

- **`AdminGuard`** — reads `isOperator` claim from the JWT (added to `AuthenticatedUser`/JWT payload alongside the existing `organizationId`, which is absent/irrelevant for an Operator request). Protects every `/admin/*` route. Rejects with `FORBIDDEN` if the claim is false/missing.
- **`OrganizationLockGuard`** — added to the existing customer-facing guard chain (after `JwtAuthGuard`, before `PermissionGuard`). Looks up the caller's `Organization.status`; rejects with `ORGANIZATION_LOCKED` (403) if `LOCKED`. Hard block — every request scoped to that org is rejected, not a soft per-action warning.

A `User` can hold `isOperator = true` and also have `Membership` rows in one or more organizations at the same time (e.g. to test the customer-facing app) — the two guards are independent, so this does not leak permissions between the two planes.

Login: same `/auth/login` endpoint and JWT issuance as customer users — no separate admin auth flow. Operator creation/`isOperator` flag toggling has no API in MVP; done via a one-off DB script when needed.

## Endpoints

```
GET  /api/v1/admin/organizations?page=&limit=
POST /api/v1/admin/organizations/:id/lock
POST /api/v1/admin/organizations/:id/unlock
GET  /api/v1/admin/ai-usage?from=&to=
GET  /api/v1/admin/ai-usage/trend?from=&to=
```

All guarded by `AdminGuard` only.

### GET /admin/organizations

```typescript
{
  items: { id: string; name: string; status: 'ACTIVE' | 'LOCKED'; createdAt: Date }[];
  total: number;
  page: number;
  limit: number;
}
```
No member/`Membership` data (see issue #178).

### POST /admin/organizations/:id/lock, /unlock

Sets `Organization.status` and writes one `OperatorAuditLog` row inside the same transaction. Idempotent: locking an already-`LOCKED` org (or unlocking an already-`ACTIVE` one) is a 200 no-op, not an error — `status` is a 2-value flag, not a multi-step state machine, so double-submission doesn't need strict transition validation.

### GET /admin/ai-usage

Aggregate `GROUP BY organizationId, model` over `[from, to]`. `from`/`to` are **required** query params (no BE default — FE is responsible for computing/passing them); reject with `VALIDATION_ERROR` if missing or the range exceeds 90 days.

```typescript
{
  items: {
    organizationId: string;
    organizationName: string;
    model: string;
    requestCount: number;
    totalTokens: number;
    errorCount: number;
  }[];
}
```

Row-level data (`conversationId`, individual log rows) is never exposed — aggregate-only, per issue #98's blast-radius concern.

### GET /admin/ai-usage/trend

Same `from`/`to` rules. `GROUP BY DATE(createdAt)`, summed across all organizations (platform-wide daily trend, not per-org).

```typescript
{
  items: { date: string; requestCount: number; totalTokens: number }[];
}
```

## Frontend

New route tree `/admin/*` in the existing React app (no separate app/deployment). Route guard checks the `isOperator` claim client-side (backend is the actual enforcement point via `AdminGuard`).

- **`/admin/dashboard`** — org count + locked-org count cards; bar chart of top organizations by usage (`GET /admin/ai-usage`, last 7 days); line chart of daily usage trend (`GET /admin/ai-usage/trend`, last 7 days). Uses the existing `recharts` dependency — no new chart library.
- **`/admin/organizations`** — paginated table with a Lock/Unlock button per row.
- **`/admin/ai-usage`** — required date-range picker + breakdown table (org → model).

`frontend-design` is invoked at implementation time for these three pages, not during this brainstorming/spec step.

## Error Handling

| Case | Response |
|---|---|
| Non-operator calls `/admin/*` | `FORBIDDEN` (403, existing ErrorCode) |
| Customer request against a `LOCKED` org | `ORGANIZATION_LOCKED` (403, **new** ErrorCode — add to `status-by-error-code.ts`) |
| `/admin/ai-usage(/trend)` missing or invalid `from`/`to`, or range > 90 days | `VALIDATION_ERROR` (400) |
| Lock/unlock on an org already in that state | 200, no-op (not an error) |

## Files (indicative — refined during planning)

| File | Action |
|---|---|
| `common/admin/admin.guard.ts` | New |
| `common/admin/is-operator.decorator.ts` (or reuse JWT payload directly) | New, if needed |
| `common/tenancy/organization-lock.guard.ts` | New |
| `common/errors/error-code.ts`, `status-by-error-code.ts` | Add `ORGANIZATION_LOCKED` |
| `modules/organizations/domain/organization.ts` | Add `status` field |
| `modules/organizations/infrastructure/organization.orm-entity.ts` | Add `status` column |
| `modules/admin/` (new module) | `domain/`, `application/`, `infrastructure/`, `presentation/` — lock/unlock use case, list-organizations use case, ai-usage aggregate use cases, `OperatorAuditLog` entity/repository |
| `modules/users/infrastructure/user.orm-entity.ts` | Add `isOperator` column |
| `common/auth/*` | Add `isOperator` to JWT payload / `AuthenticatedUser` |
| `apps/frontend/src/routes/admin/*` | New route tree + 3 pages |

## Testing

- Unit: `AdminGuard` (allow/deny by `isOperator`), `OrganizationLockGuard` (allow/deny by `status`), lock/unlock use case (status update + `OperatorAuditLog` write in one transaction), ai-usage aggregate use cases (correct grouping/math with mocked repository).
- e2e: operator locks an org → a customer request against that org receives `ORGANIZATION_LOCKED`; `GET /admin/ai-usage` and `/admin/ai-usage/trend` return correct aggregates against seeded `ai_usage_logs` rows across multiple orgs.

## Out of Scope (this spec)

- Member-level block/unblock (issue #178).
- Any API to grant/revoke `isOperator` (manual DB script only, this iteration).
- Row-level AI usage detail, model-cost-in-VND, or any breakdown finer than `(organizationId, model)` / `(date)`.
