# Harden signup against organization impersonation and abuse — design

Issue: #337 (child of #331, blocked by #336 — now shipped, PR #338).

## Problem

Issue #331's tax-code-first work made it easy to submit many signup/lookup attempts. #337 asks for:

1. Rate limits that cover IP, email, and tax-code abuse patterns independently, on both `POST /auth/signup` and `GET /tax-verification/lookup`.
2. An anti-automation challenge or equivalent risk control against repeated suspicious attempts.
3. No duplicate organizations via retries/alternate emails for the same tax code.
4. No automatic activation from a tax-code/name match — an explicit admin decision is required.
5. Admin review records verification method, decision, reviewer, and timestamp.
6. Signup/approval events are auditable without logging secrets.
7. Responses don't leak more than the organization identity needed for signup.
8. Test coverage for all of the above.

## Already satisfied (verified against current code, not assumed)

- **#3 (no duplicate orgs via retry)**: `PendingSignup`'s unique indexes on `email` and `taxCode` (ADR-0026) already reject a second signup attempt for either while one is pending, and `SignupUseCase` also checks against already-provisioned `Organization`s. No new work.
- **#4 (never auto-activate)**: `ProvisionOrganizationUseCase` always creates `Organization` with `status: 'PENDING_REVIEW'`, regardless of `taxCodeMatched`. No new work.
- **#7 (response minimization)**: `POST /auth/signup` → `{ success: true }`, `GET /tax-verification/lookup` → `{ name: string | null }`, `POST /auth/verify-email` → `{ verified, accessToken }` — none leak `organizationId` or other internal fields today. Re-verify after this issue's admin-approve DTO change (below) doesn't regress it.

Remaining real scope: #1, #2, #5, #6, plus tests for all of #1–#7 (#8).

## Decisions (resolved during brainstorming)

