# Billing + Usage Metering Design (MVP)

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (đếm `Receivable`) và [2026-08-03-cas-id-bank-connection-design.md](2026-08-03-cas-id-bank-connection-design.md) (đếm `BankConnection`). Định nghĩa cách giới hạn sử dụng theo gói subscription cho MVP.

## 1. Phạm vi

Chỉ 2 metric gate tính năng: **số Receivable tạo mới mỗi tháng** và **số BankConnection đang ACTIVE** — khớp với cách đóng gói Free/Starter/Business ở tài liệu gốc mục 10 (vd Free = 50 receivable/tháng + 1 tài khoản). Không track/gate email, AI request, hay user seat ở spec này — có thể track riêng sau nhưng không cần hạn mức cứng ở MVP.

## 2. Entities

```
Subscription
  id, organizationId, planId (FREE/STARTER/BUSINESS/ENTERPRISE),
  receivableMonthlyLimit, bankConnectionLimit,
  status (ACTIVE/PAST_DUE/CANCELLED),
  currentPeriodStart, currentPeriodEnd, createdAt
```

MVP không có bảng `Plan` catalog riêng. `planId` là enum/label và hai limit được snapshot trên `Subscription`; khi có pricing/catalog UI thật mới tách bảng `Plan`.

Signup phải tạo một `Subscription(ACTIVE, FREE)` với kỳ hiện tại trong cùng transaction tạo Organization. Không có organization hoạt động nào thiếu subscription.

Không có `UsageRecord`/`UsageAggregate` riêng cho 2 metric này. Tạo `Receivable` không phải sự kiện bị retry tự động nhiều lần (khác webhook) nên không cần idempotency riêng cho việc đếm — tính trực tiếp từ bảng nguồn:

```
receivablesThisMonth  = COUNT(Receivable WHERE organizationId=? AND createdAt BETWEEN currentPeriodStart AND currentPeriodEnd)
activeBankConnections = COUNT(BankConnection WHERE organizationId=? AND status='ACTIVE')
```

## 3. Limit enforcement

Chặn cứng, kiểm tra trong cùng transaction với hành động tạo mới (tránh race condition hai request đồng thời cùng vượt giới hạn):

```
POST /receivables:
  1. BEGIN TRANSACTION
  2. SELECT COUNT(*) Receivable tháng hiện tại FOR UPDATE (hoặc advisory lock theo organizationId)
  3. Nếu count >= plan.maxReceivablesPerMonth → ROLLBACK,
     trả 402 "Đã đạt giới hạn gói {planName}, nâng cấp để tiếp tục"
  4. Ngược lại → INSERT Receivable, COMMIT

POST /bank-connections/cas-id/sessions/:id/exchange (kích hoạt BankConnection):
  Tương tự — check COUNT(BankConnection ACTIVE) >= plan.maxBankConnections
  trước khi set status=ACTIVE; nếu vượt, exchange thất bại với 402 tương tự.
```

## 4. Ngoài phạm vi

- Usage event log chi tiết (`UsageRecord`, `UsageAggregate`) cho email/AI/user seat — chỉ cần khi các metric này thực sự được gate.
- Phí vượt hạn mức (overage billing), grace period khi subscription hết hạn — mô tả ở tài liệu gốc mục 11, spec riêng nếu cần trước khi demo.
- Thanh toán subscription qua chính CASSO (billing invoice tự động) — tài liệu gốc mục 11.

## 5. Câu hỏi mở (không chặn implementation)

- `currentPeriodStart`/`currentPeriodEnd` tính theo lịch dương (đầu tháng - cuối tháng) hay theo ngày đăng ký subscription (rolling 30 ngày)?
- Khi hạ cấp gói (downgrade) mà usage tháng hiện tại đã vượt hạn mức gói mới, có chặn ngay hay chỉ áp dụng từ kỳ tiếp theo?
