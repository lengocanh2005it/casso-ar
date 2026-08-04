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
}
```

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

Reminder effectiveness:
  COUNT(Receivable closed as PAID within 7 days after the latest ReminderExecution) /
  COUNT(ReminderExecution status='SENT') during the period
```

`Reminder effectiveness` is a follow-up metric and is not part of the MVP response for `GET /reports/dashboard-summary`; Reminder Automation/Email Notification owns the data and sending pipeline. The formula is retained only as a future extension after the measurement window is finalized.

## 5. Out of scope

- Materialized view / precomputation job—only needed when the data scale far exceeds the demo scope.
- Forecast adjusted by each customer's historical on-time payment probability.
- A separate data warehouse (ClickHouse) for reporting—the original document lists this as an open question in section 22; PostgreSQL is sufficient for the MVP.
- Reminder effectiveness in the MVP dashboard—keep it in Reminder Automation/Email Notification follow-up rather than duplicating the logic in Reporting.

## 6. Open questions (do not block implementation)

- Is a 7-day window after the latest send appropriate for "Reminder effectiveness", or should another period be used (for example, until the next send)?
- Does the Dashboard need a custom date-range filter, or are fixed periods sufficient (7/14/30 days, current month)?
