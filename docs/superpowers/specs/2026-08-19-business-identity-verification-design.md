# Business Identity Verification Design

> Spec for GitHub issue [#245](https://github.com/lengocanh2005it/casso-ledger/issues/245) — "verify business identity at signup: tax code lookup + operator review before onboarding". Extends [2026-08-03-authentication-onboarding-design.md](2026-08-03-authentication-onboarding-design.md) (signup/login flow) and the operator/admin concept introduced by the `admin` module (org lock/unlock, member block/unblock). Settled through a `grilling` session; this doc records the decisions, not the exploration.

## 1. Problem

`SignupDto` only captures `organizationName`, `name`, `email`, `password`. Anyone can register an organization with a fabricated company name and reach the dashboard immediately after verifying their email — there is no way to confirm the organization is a real business, and a tax code alone is not sufficient proof either (a real tax code can still be entered by someone with no authority to represent that company).

## 2. Two layers of defense

1. **Tax code (MST) lookup at signup** — best-effort, non-blocking cross-check against VietQR.
2. **Operator manual review gate** — an organization cannot use the product until an `Operator` (the existing platform-level actor in the `admin` module) approves it, unless the tax code check already auto-approved it.

## 3. Organization state machine

```
OrganizationStatus = 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED'
```

`ACTIVE` and `LOCKED` already exist (`apps/backend/src/modules/organizations/domain/organization.ts`) and are unaffected — `lock()`/`unlock()` remain a separate, orthogonal admin action (e.g. locking an org for fraud discovered after the fact). `PENDING_REVIEW` and `REJECTED` are new and are set only at organization creation / by the new approve/reject operator actions:

```
                    ┌─────────────────┐
   MST exact match  │                 │
  ┌─────────────────▶     ACTIVE      │◀────────────┐
  │                 │                 │              │ operator approve
  │                 └─────────────────┘              │
  │                                                   │
signup                                       ┌────────┴────────┐
  │                                          │  PENDING_REVIEW  │
  └──────────────────────────────────────────▶                 │
   MST mismatch / lookup failed              └────────┬────────┘
                                                        │ operator reject
                                                        ▼
                                              ┌─────────────────┐
                                              │    REJECTED     │  (terminal — no auto resubmit)
                                              └─────────────────┘
```

`REJECTED` is a distinct terminal state, not a reuse of `LOCKED` — a rejected-at-signup organization never had legitimate access; a `LOCKED` organization did and was later suspended. Conflating the two would make audits and support conversations ambiguous. There is no resubmit flow in this ticket; a rejected user believing this is a mistake contacts support, who can act through direct DB/ops tooling — no new API for this.

## 4. Tax code lookup at signup

`taxCode` becomes a **required** field on `SignupDto`, validated as a 10 or 13-digit string (`^\d{10}(\d{3})?$`, matching standard Vietnamese MST format, no dashes — VietQR's path param takes the raw digits).

Lookup happens **inside `SignupUseCase.execute`, before the DB transaction opens** (external calls must never run inside a transaction — see `AGENTS.md`), with a bounded timeout:

```
GET https://api.vietqr.io/v2/business/{taxCode}  (no auth, may 429)
  → { id, name, internationalName, shortName, address }
```

- Normalize both the entered `organizationName` and the returned `name` (strip Vietnamese diacritics, lowercase, trim, collapse whitespace) and compare for an **exact match**. Fuzzy/similarity matching is out of scope — an MVP with a strict comparator is simpler and any mismatch, however small, safely falls back to manual review rather than silently trusting a partial match.
- **Exact match** → `Organization.status = 'ACTIVE'` at creation (identical to today's signup: still auto-logs the user in, still sends the verification email). Also send an "organization approved" notification email (see §6) — the user has no in-app waiting state, but the email exists as a durable confirmation they can check if unsure.
- **Mismatch, lookup timeout, network error, or 429** → `Organization.status = 'PENDING_REVIEW'` at creation. Signup does **not** attempt to log the user in for this case (see §5) — it still sends the verification email, but the response carries no tokens.
- Lookup results are cached in Redis, keyed by `taxCode`, TTL 30 days (`REDIS_HOST`/`REDIS_PORT`, already configured for BullMQ) — company registration data changes rarely, and this reduces load against VietQR's undocumented rate limit. Do not cache indefinitely: a company can still legally rename or re-register.
- The lookup outcome (`taxCode`, the VietQR `name` at the time of signup, and whether it matched) is persisted on `Organization` at creation time, not just cached — so operator review later shows a stable snapshot of what was compared, independent of cache expiry or the company's name changing since.

## 5. Login gate

`PENDING_REVIEW` and `REJECTED` organizations **cannot obtain a session at all** — this is stricter than the existing onboarding gate (#244, which only blocks in the frontend router and lets `bankingLinked=false` users hold a valid session). The reasoning: `bankingLinked=false` just means missing data; a non-`ACTIVE` organization is a fraud-prevention barrier, and a session token for it should never exist, blocked-by-frontend or not.

- `LoginUseCase` (both `execute` and `executeForUser`, which both funnel through `issueSession`) checks the caller's `Organization.status` before issuing tokens. `isOperator` users without a membership are exempt (they're not tied to an organization).
- New error codes, both HTTP 403: `ORGANIZATION_PENDING_REVIEW`, `ORGANIZATION_REJECTED`. The frontend (out of scope for this ticket) shows a toast from the login error response — no waiting-room page needed in the backend contract.
- `SignupUseCase`'s existing internal auto-login call is skipped entirely when the newly created organization is `PENDING_REVIEW` (see §4) — it would otherwise immediately fail against this same rule; skipping is cleaner than catching a self-inflicted error.
- Defense in depth: the existing `OrganizationLockGuard` (`apps/backend/src/modules/organizations/presentation/organization-lock.guard.ts`), registered globally via `APP_GUARD` and already blocking every non-public route when `status === 'LOCKED'`, is broadened to block `PENDING_REVIEW`/`REJECTED` too. This covers the case where an operator changes an organization's status while a member already holds a live access token (≤15 min lifetime) — the login-time check alone wouldn't catch that.

## 6. Operator review

Reuses the existing `Operator` actor (`AdminAuthGuard`, `isOperator` flag on `User`) and extends the existing `admin` module — no new role, no new auth mechanism.

```
GET  /admin/organizations?status=PENDING_REVIEW    → list orgs awaiting review (existing endpoint, add status filter)
POST /admin/organizations/:id/approve              → PENDING_REVIEW → ACTIVE, send "approved" email
POST /admin/organizations/:id/reject { reason }     → PENDING_REVIEW → REJECTED, send "rejected" email (no reason inside the email)
```

- `reason` is **required** on reject — stored in `OperatorAuditLog` for audit/investigation, **never** included in the email sent to the user (avoid leaking internal review notes; the email just says the registration wasn't approved and to contact support).
- Both actions follow the exact transactional pattern of `LockOrganizationUseCase`/`UnlockOrganizationUseCase` (`apps/backend/src/modules/admin/application/lock-organization.usecase.ts`): one `dataSource.transaction`, reload + mutate + save the `Organization`, write one `OperatorAuditLog` row, no idempotency-key requirement (mirroring the existing lock/unlock endpoints, which are also single-shot status transitions without one).
- Approving/rejecting an organization not in `PENDING_REVIEW` is a `CONFLICT` (guards against double-processing via concurrent operator tabs).

## 7. Notifications

Both new emails reuse the existing `IMemberNotificationSender` port (`apps/backend/src/modules/auth/application/member-notification.port.ts`) and its `ResendAuthEmailSenderAdapter` implementation — the same channel already used for member-blocked/unblocked emails, itself backed by the BullMQ-queued `notifications` module (ADR-0009).

- `sendOrganizationApprovedEmail(to, organizationName)` — sent both on operator approval and on signup-time auto-approval (§4).
- `sendOrganizationRejectedEmail(to, organizationName)` — sent on operator rejection; body does not include the operator's reason text.
- Recipient is the organization's `OWNER` membership (`IMembershipRepository.findOwnerByOrganization`), the same lookup already used by `BlockMemberByOperatorUseCase`.

## 8. Out of scope for this ticket

- Frontend: signup form's `taxCode` field, the login-error toast, and any operator review UI. Backend ships a complete API surface; the UI is a follow-up ticket.
- Resubmission flow after rejection.
- Fuzzy/similarity name matching.
- A dedicated cache invalidation API (30-day TTL is the only control).

## 9. Global constraints (carried into the plan)

- `taxCode` is required at signup, validated `^\d{10}(\d{3})?$`.
- VietQR lookup happens outside the DB transaction, with a bounded timeout; any failure/mismatch defaults to `PENDING_REVIEW`, never blocks signup itself.
- Exact match only (normalized: strip diacritics, lowercase, trim, collapse whitespace) — no fuzzy matching.
- Redis cache of lookup results, keyed by `taxCode`, TTL 30 days.
- `REJECTED` is a new terminal status, distinct from `LOCKED`; no resubmit flow.
- Login issues no tokens at all for `PENDING_REVIEW`/`REJECTED` organizations (stricter than the #244 onboarding gate).
- `OrganizationLockGuard` is broadened to cover all non-`ACTIVE` statuses as defense in depth.
- Operator review reuses the existing `Operator`/`AdminAuthGuard` mechanism and the `admin` module — no new role.
- Reject requires a `reason`, stored in the audit log, never sent in the user-facing email.
- Both approve and reject send a notification email through the existing `IMemberNotificationSender` channel; auto-approval at signup also sends the approved email.
