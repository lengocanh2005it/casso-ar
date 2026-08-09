# Aging Dashboard & Reporting Design

> Child spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (`Receivable.status`, `dueDate`, `remainingAmount`) and [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (auto-match rate). Defines how the numbers displayed on the Dashboard/Reports are calculated (original document sections 7.11, 15, 19).

## 1. Principle: real-time, no precomputation

At the demo scale (a few thousand `Receivable` records per organization), direct queries with the right indexes are fast enough—no materialized view or separate precomputation cron job is needed. Precomputation is only necessary when the number of receivables reaches millions of rows, which is outside the MVP scope.

Required index: `Receivable(organizationId, status, dueDate)` (already stated in section 20 of the original document—confirmed here because the Dashboard is its main consumer).

## 2. Aging buckets

```
WHERE organizationId = ? AND status IN (OPEN, PARTIALLY_PAID)
GROUP BY CASE
  WHEN dueDate >= today                      THEN 'NOT_DUE'
  WHEN today - dueDate BETWEEN 1 AND 7        THEN 'OVERDUE_1_7'
  WHEN today - dueDate BETWEEN 8 AND 30       THEN 'OVERDUE_8_30'
  WHEN today - dueDate BETWEEN 31 AND 60      THEN 'OVERDUE_31_60'
  ELSE                                             'OVERDUE_60_PLUS'
END
```

Each bucket returns `COUNT(*)` and `SUM(originalAmount - paidAmount)`; `remainingAmount` is a derived field, not a separate SQL column.

HTTP contract:

```typescript
type AgingBucket = 'NOT_DUE' | 'OVERDUE_1_7' | 'OVERDUE_8_30' | 'OVERDUE_31_60' | 'OVERDUE_60_PLUS';

interface AgingReportResponse {
  buckets: Array<{ bucket: AgingBucket; count: number; totalRemaining: number }>;
}

interface DashboardSummaryResponse {
  totalOutstanding: number;
  totalOverdue: number;
  overdueRate: number;
  cashForecast: { forecast7d: number; forecast14d: number; forecast30d: number };
  topOverdueCustomers: Array<{ customerId: string; customerName: string; totalOverdue: number }>;
  autoMatchRate: number | null;
  manualHandlingRate: number | null;
  reminderEffectiveness: number | null;
}
```

`GET /api/v1/reports/dashboard-summary` accepts optional `from`/`to` query params (ISO date strings, `from <= to`, max 90-day range — validated, 400 `VALIDATION_ERROR` on violation). Defaults to the current calendar month in `Asia/Ho_Chi_Minh` when omitted. This period scopes `autoMatchRate`/`manualHandlingRate`/`reminderEffectiveness`; the other fields (`totalOutstanding`, `totalOverdue`, `overdueRate`, `cashForecast`, `topOverdueCustomers`) are always "as of now" and unaffected by the period.

`GET /api/v1/reports/aging` returns `AgingReportResponse`; `GET /api/v1/reports/dashboard-summary` returns `DashboardSummaryResponse`. This MVP contract does not use the labels `0-30`/`31-60`/`61-90`/`90+` or the fields `overdueAmount`, `pendingReviewCount`, `openDisputeCount`, `monthReceivedAmount`.

## 3. Cash collection forecast (naive)

```
forecast_Nd = SUM(originalAmount - paidAmount)
              WHERE organizationId = ? AND status IN (OPEN, PARTIALLY_PAID)
              AND dueDate BETWEEN today AND today + N days
              (N = 7, 14, 30)
```

Optimistic assumption: customers pay on time. This is simple and transparent, and requires no historical data for training—consistent with the original document's "rule-based before ML" principle in section 8.3. Adjusting by each customer's historical on-time payment probability (`onTimePaymentRate`) is a later upgrade; it requires enough reliable payment history and is outside the MVP scope.

## 4. Other metrics

```
Top overdue customers:
  GROUP BY customerId, SUM(originalAmount - paidAmount)
  WHERE status IN (OPEN, PARTIALLY_PAID) AND dueDate < today
  ORDER BY SUM(originalAmount - paidAmount) DESC LIMIT 10

Auto-match rate (for the reporting period):
  COUNT(BankTransaction WHERE status='MATCHED') /
  COUNT(BankTransaction WHERE createdAt is within the reporting period)

`BankTransaction` does not store `totalScore`; Matching Engine sets `status='MATCHED'` only when the total score reaches `>= 90`, so `status='MATCHED'` is the persisted condition used for reporting.

Manual handling rate = 1 - Auto-match rate
  (transactions requiring manual Exception Queue handling / total transactions)

Reminder effectiveness (in MVP as of 2026-08-09, resolved per §6):
  COUNT(Receivable closed as PAID within 7 days after the receivable's latest SENT ReminderExecution) /
  COUNT(ReminderExecution status='SENT' AND sentAt within the reporting period)
  — window fixed at 7 days (not "until next send" — avoids an unbounded window when
    no next execution exists); `sentAt` (actual provider-confirmed send time), not
    `executionDate` (the scheduled date), scopes "within the period", consistent with
    how `autoMatchRate` scopes by `BankTransaction.createdAt`.
```

`Reminder effectiveness` reads `ReminderExecution`/`Receivable` (owned by Reminder Automation/Email Notification) but is computed here, in Reporting, like every other cross-entity aggregate in this spec — it is part of the MVP `GET /reports/dashboard-summary` response (`reminderEffectiveness: number | null`, §2).

## 5. Out of scope

- Materialized view / precomputation job—only needed when the data scale far exceeds the demo scope.
- Forecast adjusted by each customer's historical on-time payment probability.
- A separate data warehouse (ClickHouse) for reporting—the original document lists this as an open question in section 22; PostgreSQL is sufficient for the MVP.

## 6. Resolved decisions (2026-08-09)

- **Reminder effectiveness window**: fixed 7 days after the latest SENT execution (not "until next send" — that would require a self-join to find the next execution per receivable, and produce an unbounded window for receivables with no follow-up send). Included in the MVP dashboard response, not deferred.
- **Date-range filter**: `GET /reports/dashboard-summary` accepts optional `from`/`to` (validated: ISO date, `from <= to`, max 90-day range) instead of only fixed periods — needed once `autoMatchRate`/`reminderEffectiveness` became period-scoped MVP fields. Default when omitted: current calendar month, `Asia/Ho_Chi_Minh`.
