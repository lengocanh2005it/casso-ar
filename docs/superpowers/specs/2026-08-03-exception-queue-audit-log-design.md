# Exception Queue + Audit Log Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (PaymentAllocation, overpayment rule) và [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (BankTransaction, MatchingCandidate, threshold 60-89).

## 1. Exception Queue — API & concurrency

```
GET  /bank-transactions/unmatched
  → BankTransaction status IN (PENDING_REVIEW), kèm top candidate + score

GET  /bank-transactions/:id/candidates
  → danh sách MatchingCandidate của giao dịch, sắp theo totalScore giảm dần

POST /bank-transactions/:id/match
  body: { allocations: [{ receivableId, amount }], version }
  1. Kiểm tra BankTransaction.version == payload.version VÀ status == PENDING_REVIEW
     → nếu không khớp (đã bị người khác xử lý) → 409 "Giao dịch đã được xử lý"
  2. Validate SUM(allocations.amount) <= BankTransaction.amount
  3. Validate mỗi allocations[i].amount <= Receivable[i].remainingAmount tại thời điểm này
  4. Trong 1 DB transaction: gọi `AllocatePaymentUseCase.allocateWithinTransaction` cho từng allocation,
     update BankTransaction (status=MATCHED, version++),
     update trạng thái từng Receivable liên quan (theo rule ở Domain Core spec mục 3)
  5. Phần dư (amount - SUM(allocations)) → xử lý như overpayment (Domain Core spec mục 4)

POST /bank-transactions/:id/skip         → status=IGNORED, ghi AuditLog, không tạo allocation
POST /bank-transactions/:id/mark-prepaid → gán customerId, giữ làm credit balance (Payment chưa allocate)
```

`version` là optimistic lock field trên `BankTransaction`, tăng mỗi lần status thay đổi — chống hai kế toán cùng xử lý một giao dịch đồng thời (double allocation).

Kế toán chọn nhiều `MatchingCandidate` cùng lúc và nhập số tiền phân bổ cho từng cái (split), submit một lần duy nhất qua `POST /bank-transactions/:id/match` với mảng `allocations` — backend xử lý atomic trong một transaction thay vì nhiều lần gọi API riêng lẻ.

## 2. Audit Log — cơ chế & cấu trúc

```
AuditLog
  id, organizationId, userId, actionType, entityType, entityId,
  beforeState (jsonb, nullable), afterState (jsonb, nullable),
  ipAddress, createdAt
```

`AuditContext` request-scoped phải có cả `before` và `after` (đều nullable), với `setBefore/getBefore`
và `setAfter/getAfter`; interceptor chỉ ghi INSERT sau khi handler thành công và lưu cả hai snapshot đã
redact. Không có PATCH/DELETE cho `AuditLog`.

Cơ chế ghi log dùng decorator + interceptor chung, tránh quên gọi log thủ công ở từng nơi:

```
@Audited(actionType: string) — decorator trên controller method
AuditInterceptor:
  1. Chạy handler như bình thường
  2. Nếu thành công (không throw) → ghi AuditLog với:
     - userId/organizationId từ request context
     - entityType/entityId lấy từ response hoặc route param
     - beforeState: service tự gọi ctx.setAuditBefore(entity) khi load record ra để update,
       trước khi thay đổi
     - afterState: `ctx.setAfter(response)` rồi đọc qua `getAfter()`
  3. Nếu handler throw → không ghi log (hành động thất bại thì không audit)
```

`PAYMENT_ALLOCATE_UNDO` là ngoại lệ có chủ đích: use case undo phải ghi
`AuditLog` trong cùng transaction với soft-delete allocation và cập nhật các
rollup, nên Domain Core ghi inline qua `IAuditLogRepository` thay vì để
`AuditInterceptor` ghi lần hai sau khi HTTP handler đã hoàn tất. Các action còn
lại dùng `@Audited` + interceptor như mô tả trên.

Danh sách action bắt buộc phải có audit (từ tài liệu gốc mục 15); các action
HTTP dùng `@Audited`, ngoại trừ `PAYMENT_ALLOCATE_UNDO` theo ngoại lệ đã nêu:

```
RECEIVABLE_CREATE, RECEIVABLE_UPDATE, RECEIVABLE_WRITE_OFF, RECEIVABLE_CANCEL, RECEIVABLE_DISPUTE
PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO
REMINDER_POLICY_UPDATE
BANK_CONNECTION_CREATE, BANK_CONNECTION_DISCONNECT
SUBSCRIPTION_CHANGE_PLAN
```

`AuditLog` không có endpoint PATCH/DELETE — chỉ INSERT, bảo toàn tính bất biến. Retention: giữ tối thiểu theo chính sách retention chung của tổ chức (tài liệu gốc mục 20), không tự động xóa trong MVP.

## 3. Ngoài phạm vi

- UI chi tiết trang Exception Queue (đã mô tả ở tài liệu gốc mục 7.10, 18).
- Audit log export/compliance report định dạng đặc biệt.
- Cấu hình retention tùy chỉnh theo từng organization.

## 4. Câu hỏi mở (không chặn implementation)

- `skip`/`mark-prepaid` có cần optimistic lock `version` tương tự `match` không, hay chấp nhận rủi ro thấp hơn vì không ghi allocation?
- `beforeState`/`afterState` có cần lọc field nhạy cảm nào trước khi lưu (vd không log accessToken nếu entity là BankConnection)?
