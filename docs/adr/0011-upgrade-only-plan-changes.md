# 11. Plan changes are upgrade-only, no downgrade or self-serve cancel

Date: 2026-08-12

## Status

Accepted

## Context

Issue #90 shipped `PLAN_CATALOG` and the `Subscription.createStarter()`/`createBusiness()`/`createEnterprise()` factories, but no way for an org to actually move between plans after signup. Issue #150 (originally titled "plan upgrade/downgrade use case") had to define that transition.

A grilling session considered the conventional SaaS shape: an org can move to any plan, including downgrading, with the immediate question of what happens when usage already exceeds the new plan's limits (block the downgrade? allow it and let the next gated write fail?). The alternative, modeled on self-serve billing UIs like Claude Code's plan page, is simpler: only upgrades are a direct user action; there is no downgrade or cancel button. An org that stops paying is moved back to FREE automatically at the next billing period (tracked separately in issue #153, gated on real payment-collection integration in #152) rather than through a user-triggered downgrade.

## Decision

`Subscription.changeToPlan(newPlanId, now)` only accepts a strictly higher tier than the current plan (FREE < STARTER < BUSINESS < ENTERPRISE, via a new `tier: number` field on `PlanConfig` in `PLAN_CATALOG`). A same-or-lower target throws a domain error. There is no downgrade or cancel use case, and none is planned as a direct API — reverting to FREE only ever happens via the non-renewal path (#153), not as something an org can click.

## Consequences

- No logic is needed anywhere to reconcile usage already over a new (lower) limit — the "over limit" case can never arise from a plan change, only from the pre-existing at-limit gate in `PlanLimitService` on the next write.
- An org cannot self-serve out of a paid tier mid-period; support/sales handles that manually until #152/#153 ship the automatic non-renewal path.
- If a real downgrade requirement shows up later (e.g. enterprise customers negotiating a lower tier mid-contract), it needs a new decision — this ADR only covers the self-serve case.
