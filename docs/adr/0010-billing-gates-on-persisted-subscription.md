# 10. Billing gates on a persisted `Subscription`: advisory-locked checks in-transaction, lazy calendar-month periods, no plan catalog yet

Date: 2026-08-11

## Status

Accepted. Point 7 (no general plan catalog) was superseded by issue #90 (PR #151, shipped 2026-08-12), which added `PLAN_CATALOG` and the STARTER/BUSINESS/ENTERPRISE factories — this record is left as-is to document the reasoning at the time.

## Context

Plan #3 (billing-usage-metering) had to gate `POST /receivables` by a monthly limit. No signup/bootstrap transaction existed at the time (Plan #4 shipped later), so a `Subscription` had to be created lazily on first use.

The first locking approach failed review: two concurrent first-ever requests for a brand-new organization both saw no `Subscription` row and raced to create one, tripping the `@Unique(['organizationId'])` constraint — a row-level `SELECT ... FOR UPDATE` cannot lock a row that does not exist. The spec's explicit alternative was `pg_advisory_xact_lock`.

The spec also left billing-period mechanics as an open question (calendar month vs rolling window; renewal cron vs lazy roll).

## Decision

1. **One persisted `Subscription` per organization** (`PlanId` FREE/STARTER/BUSINESS/ENTERPRISE × ACTIVE/PAST_DUE/CANCELLED) holding limits as flat integer fields (`receivableMonthlyLimit`, `bankConnectionLimit`, `copilotChatMonthlyLimit`) plus the `canUseCustomSmtp` boolean (ADR-0006).
2. **In-transaction, advisory-locked checks.** Every limit check runs inside the same DB transaction as the write it gates, under `pg_advisory_xact_lock(hashtext(organizationId))` acquired before reading the row (`lockAndFindByOrganizationId`) — the advisory lock also covers the first-time-creation race. A FREE `Subscription` is lazily created on first use; Plan #4's signup bootstrap transaction is the primary creation path since then.
3. **Non-ACTIVE blocks before counting.** A PAST_DUE/CANCELLED subscription rejects the write with `PLAN_LIMIT_EXCEEDED` (HTTP 402) before usage is even counted.
4. **Calendar-month period, rolled lazily.** The billing period is the current calendar month, rolled on read when expired (`rollToCurrentPeriodIfExpired`) — no renewal cron exists; a month boundary is observed the next time a gated write happens.
5. **Usage counted at check time** with raw SQL against the source tables (`receivables`, copilot chat turns) — no usage-tracking table.
6. **Shipped gates:** `receivablesThisMonth`, `copilotChatMonthlyLimit` (FREE = 50/month, per an explicit user decision reversing the spec's free-in-MVP default), and `canUseCustomSmtp` (BUSINESS/ENTERPRISE via the flat boolean). The `activeBankConnections` gate is deliberately **not** wired — `BankConnection` exists but nothing counts it yet.
7. **No general plan catalog.** Limits live in `FREE_PLAN_LIMITS` only; STARTER/BUSINESS/ENTERPRISE limits stay unwired until an upgrade/downgrade path exists — tracked as issue #90.

## Consequences

- No background billing job to operate; a month boundary is observed lazily at the next gated write.
- The advisory lock serializes all gated writes per organization — accepted because gated writes are low-frequency.
- `PLAN_LIMIT_EXCEEDED` (402) is the stable error contract the frontend switches on for upgrade prompts.
- The flat-field convention is known not to scale to many plans and boolean flags — deliberately deferred to issue #90 instead of building a catalog prematurely.
