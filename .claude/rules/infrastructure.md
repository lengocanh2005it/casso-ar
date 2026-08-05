---
paths:
  - "apps/backend/src/**/infrastructure/**"
---

# Infrastructure Layer Rules

- Repository must scope queries by `organizationId` from TenantContextService
- Use `@Column('bigint')` for all money fields
- Use `@VersionColumn()` for optimistic locking on concurrent-write entities
- Use `EntityManager` parameter for transactional saves
- Entity class names: `XOrmEntity` (e.g., `CustomerOrmEntity`)
- File naming: `*.orm-entity.ts`, `typeorm-*.repository.ts`
- DO NOT use `SELECT *` — always select specific columns
- MUST NOT import another module's infrastructure/ directly — access another module's data through a port in application/
- Queries by secret token/hash (email-verification, refresh-token, password-reset) do not need organizationId scoping — the token itself is the lookup key before the tenant is known. This is an intentional exception, not a bug.
- CRUD repositories scoped by `organizationId` MUST extend `BaseRepository` (`common/tenancy/base.repository.ts`) and use `scopedFindOne`/`scopedSaveWithManager` — DO NOT hand-roll duplicate scoping logic (see `typeorm-customer.repository.ts`/`typeorm-receivable.repository.ts` for examples). Exceptions: repositories querying by token/hash (above) or entities without a direct `organizationId` (User, Organization, Membership) do not have to extend it.
