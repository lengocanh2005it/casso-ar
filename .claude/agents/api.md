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
- POST endpoints accepting Idempotency-Key header
- Response DTOs: never leak internal fields (organizationId, version)
- Validation: class-validator decorators on DTOs
- Timezone: `Asia/Ho_Chi_Minh` for reminder-related endpoints
