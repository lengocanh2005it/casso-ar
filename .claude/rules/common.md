---
paths:
  - "apps/backend/src/common/**"
---

# Common (Cross-Cutting Infrastructure) Rules

`common/` contains code shared across modules (`tenancy/`, `rbac/`, `errors/`, `audit/`, `idempotency/`, `auth/`). It is NOT a business module — the four-layer domain/application/infrastructure/presentation structure does not apply; organize by concern (each subdirectory = one cross-cutting concern).

- Changes here affect EVERY module — consider carefully before changing the signature/behavior of `TenantContextService`, `BaseRepository`, `PermissionGuard`, `AppError`, `HttpExceptionFilter`, or `IdempotencyService`.
- `TenantContextService.getOrganizationId()` (`tenancy/tenant-context.ts`) is the ONLY runtime source of `organizationId` — do NOT read it directly from request/header/param anywhere outside `TenantContextInterceptor`.
- `BaseRepository` (`tenancy/base.repository.ts`) is the standard abstraction for tenant-scoped repositories — changing it changes the behavior of every repository that extends it (currently 4; see `infrastructure.md`). Add tests when changing it.
- `PermissionGuard`/`@RequirePermission()` (`rbac/`) is the ONLY permission-checking point — do NOT add parallel permission checks (if/else role logic in business code).
- `AppError`/`HttpExceptionFilter` (`errors/`) is the ONLY error translation point to HTTP — see `application.md`. Do NOT add a second exception filter.
- `IdempotencyService` (`idempotency/`) is the ONLY mechanism for handling `Idempotency-Key` — see `api.md`.
- There are no `*.usecase.ts`/`*-repository.port.ts` files in `common/` — if new logic is specific to one domain (not genuinely cross-cutting), it belongs in `modules/<module>/`, not `common/`.