1. **Anti-automation (#2): escalating per-dimension rate limits, not CAPTCHA.** See ADR-0027.
2. **Audit (#6): structured `info` logs, not a new persisted audit table.** See ADR-0027.
3. **Verification method (#5): a fixed enum field, not free text**, kept distinct from `OperatorAuditLog.reason` (which answers "why", used by reject) — see `CONTEXT.md`'s `OperatorAuditLog`/`OrganizationVerificationMethod` entries and business rule 18.
4. **Rate-limit thresholds** (defaults, adjustable without a design change if wrong in practice):
   - IP dimension: 20 requests / 15 minutes, per route (signup and lookup each get their own IP budget).
   - Email dimension (signup only — lookup has no email): 5 requests / 60 minutes.
   - Tax-code dimension (both routes): 5 requests / 60 minutes, per route.
   - Escalation: 3 throttled (`429`) responses from the same IP within 1 hour escalate that IP to 1 request / 15 minutes across **every** signup/lookup route for the next hour.

## Components

### Rate limiting — `apps/backend/src/modules/auth/presentation/auth-composite-rate-limit.guard.ts`

Rework `AuthCompositeRateLimitGuard` to register three named throttlers (`ip`, `email`, `taxCode`) via `ThrottlerModule.forRoot([...])` in `app.module.ts`, each with its own `ttl`/`limit`, and override the guard's tracker resolution so each named throttler gets its own key:

- `ip` throttler → `req.ip`.
- `email` throttler → lowercased `req.body.email` when present, otherwise this dimension does not apply to the request (not degraded to `ip:` — genuinely skipped, since `@nestjs/throttler` can skip a named throttler that has no valid tracker for the given request).
- `taxCode` throttler → `req.body.taxCode` (signup) or `req.query.taxCode` (lookup lookup uses query params), whichever is present.

A request is rejected (`429 RATE_LIMIT_EXCEEDED`) if it exceeds **any** dimension's limit — `@nestjs/throttler`'s multi-throttler support already evaluates every configured throttler per request and short-circuits on the first exceeded one, so no new orchestration logic is needed beyond correct tracker/config wiring. Exact API confirmed against the installed `@nestjs/throttler` version during implementation (multi-tracker-per-guard is a documented feature, but the exact override point — `getTracker` receiving the throttler name vs. a separate method — needs a version check).

### Escalation — new `AbuseEscalationGuard` (or folded into the reworked composite guard; implementer's call)

On every `429` response from the guard above, increment a Redis key `abuse:ip:<ip>` with a rolling TTL window (1 hour). Before evaluating the normal per-dimension throttlers, check that counter: if it has reached the escalation threshold (3), reject immediately with a longer `Retry-After` (15 minutes) regardless of the normal per-dimension state, and keep incrementing/extending the escalation window on every further attempt during the cooldown. Reuses the existing Redis connection (already configured for BullMQ) — no new infra.

### Admin approval evidence

- `apps/backend/src/modules/admin/domain/operator-audit-log.ts`: add `OrganizationVerificationMethod = 'TAX_CODE_NAME_MATCH_ONLY' | 'BUSINESS_REGISTRATION_DOCUMENT' | 'PHONE_CALL' | 'OTHER'` and a new `verificationMethod?: OrganizationVerificationMethod | null` field on `OperatorAuditLogProps`/`OperatorAuditLog`.
- `apps/backend/src/modules/admin/application/transition-pending-organization.ts`: thread an optional `verificationMethod` input through to the `OperatorAuditLog` it writes.
- `ApproveOrganizationUseCase`/`ApproveOrganizationInput`: add a required `verificationMethod: OrganizationVerificationMethod`. `RejectOrganizationUseCase` is untouched (no verification happened).
- New `ApproveOrganizationDto` (presentation) requiring `verificationMethod` (currently the approve route has no request body at all) + optional `reason` for the `OTHER` case, mirroring `RejectOrganizationDto`'s shape.
- Migration: add `verificationMethod` column to `operator_audit_logs` (nullable — existing historical rows have none).

### Structured audit logging (no new table)

Add one `this.logger.log({...})` call (via this module's existing structured logger service, not `console.log`) at each point, logging only non-secret context:

- `SignupUseCase`, after the `PendingSignup` transaction commits: `{ message: 'Signup requested', email, taxCode, requestId }`.
- `VerifyEmailUseCase`, PendingSignup branch, after provisioning commits: `{ message: 'Pending signup verified', email, userId, organizationId, requestId }`.
- `ResendVerificationEmailUseCase`, PendingSignup branch, after the OTP is resent: `{ message: 'Verification OTP resent', email, requestId }`.

Never log `otp`, `password`, or `passwordHash`.

## Error handling

- Any dimension's limit exceeded → `429`, `errorCode: RATE_LIMIT_EXCEEDED` (existing code, unchanged shape).
- Escalated IP → `429` with a longer `Retry-After`; same `errorCode`, so the frontend's existing rate-limit handling (added in #335) needs no changes.
- Approve without `verificationMethod` → `400 VALIDATION_ERROR` (class-validator on the new required DTO field).

## Testing

- Unit: tracker resolution per named throttler (ip/email/taxCode keys resolve correctly; email dimension genuinely skipped, not degraded, when absent); escalation counter logic (increments on 429, escalates at threshold, expires after the window).
- Unit: `ApproveOrganizationUseCase` requires and records `verificationMethod`; `RejectOrganizationUseCase` behavior unchanged.
- Unit: the three new structured-log call sites, asserting no `otp`/`password` field ever appears in the logged payload.
- E2E: independent-dimension rate-limit trips (same IP + different emails still limited by tax-code/IP; same email/tax-code from different IPs still limited by email/tax-code dimension); escalation after repeated `429`s; approve rejects a missing `verificationMethod`; approve succeeds and the `OperatorAuditLog` row carries decision/reviewer/timestamp/verificationMethod together.

## Out of scope

- CAPTCHA integration (ADR-0027, revisit only if escalating throttling proves insufficient).
- A persisted pre-tenant audit table (ADR-0027, revisit only if an admin UI needs to query pre-tenant signup history).
- Any change to the already-satisfied #336 duplicate-prevention or PENDING_REVIEW-only-activation behavior.
