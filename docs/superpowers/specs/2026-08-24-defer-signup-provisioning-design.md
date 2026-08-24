# Defer signup provisioning until email verification — design

Issue: #336 (child of #331). Related: #335 (blocked by this), #337 (blocked by this).

## Problem

`SignupUseCase` (`apps/backend/src/modules/auth/application/signup.usecase.ts`) currently creates
`Organization`, `User`, `Membership`, `Subscription`, and bootstrap data synchronously in one DB
transaction, before the applicant verifies their email. Every unverified signup attempt (abandoned,
mistyped email, bot) leaves a permanent, often `PENDING_REVIEW` `Organization` record that an operator
still has to triage in Casso Admin — regardless of whether the applicant ever completes email
verification.

## Decision

Introduce a `PendingSignup` entity that holds the signup input (email, password hash, organization
name, tax code, VietQR lookup result) between signup submission and OTP verification. `SignupUseCase`
writes only this row and sends the OTP email — it no longer touches `Organization`/`User`/`Membership`/
`Subscription`/bootstrap data. `VerifyEmailUseCase` gains a second branch: on a valid `PendingSignup` +
OTP match, it runs the exact provisioning transaction `SignupUseCase` used to run, then deletes the
`PendingSignup` row, then logs the user in — same as today's post-verification behavior.

See `docs/adr/0026-defer-signup-provisioning-pendingsignup.md` for the ADR (ties to
`OwnershipTransferRequest`/`IdempotencyKey` precedent for TTL handling) and the `CONTEXT.md` entity
entry / business rule 17 for the canonical domain description.

## Scope decisions (resolved during brainstorming)

1. **VietQR lookup timing:** runs at signup time (unchanged UX — applicant sees match/mismatch
   immediately), result stored on the `PendingSignup` row and copied onto `Organization` at
   provisioning time.
2. **Duplicate signup while one is pending:** rejected with `CONFLICT` (409). Does not silently
   replace or extend the existing pending attempt.
3. **Resend verification email:** `ResendVerificationEmailUseCase` gains a `PendingSignup` branch
   (parallel to its existing `User` branch) — issues a new OTP, resets `expiresAt`, mirroring how
   `MembershipInvite`'s resend behaves.
