---
paths:
  - "apps/backend/src/common/**"
---

# Common (Cross-Cutting Infrastructure) Rules

`common/` chứa code dùng chung xuyên module (`tenancy/`, `rbac/`, `errors/`, `audit/`, `idempotency/`, `auth/`). Đây KHÔNG phải một module nghiệp vụ — không áp dụng cấu trúc domain/application/infrastructure/presentation 4 lớp, tổ chức theo concern (mỗi thư mục con = 1 mối quan tâm cross-cutting).

- Thay đổi ở đây ảnh hưởng MỌI module — cân nhắc kỹ trước khi sửa signature/behavior của `TenantContextService`, `BaseRepository`, `PermissionGuard`, `AppError`, `HttpExceptionFilter`, `IdempotencyService`.
- `TenantContextService.getOrganizationId()` (`tenancy/tenant-context.ts`) là NGUỒN DUY NHẤT lấy `organizationId` trong runtime — KHÔNG đọc từ request/header/param trực tiếp ở bất kỳ đâu ngoài `TenantContextInterceptor`.
- `BaseRepository` (`tenancy/base.repository.ts`) là abstraction chuẩn cho repository tenant-scoped — sửa nó nghĩa là sửa hành vi của mọi repository extend nó (hiện có 4, xem `infrastructure.md`). Thêm test khi sửa.
- `PermissionGuard`/`@RequirePermission()` (`rbac/`) là điểm check quyền DUY NHẤT — KHÔNG thêm cách check quyền song song (if/else role trong code nghiệp vụ).
- `AppError`/`HttpExceptionFilter` (`errors/`) là điểm dịch lỗi DUY NHẤT sang HTTP — xem `application.md`. KHÔNG thêm exception filter thứ hai.
- `IdempotencyService` (`idempotency/`) là cơ chế xử lý `Idempotency-Key` DUY NHẤT — xem `api.md`.
- Không có file `*.usecase.ts`/`*-repository.port.ts` trong `common/` — nếu logic đang thêm mang tính nghiệp vụ riêng của 1 domain (không phải cross-cutting thật sự), nó thuộc về `modules/<module>/`, không phải `common/`.
