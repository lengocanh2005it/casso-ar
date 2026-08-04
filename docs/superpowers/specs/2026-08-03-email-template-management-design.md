# Email Template Management Design

> Spec con của [docs/overview.md](../../../docs/overview.md) (mục 7.6), phụ thuộc [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (`ReminderRule.emailTemplateId`) và [2026-08-03-email-notification-service-design.md](2026-08-03-email-notification-service-design.md) (bước "Render EmailTemplate"). Cả hai spec đó dùng `EmailTemplate` nhưng chưa định nghĩa entity này — spec này lấp khoảng trống đó.

## 1. Entity

```
EmailTemplate
  id, organizationId, name, subject, bodyHtml (Handlebars template),
  reminderStage (nullable — chỉ để hiển thị "template này đang gán cho rule nào" trên UI,
                  chỉ là metadata hiển thị; nguồn thật của binding là ReminderRule.emailTemplateId),
  isDefault (boolean — đánh dấu template hệ thống seed sẵn, không cho xóa, chỉ cho sửa nội dung),
  createdAt, updatedAt
```

Không có bảng version riêng — sửa là `UPDATE` thẳng, không lưu lịch sử (đủ cho MVP, tránh over-engineer khi chưa có yêu cầu audit lịch sử template cụ thể; nếu sau này cần, `AuditLog` đã có ở [2026-08-03-exception-queue-audit-log-design.md](2026-08-03-exception-queue-audit-log-design.md) có thể ghi thêm `EmailTemplate` vào danh sách entity theo dõi mà không cần sửa lại spec này).

## 2. Seed mặc định khi tạo Organization

```
Khi signup tạo Organization (2026-08-03-authentication-onboarding-design.md mục 2):
  seed sẵn N EmailTemplate (isDefault=true), mỗi cái ứng với 1 mốc offsetDays chuẩn
  (vd "Nhắc trước hạn 3 ngày", "Nhắc quá hạn 1 ngày", "Nhắc quá hạn 7 ngày", "Nhắc quá hạn 30 ngày")
  → ReminderRule mặc định của org mới trỏ sẵn emailTemplateId vào các bản ghi này
```

Kế toán có thể sửa nội dung `isDefault=true` (đổi giọng văn) nhưng không xóa được — đảm bảo `ReminderRule` không bao giờ trỏ tới `emailTemplateId` đã bị xóa.

## 3. Biến & render (Handlebars)

```
EmailTemplate.bodyHtml: HTML thô + cú pháp Handlebars {{variableName}}
Biến hệ thống cung cấp cố định (danh sách đóng, không cho thêm biến tùy ý):
  {{customerName}}, {{invoiceNumber}}, {{originalAmount}}, {{remainingAmount}},
  {{dueDate}}, {{daysOverdue}}, {{organizationName}}

Render: Handlebars.compile(template.bodyHtml)(data) → tự động HTML-escape mọi biến
  (chống XSS nếu customerName/invoiceNumber chứa ký tự đặc biệt do import từ Excel)
```

`EmailService.sendReminderEmail` (đã thiết kế ở email-notification-service-design) gọi render này trước khi enqueue — không đổi lại flow đã có, chỉ định nghĩa rõ bước "Render EmailTemplate" ở đó dùng cơ chế nào.

## 4. API

```
GET    /api/v1/email-templates              → danh sách template của organization
POST   /api/v1/email-templates              → tạo mới (isDefault=false), Quyền: REMINDER_POLICY_WRITE
PATCH  /api/v1/email-templates/:id          → sửa subject/bodyHtml, Quyền: REMINDER_POLICY_WRITE
DELETE /api/v1/email-templates/:id          → chỉ cho phép nếu isDefault=false VÀ không có
                                        ReminderRule nào đang trỏ emailTemplateId này (409 nếu đang dùng)
POST   /api/v1/email-templates/:id/preview  → render thử với dữ liệu mẫu giả định, trả
                                              { subject, bodyHtml } để hiển thị preview trên UI trước khi lưu,
                                              không gửi email thật; Quyền: REMINDER_POLICY_WRITE
```

## 5. Ngoài phạm vi

- Kéo-thả visual editor (drag-drop email builder) — chỉ cần textarea/code editor nhập HTML thô ở MVP, không xây dựng WYSIWYG editor riêng.
- Đa ngôn ngữ template (i18n theo locale khách hàng) — tài liệu gốc không đề cập, ngoài phạm vi.
- Versioning/lịch sử sửa template (xem mục 1).

## 6. Câu hỏi mở (không chặn implementation)

- Danh sách biến hệ thống cố định ở mục 3 có cần mở rộng thêm (vd `{{paymentLink}}` nếu sau này có cổng thanh toán online) hay giữ nguyên 7 biến này là đủ cho MVP?
- `POST /email-templates/:id/preview` dùng dữ liệu mẫu hard-code trong code hay cho phép chọn 1 Receivable thật để preview với dữ liệu thực tế?
