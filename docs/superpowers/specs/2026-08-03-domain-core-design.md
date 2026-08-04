# Domain Core Design — Customer, Invoice, Receivable, Payment, PaymentAllocation

> Spec con của [OVERVIEW.md](../../../OVERVIEW.md). Định nghĩa entity, quan hệ, state machine và business rules cho phần domain lõi mà Matching Engine, Reminder, Reporting sẽ dựa vào.

## 1. Phạm vi & mục tiêu

Spec này chỉ bao phủ 5 entity: `Customer`, `Invoice`, `Receivable`, `Payment`, `PaymentAllocation`. Mục tiêu là làm rõ đến mức implementation-ready: ERD chính xác, state machine của `Receivable`, và business rules của việc phân bổ thanh toán.

Không thuộc phạm vi (xem mục 6):
- Cách `BankTransaction` sinh ra `Payment` (Matching Engine spec riêng).
- Reminder/notification logic dựa trên trạng thái quá hạn hay tranh chấp (Reminder spec riêng).
- `Organization`, `Membership`, `Role`, RBAC (Multi-tenancy spec riêng).

Giả định nền: mọi entity dưới đây có `organizationId` (tenant isolation), không lặp lại ở từng entity.

## 2. Entities & ERD

```
Customer
  id, organizationId, name, taxCode, email, phone,
  defaultPaymentTermDays, creditLimit, priority, createdAt

Invoice
  id, organizationId, customerId, invoiceNumber, issueDate,
  totalAmount, taxAmount, sourceType (MANUAL/IMPORT/API/ERP),
  fileUrl, status (DRAFT/ISSUED/CANCELLED), createdAt

Receivable
  id, organizationId, customerId, invoiceId (nullable),
  originalAmount,
  paidAmount            -- persisted rollup, updated with every allocation/undo transaction
  remainingAmount        -- derived, = originalAmount - paidAmount
  isDisputed             -- computed, = EXISTS(Dispute WHERE receivableId=this.id AND status='OPEN')
                          --   xem 2026-08-03-dispute-management-design.md
  dueDate, status,
  salesRepresentativeId (nullable), createdAt, closedAt

Payment
  id, organizationId, customerId (nullable), bankTransactionId (nullable),
  totalAmount,
  allocatedAmount        -- persisted rollup, maintained from active PaymentAllocation rows
  unallocatedAmount      -- derived, = totalAmount - allocatedAmount
  payerName, receivedAt, createdAt

PaymentAllocation
  id, organizationId, paymentId, receivableId,
  allocatedAmount, allocatedAt, allocatedByUserId (nullable, null = auto-match),
  deletedAt (nullable), deletedByUserId (nullable), undoReason (nullable), createdAt
```

Quan hệ:

```
Customer 1──N Invoice
Customer 1──N Receivable
Invoice   1──N Receivable      (một invoice có thể tách thành nhiều receivable, ví dụ chia kỳ hạn)
Receivable 0..1──1 Invoice     (receivable có thể tồn tại trước khi có invoice)
Payment   1──N PaymentAllocation
Receivable 1──N PaymentAllocation
```

`paidAmount` (trên `Receivable`) và `allocatedAmount` (trên `Payment`) là **persisted rollup** — lưu để truy vấn/reporting không phải aggregate toàn bộ allocation. `remainingAmount` và `unallocatedAmount` là derived field. `PaymentAllocation` vẫn là source of truth về lịch sử và phải được ghi cùng rollup trong một transaction có lock; không được sửa rollup bằng đường dẫn riêng.

Invariant bắt buộc ở DB và application: `0 <= paidAmount <= originalAmount`, `0 <= allocatedAmount <= totalAmount`, mọi amount là số nguyên dương ở input allocation (và số nguyên không âm ở rollup), và mọi allocation/undo đều cập nhật đúng hai rollup trong cùng transaction. Các FK nghiệp vụ phải cùng `organizationId` và các cột tenant đều `NOT NULL`/có index theo Multi-tenancy spec.

## 3. Receivable — status & transitions

### Status values

```
DRAFT
OPEN
PARTIALLY_PAID
PAID
DISPUTED (không phải status riêng — xem "isDisputed flag" bên dưới)
WRITTEN_OFF
CANCELLED
```

`OVERDUE` **không phải status lưu trong DB**. Tính runtime:
```
isOverdue = status IN (OPEN, PARTIALLY_PAID) AND dueDate < today
```
Lý do: tránh state machine hai chiều (OPEN → OVERDUE → OPEN khi gia hạn) và tránh cần cron riêng chỉ để cập nhật một cờ có thể tính tại thời điểm query.

`isDisputed` là **flag tính toán độc lập** với status chính (xem entity `Dispute` ở [2026-08-03-dispute-management-design.md](2026-08-03-dispute-management-design.md)), không phải status riêng và không lưu trực tiếp trên `Receivable`. Khi có dispute: tạm dừng reminder, nhưng `status` giữ nguyên `OPEN`/`PARTIALLY_PAID`, luồng payment/matching vẫn hoạt động bình thường.

### Transition diagram

```
DRAFT ────────────► OPEN ────────────► PARTIALLY_PAID ────────────► PAID
                      │                       │
                      │                       └──────► WRITTEN_OFF
                      ├──────► WRITTEN_OFF
                      └──────► CANCELLED (chỉ khi paidAmount == 0)
```

### Transition rules

