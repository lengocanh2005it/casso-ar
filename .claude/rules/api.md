---
paths:
  - "apps/backend/src/**/presentation/**"
  - "apps/backend/src/main.ts"
  - "apps/backend/src/app.module.ts"
---

# API Layer Rules

- All business endpoints use `/api/v1` prefix
- Error shape: `{ statusCode, errorCode, message, details? }`
- Response DTOs: never leak `organizationId`, `version` fields
- Use `class-validator` decorators on all DTOs
- POST endpoints accept `Idempotency-Key` header
- Controller ONLY calls use case — no business logic
- Endpoint yêu cầu đã đăng nhập (có `JwtAuthGuard`) PHẢI có `@RequirePermission()`
- Endpoint tiền-xác thực (login, signup, verify-email, refresh, forgot-password) KHÔNG cần `@RequirePermission()` — chưa có identity để check quyền
- Controller KHÔNG import trực tiếp từ infrastructure/ hay repository port — chỉ gọi use case
- Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`
