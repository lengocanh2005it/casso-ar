# Collection Activity Timeline Design

> Spec con của [docs/overview.md](../../../docs/overview.md) (mục 7.13), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md), [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md), [2026-08-03-dispute-management-design.md](2026-08-03-dispute-management-design.md).

## 1. Entity

```
CollectionActivity
  id, organizationId, receivableId, customerId,
  activityType (INVOICE_CREATED/EMAIL_SENT/EMAIL_FAILED/PAYMENT_RECEIVED/
                RECEIVABLE_CLOSED/DISPUTE_OPENED/DISPUTE_RESOLVED/MANUAL_CALL/
                MANUAL_NOTE/PAYMENT_COMMITMENT),
  description, metadata (jsonb), createdByUserId (nullable — null = hệ thống tự ghi),
  createdAt
```

`CollectionActivity` là bản ghi hiển thị (denormalized log cho timeline), **không phải nguồn sự thật** — trạng thái nghiệp vụ thật vẫn nằm ở `ReminderExecution`/`PaymentAllocation`/`Dispute`. Đây chỉ là nơi tổng hợp để hiển thị timeline mà không cần UNION nhiều bảng nguồn mỗi lần load trang.

## 2. Nguồn ghi dữ liệu

### 2.1. Domain event listener (tự động)

```
ReminderExecution created (status=SENT/FAILED)  → activityType EMAIL_SENT / EMAIL_FAILED
PaymentAllocation created                       → activityType PAYMENT_RECEIVED
Receivable.status → PAID                        → activityType RECEIVABLE_CLOSED
Dispute created / resolved                      → activityType DISPUTE_OPENED / DISPUTE_RESOLVED
```

Dùng event emitter nội bộ (NestJS `EventEmitter2` hoặc tương đương): service gốc (`PaymentAllocationService`, `ReminderService`, `DisputeService`) chỉ **emit event sau khi transaction thành công**, không tự viết code ghi `CollectionActivity` rải rác trong từng service — một listener duy nhất lắng nghe và ghi vào `CollectionActivity`. Listener bất đồng bộ phải mở `TenantContext` từ `organizationId` trong payload trước cả lookup `customerId` lẫn activity insert.

### 2.2. API thủ công (kế toán/sales tự nhập)

```
POST /receivables/:id/activities
  body: { activityType: MANUAL_CALL | MANUAL_NOTE | PAYMENT_COMMITMENT, description }
  createdByUserId = user hiện tại
```

Dùng cho các sự kiện không có nguồn hệ thống nào khác — "nhân viên đã gọi điện", "khách hàng cam kết ngày thanh toán" (tài liệu gốc mục 7.13).

## 3. API đọc

```
GET /customers/:id/timeline   → CollectionActivity của mọi Receivable thuộc customer, sắp theo createdAt DESC
GET /receivables/:id/timeline → CollectionActivity của riêng receivable đó
```

## 4. Ngoài phạm vi

- UI hiển thị timeline chi tiết (đã mô tả ở tài liệu gốc mục 18, Receivable Detail).
- Sửa/xóa `CollectionActivity` đã ghi — chỉ INSERT, không có endpoint PATCH/DELETE (tương tự nguyên tắc bất biến của AuditLog).

## 5. Câu hỏi mở (không chặn implementation)

- `MANUAL_NOTE`/`MANUAL_CALL` có cần trường riêng cho "kết quả cuộc gọi" (đã liên lạc được/không) hay chỉ cần `description` tự do?
- Event listener chạy đồng bộ trong cùng transaction hay bất đồng bộ qua queue riêng (ảnh hưởng tới việc `CollectionActivity` có đảm bảo nhất quán ngay lập tức với bảng nguồn hay có độ trễ nhỏ)?
