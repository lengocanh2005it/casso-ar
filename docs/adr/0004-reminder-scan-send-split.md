# 4. Tách bước quét ứng viên (cron) khỏi bước gửi thật (worker), worker tự re-check trạng thái

Date: 2026-08-03

## Status

Accepted

## Context

Reminder automation cần quét các `Receivable` quá hạn mỗi ngày và gửi email nhắc thanh toán. Cách đơn giản nhất là cron quét và gửi email luôn trong cùng một bước. Vấn đề: giữa lúc cron bắt đầu quét (có thể mất một khoảng thời gian nếu số lượng receivable lớn) và lúc email thực sự được gửi đi, một `Payment` có thể vừa được ghi nhận cho đúng receivable đó — nếu gửi dựa trên dữ liệu đọc lúc quét, khách hàng đã thanh toán vẫn nhận nhắc nợ, gây trải nghiệm xấu và mất uy tín (sản phẩm fintech gửi email thật tới khách hàng).

## Decision

Tách thành hai bước riêng:

1. **Cron quét** (bước scan trong `2026-08-03-reminder-automation.md`): chọn ứng viên đủ điều kiện nhắc, enqueue "send reminder job" — **chưa gửi email ở bước này**.
2. **Send reminder job** (worker riêng, xử lý từng job độc lập): load lại receivable từ DB (fresh read, không dùng dữ liệu từ lúc cron quét). Nếu status đã đổi thành `PAID`/`WRITTEN_OFF`/`CANCELLED`, hoặc `isDisputed` đã thành `true` → ghi `ReminderExecution(status=SKIPPED, skipReason=...)`, dừng, không gửi email. Chỉ gửi khi trạng thái tại thời điểm gửi vẫn hợp lệ.

`ReminderExecution` luôn mang `organizationId` và `executionDate`; khóa idempotency theo receivable/rule/ngày được kiểm tra trước khi enqueue. Worker tạo execution `PENDING` rồi giao việc gửi cho `EmailService`/email queue; chính email worker mới cập nhật `SENT` hoặc `FAILED`.

## Consequences

- Loại bỏ race condition giữa "quét" và "gửi thật" mà không cần lock receivable trong suốt quá trình cron chạy (vốn có thể kéo dài nếu số lượng lớn).
- Đổi lại, hệ thống cần một hàng đợi job (queue) và một worker riêng thay vì một cron job đơn giản — thêm một thành phần vận hành (theo dõi job thất bại, retry, dead-letter) so với phương án gộp một bước.
- Có độ trễ giữa lúc "được chọn làm ứng viên" và lúc "gửi thật" bằng thời gian job nằm trong queue — chấp nhận được vì mục tiêu là đúng nội dung tại thời điểm gửi, không phải gửi tức thời.
- `ReminderExecution.status = SKIPPED` (quyết định nghiệp vụ, do đã thanh toán/dispute) được phân biệt rõ với `status = FAILED` (lỗi kỹ thuật của việc gửi) — cần giữ phân biệt này khi build UI báo cáo, không gộp chung làm một loại "không gửi được".
