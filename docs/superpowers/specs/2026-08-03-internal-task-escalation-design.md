# Internal Task & Escalation Design

> Spec con của [OVERVIEW.md](../../../OVERVIEW.md) (mục 7.14), phụ thuộc [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (tái dùng daily cron), [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md) (quyền tạo task), [2026-08-03-collection-activity-timeline-design.md](2026-08-03-collection-activity-timeline-design.md) (event listener khi receivable đóng).

## 1. Entity

```
InternalTask
  id, organizationId, receivableId, assignedToUserId, createdByUserId (nullable — null = hệ thống),
  taskType (ESCALATION/MANUAL), title, description, dueDate (nullable),
  status (OPEN/DONE/DISMISSED),
  createdAt, resolvedAt
```

## 2. Escalation trigger (tự động)

Tái dùng daily cron của Reminder Automation — không tạo scheduled job riêng, tránh trùng lặp logic quét receivable quá hạn đã có sẵn:

```
Trong daily cron (xem 2026-08-03-reminder-automation-design.md mục 3, bước 2),
sau khi xử lý reminder rule cho một receivable:
  Nếu (today - dueDate) >= escalationThresholdDays (vd 30 ngày)
     VÀ chưa có InternalTask(taskType=ESCALATION, status=OPEN) cho receivable này
  → tạo InternalTask(taskType=ESCALATION, assignedToUserId=Finance Manager của organization,
     title="Công nợ quá hạn {days} ngày cần xử lý", createdByUserId=null)
```

## 3. Đọc, tạo thủ công & resolve

```
GET /receivables/:id/tasks
  → danh sách task của receivable trong tenant hiện tại, newest first
  Quyền: RECEIVABLE_READ
```

```
POST /receivables/:id/tasks
  body: { assignedToUserId?, title, description, dueDate? }
  taskType=MANUAL, createdByUserId=user hiện tại; nếu bỏ qua assignedToUserId
  thì mặc định giao cho user hiện tại
  Quyền: FINANCE_MANAGER, ACCOUNTANT

POST /tasks/:id/resolve   → status=DONE, resolvedAt=now
POST /tasks/:id/dismiss   → status=DISMISSED, resolvedAt=now
```

Khi `Receivable` chuyển sang trạng thái đóng (`PAID`/`WRITTEN_OFF`/`CANCELLED`), mọi `InternalTask` còn `OPEN` của receivable đó tự động chuyển `DISMISSED` — xử lý qua cùng domain event listener đã dùng ở [2026-08-03-collection-activity-timeline-design.md](2026-08-03-collection-activity-timeline-design.md) (lắng nghe sự kiện `Receivable.status` đổi sang trạng thái đóng).

## 4. Ngoài phạm vi

- "Đề xuất tạm dừng bán chịu cho khách hàng" (tài liệu gốc mục 7.14) — chỉ là gợi ý hiển thị trong `InternalTask.description`, không có cơ chế tự động chặn tạo receivable mới cho khách hàng đó ở MVP.
- Notification real-time (push/Slack) khi có task mới — dùng notification nội bộ đã có (tài liệu gốc mục 7.5 MVP), không thêm kênh riêng.

## 5. Câu hỏi mở (không chặn implementation)

- `escalationThresholdDays` có cấu hình theo từng `ReminderPolicy`/`customerGroup` hay là một giá trị cố định chung cho toàn organization?
- Một `InternalTask` có cần giới hạn chỉ `assignedToUserId` hoặc `OWNER` mới được resolve/dismiss không, hay bất kỳ ai xem được task cũng resolve được?
