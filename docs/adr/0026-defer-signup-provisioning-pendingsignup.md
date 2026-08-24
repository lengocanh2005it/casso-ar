# Defer signup provisioning to email verification via PendingSignup

**Status:** proposed

Today `SignupUseCase` creates `Organization`/`User`/`Membership`/`Subscription`/bootstrap data synchronously in one transaction, before the applicant verifies their email — so every unverified signup attempt (abandoned, mistyped email, bot) leaves a permanent, often `PENDING_REVIEW` organization record that an operator still has to triage (issue #331/#336). We decided to hold signup input in a new `PendingSignup` row instead and run the exact same provisioning transaction only on successful OTP verification, deleting the row afterward.

For the `PendingSignup` TTL, we reuse `OwnershipTransferRequest`/`IdempotencyKey`'s lazy-reclaim-at-next-access pattern (ADR-0015) rather than adding a cron sweep, even though `PendingSignup` carries a password hash — the TTL window is short (10 minutes, matching the existing OTP TTL), so the exposure window an unreclaimed row could sit for is small, and it keeps one cleanup pattern for all short-lived pre-resolution entities in the codebase instead of two.

## Considered Options

- **Overload the existing `EmailVerificationToken`** with a nullable payload column instead of a new entity — rejected: breaks its current invariant that every token belongs to a real `User`, mixing "verify an existing account's email" with "hold data for an account that doesn't exist yet."
- **Store pending signup data in Redis** (already used for BullMQ) with native key TTL instead of a Postgres table — rejected: signup payload includes a password hash and organization PII, and the codebase's convention is that state with real invariants (like "one pending signup per email/tax code") lives in Postgres with an enforceable partial unique index, not an ad hoc Redis key.
