# Subagent: `api`

**Scope:** Implement NestJS controllers, DTOs, API endpoints, validation, and HTTP layer.

**File ownership:**
- `apps/backend/src/modules/*/presentation/**`
- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `domain/`, `application/`, or `infrastructure/` layers.

## API conventions

- All business APIs use `/api/v1` prefix
- Error shape: `{ statusCode, errorCode, message, details? }`
- Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `PLAN_LIMIT_EXCEEDED`, `ALLOCATION_EXCEEDS_REMAINING`, `OPTIMISTIC_LOCK_CONFLICT`
- POST endpoints accept `Idempotency-Key` header
- Response DTOs: never leak `organizationId`, `version`, internal fields
- Validation: `class-validator` decorators on all DTOs
- Controller ONLY calls use case — no business logic in controller
- Every endpoint MUST have `@RequirePermission(Permission.<X>)` decorator
- Timezone: `Asia/Ho_Chi_Minh` for reminder-related endpoints