| Từ | Đến | Điều kiện |
|---|---|---|
| DRAFT | OPEN | Receivable được kích hoạt (ví dụ invoice issued) |
| OPEN | PARTIALLY_PAID | `0 < paidAmount < originalAmount` |
| PARTIALLY_PAID | PAID | `remainingAmount == 0` |
| OPEN | PAID | `remainingAmount == 0` (thanh toán đủ ngay lần đầu, không nhất thiết qua PARTIALLY_PAID) |
| OPEN | WRITTEN_OFF | Hành động thủ công. `remainingAmount > 0`, giữ nguyên `paidAmount` (chấp nhận mất phần còn lại) |
| PARTIALLY_PAID | WRITTEN_OFF | Như trên |
| OPEN | CANCELLED | Hành động thủ công. **Chỉ hợp lệ khi `paidAmount == 0`** |
| PARTIALLY_PAID | CANCELLED | **Không hợp lệ** — đã có tiền vào thì không được "hủy như chưa từng tồn tại", phải đi qua `WRITTEN_OFF` |

`PAID`, `WRITTEN_OFF`, `CANCELLED` là **terminal states**: không cho tạo `PaymentAllocation` mới, không còn `ReminderSchedule` nào chạy.

Ý nghĩa kế toán của hai terminal state dễ nhầm:
- **WRITTEN_OFF** = chấp nhận mất tiền — chỉ áp dụng khi đang `OPEN`/`PARTIALLY_PAID` và còn `remainingAmount > 0`.
- **CANCELLED** = hủy nghĩa vụ ngay từ đầu, coi như chưa từng phát sinh — chỉ hợp lệ khi chưa có bất kỳ payment nào.

## 4. Payment & PaymentAllocation — business rules

1. Một `Payment` có thể phân bổ vào N `Receivable`, nhưng **chỉ trong cùng một Customer**. `Payment.customerId` phải được xác định trước khi auto/manual allocation; nếu còn `null` hoặc khác customer thì không được allocate trực tiếp — phải xử lý qua Exception Queue.
2. Một `Receivable` có thể nhận N `PaymentAllocation` từ N `Payment` khác nhau (khách trả nhiều lần cho cùng một hóa đơn).
3. `allocatedAmount` không được vượt quá `remainingAmount` của receivable tại thời điểm allocate. Việc kiểm tra + ghi allocation phải nằm trong cùng transaction có lock (tránh hai kế toán allocate cùng lúc gây vượt số dư — xem Optimistic Locking ở tài liệu gốc mục 15).
4. `unallocatedAmount = totalAmount - Payment.allocatedAmount` luôn `>= 0`. Nếu sau khi allocate hết các receivable liên quan mà vẫn còn dư (`unallocatedAmount > 0`): **không tự động áp vào receivable khác**. Giữ lại như "credit balance" của customer, hiển thị trong Exception Queue / customer detail để kế toán chủ động allocate tiếp vào receivable tiếp theo.
5. `allocatedAmount` phải là số nguyên dương (`Number.isInteger(amount) && amount > 0`) ở application và `CHECK (allocatedAmount > 0)` ở DB; không nhận số thập phân, zero hoặc âm.
6. Undo một `PaymentAllocation` không xóa cứng: lock allocation, payment và receivable; set `deletedAt`, `deletedByUserId`, `undoReason`; ghi một `AuditLog` INSERT-only với before/after state và actor. Chỉ allocation đang active (`deletedAt IS NULL`) mới được undo; các query rollup chỉ tính allocation active.
7. Undo phải atomic: soft-delete + audit + cập nhật `Receivable.paidAmount`, `Payment.allocatedAmount` và `Receivable.status` nằm trong cùng DB transaction. Cho phép `PAID → PARTIALLY_PAID`/`OPEN` theo rollup mới; không khôi phục `CANCELLED`/`WRITTEN_OFF` thành trạng thái thanh toán.
8. Tạo hoặc undo allocation phải atomic: `remainingAmount`/`unallocatedAmount` luôn được đọc từ các rollup sau transaction commit.

## 5. Ví dụ minh họa

```
Invoice INV-2026-0012: 50.000.000 đồng, due 20/08/2026
→ Receivable R1 (status OPEN, originalAmount 50.000.000)

Payment P1: 30.000.000 (payerName "Công ty B")
  → PaymentAllocation: P1 → R1, 30.000.000
  → R1.paidAmount = 30.000.000, remainingAmount = 20.000.000
  → R1.status = PARTIALLY_PAID

Payment P2: 25.000.000
  → PaymentAllocation: P2 → R1, 20.000.000 (chỉ đủ phần còn thiếu)
  → P2.unallocatedAmount = 5.000.000 → giữ làm credit balance của Công ty B
  → R1.paidAmount = 50.000.000, remainingAmount = 0
  → R1.status = PAID (terminal, hủy reminder còn lại, gửi email xác nhận)
```

Undo allocation P2:
```
→ lock P2→R1 và allocation active
→ set PaymentAllocation.deletedAt/deletedByUserId/undoReason, giữ nguyên row lịch sử
→ giảm P2.allocatedAmount và R1.paidAmount cùng transaction
→ ghi AuditLog(action=PAYMENT_ALLOCATE_UNDO, entity=PaymentAllocation)
→ R1.status = PARTIALLY_PAID; P2.unallocatedAmount tăng lại 20.000.000
```

## 6. Ngoài phạm vi

- Cách `BankTransaction` sinh ra `Payment` và chọn `Receivable` candidate — xem Matching Engine spec (spec kế tiếp).
- Reminder/notification logic dựa trên `isOverdue`/`isDisputed` — xem Reminder spec.
- `Organization`, `Membership`, `Role`, RBAC — xem Multi-tenancy spec.

## 7. Câu hỏi mở (không chặn implementation)

- Ai/luồng nào thực hiện transition `DRAFT → OPEN` khi ghi nhận công nợ trước khi có invoice chính thức?
- `WRITTEN_OFF` có cần approval role (Finance Manager) hay Accountant có thể tự thực hiện?
