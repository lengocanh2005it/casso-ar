# Reminder Automation Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (dùng `Receivable.status`, `Receivable.isDisputed`, `Receivable.dueDate`). Định nghĩa cách cấu hình chính sách nhắc thanh toán, lên lịch quét hàng ngày, và tránh gửi nhầm khi công nợ vừa được thanh toán.

## 1. Phạm vi

Reminder policy trong spec này chỉ dựa vào hai điều kiện: **nhóm khách hàng** (`customerGroup`: VIP | REGULAR) và **số ngày cách `dueDate`**. Không bao gồm risk scoring, dispute status nâng cao (chỉ dùng flag `isDisputed` đã có sẵn), hay custom groups tùy chỉnh.

Không thuộc phạm vi: Email Template Management chi tiết (nội dung/biến template — đã mô tả ở tài liệu gốc mục 7.6), kênh thông báo ngoài email (Zalo/SMS — mở rộng sau).

## 2. Entities

```
ReminderPolicy
  id, organizationId, customerGroup (VIP/REGULAR), isActive, createdAt

ReminderRule
  id, reminderPolicyId, offsetDays (âm = trước dueDate, dương = sau dueDate),
  emailTemplateId, minIntervalDays (rate limit tối thiểu giữa 2 lần gửi cho cùng receivable/customer),
  createdAt

ReminderExecution
  id, organizationId, receivableId, reminderRuleId (nullable for manual/ad-hoc send),
  executionDate, sentAt,
  status (PENDING/SENT/FAILED/SKIPPED), skipReason (ALREADY_PAID/DISPUTED/RATE_LIMITED),
  providerMessageId, failureReason, createdAt
```

`organizationId` là bắt buộc theo shared-schema tenancy. `executionDate` là ngày chạy dùng cho idempotency theo `(receivableId, reminderRuleId, executionDate)`. `PENDING` là trạng thái kỹ thuật từ lúc tạo execution và enqueue email đến khi email worker trả kết quả; chỉ `SENT` được tính vào rate limit. Binding template nằm ở `ReminderRule.emailTemplateId`, không nằm ở `ReminderPolicy`.

`Customer.customerGroup` (VIP | REGULAR) được thêm vào Domain Core (`Customer` entity ở spec Domain Core) làm điều kiện chọn `ReminderPolicy`.

## 3. Scheduling flow

Không tạo trước toàn bộ lịch tương lai khi receivable được tạo — daily cron tính rule khớp tại thời điểm quét, đơn giản hơn và tự động thích ứng khi `dueDate` thay đổi (gia hạn) mà không cần logic hủy/tạo lại schedule.

```
1. Daily cron (BullMQ repeatable job) quét Receivable WHERE status IN (OPEN, PARTIALLY_PAID)
2. Với mỗi receivable:
   a. Bỏ qua nếu isDisputed = true
   b. Xác định customerGroup của Customer → ReminderPolicy tương ứng (theo organizationId + customerGroup)
   c. Tính offsetDays = (dueDate - today), tìm ReminderRule của policy đó khớp offsetDays
   d. Nếu có rule khớp: query ReminderExecution gần nhất của receivable trong vòng minIntervalDays —
      nếu đã có lần gửi (status=SENT) trong khoảng đó → skip, ghi ReminderExecution(status=SKIPPED, skipReason=RATE_LIMITED)
   e. Nếu qua rate limit check → enqueue "send reminder job" (chưa gửi email ở bước này)
3. Send reminder job (worker riêng, xử lý từng job độc lập):
   a. Load lại receivable từ DB (fresh read, không dùng dữ liệu từ lúc cron quét)
   b. Nếu status đã đổi thành PAID/WRITTEN_OFF/CANCELLED, hoặc isDisputed đã thành true
      → ghi ReminderExecution(status=SKIPPED, skipReason tương ứng ALREADY_PAID/DISPUTED), dừng, không gửi email
   c. Ngược lại: kiểm tra idempotency key; nếu execution tương ứng đã tồn tại thì no-op. Nếu chưa có, tạo ReminderExecution(status=PENDING) rồi giao cho EmailService/email queue.
      Email worker render/gửi email và cập nhật cùng row thành SENT (kèm sentAt/providerMessageId),
      đồng thời emit `reminder.sent`, hoặc FAILED (kèm failureReason), đồng thời emit `reminder.failed`.
```

Tách bước 2 (cron chọn ứng viên, enqueue) và bước 3 (worker gửi thật, tự re-check trạng thái) để xử lý race condition: payment có thể về giữa lúc cron quét và lúc email thực sự gửi đi — worker luôn xác nhận lại trạng thái mới nhất ngay trước khi gửi, tránh nhắc nhầm khách đã thanh toán.

**Timezone:** "today" và `executionDate` luôn tính theo lịch (`YYYY-MM-DD`), không theo mốc UTC/millisecond. Cố định một timezone chung `REMINDER_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) cho toàn bộ tổ chức ở MVP — chưa có field `Organization.timezone` riêng từng tổ chức (out of scope, mọi khách hàng MVP cùng múi giờ VN). Cron BullMQ repeatable job cũng đặt timezone này khi đăng ký (`0 1 * * *`, tz `Asia/Ho_Chi_Minh`), không dùng giờ server mặc định.

## 4. Ngoài phạm vi

- Nội dung/biến Email Template — tài liệu gốc mục 7.6.
- Kênh thông báo ngoài email (Zalo OA, SMS, Teams, Slack).
- Escalation cho quản lý/trưởng phòng khi quá hạn lâu (Internal Task/Escalation — spec/plan riêng).
  Reminder Automation không import, khởi tạo hoặc gọi escalation participant khi phần đó không nằm trong scope triển khai.

## 5. Câu hỏi mở (không chặn implementation)

- `minIntervalDays` có cấu hình được theo từng `ReminderRule` hay cố định một giá trị chung cho toàn `ReminderPolicy`?
- Khi Owner đổi `customerGroup` của một Customer giữa chừng (VIP → REGULAR), các `ReminderExecution` lịch sử có cần gắn nhãn lại theo policy cũ để báo cáo không, hay chỉ ảnh hưởng các lần quét tiếp theo?
