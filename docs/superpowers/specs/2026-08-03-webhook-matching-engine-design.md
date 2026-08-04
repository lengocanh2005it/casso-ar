# Webhook Ingestion + Matching Engine Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md). Định nghĩa cách hệ thống nhận giao dịch từ CASSO Balance Hook, chống trùng lặp, và đối soát với Receivable.

## 0. Nguồn tham khảo

Thông tin về CASSO Balance Hook lấy từ [cas.so/product/balance-hook](https://cas.so/product/balance-hook) (truy cập 08/2026):
- Webhook thông báo real-time khi có thay đổi số dư tài khoản/VA đã kết nối.
- Payload gồm: Transaction ID + unique code, thời gian giao dịch, số tiền, số dư sau giao dịch, số tài khoản (thường + VA), thông tin ngân hàng, thông tin tài khoản đối ứng, đơn vị tiền tệ (VND).
- Xác thực bằng header: API version, client ID, secret key (không phải HMAC signature trên payload).
- Docs công khai không nói rõ retry mechanism — cần xác nhận lại với Developer Portal/tài liệu kỹ thuật nội bộ trước khi triển khai production.

## 1. Phạm vi & luồng tổng quát

Phạm vi: webhook ingestion (nhận, xác thực, chống trùng) + Matching Engine (tìm Receivable phù hợp, tính điểm, quyết định auto-match/exception/unmatched).

Không thuộc phạm vi: UI Exception Queue, luồng Cas ID connection/consent (spec riêng), Payment Allocation transaction detail (đã có ở Domain Core spec).

```
CASSO Balance Hook (POST) → Webhook Controller
    → Xác thực header (client ID + secret key, constant-time compare)
    → WebhookInbox (insert, unique key = Balance Hook Transaction ID)
        → nếu trùng key (duplicate) → return 200 ngay, không xử lý tiếp
    → Queue (BullMQ)
    → Transaction Normalizer (map payload Balance Hook → BankTransaction nội bộ)
    → Matching Engine (tính score, tìm candidate Receivable)
    → score >= 90 → Payment Allocation tự động
    → score 60-89 → Exception Queue (kế toán duyệt)
    → score < 60 → BankTransaction.status = UNMATCHED
```

## 2. Entities

```
WebhookInbox
  id, organizationId, bankConnectionId, providerTransactionId (unique, từ Balance Hook Transaction ID),
  rawPayload (jsonb), receivedAt, status (RECEIVED/PROCESSED/FAILED),
  processedAt, errorMessage, retryCount

BankTransaction
  id, organizationId, bankConnectionId, webhookInboxId,
  providerTransactionId, amount, transactionDateTime,
  counterpartyAccountNumber, counterpartyName, transferContent,
  status (UNMATCHED/PENDING_REVIEW/MATCHED/IGNORED), version,
  createdAt

MatchingCandidate
  id, bankTransactionId, receivableId,
  referenceCodeScore, amountScore, customerBankAccountScore,
  payerNameScore, timingScore, totalScore,
  createdAt
```

`WebhookInbox` giữ raw payload để audit/replay, tách biệt khỏi `BankTransaction` (dữ liệu đã normalize) để Matching Engine không phụ thuộc cấu trúc riêng của Balance Hook — nếu payload đổi format, chỉ Transaction Normalizer cần sửa.

## 3. Candidate scope & scoring

### Candidate scope

- Nếu resolve được `customerId` — qua khớp `counterpartyAccountNumber` với `CustomerBankAccount` đã lưu, hoặc qua mã hóa đơn/receivable tìm thấy trong `transferContent` — chỉ xét `Receivable` của customer đó, `status IN (OPEN, PARTIALLY_PAID)`.
- Nếu không resolve được customer, quét toàn bộ `Receivable OPEN/PARTIALLY_PAID` trong organization, giới hạn top N gần nhất theo `dueDate`, và chỉ tính `referenceCodeScore` + `amountScore` (hai tiêu chí duy nhất không cần biết customer).

### Scoring (giữ công thức cộng dồn từ brainstorm gốc)

```
referenceCodeScore (0-60): transferContent chứa đúng invoiceNumber/mã receivable → 60,
                            chứa mã dạng gần đúng (thiếu ký tự, sai định dạng) → 30, không có → 0
amountScore        (0-20): amount == remainingAmount → 20, lệch trong ±1% → 10, khác → 0
customerBankAccountScore (0-10): counterpartyAccountNumber khớp CustomerBankAccount đã lưu → 10, khác → 0
payerNameScore     (0-5):  fuzzy match counterpartyName với Customer.name vượt ngưỡng similarity → 5, không → 0
timingScore        (0-5):  transactionDateTime trong [dueDate-30 ngày, dueDate+30 ngày] → 5, ngoài → 0

totalScore = tổng 5 thành phần, tối đa 100
```

Mỗi thành phần điểm là một hàm thuần (pure function), độc lập, dễ unit test riêng.

### Threshold quyết định

```
totalScore >= 90   → tự động Payment Allocation
totalScore 60-89   → Exception Queue, đề xuất theo totalScore giảm dần
totalScore < 60    → BankTransaction.status = UNMATCHED
```

## 4. Idempotency, auth & edge cases

1. **Xác thực**: header client ID + secret key so khớp constant-time compare với giá trị lưu server-side. Sai hoặc thiếu header → 401.
2. **Idempotency**: insert `WebhookInbox` với `unique(providerTransactionId)`. Insert thất bại do trùng key → return 200 ngay lập tức, không enqueue xử lý lại (giao dịch đã được xử lý ở lần nhận trước).
3. **Retry**: nếu xử lý thất bại sau khi đã insert `WebhookInbox` thành công (lỗi ở Normalizer hoặc Matching Engine), processor phải persist `WebhookInbox.status = FAILED`, `retryCount++`, `errorMessage` (đã giới hạn độ dài và không chứa token/raw secret), rồi mới để BullMQ retry với backoff, tối đa N lần rồi chuyển Dead Letter Queue. Khi thành công persist `PROCESSED`.
4. **Giao dịch hoàn tiền / số âm**: `amount < 0` không đưa vào Matching Engine — route riêng sang luồng xử lý refund (chi tiết luồng refund ngoài phạm vi doc này).
5. **Giao dịch trùng thật** (khách chuyển 2 lần cùng số tiền nhưng khác `providerTransactionId`): đây là 2 `BankTransaction` hợp lệ, không phải lỗi idempotency — Matching Engine xử lý bình thường như 2 giao dịch riêng biệt (có thể dẫn tới overpayment nếu receivable đã trả đủ, xử lý theo rule overpayment ở Domain Core spec mục 4).

## 5. Ngoài phạm vi

- Cas ID connection/consent flow — spec riêng.
- UI Exception Queue (giao diện, thao tác kế toán) — đã mô tả ở tài liệu gốc mục 7.10 và 18.
- Chi tiết retry mechanism thực tế của CASSO Balance Hook — cần xác nhận với Developer Portal/tài liệu kỹ thuật nội bộ trước khi triển khai production.

## 6. Câu hỏi mở (không chặn implementation)

- Balance Hook có publish IP range cố định để cân nhắc thêm IP allowlist không? (MVP hiện tại chỉ dùng secret key compare, đã chốt.)
- `transferContent` từ Balance Hook có field tách riêng "unique code" hay chỉ có full text nội dung chuyển khoản để tự parse referenceCodeScore?
