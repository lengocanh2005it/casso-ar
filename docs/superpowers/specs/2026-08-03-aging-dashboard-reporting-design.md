# Aging Dashboard & Reporting Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (`Receivable.status`, `dueDate`, `remainingAmount`) và [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (auto-match rate). Định nghĩa cách tính các con số hiển thị trên Dashboard/Báo cáo (tài liệu gốc mục 7.11, 15, 19).

## 1. Nguyên tắc: real-time, không precompute

Ở quy mô thực tập (vài nghìn `Receivable`/tổ chức), query trực tiếp với index đúng đã đủ nhanh — không cần materialized view hay cron job precompute riêng. Precompute chỉ cần thiết khi số lượng receivable lên tới hàng triệu dòng, ngoài phạm vi MVP.

Index bắt buộc: `Receivable(organizationId, status, dueDate)` (đã nêu ở tài liệu gốc mục 20 — spec này xác nhận lại vì Dashboard là nơi dùng nhiều nhất).

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

Mỗi bucket trả về `COUNT(*)` và `SUM(originalAmount - paidAmount)`; `remainingAmount` là derived field, không phải cột SQL riêng.

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

`GET /api/v1/reports/aging` trả `AgingReportResponse`; `GET /api/v1/reports/dashboard-summary` trả `DashboardSummaryResponse`. Không dùng nhãn `0-30`/`31-60`/`61-90`/`90+` hoặc các field `overdueAmount`, `pendingReviewCount`, `openDisputeCount`, `monthReceivedAmount` trong contract MVP này.

## 3. Cash collection forecast (naive)

```
forecast_Nd = SUM(originalAmount - paidAmount)
              WHERE organizationId = ? AND status IN (OPEN, PARTIALLY_PAID)
              AND dueDate BETWEEN today AND today + N days
              (N = 7, 14, 30)
```

Giả định lạc quan: khách hàng trả đúng hạn. Đơn giản, minh bạch, không cần dữ liệu lịch sử để train gì — đúng tinh thần "rule-based trước ML" của tài liệu gốc mục 8.3. Điều chỉnh theo xác suất trả đúng hạn lịch sử của từng khách hàng (`onTimePaymentRate`) là hướng nâng cấp sau, cần đủ dữ liệu lịch sử thanh toán mới đáng tin cậy — ngoài phạm vi MVP.

## 4. Các số liệu khác

```
Top overdue customers:
  GROUP BY customerId, SUM(originalAmount - paidAmount)
  WHERE status IN (OPEN, PARTIALLY_PAID) AND dueDate < today
  ORDER BY SUM(originalAmount - paidAmount) DESC LIMIT 10

Auto-match rate (theo kỳ báo cáo):
  COUNT(BankTransaction WHERE status='MATCHED') /
  COUNT(BankTransaction WHERE createdAt trong kỳ báo cáo)

`BankTransaction` không lưu `totalScore`; Matching Engine chỉ đặt `status='MATCHED'` khi tổng score đạt `>= 90`, nên `status='MATCHED'` là điều kiện persisted dùng cho reporting.

Manual handling rate = 1 - Auto-match rate
  (giao dịch cần Exception Queue xử lý thủ công / tổng giao dịch)

Reminder effectiveness:
  COUNT(Receivable đóng PAID trong vòng 7 ngày sau ReminderExecution gần nhất) /
  COUNT(ReminderExecution status='SENT') trong kỳ
```

`Reminder effectiveness` là metric follow-up, không thuộc response MVP của `GET /reports/dashboard-summary`; dữ liệu và pipeline gửi do Reminder Automation/Email Notification sở hữu. Công thức trên chỉ giữ làm hướng mở rộng sau khi chốt cửa sổ đo lường.

## 5. Ngoài phạm vi

- Materialized view / precompute job — chỉ cần khi quy mô dữ liệu vượt xa phạm vi thực tập.
- Forecast có điều chỉnh theo xác suất trả đúng hạn lịch sử từng khách hàng.
- Data warehouse riêng (ClickHouse) cho reporting — tài liệu gốc mục 22 nêu là câu hỏi mở, PostgreSQL đã đủ ở MVP.
- Reminder effectiveness trong dashboard MVP — giữ ở Reminder Automation/Email Notification follow-up, không nhân đôi logic trong Reporting.

## 6. Câu hỏi mở (không chặn implementation)

- "Reminder effectiveness" tính cửa sổ 7 ngày sau lần gửi gần nhất có phù hợp, hay nên tính theo khoảng thời gian khác (vd tới lần gửi tiếp theo)?
- Dashboard có cần filter theo khoảng thời gian tùy chỉnh (date range picker) hay chỉ cần các mốc cố định (7/14/30 ngày, tháng hiện tại)?
