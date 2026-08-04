# Billing + Usage Metering Design (MVP)

> Child spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (counting `Receivable`) and [2026-08-03-cas-id-bank-connection-design.md](2026-08-03-cas-id-bank-connection-design.md) (counting `BankConnection`). Defines subscription-plan usage limits for the MVP.

## 1. Scope

Only two feature-gating metrics are included: **new Receivable records created per month** and **ACTIVE BankConnection records**—matching the Free/Starter/Business packaging in section 10 of the original document (for example, Free = 50 receivables/month + 1 account). This spec does not track or gate email, AI requests, or user seats; they can be tracked separately later but do not need hard limits in the MVP.

## 2. Entities

```
Subscription
  id, organizationId, planId (FREE/STARTER/BUSINESS/ENTERPRISE),
  receivableMonthlyLimit, bankConnectionLimit,
  status (ACTIVE/PAST_DUE/CANCELLED),
  currentPeriodStart, currentPeriodEnd, createdAt
```

The MVP has no separate `Plan` catalog table. `planId` is an enum/label and the two limits are snapshotted on `Subscription`; split out a `Plan` table when a real pricing/catalog UI exists.

Signup must create a `Subscription(ACTIVE, FREE)` for the current period in the same transaction that creates the Organization. No active organization may lack a subscription.

There are no separate `UsageRecord`/`UsageAggregate` tables for these two metrics. Creating a `Receivable` is not an event that is automatically retried many times (unlike a webhook), so counting needs no separate idempotency mechanism—calculate it directly from the source tables:

```
receivablesThisMonth  = COUNT(Receivable WHERE organizationId=? AND createdAt BETWEEN currentPeriodStart AND currentPeriodEnd)
activeBankConnections = COUNT(BankConnection WHERE organizationId=? AND status='ACTIVE')
```

## 3. Limit enforcement

Hard-block the operation, checking the limit in the same transaction as the creation action (to prevent two concurrent requests from both exceeding the limit):

```
POST /receivables:
  1. BEGIN TRANSACTION
  2. SELECT COUNT(*) Receivable for the current month FOR UPDATE (or advisory lock by organizationId)
  3. If count >= plan.maxReceivablesPerMonth → ROLLBACK,
     return 402 "Plan limit {planName} reached; upgrade to continue"
  4. Otherwise → INSERT Receivable, COMMIT

POST /bank-connections/cas-id/sessions/:id/exchange (activate BankConnection):
  Similarly — check COUNT(BankConnection ACTIVE) >= plan.maxBankConnections
  before setting status=ACTIVE; if exceeded, exchange fails with the same 402.
```

## 4. Out of scope

- Detailed usage event logs (`UsageRecord`, `UsageAggregate`) for email/AI/user seats—only needed when those metrics are actually gated.
- Overage billing and a grace period after subscription expiry—described in section 11 of the original document; use a separate spec if needed before the demo.
- Paying for the subscription through CASSO itself (automated billing invoices)—section 11 of the original document.

## 5. Open questions (do not block implementation)

- Should `currentPeriodStart`/`currentPeriodEnd` follow calendar months (start/end of month) or the subscription date (a rolling 30 days)?
- When downgrading after current-month usage already exceeds the new plan's limit, should the block apply immediately or from the next period?
