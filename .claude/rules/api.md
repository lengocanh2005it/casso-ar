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
- Authenticated endpoints (with `JwtAuthGuard`) MUST have `@RequirePermission()`
- Pre-authentication endpoints (login, signup, verify-email, refresh, forgot-password) do NOT need `@RequirePermission()` — there is no identity to check permissions against yet
- Controllers MUST NOT import directly from infrastructure/ or repository ports — they only call use cases
- Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`
- POST/PATCH/DELETE endpoints with side effects (data writes) MUST wrap the handler with `IdempotencyService.execute(key, dto, callback)` (`common/idempotency/idempotency.service.ts`) — see `receivables.controller.ts`/`payments.controller.ts` for examples. Do NOT invent another way to handle `Idempotency-Key`.
