# Testing Strategy Design

> Spec con của [OVERVIEW.md](../../../OVERVIEW.md) (deliverable "bộ integration test cho webhook và payment allocation", mục 9.8), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) và [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md).

## 1. Integration test — DB thật qua testcontainers

Logic phụ thuộc nhiều vào DB transaction, unique constraint (idempotency), queue và tính toán số tiền chính xác — unit test thuần với mock DB/Redis không đủ tin cậy để bắt lỗi race condition/constraint thật. Dùng PostgreSQL và Redis thật qua testcontainers.

```
Test setup:
  - testcontainers khởi PostgreSQL + Redis thật cho mỗi test suite (không mock DB/Redis)
  - Seed: 1 Organization, 1 Customer, N Receivable ở trạng thái cần thiết cho từng case
  - Gọi thẳng qua HTTP layer (supertest) tới webhook endpoint / API thật,
    không gọi service method trực tiếp — đảm bảo test cả tầng controller/validation/transaction
```

### Bộ case bắt buộc tối thiểu (không rút gọn thêm)

```
1. Duplicate webhook (cùng providerTransactionId gửi 2 lần)
   → chỉ 1 BankTransaction được tạo, lần 2 trả 200 nhưng không tạo thêm bản ghi
   (xem 2026-08-03-webhook-matching-engine-design.md mục 4)

2. Partial payment → allocate 1 phần
   → Receivable.status = PARTIALLY_PAID, remainingAmount tính đúng
   (xem 2026-08-03-domain-core-design.md mục 3, 5)

3. Overpayment → allocate hết remainingAmount, phần dư
   → Payment.unallocatedAmount > 0, không tự động gán receivable khác
   (xem 2026-08-03-domain-core-design.md mục 4)

4. Hai request đồng thời cùng match() 1 BankTransaction
   → request thứ 2 nhận 409 (optimistic lock version mismatch), không tạo double allocation
   (xem 2026-08-03-exception-queue-audit-log-design.md mục 1)

5. Receivable đang PARTIALLY_PAID → gọi API CANCEL
   → phải bị từ chối (chỉ WRITTEN_OFF hợp lệ)
   (xem 2026-08-03-domain-core-design.md mục 3)
```

## 2. Unit test bổ sung (pure function)

```
Matching Engine scoring: mỗi hàm con (referenceCodeScore, amountScore, payerNameScore,
  customerBankAccountScore, timingScore) là pure function → unit test độc lập,
  không cần DB, input/output cố định dễ assert.

Reminder rule matching: hàm tính offsetDays + kiểm tra rule khớp → pure function, unit test riêng.
```

## 3. Phạm vi ưu tiên

Không viết integration test cho mọi CRUD đơn giản (Customer/Invoice tạo/sửa/xóa cơ bản) — chỉ tập trung integration test vào nơi có invariant tài chính thật sự rủi ro (5 case ở mục 1), phần còn lại dùng unit test là đủ.

## 4. Ngoài phạm vi

- Load test webhook (tài liệu gốc mục 9.6 giai đoạn 4 — công cụ/kịch bản load test cụ thể, spec riêng nếu cần trước khi demo).
- E2E test FE (Playwright/Cypress) — có thể bổ sung sau khi UI ổn định.
- Test coverage threshold cụ thể (%) — không đặt mục tiêu số % cứng, ưu tiên đúng case rủi ro hơn coverage bề mặt.

## 5. CI contract

- CI dùng GitHub Actions runner có Docker daemon và chạy rõ ràng `pnpm turbo run test` cùng `pnpm turbo run test:e2e`; `test:e2e` phải chạy các suite testcontainers với PostgreSQL + Redis thật.
- Local và CI không được hạ testcontainers xuống mock hoặc chỉ dùng service container dùng chung để che mất khác biệt môi trường.

## 6. Câu hỏi mở (không chặn implementation)

- Ngoài 5 case bắt buộc, có case dispute/reminder-skip nào cũng cần integration test DB thật (thay vì unit test) không?
