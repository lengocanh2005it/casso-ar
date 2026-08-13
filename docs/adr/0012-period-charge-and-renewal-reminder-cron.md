# 12. `PeriodCharge` models per-period renewal; a reminder cron is introduced, contradicting ADR-0010's "no renewal cron"

Date: 2026-08-13

## Status

Accepted

## Context

ADR-0011 established that a `Subscription` only ever moves to FREE automatically via non-renewal (issue #153), never a user-triggered downgrade. Domain-modeling that non-renewal path surfaced a mismatch: `PlanUpgradeOrder` (issue #152, PR #156) is a one-off payment that moves a `Subscription` to a *strictly higher* tier (`Subscription.changeToPlan`/`isUpgradeTo`) and never expires — it has no period field at all. But "an org that stops paying" implies a *recurring* payment obligation, and PayOS has no card-on-file or auto-charge capability (it only issues one-time payment links) — so nothing in the shipped model can ever represent "this org did not pay for the current period."

ADR-0010 also decided there is no renewal cron; a billing period is rolled lazily on the next gated write (`rollToCurrentPeriodIfExpired`). That premise assumed there was nothing to remind anyone about — a FREE-only or upgrade-only-forever product has no recurring obligation to miss. Once renewal became a real recurring payment, silently rolling the period on the next write (no reminder, no grace) risked an org losing paid-tier access with no warning.

## Decision

1. **New entity `PeriodCharge`** — the recurring per-billing-period PayOS payment a paid-tier `Subscription` makes to keep its current tier. Distinct from `PlanUpgradeOrder`: validates `targetPlan == currentTier` (not strictly higher), one per `Subscription` per billing period. The `PlanUpgradeOrder` that moved a `Subscription` onto a tier counts as that tier's first period paid — no separate `PeriodCharge` is required for the period an upgrade lands in.
2. **A reminder cron is introduced**, scanning `Subscription`s approaching period end and emailing a renewal checkout link — reusing the existing reminder-email infrastructure (`ReminderPolicy`/notification queue) rather than building new delivery. This is a deliberate, narrow exception to ADR-0010's "no renewal cron": ADR-0010's premise (nothing to remind about) no longer holds now that renewal is a real recurring payment.
3. **3-day grace window, `status` stays `ACTIVE`.** If a period ends with no `PeriodCharge` PAID, the `Subscription` is not immediately downgraded — it has 3 days to pay before `Subscription.changeToPlan(FREE)` runs. `status` does **not** change to `PAST_DUE` during this window: `plan-limit.service.ts` already blocks every non-`ACTIVE` status with a hard `PLAN_LIMIT_EXCEEDED` (402), a behavior shipped under ADR-0010 for a different purpose. Reusing `PAST_DUE` for grace would silently turn "3 days to pay" into "blocked immediately," defeating the grace period. `PAST_DUE` keeps its existing hard-block meaning, unused by this flow; whether renewal grace should exist is instead determined by "does a `PeriodCharge` PAID for the current period exist," checked lazily the same way `rollToCurrentPeriodIfExpired` already checks period boundaries.

## Consequences

- `PlanLimitService`'s non-`ACTIVE` block is untouched — no risk to the already-shipped ADR-0010 gating behavior.
- The lazy-roll design survives for period *boundaries*; only the renewal-reminder *notification* needs a cron, not the downgrade decision itself, which can still be evaluated lazily at the next gated write or cron tick.
- `PeriodCharge` and `PlanUpgradeOrder` are two payment-order shapes with near-identical PayOS plumbing (checkout creation, webhook confirmation, idempotent lock-and-confirm) but different validation rules — the implementer should decide whether to share infrastructure (adapter, webhook guard) while keeping the domain concepts and use cases distinct, not collapse them into one entity.
- If PayOS ever adds card-on-file/auto-charge, this ADR's reason for `PeriodCharge` existing as a *manual, self-serve* repeat payment goes away and the reminder cron could be dropped in favor of true auto-renewal — worth revisiting then.