4. **Expired/abandoned cleanup:** lazy reclaim at next access only (create/verify/resend) — **not** a
   cron. This matches the established codebase precedent for every other short-lived, expiring entity
   (`OwnershipTransferRequest`, `IdempotencyKey`, ADR-0015), even though `PendingSignup` carries a
   password hash: the TTL window is short (10 minutes, same as today's `VERIFICATION_TOKEN_TTL_MS`),
   so the exposure window for an unreclaimed row is small, and it avoids a second cleanup pattern in
   the codebase.
5. **Legacy unverified users:** `User` rows created by the pre-#336 signup flow that never verified
   (`emailVerifiedAt: null`) must remain verifiable. `VerifyEmailUseCase` and
   `ResendVerificationEmailUseCase` keep their existing `User`-based branch untouched, alongside the
   new `PendingSignup` branch. No data migration/backfill.

## Components

### Domain — `modules/auth/domain/pending-signup.ts`

```
PendingSignup {
  id, email, passwordHash, name, organizationName, taxCode,
  taxCodeMatched, taxCodeLookupName, otpHash, expiresAt, createdAt
}
isExpired(now: Date): boolean
```

(`name` is the applicant's own name — distinct from `organizationName` — needed to construct `User` at provisioning time; this was missing from the first pass of this section and corrected while writing the implementation plan.)

No `status` column — a row's existence means "pending"; consuming (verify success) or reclaiming
(expired) both delete the row. No persisted history is kept, matching how `OwnershipTransferRequest`
handles its terminal states via deletion rather than an audit trail (that's #337's concern, not #336's).

### Application

- `application/pending-signup-repository.port.ts` — port: `save`, `findByEmail`, `findByTaxCode`,
  `findByEmailAndOtpHash` (with a pessimistic lock variant for the verify path), `delete`.
- `signup.usecase.ts` — rewritten:
  1. Validate input (unchanged).
  2. Lazy-reclaim: delete any expired `PendingSignup` found by email or by tax code.
  3. Duplicate check: existing `User`/`Organization` → `CONFLICT`; existing non-expired
     `PendingSignup` by email or tax code → `CONFLICT`.
  4. VietQR lookup (unchanged call site, same adapter contract — never throws).
  5. Hash password (unchanged), generate OTP + hash, `expiresAt = now + VERIFICATION_TOKEN_TTL_MS`.
  6. Transaction: insert `PendingSignup` row.
  7. After commit: send OTP email (unchanged pattern — external call stays outside the transaction).
- `verify-email.usecase.ts` — add branch B after existing branch A (legacy `User` path, untouched):
  1. Find `PendingSignup` by email.
  2. Compare `otpHash`; check `isExpired`.
  3. Transaction, row locked (`pessimistic_write`): run the provisioning steps `SignupUseCase` used to
     run (`Organization.save` → `User.save` → `Membership.save` → `Subscription.createFree` →
     `organizationBootstrap.seed`), then delete the `PendingSignup` row.
  4. `LoginUseCase.executeForUser` (unchanged, same as today's post-verification behavior).
  5. Neither branch matches / OTP wrong / expired → throw the same error the current invalid/expired
     branch throws today (exact `ErrorCode` to be confirmed against current code when the
     implementation plan is written).
- `resend-verification-email.usecase.ts` — add a parallel `PendingSignup` branch: look up by email,
  generate a new OTP + hash, extend `expiresAt`, resend the email. Existing `User` branch untouched.

### Infrastructure

- `infrastructure/pending-signup.orm-entity.ts` / `typeorm-pending-signup.repository.ts` — standard
  TypeORM entity + repository + explicit domain↔ORM mapper, following the `ownership-transfer` module's
  shape.
- Migration `apps/backend/src/database/migrations/<timestamp>-add-pending-signups-table.ts` (+
  matching `.spec.ts`): new `pending_signups` table with a unique index on `email` and a separate
  unique index on `taxCode` (every row is always "pending" — no partial predicate needed, unlike
  `ownership_transfer_requests`, since rows are deleted rather than transitioned to a terminal status).

## Data flow

```
POST /signup
  reclaim-if-expired(email) + reclaim-if-expired(taxCode)
  duplicate check: User/Organization exists -> CONFLICT
  duplicate check: PendingSignup (non-expired) exists -> CONFLICT
  VietQR lookup (unchanged)
  hash password, generate OTP + hash, expiresAt = now + TTL
  transaction: insert PendingSignup
  after commit: send OTP email

POST /verify-email {email, otp}
  branch A (legacy): User exists, emailVerifiedAt=null, token matches -> unchanged today's flow
  branch B (new): PendingSignup found by email, otpHash matches, not expired
    transaction (row locked):
      create Organization/User/Membership/Subscription/bootstrap (moved from SignupUseCase)
      delete PendingSignup
    LoginUseCase.executeForUser (unchanged)
  neither matches -> same invalid/expired error as today

POST /resend-verification-email {email}
  branch A (legacy): unchanged
  branch B (new): PendingSignup found by email -> new OTP + hash + expiresAt -> resend email
```

## Error handling

| Case | Behavior |
|---|---|
| Duplicate email/tax code (real record or non-expired `PendingSignup`) | `CONFLICT` |
| OTP wrong / expired / no matching `PendingSignup` or `User` | Same error code `verify-email.usecase.ts` throws today for invalid/expired token |
| Replayed OTP after successful verification | `PendingSignup` already deleted by the first request -> falls into the "not found" case above; no duplicate provisioning |
| Concurrent verify requests for the same `PendingSignup` | Row-level pessimistic lock in the provisioning transaction serializes them; the loser sees the row already gone -> same "not found" error |
| OTP email send fails after `PendingSignup` commit | `EMAIL_SEND_FAILED` (unchanged code) — row already persisted, so resend works without resubmitting the signup form |

## Testing

- Unit: `PendingSignup.isExpired`; `SignupUseCase` (no `User`/`Organization` side effects, duplicate +
  reclaim-if-expired behavior, VietQR lookup result stored on the row); `VerifyEmailUseCase` branch B
  (provisions exactly once, replay fails, expired fails, branch A untouched); `ResendVerificationEmailUseCase`
  branch B.
- E2E: signup produces no `Organization`/`User` row; verify creates them exactly once; OTP replay
  fails; duplicate signup while pending returns 409; signup succeeds again once the prior attempt
  expires (via lazy reclaim, no manual cleanup step).
- Migration spec for the new table + unique indexes, following the existing per-migration `.spec.ts`
  convention.

## Additional findings from implementation-plan research

Discovered while reading the exact current code (not present in the brainstorming pass above):

1. **Provisioning logic needs a second caller besides `VerifyEmailUseCase`.**
   `apps/backend/src/database/seed/seed.ts` calls `SignupUseCase.execute()` directly today and
   expects a synchronously-created `{ user, organization }` back (it then force-verifies the email
   and force-approves the organization for the local demo account). Once `SignupUseCase` only
   writes a `PendingSignup`, the seed script can no longer get real entities back from it. Fix:
   extract the entity-creation transaction (`Organization`/`User`/`Membership`/`Subscription`/
   bootstrap save, today inline in `SignupUseCase.execute`) into its own
   `ProvisionOrganizationUseCase` (`modules/auth/application/provision-organization.usecase.ts`),
   taking an already-hashed password and already-resolved tax-lookup result, with an optional
   `manager: EntityManager` parameter (runs in the caller's transaction when passed, opens its own
   otherwise — the same optional-manager idiom every repository in this codebase already uses).
   `VerifyEmailUseCase` calls it with its own transaction's manager; `seed.ts` calls it standalone
   (hashing the seed password itself first, since that responsibility moves to `SignupUseCase`).
2. **The `/auth/signup` HTTP response shape changes.** It currently returns
   `{ userId, organizationId, organizationStatus }` (`auth.controller.ts:130-137`), read from the
   `Organization`/`User` `SignupUseCase` used to create — which no longer exist at signup time.
   Confirmed via grep that no frontend code reads these fields (`signup-page.tsx` ignores the
   response; only test mocks reference them, not assertions). New response:
   `{ success: true }`, matching `POST /auth/resend-verification`'s existing shape
   (`successResponseSchema()`), with the `@ApiCreatedResponse` docs/description updated to match.
3. **`apps/backend/test/auth-flow.e2e-spec.ts`'s signup test is already stale** (asserts
   `response.body.accessToken` after signup, which the current controller never returned — dead
   from before OTP-gated verification existed, unrelated to #336). Since #336 rewrites this test's
   assertions anyway (no more `organizations`/`subscriptions`/`memberships` rows created at signup
   time), the corrected assertions are written as part of this plan.

## Out of scope (belongs to #335 / #337)

- Redesigning the signup UI into a tax-code-first, confirm-then-continue flow (#335).
- Rate limiting, anti-automation, admin-review-evidence requirements, and audit logging around
  signup/lookup abuse (#337).
