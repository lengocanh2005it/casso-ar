---
paths:
  - "apps/backend/src/**/presentation/**"
  - "apps/backend/src/main.ts"
  - "apps/backend/src/app.module.ts"
---

# API Layer Rules

- All business endpoints use /api/v1 prefix
- Error shape: { statusCode, errorCode, message, details? }
- Response DTOs: never leak organizationId or version fields
- Use class-validator decorators on all DTOs
- POST endpoints accept Idempotency-Key header
