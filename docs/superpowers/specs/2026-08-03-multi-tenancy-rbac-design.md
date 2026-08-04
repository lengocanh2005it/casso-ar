# Multi-tenancy + RBAC Design

> Spec con của [docs/overview.md](../../../docs/overview.md). Nền tảng mà mọi spec khác ([Domain Core](2026-08-03-domain-core-design.md), [Webhook/Matching](2026-08-03-webhook-matching-engine-design.md), [Cas ID](2026-08-03-cas-id-bank-connection-design.md), [Reminder](2026-08-03-reminder-automation-design.md)) dựa vào cho tenant isolation và phân quyền.

## 1. Tenant isolation model

Chọn **shared schema** (một database, mọi bảng nghiệp vụ có cột `organizationId`) thay vì schema-per-tenant — đơn giản hơn để vận hành, migrate, backup ở quy mô thực tập và giai đoạn đầu SaaS; schema-per-tenant chỉ cần thiết khi có yêu cầu compliance cách ly vật lý từ khách hàng lớn.

```
Organization
  id, name, createdAt

User
  id, email, passwordHash, createdAt

Membership
  id, organizationId, userId, role (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER),
  invitedAt, joinedAt, createdAt
```

Một `User` có thể thuộc nhiều `Organization` qua nhiều `Membership` (khác role ở mỗi org). Mọi bảng nghiệp vụ (`Customer`, `Invoice`, `Receivable`, `Payment`, `PaymentAllocation`, `BankConnection`, `WebhookInbox`, ...) có cột `organizationId` bắt buộc: `NOT NULL`, `FOREIGN KEY` tới `organizations.id`, có index. Mọi FK giữa các bảng nghiệp vụ phải ngăn cross-tenant reference ở application và DB; các index truy vấn tenant đặt `organizationId` ở đầu (ví dụ `(organizationId, status, dueDate)`).

### Thực thi cách ly ở tầng ứng dụng

```
1. AuthGuard xác thực JWT, lấy userId + organizationId
   (từ token, hoặc header X-Organization-Id nếu user thuộc nhiều org) → validate qua Membership
2. Gắn organizationId vào request-scoped context (NestJS request-scoped provider / AsyncLocalStorage)
3. BaseRepository (mọi Repository nghiệp vụ bắt buộc extend từ đây) tự động thêm
   WHERE organizationId = :ctx.organizationId vào mọi query — service code không tự viết filter tay,
   loại bỏ rủi ro quên filter dẫn tới lộ dữ liệu chéo tổ chức
```

Không dùng Postgres Row-Level Security ở MVP — enforcement tại tầng NestJS đã đủ khi mọi truy vấn bắt buộc đi qua `BaseRepository`; RLS có thể thêm sau như lớp bảo vệ thứ hai nếu cần.

Đối với webhook/worker không có JWT: không nhận `organizationId` từ payload để quyết định tenant. Controller phải resolve `BankConnection` bằng `bankConnectionId`, kiểm tra `connection.organizationId`, rồi dùng organization đó cho `WebhookInbox`, `BankTransaction`, queue job và `TenantContextService`. Mọi organizationId gửi kèm payload nếu khác giá trị resolve được phải bị từ chối.

## 2. RBAC — static role → permission mapping

5 role cố định (không cần bảng `Role`/`Permission` động trong DB — set cứng trong code):

```
enum Permission {
  RECEIVABLE_READ, RECEIVABLE_WRITE, RECEIVABLE_WRITE_OFF, RECEIVABLE_DISPUTE,
  PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO,
  REMINDER_POLICY_WRITE, REMINDER_SEND_MANUAL,
  BANK_CONNECTION_MANAGE,
  SUBSCRIPTION_MANAGE, USER_MANAGE, INTERNAL_TASK_MANAGE,
  REPORT_READ, AUDIT_LOG_READ,
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER:           [/* toàn bộ Permission */],
  FINANCE_MANAGER: [RECEIVABLE_READ, RECEIVABLE_WRITE, RECEIVABLE_WRITE_OFF, RECEIVABLE_DISPUTE,
                     PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO,
                     REMINDER_POLICY_WRITE, REMINDER_SEND_MANUAL, SUBSCRIPTION_MANAGE, USER_MANAGE,
                     INTERNAL_TASK_MANAGE,
                     REPORT_READ, AUDIT_LOG_READ],
  ACCOUNTANT:      [RECEIVABLE_READ, RECEIVABLE_WRITE, RECEIVABLE_DISPUTE,
                     PAYMENT_ALLOCATE, REMINDER_SEND_MANUAL, INTERNAL_TASK_MANAGE, REPORT_READ],
  SALES_REP:       [RECEIVABLE_READ, REPORT_READ],   // giới hạn thêm ở tầng Service, xem bên dưới
  VIEWER:          [RECEIVABLE_READ, REPORT_READ, AUDIT_LOG_READ],
}
```

Dùng qua decorator trên controller method, ví dụ `@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)`. `PermissionGuard` tra `ROLE_PERMISSIONS[membership.role]` để cho phép/chặn.
Endpoint allocate payment bắt buộc `@RequirePermission(Permission.PAYMENT_ALLOCATE)`; endpoint undo bắt buộc `@RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)`. `USER_MANAGE` chỉ có OWNER và FINANCE_MANAGER. `INTERNAL_TASK_MANAGE` cấp cho FINANCE_MANAGER và ACCOUNTANT để tạo/resolve/dismiss internal task.

### Trường hợp đặc biệt: SALES_REP

Permission check chung không đủ vì `SALES_REP` chỉ được xem receivable của khách hàng mình phụ trách, không phải toàn bộ organization. `Receivable.salesRepresentativeId` là assignment/ownership scope, nullable khi chưa phân công; Service thêm `WHERE salesRepresentativeId = ctx.userId` khi role là `SALES_REP`. Điều kiện này xử lý ở tầng Service, không phải trong `PermissionGuard` chung — giữ `PermissionGuard` đơn giản (chỉ kiểm tra "có quyền hành động loại này không"), còn "phạm vi dữ liệu nào" là logic nghiệp vụ riêng của từng Service.

## 3. Ngoài phạm vi

- Custom role / permission tùy chỉnh theo từng organization (chỉ cần khi có yêu cầu enterprise thật sự).
- Postgres Row-Level Security (có thể thêm sau như lớp bảo vệ bổ sung).
- SSO / external identity provider cho Organization (đề cập ở tài liệu gốc mục 10 cho gói Enterprise, ngoài phạm vi MVP).

## 4. Câu hỏi mở (không chặn implementation)

- Một User bị xóa khỏi Membership của một Organization — `salesRepresentativeId` trên dữ liệu cũ có giữ nguyên để bảo toàn lịch sử, hay cần reassign?
- `SALES_REP` xem báo cáo (`REPORT_READ`) có cần giới hạn theo customer phụ trách tương tự `RECEIVABLE_READ`, hay được xem báo cáo tổng hợp toàn organization?
