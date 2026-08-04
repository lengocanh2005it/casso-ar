# Email / Notification Service Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (`ReminderExecution`) và [2026-08-03-collection-copilot-design.md](2026-08-03-collection-copilot-design.md) (gửi email nhắc qua chat).

## 1. EmailProviderAdapter & send flow

```
EmailProviderAdapter (interface)
  send(to, subject, html, metadata): Promise<{ providerMessageId }>

ResendEmailAdapter implements EmailProviderAdapter   // implementation thật duy nhất cho MVP,
                                                       // không build sẵn SES/SendGrid adapter chưa dùng đến (YAGNI)

EmailService
  sendReminderEmail({ receivableId, templateId, reminderExecutionId }):
    1. Render EmailTemplate với biến (customerName, invoiceNumber, remainingAmount,
       dueDate, daysOverdue, organizationName)
    2. Enqueue vào "email-queue" (BullMQ), không gọi adapter.send() trực tiếp trong request
    3. Worker xử lý job: gọi adapter.send(...), cập nhật đúng ReminderExecution
       bằng reminderExecutionId và lưu providerMessageId
```

`EmailProviderAdapter` cô lập domain logic khỏi provider cụ thể — đổi từ Resend sang provider khác sau này chỉ cần thêm implementation mới, không sửa `EmailService` hay caller.

`reminderExecutionId` là bắt buộc để email worker cập nhật đúng execution của lần gửi hiện tại; không suy ra execution chỉ từ `receivableId` và `templateId` vì một receivable có thể được nhắc nhiều lần.

## 2. Retry & failure handling

```
email-queue job config:
  attempts: 3, backoff: { type: 'exponential', delay: 5000 }
```

Nếu cả 3 lần thất bại → job chuyển Dead Letter Queue, ghi `ReminderExecution.status = FAILED` (khác với `SKIPPED` — `FAILED` là lỗi kỹ thuật của việc gửi, `SKIPPED` là quyết định nghiệp vụ như đã thanh toán/dispute, xem [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) mục 3) → hiển thị trong UI để kế toán biết và xử lý thủ công (vd gọi điện thay thế).

`ReminderExecution.status = SENT` chỉ được set sau khi `adapter.send()` trả về thành công (`providerMessageId`), không phải ngay khi enqueue — tránh báo cáo "đã gửi" trong khi thực tế đang chờ xử lý hoặc đã thất bại.

## 3. Ngoài phạm vi

- Tracking open/click, xử lý bounce/complaint webhook từ Resend — mở rộng sau (tài liệu gốc mục 22 liệt kê là câu hỏi mở).
- Domain gửi riêng theo từng organization (custom sending domain) — tính năng Enterprise, ngoài phạm vi MVP.
- Kênh thông báo ngoài email (Zalo OA, SMS, Teams, Slack).

## 4. Câu hỏi mở (không chặn implementation)

- Có cần webhook nhận sự kiện bounce/complaint từ Resend để tự động đánh dấu email khách hàng không hợp lệ (tránh gửi tiếp) không, hay để thủ công ở MVP?
- `email-queue` có cần tách riêng khỏi queue xử lý webhook CASSO (khác priority) hay dùng chung Redis instance là đủ?
