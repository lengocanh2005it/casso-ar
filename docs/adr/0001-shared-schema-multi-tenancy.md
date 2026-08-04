# 1. Shared-schema multi-tenancy thay vì schema-per-tenant

Date: 2026-08-03

## Status

Accepted

## Context

Mọi entity nghiệp vụ (`Customer`, `Invoice`, `Receivable`, `Payment`, `BankConnection`, `WebhookInbox`, ...) cần cách ly dữ liệu giữa các `Organization`. Có hai mô hình phổ biến để làm việc này ở tầng database:

- **Schema-per-tenant** (hoặc database-per-tenant): mỗi organization có schema/DB riêng, cách ly vật lý mạnh, nhưng migration/backup/query cross-tenant (vd admin dashboard, billing) phức tạp hơn tuyến tính theo số tenant.
- **Shared schema**: một database, mọi bảng nghiệp vụ có cột `organizationId`, cách ly thực thi ở tầng ứng dụng.

Ở quy mô hiện tại (dự án thực tập, giai đoạn đầu SaaS, chưa có khách hàng yêu cầu compliance cách ly vật lý), chi phí vận hành N schema là không tương xứng với lợi ích.

## Decision

Dùng **shared schema**: một Postgres database, mọi bảng dữ liệu nghiệp vụ có cột `organizationId NOT NULL` kèm `FOREIGN KEY` + index. Các bảng identity dùng chung như `User` là ngoại lệ có chủ ý; quyền truy cập tenant của User đi qua `Membership`.

Trong request đã có tenant context, mọi `Repository` nghiệp vụ phải extend `BaseRepository`, tự động thêm `WHERE organizationId = :ctx.organizationId` vào mọi query; service code không tự viết filter tay. Các đường ingestion/worker chạy trước khi có JWT (`BankConnection.findByIdUnscoped`, `WebhookInbox`, `BankTransaction`) là ngoại lệ có kiểm soát: chúng chỉ được dùng tenant đã resolve từ `BankConnection` hoặc job data đáng tin cậy, không dùng `organizationId` từ payload để quyết định tenant, và phải giữ filter `organizationId` tường minh ở repository.

Với webhook/worker không có JWT: **không** nhận `organizationId` từ request/payload để quyết định tenant. Phải resolve `BankConnection` bằng `bankConnectionId` rồi lấy `connection.organizationId` làm nguồn sự thật; nếu payload có kèm `organizationId` khác giá trị resolve được thì từ chối.

Không dùng Postgres Row-Level Security (RLS) ở MVP — coi enforcement tại tầng NestJS qua `BaseRepository` là đủ cho request-scoped queries; ingestion/worker paths dùng explicit `organizationId` filter theo các exception đã nêu.

## Consequences

- Migration, backup, và query cross-tenant (admin, billing) đơn giản như một ứng dụng single-tenant bình thường.
- Toàn bộ an toàn cách ly tenant phụ thuộc vào kỷ luật code: mọi Repository phục vụ request có tenant context phải extend `BaseRepository`; các repository ingestion/worker ngoại lệ phải nhận tenant đã resolve và không được dùng payload làm nguồn sự thật. Mọi query thủ công (raw SQL, query builder rời) vẫn là điểm rò rỉ dữ liệu chéo tổ chức tiềm ẩn. Không có lớp phòng thủ thứ hai ở tầng DB (RLS) cho tới khi chủ động thêm.
- Nếu sau này có khách hàng lớn yêu cầu cách ly vật lý (compliance), việc migrate từ shared schema sang schema-per-tenant là một dự án lớn (di chuyển dữ liệu, đổi connection routing, đổi migration pipeline) — quyết định này chấp nhận đánh đổi đó để đổi lấy vận hành đơn giản ở giai đoạn hiện tại.
- RLS có thể bổ sung sau như lớp bảo vệ thứ hai mà không cần đổi model hiện tại.
